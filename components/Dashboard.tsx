
import React, { useMemo, useState } from 'react';
import { RawRecord, StoppageType, ReliabilityMetrics, InputMode } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Cell, Legend, ComposedChart, Scatter } from 'recharts';
import { calculateMetrics, calculateTimeBetweenFailures, calculateWeibull, generateHistogram } from '../utils/reliabilityMath';
import { Filter, RefreshCcw, Activity, Clock, Hash, Layers, TrendingUp, ScatterChart as ScatterIcon, BarChart as BarChartIcon, Presentation } from 'lucide-react';

interface DashboardProps {
  data: RawRecord[];
  inputMode: InputMode;
  selectedAsset: string;
  onAssetChange: (val: string) => void;
  selectedMode: string;
  onModeChange: (val: string) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ 
    data, 
    inputMode,
    selectedAsset,
    onAssetChange,
    selectedMode,
    onModeChange
}) => {
  // --- Chart Config State ---
  // Left Chart (Duration) Grouping
  const [durationGroupBy, setDurationGroupBy] = useState<'mode' | 'asset'>('mode');
  // Right Chart (Frequency) Grouping
  const [frequencyGroupBy, setFrequencyGroupBy] = useState<'mode' | 'asset'>('mode');

  // --- Derived Lists for Dropdowns ---
  const uniqueAssets = useMemo(() => {
    return Array.from(new Set(data.map(r => r.location || 'Unknown'))).sort();
  }, [data]);

  const uniqueModes = useMemo(() => {
    return Array.from(new Set(data.map(r => r.failureMode || 'Uncategorized'))).sort();
  }, [data]);

  // --- Filter Logic ---
  const filteredData = useMemo(() => {
    return data.filter(r => {
      const matchAsset = selectedAsset === 'All' || r.location === selectedAsset;
      const matchMode = selectedMode === 'All' || r.failureMode === selectedMode;
      return matchAsset && matchMode;
    });
  }, [data, selectedAsset, selectedMode]);

  // --- Real-time Calculations based on Filtered Data ---
  const metrics = useMemo<ReliabilityMetrics>(() => {
    return calculateMetrics(filteredData, inputMode);
  }, [filteredData, inputMode]);

  const tbfData = useMemo(() => {
      return calculateTimeBetweenFailures(filteredData, inputMode);
  }, [filteredData, inputMode]);

  const currentWeibull = useMemo(() => {
      return calculateWeibull(tbfData);
  }, [tbfData]);

  // --- Chart Data Preparation ---

  // Helper to generate chart data
  const generateChartData = (measure: 'duration' | 'frequency', groupBy: 'mode' | 'asset') => {
    const aggregated: Record<string, number> = {};
    
    // We use filteredData here so the charts reflect the global selection
    filteredData.filter(r => r.type === StoppageType.Unplanned).forEach(r => {
        const key = groupBy === 'mode' ? (r.failureMode || 'Uncategorized') : (r.location || 'Unknown');
        const val = measure === 'duration' ? r.durationMinutes : 1;
        aggregated[key] = (aggregated[key] || 0) + val;
    });

    return Object.entries(aggregated)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 10); // Keep top 10
  };

  const durationData = useMemo(() => generateChartData('duration', durationGroupBy), [filteredData, durationGroupBy]);
  const frequencyData = useMemo(() => generateChartData('frequency', frequencyGroupBy), [filteredData, frequencyGroupBy]);

  // 3. Survival Curve
  const survivalData = useMemo(() => {
    if (currentWeibull.beta === 0 || currentWeibull.eta === 0) return [];
    const maxT = Math.min(currentWeibull.eta * 2.5, 100000); 
    const step = maxT / 60;
    
    const points = [];
    for (let t = 0; t <= maxT; t += step) {
        const reliability = Math.exp(-Math.pow(t / currentWeibull.eta, currentWeibull.beta));
        points.push({ t: Math.round(t), reliability });
    }
    return points;
  }, [currentWeibull]);

  // 4. Hazard Rate Curve h(t)
  const hazardData = useMemo(() => {
    if (currentWeibull.beta === 0 || currentWeibull.eta === 0) return [];
    const maxT = Math.min(currentWeibull.eta * 2.5, 100000);
    const step = maxT / 60;
    
    const points = [];
    // Start from step to avoid division by zero if t=0 and beta < 1
    for (let t = step; t <= maxT; t += step) {
        // h(t) = (beta/eta) * (t/eta)^(beta-1)
        const h = (currentWeibull.beta / currentWeibull.eta) * Math.pow((t / currentWeibull.eta), currentWeibull.beta - 1);
        points.push({ t: Math.round(t), h });
    }
    return points;
  }, [currentWeibull]);

  // 5. Probability Plot Data with Regression Line
  const probPlotData = useMemo(() => {
    if (!currentWeibull.points || currentWeibull.points.length === 0) {
        return { points: [], lineData: [] };
    }
    
    const minX = Math.min(...currentWeibull.points.map(p => p.x));
    const maxX = Math.max(...currentWeibull.points.map(p => p.x));
    
    // y = beta*x - beta*ln(eta)
    const intercept = -currentWeibull.beta * Math.log(currentWeibull.eta);
    
    const lineData = [
        { x: minX, lineY: currentWeibull.beta * minX + intercept },
        { x: maxX, lineY: currentWeibull.beta * maxX + intercept }
    ];
    
    return { points: currentWeibull.points, lineData };
  }, [currentWeibull]);

  // 6. Histogram Data (Distribution)
  const histogramData = useMemo(() => {
      return generateHistogram(tbfData, currentWeibull.beta, currentWeibull.eta);
  }, [tbfData, currentWeibull]);


  // --- Interaction Handlers ---
  const handleChartClick = (data: any, groupBy: 'mode' | 'asset') => {
      if (data && data.activePayload && data.activePayload.length > 0) {
          const clickedName = data.activePayload[0].payload.name;
          
          if (groupBy === 'asset') {
              onAssetChange(clickedName === selectedAsset ? 'All' : clickedName);
          } else {
              onModeChange(clickedName === selectedMode ? 'All' : clickedName);
          }
      }
  };

  const getOpacity = (entryName: string, groupBy: 'mode' | 'asset') => {
      if (groupBy === 'asset') {
          return (selectedAsset === 'All' || selectedAsset === entryName) ? 1 : 0.3;
      } else {
          return (selectedMode === 'All' || selectedMode === entryName) ? 1 : 0.3;
      }
  };

  const handleExportDashboardPPT = () => {
    const pptx = new (window as any).PptxGenJS();
    pptx.layout = 'LAYOUT_16x9';

    // Slide 1: Title & KPIs
    const slide1 = pptx.addSlide();
    slide1.addText("Reliability Statistics Report", { x: 0.5, y: 0.5, fontSize: 24, bold: true, color: '363636' });
    slide1.addText(`Asset: ${selectedAsset}, Failure Mode: ${selectedMode}`, { x: 0.5, y: 1.0, fontSize: 14, color: '666666' });
    slide1.addText(`Generated: ${new Date().toLocaleDateString()}`, { x: 0.5, y: 1.3, fontSize: 12, color: '888888' });

    // KPI Boxes
    const kpiY = 2.5;
    const kpiW = 2.2;
    const kpiH = 1.2;
    const margin = 0.2;

    // MTBF
    slide1.addShape(pptx.ShapeType.rect, { x: 0.5, y: kpiY, w: kpiW, h: kpiH, fill: 'EEF2FF', line: { color: 'C7D2FE' } });
    slide1.addText("MTBF", { x: 0.5, y: kpiY + 0.1, w: kpiW, align: 'center', fontSize: 12, color: '4338CA', bold: true });
    slide1.addText(`${metrics.mtbf.toFixed(1)} hrs`, { x: 0.5, y: kpiY + 0.5, w: kpiW, align: 'center', fontSize: 20, color: '312E81', bold: true });

    // MTTR
    slide1.addShape(pptx.ShapeType.rect, { x: 0.5 + kpiW + margin, y: kpiY, w: kpiW, h: kpiH, fill: 'FFF7ED', line: { color: 'FED7AA' } });
    slide1.addText("MTTR", { x: 0.5 + kpiW + margin, y: kpiY + 0.1, w: kpiW, align: 'center', fontSize: 12, color: 'EA580C', bold: true });
    slide1.addText(`${metrics.mttr.toFixed(1)} hrs`, { x: 0.5 + kpiW + margin, y: kpiY + 0.5, w: kpiW, align: 'center', fontSize: 20, color: '9A3412', bold: true });

    // Availability
    slide1.addShape(pptx.ShapeType.rect, { x: 0.5 + (kpiW + margin) * 2, y: kpiY, w: kpiW, h: kpiH, fill: 'ECFDF5', line: { color: 'A7F3D0' } });
    slide1.addText("Availability", { x: 0.5 + (kpiW + margin) * 2, y: kpiY + 0.1, w: kpiW, align: 'center', fontSize: 12, color: '059669', bold: true });
    slide1.addText(`${metrics.availability.toFixed(1)}%`, { x: 0.5 + (kpiW + margin) * 2, y: kpiY + 0.5, w: kpiW, align: 'center', fontSize: 20, color: '064E3B', bold: true });

    // Beta
    slide1.addShape(pptx.ShapeType.rect, { x: 0.5 + (kpiW + margin) * 3, y: kpiY, w: kpiW, h: kpiH, fill: 'F3F4F6', line: { color: 'E5E7EB' } });
    slide1.addText("Weibull Beta", { x: 0.5 + (kpiW + margin) * 3, y: kpiY + 0.1, w: kpiW, align: 'center', fontSize: 12, color: '4B5563', bold: true });
    slide1.addText(`${currentWeibull.beta.toFixed(2)}`, { x: 0.5 + (kpiW + margin) * 3, y: kpiY + 0.5, w: kpiW, align: 'center', fontSize: 20, color: '1F2937', bold: true });
    slide1.addText(`Eta: ${currentWeibull.eta.toFixed(0)}`, { x: 0.5 + (kpiW + margin) * 3, y: kpiY + 0.9, w: kpiW, align: 'center', fontSize: 10, color: '6B7280' });


    // Slide 2: Pareto Charts
    if (durationData.length > 0 || frequencyData.length > 0) {
        const slide2 = pptx.addSlide();
        slide2.addText("Failure Analysis (Pareto)", { x: 0.5, y: 0.5, fontSize: 18, bold: true });

        // Chart 1: Downtime
        if (durationData.length > 0) {
            slide2.addText("Total Downtime (Minutes)", { x: 0.5, y: 1.0, fontSize: 14 });
            slide2.addChart(pptx.ChartType.bar, 
                [{
                    name: "Duration",
                    labels: durationData.map(d => d.name),
                    values: durationData.map(d => d.value)
                }],
                { x: 0.5, y: 1.5, w: 4.5, h: 4.5, barDir: 'col', chartColors: ['F43F5E'] }
            );
        }

        // Chart 2: Frequency
        if (frequencyData.length > 0) {
            slide2.addText("Failure Frequency (Count)", { x: 5.5, y: 1.0, fontSize: 14 });
             slide2.addChart(pptx.ChartType.bar, 
                [{
                    name: "Frequency",
                    labels: frequencyData.map(d => d.name),
                    values: frequencyData.map(d => d.value)
                }],
                { x: 5.5, y: 1.5, w: 4.5, h: 4.5, barDir: 'col', chartColors: ['6366F1'] }
            );
        }
    }

    // Slide 3: Reliability Curves
    if (survivalData.length > 0 || hazardData.length > 0) {
        const slide3 = pptx.addSlide();
        slide3.addText("Reliability Characteristics", { x: 0.5, y: 0.5, fontSize: 18, bold: true });

        // Survival
        if (survivalData.length > 0) {
            slide3.addText("Survival Probability R(t)", { x: 0.5, y: 1.0, fontSize: 14 });
            // Downsample for PPT speed
            const dsSurvival = survivalData.filter((_, i) => i % 5 === 0);
            slide3.addChart(pptx.ChartType.line,
                [{
                    name: "Reliability",
                    labels: dsSurvival.map(d => d.t.toString()),
                    values: dsSurvival.map(d => d.reliability)
                }],
                { x: 0.5, y: 1.5, w: 9, h: 2.5, chartColors: ['059669'], showLegend: false }
            );
        }

        // Hazard
        if (hazardData.length > 0) {
            slide3.addText("Hazard Rate h(t)", { x: 0.5, y: 4.2, fontSize: 14 });
             const dsHazard = hazardData.filter((_, i) => i % 5 === 0);
             slide3.addChart(pptx.ChartType.line,
                [{
                    name: "Hazard Rate",
                    labels: dsHazard.map(d => d.t.toString()),
                    values: dsHazard.map(d => d.h)
                }],
                { x: 0.5, y: 4.7, w: 9, h: 2.5, chartColors: ['DC2626'], showLegend: false }
            );
        }
    }

     // Slide 4: Weibull Plots
    if (probPlotData.points && probPlotData.points.length > 0) {
        const slide4 = pptx.addSlide();
        slide4.addText("Advanced Weibull Analysis", { x: 0.5, y: 0.5, fontSize: 18, bold: true });
        
        // Probability Plot (Scatter)
        slide4.addText("Weibull Probability Plot", { x: 0.5, y: 1.0, fontSize: 14 });
        slide4.addChart(pptx.ChartType.scatter,
            [
                { name: "Failures", values: probPlotData.points.map(p => ({ x: p.x, y: p.y })) }
            ],
            { x: 0.5, y: 1.5, w: 4.5, h: 4.5, chartColors: ['4F46E5'] }
        );

        // Histogram
         if (histogramData.length > 0) {
            slide4.addText("Time-to-Failure Distribution", { x: 5.5, y: 1.0, fontSize: 14 });
            slide4.addChart(pptx.ChartType.bar,
                [{
                    name: "Failures",
                    labels: histogramData.map(d => d.mid.toFixed(0)),
                    values: histogramData.map(d => d.count)
                }],
                { x: 5.5, y: 1.5, w: 4.5, h: 4.5, chartColors: ['93C5FD'] }
            );
        }
    }

    pptx.writeFile({ fileName: `Reliability_Stats_${selectedAsset}.pptx` });
  };

  return (
    <div className="space-y-6">
        {/* --- Filters Toolbar --- */}
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 flex flex-wrap items-center gap-4 md:gap-8 sticky top-0 z-20">
            <div className="flex items-center gap-2 text-gray-700 font-medium">
                <Filter size={20} className="text-indigo-600"/>
                <span>Filters:</span>
            </div>
            
            <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500 uppercase font-semibold">Asset:</label>
                <select 
                    value={selectedAsset}
                    onChange={(e) => onAssetChange(e.target.value)}
                    className={`bg-gray-50 border text-gray-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block w-48 p-2 transition ${selectedAsset !== 'All' ? 'border-indigo-500 bg-indigo-50 font-semibold' : 'border-gray-300'}`}
                >
                    <option value="All">All Assets</option>
                    {uniqueAssets.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
            </div>

            <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500 uppercase font-semibold">Failure Mode:</label>
                <select 
                    value={selectedMode}
                    onChange={(e) => onModeChange(e.target.value)}
                    className={`bg-gray-50 border text-gray-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block w-48 p-2 transition ${selectedMode !== 'All' ? 'border-indigo-500 bg-indigo-50 font-semibold' : 'border-gray-300'}`}
                >
                    <option value="All">All Modes</option>
                    {uniqueModes.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
            </div>

            <div className="ml-auto flex items-center gap-3">
                <button 
                    onClick={handleExportDashboardPPT}
                    className="flex items-center gap-2 bg-orange-100 hover:bg-orange-200 text-orange-800 px-3 py-1.5 rounded-lg text-sm font-medium transition border border-orange-200"
                    title="Export Dashboard to PowerPoint"
                >
                    <Presentation size={16} /> Export PPT
                </button>
                <button 
                    onClick={() => { onAssetChange('All'); onModeChange('All'); }}
                    className="flex items-center gap-1 text-sm text-gray-500 hover:text-indigo-600 transition"
                >
                    <RefreshCcw size={14} /> Reset
                </button>
            </div>
        </div>

        {/* --- KPI Cards --- */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 relative overflow-hidden">
                <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Mean Time Between Failures</p>
                <div className="mt-2 flex items-baseline gap-1">
                    <p className="text-3xl font-bold text-indigo-700">{metrics.mtbf.toFixed(1)}</p>
                    <span className="text-sm text-gray-400">hours</span>
                </div>
                <div className="absolute top-0 right-0 p-4 opacity-10">
                    <Activity size={48} className="text-indigo-600" />
                </div>
            </div>
            
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 relative overflow-hidden">
                <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Mean Time To Repair</p>
                <div className="mt-2 flex items-baseline gap-1">
                     <p className="text-3xl font-bold text-orange-600">{metrics.mttr.toFixed(1)}</p>
                     <span className="text-sm text-gray-400">hours</span>
                </div>
                 <div className="absolute top-0 right-0 p-4 opacity-10">
                    <RefreshCcw size={48} className="text-orange-600" />
                </div>
            </div>
            
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 relative overflow-hidden">
                <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Availability</p>
                <p className="text-3xl font-bold text-emerald-600 mt-2">{metrics.availability.toFixed(1)}%</p>
                <div className="w-full bg-gray-100 h-1.5 mt-3 rounded-full overflow-hidden">
                    <div className="bg-emerald-500 h-full" style={{ width: `${Math.min(metrics.availability, 100)}%` }}></div>
                </div>
            </div>
            
             <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 relative overflow-hidden">
                <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Reliability Shape (Beta)</p>
                <div className="flex items-end gap-2 mt-2">
                    <p className="text-3xl font-bold text-purple-600">{currentWeibull.beta.toFixed(2)}</p>
                    <span className="text-xs text-gray-500 mb-1 px-2 py-0.5 bg-gray-100 rounded-full">
                        {currentWeibull.beta < 1 ? 'Early Life' : currentWeibull.beta === 1 ? 'Random' : 'Wear Out'}
                    </span>
                </div>
                <p className="text-xs text-gray-400 mt-2">Scale (Eta): {currentWeibull.eta.toFixed(0)} hrs</p>
            </div>
        </div>

        {/* --- Charts Row 1 --- */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
             {/* LEFT CHART: Duration Analysis */}
             <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 flex flex-col h-96">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                        <Clock size={18} className="text-rose-500"/> Total Downtime (Duration)
                    </h3>
                    <div className="flex bg-gray-100 p-0.5 rounded-lg">
                        <button 
                            onClick={() => setDurationGroupBy('mode')}
                            className={`px-3 py-1 text-xs font-medium rounded-md transition flex items-center gap-1 ${durationGroupBy === 'mode' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            <Layers size={12} /> By Mode
                        </button>
                        <button 
                            onClick={() => setDurationGroupBy('asset')}
                            className={`px-3 py-1 text-xs font-medium rounded-md transition flex items-center gap-1 ${durationGroupBy === 'asset' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            <Layers size={12} /> By Asset
                        </button>
                    </div>
                </div>
                
                <div className="flex-1 min-h-0">
                    {durationData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart 
                                data={durationData} 
                                layout="vertical" 
                                margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
                                onClick={(data) => handleChartClick(data, durationGroupBy)}
                            >
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
                                <XAxis type="number" tick={{fontSize: 12}} />
                                <YAxis 
                                    dataKey="name" 
                                    type="category" 
                                    width={120} 
                                    tick={{fontSize: 11, fill: '#374151'}} 
                                    interval={0}
                                />
                                <Tooltip 
                                    cursor={{fill: '#fff1f2', opacity: 0.5}}
                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    formatter={(val: number) => [`${val.toFixed(0)} min`, 'Total Downtime']} 
                                />
                                <Bar 
                                    dataKey="value" 
                                    radius={[0, 4, 4, 0]} 
                                    barSize={20}
                                    className="cursor-pointer"
                                >
                                    {durationData.map((entry, index) => (
                                        <Cell 
                                            key={`cell-${index}`} 
                                            fill="#f43f5e" 
                                            fillOpacity={getOpacity(entry.name, durationGroupBy)}
                                        />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-full flex items-center justify-center text-gray-400 text-sm bg-gray-50 rounded">
                            No data for current filters
                        </div>
                    )}
                </div>
            </div>

            {/* RIGHT CHART: Frequency Analysis */}
            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 flex flex-col h-96">
                <div className="flex justify-between items-center mb-4">
                     <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                        <Hash size={18} className="text-indigo-500"/> Failure Frequency
                    </h3>
                    <div className="flex bg-gray-100 p-0.5 rounded-lg">
                        <button 
                            onClick={() => setFrequencyGroupBy('mode')}
                            className={`px-3 py-1 text-xs font-medium rounded-md transition flex items-center gap-1 ${frequencyGroupBy === 'mode' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            <Layers size={12} /> By Mode
                        </button>
                        <button 
                            onClick={() => setFrequencyGroupBy('asset')}
                            className={`px-3 py-1 text-xs font-medium rounded-md transition flex items-center gap-1 ${frequencyGroupBy === 'asset' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            <Layers size={12} /> By Asset
                        </button>
                    </div>
                </div>

                <div className="flex-1 min-h-0">
                    {frequencyData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart 
                                data={frequencyData} 
                                margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                                onClick={(data) => handleChartClick(data, frequencyGroupBy)}
                            >
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                                <XAxis 
                                    dataKey="name" 
                                    tick={{fontSize: 11, fill: '#6b7280'}} 
                                    interval={0}
                                    angle={-45}
                                    textAnchor="end"
                                    height={60}
                                />
                                <YAxis tick={{fontSize: 12, fill: '#6b7280'}} allowDecimals={false}/>
                                <Tooltip 
                                    cursor={{fill: '#e0e7ff', opacity: 0.5}}
                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    formatter={(val: number) => [val, 'Occurrences']}
                                />
                                <Bar 
                                    dataKey="value" 
                                    radius={[4, 4, 0, 0]}
                                    className="cursor-pointer"
                                >
                                    {frequencyData.map((entry, index) => (
                                        <Cell 
                                            key={`cell-${index}`} 
                                            fill={index % 2 === 0 ? '#6366f1' : '#818cf8'} 
                                            fillOpacity={getOpacity(entry.name, frequencyGroupBy)}
                                        />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-full flex items-center justify-center text-gray-400 text-sm bg-gray-50 rounded">
                            No records found
                        </div>
                    )}
                </div>
            </div>
        </div>

        {/* --- Charts Row 2: Reliability Curves --- */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Survival Probability */}
            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 h-80">
                <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                    <Activity size={18} className="text-green-600"/> Reliability Survival Curve
                </h3>
                <div className="h-full pb-6">
                    {survivalData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={survivalData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                                <XAxis 
                                    dataKey="t" 
                                    label={{ value: 'Hours', position: 'insideBottomRight', offset: -5, fontSize: 12 }} 
                                    tick={{fontSize: 12}}
                                />
                                <YAxis 
                                    domain={[0, 1]} 
                                    label={{ value: 'R(t)', angle: -90, position: 'insideLeft', fontSize: 12 }} 
                                    tick={{fontSize: 12}}
                                />
                                <Tooltip 
                                    formatter={(val: number) => [(val*100).toFixed(1) + '%', 'Survival Probability']}
                                    labelFormatter={(t) => `${t} Hours`}
                                />
                                <Line 
                                    type="monotone" 
                                    dataKey="reliability" 
                                    stroke="#059669" 
                                    strokeWidth={3} 
                                    dot={false} 
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-gray-400 bg-gray-50 rounded">
                            <p>Insufficient data for Survival plot</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Hazard Rate (Bathtub) */}
            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 h-80">
                <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                    <TrendingUp size={18} className="text-red-600"/> Hazard Rate (Failure Rate)
                </h3>
                <div className="h-full pb-6">
                    {hazardData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={hazardData} margin={{ top: 5, right: 30, left: 30, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                                <XAxis 
                                    dataKey="t" 
                                    label={{ value: 'Hours', position: 'insideBottomRight', offset: -5, fontSize: 12 }} 
                                    tick={{fontSize: 12}}
                                />
                                <YAxis 
                                    label={{ value: 'h(t)', angle: -90, position: 'insideLeft', fontSize: 12 }} 
                                    tick={{fontSize: 12}}
                                />
                                <Tooltip 
                                    formatter={(val: number) => [val.toExponential(4), 'Hazard Rate']}
                                    labelFormatter={(t) => `${t} Hours`}
                                />
                                <Line 
                                    type="monotone" 
                                    dataKey="h" 
                                    stroke="#dc2626" 
                                    strokeWidth={2} 
                                    dot={false} 
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-gray-400 bg-gray-50 rounded">
                            <p>Insufficient data for Hazard Rate plot</p>
                        </div>
                    )}
                </div>
            </div>
        </div>

        {/* --- Charts Row 3: Advanced Analytics --- */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Probability Plot */}
            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 h-[400px]">
                <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                    <ScatterIcon size={18} className="text-purple-600"/> Weibull Probability Plot
                </h3>
                <div className="h-full pb-6">
                    {probPlotData.points && probPlotData.points.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis 
                                    dataKey="x" 
                                    type="number" 
                                    name="ln(t)" 
                                    label={{ value: 'ln(Time)', position: 'insideBottom', offset: -10 }}
                                    domain={['auto', 'auto']}
                                />
                                <YAxis 
                                    dataKey="y" 
                                    type="number" 
                                    name="ln(-ln(1-R))" 
                                    label={{ value: 'ln(-ln(1-Rank))', angle: -90, position: 'insideLeft' }}
                                    domain={['auto', 'auto']}
                                />
                                <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                                <Legend />
                                {/* Regression Line */}
                                <Scatter 
                                    name="Fit Line" 
                                    data={probPlotData.lineData} 
                                    line={{ stroke: '#9333ea', strokeWidth: 2, strokeDasharray: '5 5' }} 
                                    shape={<></>} // Hide dots for the line
                                    legendType="line"
                                />
                                {/* Failure Data Points */}
                                <Scatter 
                                    name="Failure Data" 
                                    data={probPlotData.points} 
                                    fill="#4f46e5" 
                                    shape="circle"
                                />
                            </ComposedChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-gray-400 bg-gray-50 rounded">
                            <p>Insufficient data (Need 3+ points)</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Distribution Histogram */}
            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 h-[400px]">
                <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                    <BarChartIcon size={18} className="text-blue-600"/> Time-to-Failure Distribution
                </h3>
                 <div className="h-full pb-6">
                    {histogramData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={histogramData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis 
                                    dataKey="mid" 
                                    label={{ value: 'Time Between Failures (Hours)', position: 'insideBottom', offset: -10 }}
                                    tickFormatter={(val) => val.toFixed(0)}
                                />
                                <YAxis 
                                    yAxisId="left"
                                    label={{ value: 'Frequency', angle: -90, position: 'insideLeft' }}
                                />
                                <YAxis 
                                    yAxisId="right" 
                                    orientation="right" 
                                    hide={true} // Hidden Y axis for the PDF just to scale it reasonably if needed, but here we scaled PDF to count in logic
                                />
                                <Tooltip 
                                    labelFormatter={(val) => `~${Number(val).toFixed(0)} Hours`}
                                    formatter={(value: number, name: string) => [
                                        name === 'pdf' ? value.toFixed(2) : value, 
                                        name === 'pdf' ? 'Theoretical Fit (Scaled)' : 'Actual Failures'
                                    ]}
                                />
                                <Legend />
                                <Bar 
                                    yAxisId="left"
                                    dataKey="count" 
                                    name="Actual Failures" 
                                    fill="#93c5fd" 
                                    opacity={0.8}
                                    barSize={30}
                                />
                                <Line 
                                    yAxisId="left"
                                    type="monotone" 
                                    dataKey="pdf" 
                                    name="Weibull Fit" 
                                    stroke="#2563eb" 
                                    strokeWidth={3} 
                                    dot={false} 
                                />
                            </ComposedChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-gray-400 bg-gray-50 rounded">
                            <p>Insufficient data for Histogram</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    </div>
  );
};

export default Dashboard;
