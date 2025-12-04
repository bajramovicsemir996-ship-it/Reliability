

import { RawRecord, StoppageType, WeibullParams, InputMode, ReliabilityMetrics, PMRecord, CrowAMSAA, RollingMetric } from "../types";

// Excel parsing helper
declare global {
  interface Window {
    XLSX: any;
  }
}

// --- BOX 1: Failure Log Parser ---
export const parseExcelFile = async (file: File): Promise<RawRecord[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = window.XLSX.read(data, { type: 'binary', cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const jsonData = window.XLSX.utils.sheet_to_json(sheet, { cellDates: true, defval: "" });

        const mappedData: RawRecord[] = jsonData.map((row: any, index: number) => {
            const findKey = (keywords: string[], excludeKey?: string) => Object.keys(row).find(k => 
                keywords.some(kw => k.toLowerCase().includes(kw)) && k !== excludeKey
            );

            const failureModeKey = findKey(['failure mode', 'failure_mode', 'root cause', 'failure code']);
            const importedFailureMode = failureModeKey ? String(row[failureModeKey]).trim() : '';

            const dateKey = findKey(['start', 'date', 'time'], failureModeKey);
            let startDate: string | undefined = undefined;
            if (dateKey && row[dateKey]) {
                if (row[dateKey] instanceof Date) {
                    startDate = row[dateKey].toISOString();
                } else {
                    const d = new Date(row[dateKey]);
                    if (!isNaN(d.getTime())) startDate = d.toISOString();
                }
            }

            const durKey = findKey(['duration', 'downtime', 'min', 'delay']);
            let duration = durKey ? Number(row[durKey]) : 0;
            if (isNaN(duration)) duration = 0;

            const locKey = findKey(['asset', 'location', 'machine']);
            const location = locKey ? String(row[locKey]) : 'Unknown Asset';

            const descKey = findKey(['description', 'reason', 'desc', 'failure', 'details'], failureModeKey);
            let description = descKey ? String(row[descKey]) : 'No description';

            const profileKey = findKey(['profile', 'rolled']);
            const productTypeKey = findKey(['product', 'material']); 
            const specificTypeKey = Object.keys(row).find(k => k.toLowerCase() === 'type' || k.toLowerCase().includes('product'));
            const extraInfo = [];
            if (profileKey && row[profileKey]) extraInfo.push(`Profile: ${row[profileKey]}`);
            if ((productTypeKey || specificTypeKey) && row[productTypeKey || specificTypeKey]) {
                extraInfo.push(`Product: ${row[productTypeKey || specificTypeKey]}`);
            }
            if (extraInfo.length > 0) {
                description = `${description} (${extraInfo.join(', ')})`;
            }

            let type = StoppageType.Unplanned;
            const stopTypeKey = findKey(['stoppage type', 'category', 'classification']);
            if (stopTypeKey && row[stopTypeKey]) {
                 const val = String(row[stopTypeKey]).toLowerCase();
                 if (val.includes('plan')) type = StoppageType.Planned;
                 if (val.includes('exter')) type = StoppageType.External;
            }

            const ttbfKey = findKey(['ttbf', 'tbf', 'operating']);
            const ttbf = ttbfKey ? Number(row[ttbfKey]) : 0;

            return {
                id: `row-${index}-${Date.now()}`,
                startTime: startDate, 
                ttbf: ttbf,
                durationMinutes: duration,
                type: type,
                description: description,
                location: location,
                failureMode: importedFailureMode
            };
        });
        
        const validData = mappedData.filter(r => 
            (r.startTime !== undefined) || (r.ttbf !== undefined && r.ttbf > 0)
        );
        resolve(validData);
      } catch (err) {
        reject(err);
      }
    };
    reader.readAsBinaryString(file);
  });
};

// --- BOX 2: PM Plan Parser ---
export const parsePMExcel = async (file: File): Promise<PMRecord[]> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = e.target?.result;
                const workbook = window.XLSX.read(data, { type: 'binary' });
                const sheetName = workbook.SheetNames[0];
                const sheet = workbook.Sheets[sheetName];
                const jsonData = window.XLSX.utils.sheet_to_json(sheet, { defval: "" });

                const mappedData: PMRecord[] = jsonData.map((row: any, index: number) => {
                     const findKey = (keywords: string[]) => Object.keys(row).find(k => 
                        keywords.some(kw => k.toLowerCase().includes(kw))
                    );

                    const assetKey = findKey(['asset', 'equipment', 'location', 'tag']);
                    const taskKey = findKey(['task', 'description', 'instruction', 'activity']);
                    const freqKey = findKey(['frequency', 'interval', 'period', 'schedule', 'quarter']);
                    const tradeKey = findKey(['trade', 'skill', 'craft', 'role']);
                    const durKey = findKey(['duration', 'time', 'hours', 'mins', 'est']);
                    const shutKey = findKey(['shutdown', 'stopped', 'offline', 'outage']);
                    const executorsKey = findKey(['executor', 'people', 'number', 'count']);
                    const typeKey = findKey(['contractor', 'internal', 'own', 'source', 'type']);

                    // Duration Logic: Input is HOURS
                    let duration = 0;
                    if(durKey) {
                        const val = Number(row[durKey]);
                        duration = isNaN(val) ? 0 : val;
                    }

                    const shutdownVal = shutKey ? String(row[shutKey]).toLowerCase() : 'no';
                    const isShutdown = shutdownVal.includes('y') || shutdownVal.includes('true') || shutdownVal.includes('req');

                    // Parse Frequency (Interval in Months)
                    let frequency = '1'; // Default to Monthly
                    if (freqKey) {
                        const val = row[freqKey];
                        if (typeof val === 'number') {
                             frequency = `${val}`; // Store numeric interval (1, 3, 6)
                        } else {
                            frequency = String(val);
                        }
                    }

                    // Parse Executors
                    let numExecutors = 1;
                    if (executorsKey) {
                        const val = parseInt(row[executorsKey]);
                        if (!isNaN(val) && val > 0) numExecutors = val;
                    }

                    // Parse Executor Type
                    let executorType: 'Internal' | 'Contractor' | 'Internal + Contractor' = 'Internal';
                    if (typeKey) {
                        const val = String(row[typeKey]).toLowerCase();
                        if (
                            (val.includes('internal') && val.includes('contractor')) || 
                            val.includes('both') || 
                            val.includes('+') ||
                            val.includes('&')
                        ) {
                            executorType = 'Internal + Contractor';
                        }
                        else if (val.includes('cont') || val.includes('ext')) {
                            executorType = 'Contractor';
                        }
                    }

                    return {
                        id: `pm-${index}-${Date.now()}`,
                        asset: assetKey ? String(row[assetKey]) : 'Unknown',
                        taskDescription: taskKey ? String(row[taskKey]) : 'Check equipment',
                        frequency: frequency,
                        trade: tradeKey ? String(row[tradeKey]) : 'General',
                        estimatedDuration: duration,
                        shutdownRequired: isShutdown,
                        numberOfExecutors: numExecutors,
                        executorType: executorType
                    };
                });
                resolve(mappedData);
            } catch (err) {
                reject(err);
            }
        };
        reader.readAsBinaryString(file);
    });
};

// Helper to convert frequency/interval to annual occurrences
// Logic: Numeric value = Interval in Months. e.g. "3" -> Every 3 months -> 4 times/year
export const normalizeFrequency = (freq: string): number => {
    const f = freq.toLowerCase().trim();
    
    // 1. Try numeric value which implies Months Interval
    const num = parseFloat(f);
    // Ensure it's a number and doesn't contain time units that contradict "Months" assumption
    const hasUnits = f.includes('day') || f.includes('week') || f.includes('year') || f.includes('qtr');
    
    if (!isNaN(num) && !hasUnits) {
        // Interpretation: num is Interval in Months
        // Freq per year = 12 / interval
        return num > 0 ? 12 / num : 0;
    }

    // 2. Parse text based frequencies (fallback)
    if (f.includes('dai') || f.includes('day')) return 365;
    if (f.includes('wee') || f.includes('week')) return 52;
    if (f.includes('qua') || f.includes('qtr')) return 4;
    if (f.includes('yea') || f.includes('ann')) return 1;
    if (f.includes('semi')) return 2;
    if (f.includes('mon')) return 12; // "Monthly"

    // Default fallback if unknown
    return 0; 
};


// --- Metric Calculators ---

export const calculateTimeBetweenFailures = (records: RawRecord[], mode: InputMode = 'timestamp'): number[] => {
    const failures = records.filter(r => r.type === StoppageType.Unplanned);
    if (mode === 'manual_ttf') {
        return failures.map(r => r.ttbf || 0).filter(t => t > 0);
    }
    const sortedFailures = [...failures].sort((a, b) => 
        new Date(a.startTime || 0).getTime() - new Date(b.startTime || 0).getTime()
    );
    const tbf: number[] = [];
    if (sortedFailures.length < 2) return tbf;
    for (let i = 0; i < sortedFailures.length - 1; i++) {
        const endCurrent = new Date(sortedFailures[i].startTime || 0).getTime() + (sortedFailures[i].durationMinutes * 60000);
        const startNext = new Date(sortedFailures[i+1].startTime || 0).getTime();
        const diffMs = startNext - endCurrent;
        if (diffMs > 0) tbf.push(diffMs / (1000 * 60 * 60));
    }
    return tbf;
};

export const calculateMetrics = (data: RawRecord[], mode: InputMode): ReliabilityMetrics => {
    const unplanned = data.filter(r => r.type === StoppageType.Unplanned);
    const failureCount = unplanned.length;
    const totalDowntime = unplanned.reduce((acc, r) => acc + r.durationMinutes, 0) / 60;
    let totalUptime = 0;

    if (mode === 'manual_ttf') {
        totalUptime = unplanned.reduce((acc, r) => acc + (r.ttbf || 0), 0);
    } else {
        if (data.length > 0) {
            const times = data.filter(r => r.startTime).map(r => new Date(r.startTime!).getTime());
            if (times.length > 0) {
                const start = Math.min(...times);
                const endRecord = data.reduce((prev, current) => {
                     const prevEnd = new Date(prev.startTime || 0).getTime() + prev.durationMinutes * 60000;
                     const currEnd = new Date(current.startTime || 0).getTime() + current.durationMinutes * 60000;
                     return currEnd > prevEnd ? current : prev;
                });
                const end = new Date(endRecord.startTime || 0).getTime() + endRecord.durationMinutes * 60000;
                const totalHours = (end - start) / (1000 * 60 * 60);
                totalUptime = Math.max(0, totalHours - totalDowntime);
            }
        }
    }
    const mtbf = failureCount > 0 ? totalUptime / failureCount : totalUptime;
    const mttr = failureCount > 0 ? totalDowntime / failureCount : 0;
    const totalTime = totalUptime + totalDowntime;
    const availability = totalTime > 0 ? (totalUptime / totalTime) * 100 : 0;
    return { mtbf, mttr, availability, totalUptime, totalDowntime, failureCount };
};

export const calculateWeibull = (tbfData: number[]): WeibullParams => {
    if (tbfData.length < 3) return { beta: 0, eta: 0, rSquared: 0, points: [] };
    const sortedTbf = [...tbfData].sort((a, b) => a - b);
    const n = sortedTbf.length;
    const points = sortedTbf.map((t, i) => {
        const rank = (i + 1 - 0.3) / (n + 0.4);
        const y = Math.log(-Math.log(1 - rank));
        const x = Math.log(t);
        return { x, y };
    });
    const sumX = points.reduce((acc, p) => acc + p.x, 0);
    const sumY = points.reduce((acc, p) => acc + p.y, 0);
    const sumXY = points.reduce((acc, p) => acc + (p.x * p.y), 0);
    const sumXX = points.reduce((acc, p) => acc + (p.x * p.x), 0);
    const denominator = (n * sumXX - sumX * sumX);
    if (denominator === 0) return { beta: 0, eta: 0, rSquared: 0, points };
    const slope = (n * sumXY - sumX * sumY) / denominator;
    const intercept = (sumY - slope * sumX) / n;
    const beta = slope;
    const eta = Math.exp(-intercept / beta);
    const yMean = sumY / n;
    const ssTot = points.reduce((acc, p) => acc + Math.pow(p.y - yMean, 2), 0);
    const ssRes = points.reduce((acc, p) => {
        const yPred = slope * p.x + intercept;
        return acc + Math.pow(p.y - yPred, 2);
    }, 0);
    const rSquared = ssTot === 0 ? 0 : 1 - (ssRes / ssTot);
    return { beta, eta, rSquared, points };
};

export const calculateOptimalPM = (beta: number, eta: number, cp: number, cc: number): number | null => {
    if (beta <= 1) return null; 
    if (cp >= cc) return null; 
    const ratio = cp / (cc * (beta - 1));
    const tOpt = eta * Math.pow(ratio, 1 / beta);
    return tOpt;
};

export const generateHistogram = (tbfData: number[], beta: number, eta: number) => {
    if (tbfData.length === 0) return [];
    const maxT = Math.max(...tbfData);
    const binCount = 10;
    const binWidth = maxT / binCount;
    const bins = Array.from({ length: binCount }, (_, i) => ({
        start: i * binWidth,
        end: (i + 1) * binWidth,
        mid: (i * binWidth) + (binWidth / 2),
        count: 0,
        pdf: 0
    }));
    tbfData.forEach(t => {
        const binIndex = Math.min(Math.floor(t / binWidth), binCount - 1);
        if (bins[binIndex]) bins[binIndex].count++;
    });
    const totalCount = tbfData.length;
    bins.forEach(bin => {
        const t = bin.mid;
        if (t > 0 && beta > 0 && eta > 0) {
            const f_t = (beta / eta) * Math.pow(t / eta, beta - 1) * Math.exp(-Math.pow(t / eta, beta));
            bin.pdf = f_t * totalCount * binWidth;
        }
    });
    return bins;
};

export const generateCostCurve = (beta: number, eta: number, cp: number, cc: number) => {
    if (beta === 0 || eta === 0) return [];
    if (beta <= 1) return []; 
    const startT = Math.max(1, eta * 0.1);
    const endT = eta * 2.0;
    const points = 50;
    const step = (endT - startT) / points;
    const dataPoints = [];
    for (let t = startT; t <= endT; t += step) {
        const R = Math.exp(-Math.pow(t / eta, beta));
        const F = 1 - R;
        let integralR = 0;
        const subSteps = 20;
        const subStepSize = t / subSteps;
        for(let j = 0; j < subSteps; j++) {
            const x1 = j * subStepSize;
            const x2 = (j + 1) * subStepSize;
            const r1 = Math.exp(-Math.pow(x1 / eta, beta));
            const r2 = Math.exp(-Math.pow(x2 / eta, beta));
            integralR += (r1 + r2) / 2 * subStepSize;
        }
        const costPerUnitTime = (cp * R + cc * F) / integralR;
        dataPoints.push({ t, cost: costPerUnitTime });
    }
    return dataPoints;
};

// --- TREND ANALYSIS MATH ---

// Crow-AMSAA (Reliability Growth)
export const calculateCrowAMSAA = (records: RawRecord[]): CrowAMSAA => {
    const failures = records
        .filter(r => r.type === StoppageType.Unplanned && r.startTime)
        .sort((a, b) => new Date(a.startTime!).getTime() - new Date(b.startTime!).getTime());

    if (failures.length < 3) return { beta: 0, lambda: 0, points: [] };

    // Calculate Cumulative Time and Cumulative Failures
    const startEpoch = new Date(failures[0].startTime!).getTime();
    const points: { x: number, y: number, date: string, t: number, n: number }[] = [];

    failures.forEach((f, i) => {
        const currentEpoch = new Date(f.startTime!).getTime();
        const cumulativeHours = (currentEpoch - startEpoch) / (1000 * 60 * 60);
        // Avoid log(0)
        if (cumulativeHours > 0) {
            points.push({
                t: cumulativeHours,
                n: i + 1,
                x: Math.log(cumulativeHours),
                y: Math.log(i + 1),
                date: f.startTime!.substring(0, 10)
            });
        }
    });

    // Linear Regression on ln(t) vs ln(n)
    const n = points.length;
    const sumX = points.reduce((acc, p) => acc + p.x, 0);
    const sumY = points.reduce((acc, p) => acc + p.y, 0);
    const sumXY = points.reduce((acc, p) => acc + (p.x * p.y), 0);
    const sumXX = points.reduce((acc, p) => acc + (p.x * p.x), 0);
    
    const denominator = (n * sumXX - sumX * sumX);
    if (denominator === 0) return { beta: 0, lambda: 0, points: [] };

    const slope = (n * sumXY - sumX * sumY) / denominator; // Beta
    const intercept = (sumY - slope * sumX) / n; // ln(Lambda)
    const lambda = Math.exp(intercept);

    return {
        beta: slope,
        lambda: lambda,
        points: points.map(p => ({
            cumulativeTime: p.t,
            cumulativeFailures: p.n,
            date: p.date
        }))
    };
};

// Rolling MTBF
export const calculateRollingMTBF = (records: RawRecord[], windowSize: number = 5): RollingMetric[] => {
     const failures = records
        .filter(r => r.type === StoppageType.Unplanned && r.startTime)
        .sort((a, b) => new Date(a.startTime!).getTime() - new Date(b.startTime!).getTime());

    if (failures.length < windowSize) return [];

    const results: RollingMetric[] = [];

    for (let i = windowSize; i < failures.length; i++) {
        const windowSlice = failures.slice(i - windowSize, i);
        
        // Calculate Uptime in this window
        // Simple approximation: Time between first and last failure in window
        const start = new Date(windowSlice[0].startTime!).getTime();
        const end = new Date(windowSlice[windowSlice.length - 1].startTime!).getTime();
        
        const totalDuration = (end - start) / (1000 * 60 * 60); // Hours
        const downtime = windowSlice.reduce((acc, r) => acc + r.durationMinutes, 0) / 60;
        const uptime = Math.max(0, totalDuration - downtime);
        
        const mtbf = uptime / windowSize;
        const mttr = downtime / windowSize;

        results.push({
            date: windowSlice[windowSlice.length - 1].startTime!.substring(0, 10),
            mtbf: mtbf,
            mttr: mttr
        });
    }

    return results;
};