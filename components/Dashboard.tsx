import React, { useMemo, useState } from 'react';
import { RawRecord, StoppageType, InputMode } from '../types';
import { 
    calculateMetrics, 
    calculateTimeBetweenFailures, 
    calculateWeibull, 
    calculateReliabilityAtTime,
    calculatePDFAtTime,
    calculateHazardAtTime,
    calculateBLife,
    exportChartAsPNG,
    generateTbfHistogram
} from '../utils/reliabilityMath';
import { 
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
    LineChart, Line, Cell, AreaChart, Area, ReferenceLine, ScatterChart, Scatter
} from 'recharts';
import { 
    RefreshCcw, Activity, Clock, Hash, TrendingUp, Zap, BarChart as BarChartIcon, 
    LayoutGrid, HelpCircle, ShieldCheck, Target, Filter, AlertCircle, Layers, Camera, BarChart3
} from 'lucide-react';

interface DashboardProps {
  box1Data: RawRecord[];
  inputMode: InputMode;
  box1Filters: { asset: string; failureMode: string; delayType: string; hour: string; dayOfWeek: string };
  setBox1Filter: (key: any, value: string) => void;
}

const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-slate-900/90 backdrop-blur-md text-white p-4 rounded-2xl shadow-2xl text-[11px] border border-white/10 min-w-[160px] z-50 animate-in fade-in zoom-in-95 duration-200">
                <p className="font-black border-b border-white/10 pb-2 mb-3 text-indigo-400 uppercase tracking-widest">{label}</p>
                {payload.map((p: any, i: number) => (
                    <div key={i} className="flex justify-between items-center gap-6 mb-2 last:mb-0">
                        <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: p.color || p.fill }}></div>
                            <span className="text-slate-400 font-bold">{p.name}:</span>
                        </div>
                        <span className="font-mono font-black text-white">
                            {typeof p.value === 'number' ? p.value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : p.value}
                        </span>
                    </div>
                ))}
            </div>
        );
    }
    return null;
};

const StatCard = ({ title, value, unit, subValue, icon: Icon, color, explanation, description, isWarning }: { title: string, value: string, unit: string, subValue?: string, icon: any, color: string, explanation: string, description: string, isWarning?: boolean }) => {
    const colorStyles: Record<string, string> = {
        indigo: "text-indigo-600 bg-indigo-50 border-indigo-100 ring-indigo-500/10",
        orange: "text-orange-600 bg-orange-50 border-orange-100 ring-orange-500/10",
        emerald: "text-emerald-600 bg-emerald-50 border-emerald-100 ring-emerald-500/10",
        purple: "text-purple-600 bg-purple-50 border-purple-100 ring-purple-100/10",
        rose: "text-rose-600 bg-rose-50 border-rose-100 ring-rose-500/10",
    };
    const style = colorStyles[color] || colorStyles.indigo;

    return (
        <div className={`relative group overflow-visible bg-white p-6 rounded-[2rem] border transition-all duration-500 ring-1 ring-slate-950/[0.03] hover:z-30 ${isWarning ? 'border-rose-300 shadow-[0_0_25px_-5px_rgba(244,63,94,0.4)]' : 'border-slate-200 shadow-sm hover:shadow-2xl hover:-translate-y-1'}`}>
            <div className="relative z-10 flex flex-col h-full">
                <div className="flex items-center gap-4 mb-5">
                    <div className={`p-3 rounded-2xl shadow-sm ${isWarning ? 'text-rose-600 bg-rose-50 border-rose-100' : style} transition-transform group-hover:scale-110 duration-500`}>
                        <Icon size={24} />
                    </div>
                    <div className="relative">
                        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] cursor-help border-b border-dotted border-slate-300 pb-0.5 peer">{title}</h3>
                        <p className="text-[10px] font-bold text-slate-500 leading-tight mt-1 uppercase">{explanation}</p>
                        {/* Tooltip positioned below label */}
                        <div className="absolute left-0 top-full mt-3 w-64 bg-slate-900/95 backdrop-blur-md text-white text-[10px] p-4 rounded-2xl shadow-2xl invisible peer-hover:visible z-50 leading-relaxed border border-white/10 animate-in fade-in slide-in-from-top-2 duration-200 pointer-events-none">
                            <p className="font-black text-indigo-400 mb-1 uppercase tracking-widest">{title} Definition</p>
                            <p className="text-slate-300 font-medium leading-relaxed">{description}</p>
                        </div>
                    </div>
                </div>
                <div className="mt-auto">
                    <div className="flex items-baseline gap-2">
                        <span className={`text-3xl font-black tracking-tighter uppercase ${isWarning ? 'text-rose-600' : 'text-slate-900'}`}>{value}</span>
                        <span className="text-xs font-black text-slate-400 uppercase tracking-widest">{unit}</span>
                    </div>
                    {subValue && (
                        <div className={`mt-4 flex items-center gap-2 py-1.5 px-3 rounded-full border w-fit ${isWarning ? 'bg-rose-50 border-rose-100' : 'bg-slate-50 border-slate-100'}`}>
                             <div className={`h-1.5 w-1.5 rounded-full animate-pulse ${isWarning ? 'bg-rose-500' : style.split(' ')[0]}`}></div>
                             <span className={`text-[9px] font-black uppercase tracking-widest ${isWarning ? 'text-rose-600' : 'text-slate-500'}`}>{subValue}</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const Dashboard: React.FC<DashboardProps> = ({ box1Data, inputMode, box1Filters, setBox1Filter }) => {
  const [dashboardTab, setDashboardTab] = useState<'system' | 'physics'>('system');

  const assetList = useMemo(() => Array.from(new Set(box1Data.map(r => r.location))).filter(Boolean).sort(), [box1Data]);
  const modeList = useMemo(() => Array.from(new Set(box1Data.map(r => r.failureMode))).filter(Boolean).sort(), [box1Data]);
  const typeList = useMemo(() => Array.from(new Set(box1Data.map(r => r.delayType))).filter(Boolean).sort(), [box1Data]);

  const filteredData = useMemo(() => {
    return box1Data.filter(r => {
      const matchAsset = box1Filters.asset === 'All' || r.location === box1Filters.asset;
      const matchMode = box1Filters.failureMode === 'All' || r.failureMode === box1Filters.failureMode;
      const matchType = box1Filters.delayType === 'All' || r.delayType === box1Filters.delayType;
      return matchAsset && matchMode && matchType;
    });
  }, [box1Data, box1Filters]);

  const metrics = useMemo(() => calculateMetrics(filteredData, inputMode), [filteredData, inputMode]);
  const tbfData = useMemo(() => calculateTimeBetweenFailures(filteredData, inputMode), [filteredData, inputMode]);
  const weibull = useMemo(() => calculateWeibull(tbfData), [tbfData]);
  const b10Life = useMemo(() => calculateBLife(weibull.beta, weibull.eta, 0.1), [weibull]);

  const patternDescription = useMemo(() => {
    const beta = weibull.beta;
    if (beta === 0) return { label: "NO DATA", desc: "Insufficient failure points to determine a physics pattern." };
    if (beta < 0.9) return { 
        label: "EARLY LIFE", 
        desc: "Failures are occurring early. This usually indicates 'Infant Mortality' caused by poor installation, manufacturing defects, or commissioning errors." 
    };
    if (beta >= 0.9 && beta <= 1.2) return { 
        label: "RANDOM RISK", 
        desc: "Failures occur by pure chance, regardless of asset age. Strategic Note: Scheduled parts replacement is NOT effective for this pattern. Use condition monitoring instead." 
    };
    return { 
        label: "WEAR-OUT", 
        desc: "Age-Related failures. The asset is entering its wear-out phase. This pattern is well-suited for 'Scheduled Replacement' or 'Scheduled Restoration' strategies." 
    };
  }, [weibull.beta]);

  const aggregateData = (groupBy: 'location' | 'failureMode', valueKey: 'duration' | 'count') => {
      const agg: Record<string, number> = {};
      filteredData.filter(r => r.type === StoppageType.Unplanned).forEach(r => {
          const key = r[groupBy] || (groupBy === 'location' ? 'Unknown Asset' : 'Uncategorized');
          const val = valueKey === 'count' ? 1 : r.durationMinutes / 60;
          agg[key] = (agg[key] || 0) + val;
      });
      return Object.entries(agg).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 15);
  };
  
  const tbfHistogramData = useMemo(() => {
      const bins = generateTbfHistogram(tbfData);
      return bins.map(bin => ({ name: bin.name, value: bin.count }));
  }, [tbfData]);

  const assetDowntime = useMemo(() => aggregateData('location', 'duration'), [filteredData]);
  const assetFreq = useMemo(() => aggregateData('location', 'count'), [filteredData]);
  const modeDowntime = useMemo(() => aggregateData('failureMode', 'duration'), [filteredData]);
  const modeFreq = useMemo(() => aggregateData('failureMode', 'count'), [filteredData]);

  const physicsData = useMemo(() => {
      if (weibull.beta === 0) return [];
      const maxT = Math.min(weibull.eta * 2.5, 20000);
      const step = maxT / 100;
      const series = [];
      for (let t = 0; t <= maxT; t += step) {
          series.push({
              t: Math.round(t),
              reliability: calculateReliabilityAtTime(weibull.beta, weibull.eta, t),
              pdf: calculatePDFAtTime(weibull.beta, weibull.eta, t),
              hazard: calculateHazardAtTime(weibull.beta, weibull.eta, t)
          });
      }
      return series;
  }, [weibull]);

  const weibullPlotData = useMemo(() => {
    if (!weibull.points || weibull.points.length === 0) return { points: [], line: [] };
    const minX = Math.min(...weibull.points.map(p => p.x)) - 0.5;
    const maxX = Math.max(...weibull.points.map(p => p.x)) + 0.5;
    const linePoints = [
        { x: minX, y: weibull.beta * minX - (weibull.beta * Math.log(weibull.eta)) },
        { x: maxX, y: weibull.beta * maxX - (weibull.beta * Math.log(weibull.eta)) }
    ];
    return {
        points: weibull.points.map(p => ({ x: p.x, y: p.y, name: 'Failure Event' })),
        line: linePoints
    };
  }, [weibull]);

  const handleBarClick = (payload: any, filterKey: 'asset' | 'failureMode') => {
      if (!payload || !payload.name) return;
      const currentVal = (box1Filters as any)[filterKey];
      const clickedVal = payload.name;
      setBox1Filter(filterKey, clickedVal === currentVal ? 'All' : clickedVal);
  };
  
  const systemCharts = [
    { title: 'Asset Downtime (Hrs)', data: assetDowntime, icon: Activity, color: '#F43F5E', grad: 'colorDown', filterKey: 'asset' },
    { title: 'Failure Intensity (Qty)', data: assetFreq, icon: Hash, color: '#6366F1', grad: 'colorFreq', filterKey: 'asset' },
    { title: 'Failure Rate Distribution (TBF)', data: tbfHistogramData, icon: BarChart3, color: '#0ea5e9', grad: 'colorTbfHist', filterKey: null },
    { title: 'Mode Downtime (Hrs)', data: modeDowntime, icon: BarChartIcon, color: '#F59E0B', grad: 'colorModeDown', filterKey: 'failureMode' },
    { title: 'Mode Intensity (Qty)', data: modeFreq, icon: Hash, color: '#10B981', grad: 'colorModeFreq', filterKey: 'failureMode' }
  ];

  return (
    <div className="space-y-10 animate-in fade-in duration-700 pb-20">
        <div className="bg-white/80 backdrop-blur-2xl p-3 rounded-[2.5rem] shadow-2xl border border-white/50 flex flex-wrap gap-4 items-center justify-between sticky top-4 z-40 mx-2 ring-1 ring-slate-950/5">
            <div className="flex bg-slate-100/60 p-1.5 rounded-2xl border border-slate-200/50">
                <button onClick={() => setDashboardTab('system')} className={`flex items-center gap-3 px-8 py-3 rounded-[1.25rem] text-xs font-black transition-all duration-300 ${dashboardTab === 'system' ? 'bg-white shadow-xl text-indigo-600 ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-800'}`}>
                    <LayoutGrid size={18} className={dashboardTab === 'system' ? 'animate-pulse' : ''} /> SYSTEM OVERVIEW
                </button>
                <button onClick={() => setDashboardTab('physics')} className={`flex items-center gap-3 px-8 py-3 rounded-[1.25rem] text-xs font-black transition-all duration-300 ${dashboardTab === 'physics' ? 'bg-white shadow-xl text-indigo-600 ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-800'}`}>
                    <TrendingUp size={18} className={dashboardTab === 'physics' ? 'animate-pulse' : ''} /> RELIABILITY PHYSICS
                </button>
            </div>
            
            <div className="flex items-center gap-3 pr-4 overflow-x-auto no-scrollbar max-w-[60%]">
                {[
                    { key: 'asset', icon: Filter, options: assetList, label: 'Asset' },
                    { key: 'delayType', icon: Layers, options: typeList, label: 'Type' },
                    { key: 'failureMode', icon: Hash, options: modeList, label: 'Mode' }
                ].map((item) => (
                    <div key={item.key} className="flex items-center gap-2 bg-white px-4 py-2.5 rounded-2xl border border-slate-200 shadow-sm shrink-0 transition-all hover:border-indigo-300 focus-within:ring-2 focus-within:ring-indigo-100">
                        <item.icon size={14} className="text-slate-400" />
                        <select 
                            value={(box1Filters as any)[item.key]} 
                            onChange={(e) => setBox1Filter(item.key, e.target.value)}
                            className="text-[10px] font-black uppercase outline-none bg-transparent min-w-[120px] cursor-pointer"
                        >
                            <option value="All">All {item.label}s</option>
                            {item.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                    </div>
                ))}
                <button onClick={() => {setBox1Filter('asset', 'All'); setBox1Filter('failureMode', 'All'); setBox1Filter('delayType', 'All');}} className="p-3 rounded-2xl bg-slate-900 border border-slate-800 hover:bg-indigo-600 text-white transition-all shadow-lg shrink-0" title="Reset Filters">
                    <RefreshCcw size={18}/>
                </button>
            </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 px-2">
            <StatCard title="MTBF" explanation="Availability Lead" value={metrics.mtbf.toFixed(1)} unit="hrs" icon={Activity} color="indigo" description="Mean Time Between Failures. Average uptime between unplanned events. Formula: Total Uptime / Number of Failures." isWarning={metrics.mtbf > 0 && metrics.mtbf < 20} />
            <StatCard title="MTTR" explanation="Recovery Efficiency" value={metrics.mttr.toFixed(1)} unit="hrs" icon={Clock} color="orange" description="Mean Time To Repair. Average time to restore functionality after a failure event. Formula: Total Downtime / Number of Failures." />
            <StatCard title="Availability" explanation="Asset Utilization" value={metrics.availability.toFixed(1)} unit="%" icon={Zap} color="emerald" description="Percentage of time the asset was capable of performing its function. Formula: MTBF / (MTBF + MTTR)." isWarning={metrics.availability > 0 && metrics.availability < 85} />
            <StatCard 
                title="Pattern (β)" 
                explanation={`Physics Beta: ${weibull.beta.toFixed(2)}`} 
                value={patternDescription.label} 
                unit="" 
                subValue={`Eta (Scale): ${weibull.eta.toFixed(0)}h`} 
                icon={TrendingUp} 
                color="purple" 
                description="Weibull Shape Parameter (Beta). β < 1: Early life failures (Infant Mortality); β = 1: Random failures; β > 1: Wear-out phase failures." 
            />
            <StatCard title="B10 Life" explanation="Risk Threshold" value={b10Life.toFixed(0)} unit="hrs" subValue={`Model R²: ${weibull.rSquared.toFixed(2)}`} icon={Target} color="rose" description="The age by which 10% of the population is expected to have failed. A key engineering benchmark for replacement scheduling." />
        </div>

        <div className="space-y-12 px-2">
            {dashboardTab === 'system' ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                    {systemCharts.map((chart, cIdx) => (
                        <div key={chart.title} id={`chart-container-${cIdx}`} className="bg-white p-10 rounded-[3rem] shadow-xl border border-slate-100 h-[40rem] flex flex-col ring-1 ring-slate-950/[0.03] transition-all hover:shadow-2xl duration-500 group/chart">
                            <div className="flex justify-between items-center mb-10">
                                <h4 className="font-black text-slate-900 text-xs tracking-[0.25em] uppercase flex items-center gap-4">
                                    <div className="p-2 rounded-xl bg-slate-50 border border-slate-100 shadow-sm"><chart.icon size={20} style={{ color: chart.color }}/></div>
                                    {chart.title}
                                </h4>
                                <button onClick={() => exportChartAsPNG(`chart-container-${cIdx}`, chart.title.replace(/\s+/g, '_'))} className="p-3 bg-slate-50 text-slate-400 hover:text-indigo-600 rounded-2xl border border-slate-100 opacity-0 group-hover/chart:opacity-100 transition-all hover:shadow-md" title="Export Chart as PNG">
                                    <Camera size={18}/>
                                </button>
                            </div>
                            <div className="flex-1 min-h-0">
                                <ResponsiveContainer>
                                    <BarChart data={chart.data} margin={{ bottom: 80 }} barGap={0}>
                                        <defs>
                                            <linearGradient id={chart.grad} x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor={chart.color} stopOpacity={1}/>
                                                <stop offset="100%" stopColor={chart.color} stopOpacity={0.7}/>
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#f1f5f9"/>
                                        <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} fontWeight="900" axisLine={false} tickLine={false} angle={-45} textAnchor="end" interval={0} height={80} />
                                        <YAxis stroke="#cbd5e1" fontSize={10} fontWeight="800" axisLine={false} tickLine={false}/>
                                        <Tooltip content={<CustomTooltip/>}/>
                                        <Bar 
                                            dataKey="value" 
                                            name="Measurement" 
                                            radius={[10, 10, 0, 0]} 
                                            cursor={chart.filterKey ? "pointer" : "default"}
                                            onClick={chart.filterKey ? (payload) => handleBarClick(payload, chart.filterKey as any) : undefined}
                                            animationDuration={1500}
                                            animationBegin={cIdx * 200}
                                        >
                                            {chart.data.map((entry, index) => {
                                                const isActive = chart.filterKey ? (box1Filters as any)[chart.filterKey] === entry.name : false;
                                                const isAnyActive = chart.filterKey ? (box1Filters as any)[chart.filterKey] !== 'All' : false;
                                                return (
                                                    <Cell 
                                                        key={`cell-${index}`} 
                                                        fill={isActive ? '#4F46E5' : `url(#${chart.grad})`} 
                                                        fillOpacity={!isAnyActive || isActive ? 1 : 0.2} 
                                                        className="transition-all duration-500"
                                                    />
                                                );
                                            })}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-12">
                    <div id="chart-weibull-prob" className="bg-white p-10 rounded-[3rem] shadow-xl border border-slate-100 h-[38rem] flex flex-col ring-1 ring-slate-950/[0.03] group/chart">
                        <div className="flex justify-between items-center mb-10">
                            <h4 className="font-black text-slate-900 text-xs tracking-[0.25em] uppercase flex items-center gap-4">
                                <div className="p-2 rounded-xl bg-slate-50 border border-slate-100 shadow-sm"><Target size={20} className="text-indigo-600"/></div>
                                Weibull Probability Plot
                            </h4>
                            <button onClick={() => exportChartAsPNG('chart-weibull-prob', 'Weibull_Probability_Plot')} className="p-3 bg-slate-50 text-slate-400 hover:text-indigo-600 rounded-2xl border border-slate-100 opacity-0 group-hover/chart:opacity-100 transition-all hover:shadow-md">
                                <Camera size={18}/>
                            </button>
                        </div>
                        <div className="flex-1 min-h-0">
                            <ResponsiveContainer>
                                <ScatterChart margin={{ top: 20, right: 30, bottom: 40, left: 10 }}>
                                    <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#f1f5f9"/>
                                    <XAxis type="number" dataKey="x" name="ln(Time)" stroke="#94a3b8" fontSize={10} fontWeight="800" axisLine={false} tickLine={false} label={{ value: 'NATURAL LOG OF OPERATING TIME', position: 'insideBottom', offset: -10, fontSize: 9, fontWeight: 900, fill: '#cbd5e1' }}/>
                                    <YAxis type="number" dataKey="y" name="ln(-ln(1-F))" stroke="#94a3b8" fontSize={10} fontWeight="800" axisLine={false} tickLine={false}/>
                                    <Tooltip content={<CustomTooltip/>}/>
                                    <Scatter name="Failure Events" data={weibullPlotData.points} fill="#4F46E5" strokeWidth={2} stroke="white" />
                                    <Scatter name="Statistical Model" data={weibullPlotData.line} line={{ stroke: '#F43F5E', strokeWidth: 3, strokeDasharray: '8 4' }} shape={() => null} />
                                </ScatterChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div id="chart-reliability-r" className="bg-white p-10 rounded-[3rem] shadow-xl border border-slate-100 h-[38rem] flex flex-col ring-1 ring-slate-950/[0.03] group/chart">
                        <div className="flex justify-between items-center mb-10">
                            <h4 className="font-black text-slate-900 text-xs tracking-[0.25em] uppercase flex items-center gap-4">
                                <div className="p-2 rounded-xl bg-slate-50 border border-slate-100 shadow-sm"><Activity size={20} className="text-emerald-500"/></div>
                                Reliability Function R(t)
                            </h4>
                            <button onClick={() => exportChartAsPNG('chart-reliability-r', 'Reliability_Function')} className="p-3 bg-slate-50 text-slate-400 hover:text-indigo-600 rounded-2xl border border-slate-100 opacity-0 group-hover/chart:opacity-100 transition-all hover:shadow-md">
                                <Camera size={18}/>
                            </button>
                        </div>
                        <div className="flex-1 min-h-0">
                            <ResponsiveContainer>
                                <AreaChart data={physicsData}>
                                    <defs>
                                        <linearGradient id="colorReliability" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#10B981" stopOpacity={0.6}/>
                                            <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="4 4" stroke="#f1f5f9" vertical={false}/>
                                    <XAxis dataKey="t" stroke="#94a3b8" fontSize={10} fontWeight="800" axisLine={false} tickLine={false}/>
                                    <YAxis domain={[0, 1]} stroke="#94a3b8" fontSize={10} fontWeight="800" axisLine={false} tickLine={false} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}/>
                                    <Tooltip content={<CustomTooltip/>}/>
                                    <Area type="monotone" dataKey="reliability" name="Reliability" stroke="#10B981" strokeWidth={5} fillOpacity={1} fill="url(#colorReliability)" animationDuration={2000} />
                                    <ReferenceLine x={weibull.eta} stroke="#6366f1" strokeDasharray="10 5" strokeWidth={2} label={{ position: 'top', value: 'Characteristic Life (η)', fill: '#6366f1', fontSize: 10, fontWeight: 900 }} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div id="chart-pdf-density" className="bg-white p-10 rounded-[3rem] shadow-xl border border-slate-100 h-[38rem] flex flex-col ring-1 ring-slate-950/[0.03] group/chart">
                        <div className="flex justify-between items-center mb-10">
                            <h4 className="font-black text-slate-900 text-xs tracking-[0.25em] uppercase flex items-center gap-4">
                                <div className="p-2 rounded-xl bg-slate-50 border border-slate-100 shadow-sm"><TrendingUp size={20} className="text-amber-500"/></div>
                                Probability Density Function f(t)
                            </h4>
                            <button onClick={() => exportChartAsPNG('chart-pdf-density', 'Probability_Density_Function')} className="p-3 bg-slate-50 text-slate-400 hover:text-indigo-600 rounded-2xl border border-slate-100 opacity-0 group-hover/chart:opacity-100 transition-all hover:shadow-md">
                                <Camera size={18}/>
                            </button>
                        </div>
                        <div className="flex-1 min-h-0">
                            <ResponsiveContainer>
                                <AreaChart data={physicsData}>
                                    <defs>
                                        <linearGradient id="colorPDF_Grad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.6}/>
                                            <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="4 4" stroke="#f1f5f9" vertical={false}/>
                                    <XAxis dataKey="t" stroke="#94a3b8" fontSize={10} fontWeight="800" axisLine={false} tickLine={false}/>
                                    <YAxis stroke="#94a3b8" fontSize={10} fontWeight="800" axisLine={false} tickLine={false} hide />
                                    <Tooltip content={<CustomTooltip/>}/>
                                    <Area type="monotone" dataKey="pdf" name="Failure Density" stroke="#f59e0b" strokeWidth={5} fillOpacity={1} fill="url(#colorPDF_Grad)" animationDuration={2000} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div id="chart-hazard-rate" className="bg-white p-10 rounded-[3rem] shadow-xl border border-slate-100 h-[38rem] flex flex-col ring-1 ring-slate-950/[0.03] group/chart">
                        <div className="flex justify-between items-center mb-10">
                            <h4 className="font-black text-slate-900 text-xs tracking-[0.25em] uppercase flex items-center gap-4">
                                <div className="p-2 rounded-xl bg-slate-50 border border-slate-100 shadow-sm"><Zap size={20} className="text-rose-600"/></div>
                                Hazard Rate λ(t)
                            </h4>
                            <button onClick={() => exportChartAsPNG('chart-hazard-rate', 'Hazard_Rate')} className="p-3 bg-slate-50 text-slate-400 hover:text-indigo-600 rounded-2xl border border-slate-100 opacity-0 group-hover/chart:opacity-100 transition-all hover:shadow-md">
                                <Camera size={18}/>
                            </button>
                        </div>
                        <div className="flex-1 min-h-0">
                            <ResponsiveContainer>
                                <LineChart data={physicsData}>
                                    <CartesianGrid strokeDasharray="4 4" stroke="#f1f5f9" vertical={false}/>
                                    <XAxis dataKey="t" stroke="#94a3b8" fontSize={10} fontWeight="800" axisLine={false} tickLine={false}/>
                                    <YAxis stroke="#94a3b8" fontSize={10} fontWeight="800" axisLine={false} tickLine={false}/>
                                    <Tooltip content={<CustomTooltip/>}/>
                                    <Line type="monotone" dataKey="hazard" name="Instantaneous Hazard" stroke="#f43f5e" strokeWidth={6} dot={false} animationDuration={2000} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            )}
        </div>
    </div>
  );
};

export default Dashboard;