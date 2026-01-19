
import { RawRecord, StoppageType, WeibullParams, InputMode, ReliabilityMetrics, PMRecord, CrowAMSAA, RollingMetric, ImportMode, FieldMapping } from "../types";

declare global {
  interface Window {
    XLSX: any;
    PptxGenJS: any;
  }
}

/**
 * Robust Utility to capture a DOM element (like a chart container) as a base64 image.
 * Uses a hidden canvas and XMLSerializer with explicit background handling.
 */
const getChartBase64 = async (containerId: string): Promise<string | null> => {
    const container = document.getElementById(containerId);
    if (!container) return null;
    
    const svg = container.querySelector('svg');
    if (!svg) return null;

    // Explicitly set dimensions to ensure visibility
    const bbox = svg.getBoundingClientRect();
    const width = bbox.width || 800;
    const height = bbox.height || 400;

    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const scale = 2; // High resolution
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    return new Promise((resolve) => {
        const img = new Image();
        const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(svgBlob);

        img.onload = () => {
            ctx.fillStyle = "white"; 
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            const base64 = canvas.toDataURL('image/png');
            URL.revokeObjectURL(url);
            resolve(base64);
        };
        img.onerror = () => resolve(null);
        img.src = url;
    });
};

/**
 * Workflow Integration: Generate a professional PowerPoint report
 */
export const generateReliabilityPresentation = async (datasetName: string, metrics: ReliabilityMetrics) => {
    const pptx = new window.PptxGenJS();
    pptx.layout = 'LAYOUT_16x9';

    // 1. Title Slide
    const slide1 = pptx.addSlide();
    slide1.background = { color: "F1F5F9" };
    slide1.addText("Asset Reliability Executive Report", { x: 0, y: 2.2, w: '100%', fontSize: 36, bold: true, color: "0F172A", align: "center" });
    slide1.addText(`Dataset: ${datasetName || 'Active System Data'}`, { x: 0, y: 3.2, w: '100%', fontSize: 18, color: "4F46E5", align: "center" });
    slide1.addText(`Generated: ${new Date().toLocaleDateString()}`, { x: 0, y: 4.8, w: '100%', fontSize: 12, color: "94A3B8", align: "center" });

    // 2. Metrics Overview Slide
    const slide2 = pptx.addSlide();
    slide2.addText("Reliability Performance Overview", { x: 0.5, y: 0.4, w: 9, h: 0.5, fontSize: 24, bold: true, color: "0F172A" });
    
    const metricBoxes = [
        { label: "MTBF", val: `${metrics.mtbf.toFixed(1)} hrs`, color: "4F46E5" },
        { label: "MTTR", val: `${metrics.mttr.toFixed(1)} hrs`, color: "F59E0B" },
        { label: "Availability", val: `${metrics.availability.toFixed(1)}%`, color: "10B981" }
    ];

    metricBoxes.forEach((m, i) => {
        const xPos = 0.5 + (i * 3.1);
        slide2.addShape(pptx.ShapeType.rect, { x: xPos, y: 1.1, w: 2.8, h: 1, fill: { color: "FFFFFF" }, line: { color: "E2E8F0", width: 1 } });
        slide2.addText(m.label, { x: xPos, y: 1.3, w: 2.8, h: 0.3, fontSize: 12, bold: true, color: "64748B", align: "center" });
        slide2.addText(m.val, { x: xPos, y: 1.6, w: 2.8, h: 0.4, fontSize: 22, bold: true, color: m.color, align: "center" });
    });

    // Capture main asset downtime chart
    const chart1 = await getChartBase64('chart-container-0');
    if (chart1) {
        slide2.addImage({ data: chart1, x: 0.5, y: 2.4, w: 9, h: 4.8 });
    } else {
        slide2.addText("[Chart capture unavailable - Ensure 'System Overview' is visible]", { x: 0.5, y: 3.5, w: 9, align: 'center', color: '94A3B8', fontSize: 10 });
    }

    // 3. Root Cause Analysis Slide
    const slide3 = pptx.addSlide();
    slide3.addText("Criticality & Root Cause Analysis", { x: 0.5, y: 0.4, w: 9, h: 0.5, fontSize: 24, bold: true });
    
    const paretoImg = await getChartBase64('chart-pareto-analysis');
    if (paretoImg) {
        slide3.addImage({ data: paretoImg, x: 0.5, y: 1.2, w: 6, h: 4.5 });
    }
    
    const heatmapImg = await getChartBase64('chart-heatmap');
    if (heatmapImg) {
        slide3.addImage({ data: heatmapImg, x: 6.7, y: 1.2, w: 2.8, h: 4.5 });
    }
    
    slide3.addText("Pareto identifies vital few drivers of downtime. Heatmap isolates operational risk windows.", { x: 0.5, y: 6.0, w: 9, fontSize: 11, color: "475569", italic: true });

    // 4. Trend Analysis Slide
    const slide4 = pptx.addSlide();
    slide4.addText("Reliability Growth & Stability Trends", { x: 0.5, y: 0.4, w: 9, h: 0.5, fontSize: 24, bold: true });
    
    const growthImg = await getChartBase64('chart-log-growth');
    if (growthImg) slide4.addImage({ data: growthImg, x: 0.5, y: 1.2, w: 4.5, h: 4.5 });
    
    const rollingImg = await getChartBase64('chart-stability-matrix');
    if (rollingImg) slide4.addImage({ data: rollingImg, x: 5.2, y: 1.2, w: 4.5, h: 4.5 });

    pptx.writeFile({ fileName: `Reliability_Report_${datasetName.replace(/\s+/g, '_') || 'System'}.pptx` });
};

/**
 * Utility to render a chart and copy it to the clipboard as an image.
 */
export const exportChartAsPNG = async (containerId: string, fileName: string) => {
    const dataUrl = await getChartBase64(containerId);
    if (!dataUrl) return;

    const base64Content = dataUrl.split(',')[1];
    const byteCharacters = atob(base64Content);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: 'image/png' });

    try {
        const item = new ClipboardItem({ "image/png": blob });
        await navigator.clipboard.write([item]);
        alert("Snapshot copied to clipboard!");
    } catch (err) {
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = `${fileName}.png`;
        link.click();
    }
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
                const workbook = window.XLSX.read(data, { 
                    type: 'array', 
                    cellDates: true, 
                    cellFormula: false, 
                    cellHTML: false, 
                    cellText: true 
                });
                const sheetName = workbook.SheetNames[0];
                const sheet = workbook.Sheets[sheetName];
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
                    delayType: String(getVal(row, 'delayType'))
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
                frequency: String(rawFreq), 
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
