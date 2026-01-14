import { RawRecord, StoppageType, WeibullParams, InputMode, ReliabilityMetrics, PMRecord, CrowAMSAA, RollingMetric, ImportMode, FieldMapping } from "../types";

declare global {
  interface Window {
    XLSX: any;
  }
}

/**
 * Utility to export an SVG element from Recharts to a PNG file
 */
export const exportChartAsPNG = (containerId: string, fileName: string) => {
    const container = document.getElementById(containerId);
    if (!container) return;
    const svg = container.querySelector('svg');
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const svgSize = svg.getBoundingClientRect();
    
    // Use 2x scale for higher resolution (retina/print quality)
    const scale = 2;
    canvas.width = svgSize.width * scale;
    canvas.height = svgSize.height * scale;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
        ctx.fillStyle = "white"; // Background fill for clean export
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const pngUrl = canvas.toDataURL('image/png');
        const downloadLink = document.createElement('a');
        downloadLink.href = pngUrl;
        downloadLink.download = `${fileName}.png`;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
        URL.revokeObjectURL(url);
    };
    img.src = url;
};

/**
 * High-performance Excel reading using ArrayBuffer and lean parsing
 */
export const readExcelRaw = async (file: File): Promise<{ headers: string[], rows: any[] }> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target?.result as ArrayBuffer);
                // Optimized parsing: raw values prioritized
                const workbook = window.XLSX.read(data, { 
                    type: 'array', 
                    cellDates: true, 
                    cellFormula: false, 
                    cellHTML: false, 
                    cellText: true // Enable cellText to capture exact display strings from Excel
                });
                const sheetName = workbook.SheetNames[0];
                const sheet = workbook.Sheets[sheetName];
                // Use defval to ensure empty cells result in empty strings, not undefined
                const jsonData = window.XLSX.utils.sheet_to_json(sheet, { defval: "" }); 
                
                if (jsonData.length === 0) {
                    reject("Excel file is empty");
                    return;
                }

                const headers = Object.keys(jsonData[0]);
                resolve({ headers, rows: jsonData });
            } catch (err) {
                reject(err);
            }
        };
        reader.readAsArrayBuffer(file);
    });
};

const parseCustomDate = (value: any): string | undefined => {
    if (value instanceof Date) {
        if (!isNaN(value.getTime())) return value.toISOString().split('T')[0];
        return undefined;
    }
    if (!value) return undefined;
    const str = String(value).trim();
    // Try to match YYYY-MM-DD or similar
    const match = str.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);
    if (match) {
        const y = parseInt(match[1]);
        const m = String(parseInt(match[2])).padStart(2, '0');
        const d = String(parseInt(match[3])).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
    const d = new Date(str);
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    return undefined;
};

const timeToMinutes = (val: any): number | null => {
    if (val === undefined || val === null || val === '') return null;
    if (typeof val === 'number') {
        // Excel stores time as a fraction of a day
        const fractionalDay = val % 1;
        return Math.round(fractionalDay * 24 * 60);
    }
    if (val instanceof Date) {
        return val.getHours() * 60 + val.getMinutes();
    }
    const str = String(val).trim();
    const match = str.match(/^(\d{1,2})[:\.\s](\d{1,2})/);
    if (match) {
        const h = parseInt(match[1]);
        const m = parseInt(match[2]);
        if (h >= 0 && h < 24 && m >= 0 && m < 60) return h * 60 + m;
    }
    return null;
};

/**
 * Process raw excel data into application objects without AI alterations
 */
export const processMappedData = (
    rawRows: any[], 
    mapping: FieldMapping[], 
    mode: ImportMode, 
    dateFormat: any = 'yyyy/mm/dd'
): RawRecord[] | PMRecord[] => {
    const fieldMap: Record<string, string | null> = {};
    mapping.forEach(m => { fieldMap[m.appField] = m.mappedColumn; });

    const getVal = (row: any, fieldKey: string) => {
        const colName = fieldMap[fieldKey];
        const val = (colName && row[colName] !== undefined) ? row[colName] : "";
        return val;
    };

    const timestamp = Date.now();

    if (mode === 'box1') {
        const result: RawRecord[] = [];
        const len = rawRows.length;
        for (let i = 0; i < len; i++) {
            const row = rawRows[i];
            const rawDate = getVal(row, 'date');
            const rawStartTime = getVal(row, 'startTime24');
            const rawEndTime = getVal(row, 'endTime24');
            const rawDur = getVal(row, 'durationMinutes');
            
            const datePart = parseCustomDate(rawDate);
            const startMins = timeToMinutes(rawStartTime);
            
            if (datePart && startMins !== null) {
                const h = Math.floor(startMins / 60);
                const m = startMins % 60;
                const finalStartTime = `${datePart}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00.000Z`;

                let duration = 0;
                if (rawDur !== "") {
                    duration = Number(rawDur);
                } else {
                    const endMins = timeToMinutes(rawEndTime);
                    if (endMins !== null) {
                        duration = endMins - startMins;
                        if (duration < 0) duration += 1440;
                    }
                }

                result.push({
                    id: `import-${i}-${timestamp}`,
                    startTime: finalStartTime,
                    ttbf: 0,
                    durationMinutes: duration,
                    type: StoppageType.Unplanned,
                    description: String(getVal(row, 'description')),
                    location: String(getVal(row, 'location')),
                    failureMode: String(getVal(row, 'failureMode')),
                    delayType: String(getVal(row, 'delayType')) // Added mapping
                });
            }
        }
        return result;
    } else {
        return rawRows.map((row, index) => {
            const rawTaskType = getVal(row, 'taskType');
            const rawShutdown = getVal(row, 'shutdownRequired');
            const rawFreq = getVal(row, 'frequency');
            const rawDur = getVal(row, 'estimatedDuration');
            const rawExecs = getVal(row, 'numberOfExecutors');
            
            let isShutdown = false;
            if (rawShutdown !== "") {
                const s = String(rawShutdown).toLowerCase();
                isShutdown = s.includes('shut') || s.includes('yes') || s === '1' || s === 'true';
            }

            return {
                id: `pm-import-${index}-${timestamp}`,
                asset: String(getVal(row, 'asset')),
                taskDescription: String(getVal(row, 'taskDescription')),
                frequency: String(rawFreq), // PULL EXACT FREQUENCY STRING FROM EXCEL
                trade: String(getVal(row, 'trade')),
                estimatedDuration: rawDur !== "" ? Number(rawDur) : 0,
                shutdownRequired: isShutdown,
                numberOfExecutors: rawExecs !== "" ? Number(rawExecs) : 0,
                executorType: String(getVal(row, 'executorType')),
                criticality: String(getVal(row, 'criticality')),
                taskType: rawTaskType ? String(rawTaskType) : ""
            } as PMRecord;
        });
    }
};

/**
 * Normalization only used for calculation/analytics, not during import storage
 */
export const normalizeFrequency = (freq: string): number => {
    if (!freq) return 1;
    const f = freq.toLowerCase().trim();
    
    const match = f.match(/(\d+(\.\d+)?)/);
    const num = match ? parseFloat(match[0]) : null;

    if (f.includes('dai') || f.includes('day')) return num ? 365 / num : 365;
    if (f.includes('wee')) return num ? 52 / num : 52;
    if (f.includes('mon')) return num ? 12 / num : 12;
    if (f.includes('yea') || f.includes('annu')) return num ? 1 / num : 1;
    if (f.includes('fortnight')) return 26;
    if (f.includes('quart')) return 4;
    if (num !== null && !isNaN(num)) return 12 / num;

    return 1; 
};

export const calculateTimeBetweenFailures = (records: RawRecord[], mode: InputMode = 'timestamp'): number[] => {
    const failures = records.filter(r => r.type === StoppageType.Unplanned);
    const sortedFailures = [...failures].sort((a, b) => new Date(a.startTime || 0).getTime() - new Date(b.startTime || 0).getTime());
    const tbf: number[] = [];
    if (sortedFailures.length < 2) return tbf;
    for (let i = 0; i < sortedFailures.length - 1; i++) {
        const endCurrent = new Date(sortedFailures[i].startTime || 0).getTime() + (sortedFailures[i].durationMinutes * 60000);
        const startNext = new Date(sortedFailures[i+1].startTime || 0).getTime();
        const diffMs = startNext - endCurrent;
        if (diffMs > 0) tbf.push(diffMs / 3600000);
    }
    return tbf;
};

export const calculateMetrics = (data: RawRecord[], mode: InputMode): ReliabilityMetrics => {
    const unplanned = data.filter(r => r.type === StoppageType.Unplanned);
    const failureCount = unplanned.length;
    const totalDowntime = unplanned.reduce((acc, r) => acc + r.durationMinutes, 0) / 60;
    let totalUptime = 0;
    const tbfs = calculateTimeBetweenFailures(data, mode);

    if (data.length > 1) {
        const times = data.filter(r => r.startTime).map(r => new Date(r.startTime!).getTime());
        const start = Math.min(...times);
        const end = Math.max(...times.map((t, i) => t + data[i].durationMinutes * 60000));
        totalUptime = Math.max(0, ((end - start) / 3600000) - totalDowntime);
    }
    
    const mtbf = failureCount > 0 ? totalUptime / failureCount : 0;
    const mttr = failureCount > 0 ? totalDowntime / failureCount : 0;
    const meanTbf = tbfs.length > 0 ? tbfs.reduce((a, b) => a + b, 0) / tbfs.length : 0;
    const stdDevTbf = tbfs.length > 1 ? Math.sqrt(tbfs.reduce((a, b) => a + Math.pow(b - meanTbf, 2), 0) / tbfs.length) : 0;
    const mtbfCoV = meanTbf > 0 ? stdDevTbf / meanTbf : 0;

    const totalTime = totalUptime + totalDowntime;
    const availability = totalTime > 0 ? (totalUptime / totalTime) * 100 : 0;
    return { mtbf, mttr, availability, totalUptime, totalDowntime, failureCount, mtbfCoV };
};

export const calculateFailureProbability = (beta: number, eta: number, hours: number): number => {
    if (beta === 0 || eta === 0) return 0;
    return (1 - Math.exp(-Math.pow(hours / eta, beta))) * 100;
};

export const calculateReliabilityAtTime = (beta: number, eta: number, t: number): number => {
    if (beta === 0 || eta === 0) return 1;
    return Math.exp(-Math.pow(t / eta, beta));
};

export const calculatePDFAtTime = (beta: number, eta: number, t: number): number => {
    if (beta === 0 || eta === 0 || t === 0) return 0;
    const r = calculateReliabilityAtTime(beta, eta, t);
    return (beta / eta) * Math.pow(t / eta, beta - 1) * r;
};

export const calculateHazardAtTime = (beta: number, eta: number, t: number): number => {
    if (beta === 0 || eta === 0 || t === 0) return 0;
    return (beta / eta) * Math.pow(t / eta, beta - 1);
};

export const calculateBLife = (beta: number, eta: number, p: number): number => {
    if (beta === 0 || eta === 0) return 0;
    return eta * Math.pow(-Math.log(1 - p), 1 / beta);
};

export const calculateWeibull = (tbfData: number[]): WeibullParams => {
    if (tbfData.length < 3) return { beta: 0, eta: 0, rSquared: 0, points: [] };
    const sortedTbf = [...tbfData].sort((a, b) => a - b);
    const n = sortedTbf.length;
    const points = sortedTbf.map((t, i) => ({
        x: Math.log(t),
        y: Math.log(-Math.log(1 - ((i + 1 - 0.3) / (n + 0.4))))
    }));
    const sumX = points.reduce((acc, p) => acc + p.x, 0);
    const sumY = points.reduce((acc, p) => acc + p.y, 0);
    const sumXY = points.reduce((acc, p) => acc + (p.x * p.y), 0);
    const sumXX = points.reduce((acc, p) => acc + (p.x * p.x), 0);
    const beta = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const eta = Math.exp(-(sumY - beta * sumX) / (n * beta));
    
    const meanY = sumY / n;
    const ssTot = points.reduce((acc, p) => acc + Math.pow(p.y - meanY, 2), 0);
    const ssRes = points.reduce((acc, p) => {
        const yPred = beta * p.x + (sumY - beta * sumX) / n;
        return acc + Math.pow(p.y - yPred, 2);
    }, 0);
    const rSquared = 1 - (ssRes / (ssTot || 1));

    return { beta, eta, rSquared, points };
};

export const calculateOptimalPM = (beta: number, eta: number, cp: number, cc: number): number | null => {
    if (beta <= 1 || cp >= cc) return null; 
    return eta * Math.pow(cp / (cc * (beta - 1)), 1 / beta);
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
        count: 0
    }));
    tbfData.forEach(t => {
        const binIndex = Math.min(Math.floor(t / binWidth), binCount - 1);
        bins[binIndex].count++;
    });
    return bins;
};

export const generateTbfHistogram = (tbfData: number[]): { name: string, count: number }[] => {
    if (tbfData.length < 2) return [];
    
    const maxT = Math.max(...tbfData);
    if (maxT <= 0) return [];
    
    const binCount = 15;
    let binWidth = Math.ceil(maxT / binCount);
    if (binWidth > 10) {
        binWidth = Math.ceil(binWidth / 10) * 10;
    } else if (binWidth === 0) {
        binWidth = 1;
    }

    const effectiveBinCount = Math.ceil(maxT / binWidth);

    const bins = Array.from({ length: effectiveBinCount }, (_, i) => ({
        name: `${i * binWidth}-${(i + 1) * binWidth}`,
        count: 0
    }));

    tbfData.forEach(t => {
        const binIndex = Math.min(Math.floor(t / binWidth), effectiveBinCount - 1);
        if (bins[binIndex]) {
            bins[binIndex].count++;
        }
    });

    return bins;
};

export const generateCostCurve = (beta: number, eta: number, cp: number, cc: number) => {
    if (beta <= 1 || eta === 0) return [];
    const startT = Math.max(1, eta * 0.1);
    const endT = eta * 1.5;
    const step = (endT - startT) / 50;
    const dataPoints = [];
    for (let t = startT; t <= endT; t += step) {
        const R = Math.exp(-Math.pow(t / eta, beta));
        const F = 1 - R;
        const cost = (cp * R + cc * F) / t;
        dataPoints.push({ t, cost });
    }
    return dataPoints;
};

export const calculateCrowAMSAA = (records: RawRecord[]): CrowAMSAA => {
    const failures = records.filter(r => r.type === StoppageType.Unplanned && r.startTime).sort((a, b) => new Date(a.startTime!).getTime() - new Date(b.startTime!).getTime());
    if (failures.length < 3) return { beta: 0, lambda: 0, points: [] };
    const startEpoch = new Date(failures[0].startTime!).getTime();
    const points = failures.map((f, i) => ({
        cumulativeTime: (new Date(f.startTime!).getTime() - startEpoch) / 3600000,
        cumulativeFailures: i + 1,
        date: f.startTime!.substring(0, 10)
    })).filter(p => p.cumulativeTime > 0);
    return { beta: 1, lambda: 0, points };
};

export const calculateRollingMTBF = (records: RawRecord[], windowSize: number = 5): RollingMetric[] => {
     const failures = records.filter(r => r.type === StoppageType.Unplanned && r.startTime).sort((a, b) => new Date(a.startTime!).getTime() - new Date(b.startTime!).getTime());
    if (failures.length < windowSize) return [];
    const results: RollingMetric[] = [];
    for (let i = windowSize; i < failures.length; i++) {
        const window = failures.slice(i - windowSize, i);
        const start = new Date(window[0].startTime!).getTime();
        const end = new Date(window[window.length - 1].startTime!).getTime();
        results.push({ date: window[window.length - 1].startTime!.substring(0, 10), mtbf: ((end - start) / 3600000) / windowSize, mttr: 1 });
    }
    return results;
};