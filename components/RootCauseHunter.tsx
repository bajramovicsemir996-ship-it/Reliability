
import React, { useMemo, useState } from 'react';
import { RawRecord, StoppageType } from '../types';
import { calculateMetrics, exportChartAsPNG } from '../utils/reliabilityMath';
import { getRcaNarrative } from '../services/geminiService';
import { 
    ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, 
    ResponsiveContainer, Cell, ScatterChart, Scatter, ZAxis, BarChart 
} from 'recharts';
import { 
    Filter, Target, Clock, Zap, AlertTriangle, ShieldCheck, Activity, 
    Info, RefreshCcw, TrendingUp, TrendingDown, Hash, Loader2, Sparkles, 
    ChevronRight, Calendar, BarChart3, Crosshair, Layers, Camera 
} from 'lucide-react';
import { useAppStore } from '../store';

interface RootCauseHunterProps {
  box1Data: RawRecord[];
  box1Filters: { asset: string; failureMode: string; delayType: string; hour: string; dayOfWeek: string };
  setBox1Filter: (key: any, value: string) => void;
}

const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-slate-900/95 backdrop-blur-md text-white p-4 rounded-2xl shadow-2xl text-[11px] border border-white/10 min-w-[160px] z-50 animate-in fade-in zoom-in-95 duration-200">
                <p className="font-black border-b border-white/10 pb-2 mb-3 text-indigo-400 uppercase tracking-widest">{label}</p>
                {payload.map((p: any, i: number) => (
                    <div key={i} className="flex justify-between items-center gap-6 mb-2 last:mb-0">
                        <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: p.color || p.fill }}></div>
                            <span className="text-slate-400 font-bold">{p.name}:</span>
                        </div>
                        <span className="font-mono font-black text-white">
                            {p.name === 'Hour' ? `${p.value}:00` : (typeof p.value === 'number' ? p.value.toLocaleString(undefined, { maximumFractionDigits: 1 }) : p.value)}
                            {p.name.includes('Cumulative') ? '%' : ''}
                        </span>
                    </div>
                ))}
            </div>
        );
    }
    return null;
};

const AINarrativeSkeleton = () => (
    <div className="space-y-4 w-full">
        <div className="h-3 w-3/4 animate-skeleton rounded-full"></div>
        <div className="h-3 w-full animate-skeleton rounded-full"></div>
        <div className="h-3 w-5/6 animate-skeleton rounded-full"></div>
        <div className="h-3 w-2/3 animate-skeleton rounded-full"></div>
        <div className="pt-4 space-y-3">
            <div className="h-3 w-4/5 animate-skeleton rounded-full"></div>
            <div className="h-3 w-full animate-skeleton rounded-full"></div>
        </div>
    </div>
);

const RootCauseHunter: React.FC<RootCauseHunterProps> = ({ box1Data, box1Filters, setBox1Filter }) => {
    const { language } = useAppStore();
    const [paretoBasis, setParetoBasis] = useState<'duration' | 'count'>('duration');
    const [aiNarrative, setAiNarrative] = useState<string>('');
    const [loadingAI, setLoadingAI] = useState(false);

    const assetList = useMemo(() => Array.from(new Set(box1Data.map(r => r.location))).filter(Boolean).sort(), [box1Data]);
    const modeList = useMemo(() => Array.from(new Set(box1Data.map(r => r.failureMode))).filter(Boolean).sort(), [box1Data]);
    const typeList = useMemo(() => Array.from(new Set(box1Data.map(r => r.delayType))).filter(Boolean).sort(), [box1Data]);

    const filteredData = useMemo(() => {
        return box1Data.filter(r => {
            const matchAsset = box1Filters.asset === 'All' || r.location === box1Filters.asset;
            const matchMode = box1Filters.failureMode === 'All' || r.failureMode === box1Filters.failureMode;
            const matchType = box1Filters.delayType === 'All' || r.delayType === box1Filters.delayType;
            
            let matchHour = true;
            let matchDay = true;
            if (r.startTime) {
                const date = new Date(r.startTime);
                if (box1Filters.hour !== 'All') matchHour = date.getHours().toString() === box1Filters.hour;
                if (box1Filters.dayOfWeek !== 'All') {
                    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                    matchDay = days[date.getDay()] === box1Filters.dayOfWeek;
                }
            }
            return matchAsset && matchMode && matchType && matchHour && matchDay;
        });
    }, [box1Data, box1Filters]);

    const paretoData = useMemo(() => {
        const agg: Record<string, number> = {};
        const groupBy = box1Filters.asset === 'All' ? 'location' : 'failureMode';
        
        filteredData.filter(r => r.type === StoppageType.Unplanned).forEach(r => {
            const key = r[groupBy as keyof RawRecord] || (groupBy === 'location' ? 'Unknown Asset' : 'Uncategorized');
            const val = paretoBasis === 'count' ? 1 : r.durationMinutes / 60;
            agg[key] = (agg[key] || 0) + val;
        });

        const sorted = Object.entries(agg)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value);

        const total = sorted.reduce((acc, curr) => acc + curr.value, 0);
        let runningTotal = 0;
        
        return sorted.map(item => {
            runningTotal += item.value;
            return { ...item, cumulative: total > 0 ? (runningTotal / total) * 100 : 0 };
        }).slice(0, 15);
    }, [filteredData, box1Filters.asset, paretoBasis]);

    const hourData = useMemo(() => {
        const hours = Array.from({ length: 24 }, (_, i) => ({ name: i.toString(), label: `${i.toString().padStart(2, '0')}:00`, value: 0 }));
        filteredData.forEach(r => { if (r.startTime) { const h = new Date(r.startTime).getHours(); hours[h].value++; } });
        return hours;
    }, [filteredData]);

    const dayData = useMemo(() => {
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const days = dayNames.map(name => ({ name, value: 0 }));
        filteredData.forEach(r => { if (r.startTime) { const d = new Date(r.startTime).getDay(); days[d].value++; } });
        return days;
    }, [filteredData]);

    const heatmapGrid = useMemo(() => {
        const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        const grid: any[] = [];
        
        days.forEach(day => {
            for (let h = 0; h < 24; h++) {
                grid.push({ day, hour: h, count: 0 });
            }
        });

        filteredData.forEach(r => {
            if (r.startTime) {
                const date = new Date(r.startTime);
                const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()];
                const hour = date.getHours();
                const cell = grid.find(m => m.day === day && m.hour === hour);
                if (cell) cell.count++;
            }
        });
        
        return grid;
    }, [filteredData]);

    const handleParetoClick = (payload: any) => {
        if (!payload || !payload.name) return;
        const clickedName = payload.name;
        const filterType = box1Filters.asset === 'All' ? 'asset' : 'failureMode';
        const currentVal = (box1Filters as any)[filterType];
        setBox1Filter(filterType, clickedName === currentVal ? 'All' : clickedName);
    };

    const handleTimeBarClick = (payload: any, key: 'hour' | 'dayOfWeek') => {
        if (!payload || !payload.name) return;
        const clickedName = payload.name;
        const currentVal = (box1Filters as any)[key];
        setBox1Filter(key, clickedName === currentVal ? 'All' : clickedName);
    };

    const handleHeatmapCellClick = (day: string, hour: number) => {
        setBox1Filter('hour', hour.toString() === box1Filters.hour ? 'All' : hour.toString());
        setBox1Filter('dayOfWeek', day === box1Filters.dayOfWeek ? 'All' : day);
    };

    const runAINarrative = async () => {
        setLoadingAI(true);
        const target = box1Filters.asset !== 'All' ? box1Filters.asset : (assetList[0] || 'Unknown System');
        const narrative = await getRcaNarrative(target, filteredData, language);
        setAiNarrative(narrative);
        setLoadingAI(false);
    };

    const metrics = useMemo(() => calculateMetrics(filteredData, 'timestamp'), [filteredData]);
    const consistencyRating = metrics.mtbfCoV < 0.5 ? 'Predictable' : metrics.mtbfCoV < 1.0 ? 'Variable' : 'Chaos';

    return (
        <div className="space-y-12 pb-20 animate-in fade-in duration-700">
            {/* Context Explorer */}
            <div className="bg-slate-900/95 backdrop-blur-xl text-white p-3 rounded-[2.5rem] shadow-2xl border border-white/10 flex flex-wrap gap-4 items-center sticky top-4 z-40 mx-2 ring-1 ring-white/10">
                <div className="flex items-center gap-4 pr-8 border-r border-white/10 pl-4">
                    <div className="p-3 bg-indigo-500 rounded-2xl shadow-xl shadow-indigo-500/20"><Target size={24} className="text-white"/></div>
                    <div>
                        <h2 className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">Root Cause Hunter</h2>
                        <p className="text-sm font-black text-white uppercase tracking-tighter mt-0.5">Filter Engine</p>
                    </div>
                </div>
                
                <div className="flex-1 flex flex-wrap gap-4 px-4">
                    {[
                        { key: 'asset', icon: Filter, options: assetList, label: 'Asset' },
                        { key: 'delayType', icon: Layers, options: typeList, label: 'Type' },
                        { key: 'failureMode', icon: Hash, options: modeList, label: 'Mode' },
                        { key: 'hour', icon: Clock, options: Array.from({length: 24}, (_, i) => i.toString()), label: 'Hour' }
                    ].map(item => (
                        <div key={item.key} className="flex items-center gap-3 bg-white/5 px-5 py-2.5 rounded-2xl border border-white/10 transition-all hover:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-500/20">
                            <item.icon size={16} className="text-slate-500" />
                            <select 
                                value={(box1Filters as any)[item.key]} 
                                onChange={(e) => setBox1Filter(item.key, e.target.value)}
                                className="text-[10px] font-black uppercase outline-none bg-transparent text-indigo-400 min-w-[120px] cursor-pointer"
                            >
                                <option value="All" className="bg-slate-900 text-white">All {item.label}s</option>
                                {item.options.map(opt => <option key={opt} value={opt} className="bg-slate-900 text-white">{item.key === 'hour' ? `${opt.padStart(2, '0')}:00` : opt}</option>)}
                            </select>
                        </div>
                    ))}
                    <button onClick={() => {setBox1Filter('asset', 'All'); setBox1Filter('failureMode', 'All'); setBox1Filter('delayType', 'All'); setBox1Filter('hour', 'All'); setBox1Filter('dayOfWeek', 'All');}} className="p-3 bg-white/10 rounded-2xl hover:bg-indigo-600 hover:text-white text-slate-400 transition-all shadow-md" title="Reset All Filters"><RefreshCcw size={20}/></button>
                </div>

                <div className="flex items-center gap-4 border-l border-white/10 pl-8 pr-6">
                    <div className="text-right">
                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em]">Consistency</p>
                        <p className={`text-xs font-black uppercase tracking-widest mt-1 ${consistencyRating === 'Predictable' ? 'text-emerald-400' : 'text-rose-400'}`}>{consistencyRating}</p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 px-2">
                {/* Pareto Section */}
                <div id="chart-pareto-analysis" className="lg:col-span-8 bg-white p-12 rounded-[3.5rem] border border-slate-200 shadow-xl flex flex-col h-[55rem] ring-1 ring-slate-950/[0.03] transition-all hover:shadow-2xl duration-500 group/chart">
                    <div className="flex justify-between items-start mb-12">
                        <div>
                            <h3 className="text-sm font-black text-slate-900 uppercase tracking-[0.3em] flex items-center gap-4">
                                <div className="p-2 rounded-xl bg-rose-50 text-rose-500 border border-rose-100"><TrendingDown size={24}/></div>
                                Pareto Criticality Analysis
                            </h3>
                            <p className="text-[10px] text-slate-400 font-bold uppercase mt-3 tracking-widest pl-[60px]">Detecting the "vital few" assets driving systemic downtime. Click bars to pivot data.</p>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="flex bg-slate-100/60 p-1.5 rounded-2xl border border-slate-200/50">
                                <button onClick={() => setParetoBasis('duration')} className={`px-6 py-2.5 text-[9px] font-black rounded-xl transition-all duration-300 ${paretoBasis === 'duration' ? 'bg-white shadow-xl text-indigo-600 ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-800'}`}>DOWNTIME</button>
                                <button onClick={() => setParetoBasis('count')} className={`px-6 py-2.5 text-[9px] font-black rounded-xl transition-all duration-300 ${paretoBasis === 'count' ? 'bg-white shadow-xl text-indigo-600 ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-800'}`}>FREQUENCY</button>
                            </div>
                            <button onClick={() => exportChartAsPNG('chart-pareto-analysis', 'Pareto_Criticality_Analysis')} className="p-3 bg-slate-50 text-slate-400 hover:text-indigo-600 rounded-2xl border border-slate-100 opacity-0 group-hover/chart:opacity-100 transition-all hover:shadow-md">
                                <Camera size={18}/>
                            </button>
                        </div>
                    </div>
                    <div className="flex-1 w-full min-h-0">
                        <ResponsiveContainer>
                            <ComposedChart data={paretoData} margin={{ top: 20, right: 30, left: 10, bottom: 120 }}>
                                <defs>
                                    <linearGradient id="colorPareto" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#4F46E5" stopOpacity={1}/>
                                        <stop offset="100%" stopColor="#4F46E5" stopOpacity={0.7}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#f1f5f9"/>
                                <XAxis dataKey="name" angle={-45} textAnchor="end" interval={0} stroke="#94a3b8" fontSize={9} fontWeight="900" axisLine={false} tickLine={false} height={120} />
                                <YAxis yAxisId="left" stroke="#cbd5e1" fontSize={10} fontWeight="800" axisLine={false} tickLine={false}/>
                                <YAxis yAxisId="right" orientation="right" domain={[0, 100]} stroke="#F43F5E" fontSize={10} fontWeight="900" axisLine={false} tickLine={false} tickFormatter={(v)=>`${v}%`}/>
                                <Tooltip content={<CustomTooltip/>}/>
                                <Bar 
                                    yAxisId="left" 
                                    dataKey="value" 
                                    name={paretoBasis === 'count' ? 'Events' : 'Hours'} 
                                    radius={[10, 10, 0, 0]} 
                                    onClick={(p) => handleParetoClick(p)}
                                    cursor="pointer"
                                    animationDuration={2000}
                                >
                                    {paretoData.map((entry, index) => {
                                        const filterType = box1Filters.asset === 'All' ? 'asset' : 'failureMode';
                                        const isActive = (box1Filters as any)[filterType] === entry.name;
                                        const isAnyActive = (box1Filters as any)[filterType] !== 'All';
                                        return (
                                            <Cell 
                                                key={index} 
                                                fill={isActive ? '#4F46E5' : (entry.cumulative <= 80 ? 'url(#colorPareto)' : '#E2E8F0')} 
                                                fillOpacity={!isAnyActive || isActive ? 1 : 0.2}
                                                className="transition-all duration-500"
                                            />
                                        );
                                    })}
                                </Bar>
                                <Line yAxisId="right" type="monotone" dataKey="cumulative" name="Cumulative %" stroke="#F43F5E" strokeWidth={5} dot={{ fill: '#F43F5E', r: 6, stroke: 'white', strokeWidth: 3 }} animationDuration={2500} />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* AI & KPI Side Panel */}
                <div className="lg:col-span-4 flex flex-col gap-8">
                    <div className="bg-white p-10 rounded-[3.5rem] border border-slate-200 shadow-xl flex-1 flex flex-col relative overflow-hidden ring-1 ring-slate-950/[0.03] transition-all hover:shadow-2xl duration-500">
                        <div className="absolute top-0 right-0 p-10 opacity-[0.03] pointer-events-none transform translate-x-1/4 -translate-y-1/4"><Sparkles size={220} className="text-indigo-600"/></div>
                        <h3 className="text-xs font-black text-slate-900 uppercase tracking-[0.25em] mb-10 flex items-center gap-4 relative z-10">
                            <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100"><Zap size={20}/></div>
                            RCA Logic Synthesis
                        </h3>
                        
                        <div className="flex-1 space-y-6 relative z-10 overflow-auto custom-scrollbar pr-2">
                            {loadingAI ? (
                                <AINarrativeSkeleton />
                            ) : aiNarrative ? (
                                <div className="text-[11px] font-medium text-slate-600 leading-[1.8] whitespace-pre-wrap italic bg-slate-50 p-6 rounded-[2rem] border border-slate-100 shadow-inner">
                                    {aiNarrative}
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-center space-y-6 opacity-40 py-12">
                                    <div className="p-6 bg-slate-50 rounded-full border border-slate-100 shadow-inner"><Activity size={64} className="text-slate-300"/></div>
                                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 max-w-[200px]">Select context and trigger engineering audit</p>
                                </div>
                            )}
                        </div>

                        <button 
                            onClick={runAINarrative} 
                            disabled={loadingAI}
                            className="w-full mt-10 bg-indigo-600 hover:bg-indigo-700 text-white py-5 rounded-[2rem] font-black uppercase tracking-[0.25em] text-[10px] flex items-center justify-center gap-4 shadow-2xl shadow-indigo-200 transition-all hover:-translate-y-1 active:scale-95 disabled:opacity-50 relative z-10 border border-white/20"
                        >
                            {loadingAI ? <Loader2 className="animate-spin" size={20}/> : <Sparkles size={20}/>}
                            Generate AI Analysis
                        </button>
                    </div>
                    
                    <div className="bg-slate-900 p-10 rounded-[3.5rem] shadow-2xl border border-white/5 flex flex-col ring-1 ring-white/10 relative">
                        <div className="relative z-10">
                            <h4 className="text-[9px] font-black text-indigo-400 uppercase tracking-[0.3em] mb-6 cursor-help border-b border-dotted border-indigo-800 w-fit peer">Physics Stability Index</h4>
                            {/* Definition Tooltip positioned below label */}
                            <div className="absolute left-0 top-full mt-3 w-64 bg-slate-800 text-white text-[10px] p-4 rounded-2xl shadow-2xl invisible peer-hover:visible z-50 leading-relaxed border border-white/10 animate-in fade-in slide-in-from-top-2 duration-200 pointer-events-none">
                                <p className="font-black text-indigo-400 mb-1 uppercase tracking-widest text-[9px]">Coefficient of Variation (CoV)</p>
                                <p className="text-slate-300 font-medium leading-relaxed">A normalized measure of dispersion. Calculated as the Standard Deviation of Time Between Failures divided by the MTBF. CoV > 1.0 indicates 'chaotic' or clustered failure behavior.</p>
                            </div>
                            <div className="flex items-baseline gap-3">
                                <span className="text-6xl font-black text-white tracking-tighter">{metrics.mtbfCoV.toFixed(2)}</span>
                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">CoV Factor</span>
                            </div>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-10 leading-relaxed font-bold uppercase tracking-widest border-t border-white/5 pt-10 opacity-70">
                            Coefficient of Variation tracks arrival intensity. Values &gt; 1.0 indicate chaotic distribution characteristic of external stress shocks.
                        </p>
                    </div>
                </div>
            </div>

            {/* Density Bars */}
            <div className="bg-white p-12 rounded-[3.5rem] shadow-xl border border-slate-100 ring-1 ring-slate-950/[0.03] mx-2">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
                     <div id="chart-density-hour" className="h-[38rem] flex flex-col group/chart">
                        <div className="flex justify-between items-center mb-10">
                            <h4 className="font-black text-slate-900 text-xs tracking-[0.25em] uppercase flex items-center gap-4">
                                <div className="p-2 rounded-xl bg-amber-50 text-amber-600 border border-amber-100"><Clock size={20}/></div>
                                Failure Density by Time of Day
                            </h4>
                            <button onClick={() => exportChartAsPNG('chart-density-hour', 'Failure_Density_Hour')} className="p-3 bg-slate-50 text-slate-400 hover:text-indigo-600 rounded-2xl border border-slate-100 opacity-0 group-hover/chart:opacity-100 transition-all hover:shadow-md">
                                <Camera size={18}/>
                            </button>
                        </div>
                        <div className="flex-1 w-full min-h-0">
                            <ResponsiveContainer>
                                <BarChart data={hourData} margin={{bottom: 60}}>
                                    <defs>
                                        <linearGradient id="colorHour" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#F59E0B" stopOpacity={1}/>
                                            <stop offset="100%" stopColor="#F59E0B" stopOpacity={0.7}/>
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#f1f5f9"/>
                                    <XAxis dataKey="label" stroke="#94a3b8" fontSize={10} axisLine={false} tickLine={false} fontWeight="900" angle={-45} textAnchor="end" height={60} interval={0} />
                                    <YAxis stroke="#cbd5e1" fontSize={10} fontWeight="800" axisLine={false} tickLine={false}/>
                                    <Tooltip content={<CustomTooltip/>}/>
                                    <Bar dataKey="value" name="Frequency" radius={[8, 8, 0, 0]} cursor="pointer" onClick={(p) => handleTimeBarClick(p, 'hour')} animationDuration={2000}>
                                        {hourData.map((entry, index) => (
                                            <Cell 
                                                key={`cell-${index}`} 
                                                fillOpacity={box1Filters.hour === 'All' || box1Filters.hour === entry.name ? 1 : 0.2}
                                                fill={box1Filters.hour === entry.name ? '#D97706' : 'url(#colorHour)'}
                                                className="transition-all duration-500"
                                            />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                     </div>
                     <div id="chart-density-day" className="h-[38rem] flex flex-col group/chart">
                        <div className="flex justify-between items-center mb-10">
                            <h4 className="font-black text-slate-900 text-xs tracking-[0.25em] uppercase flex items-center gap-4">
                                <div className="p-2 rounded-xl bg-blue-50 text-blue-600 border border-blue-100"><Calendar size={20}/></div>
                                Day of Week Distribution
                            </h4>
                            <button onClick={() => exportChartAsPNG('chart-density-day', 'Failure_Density_Day')} className="p-3 bg-slate-50 text-slate-400 hover:text-indigo-600 rounded-2xl border border-slate-100 opacity-0 group-hover/chart:opacity-100 transition-all hover:shadow-md">
                                <Camera size={18}/>
                            </button>
                        </div>
                        <div className="flex-1 w-full min-h-0">
                            <ResponsiveContainer>
                                <BarChart data={dayData} margin={{bottom: 60}}>
                                    <defs>
                                        <linearGradient id="colorDay" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#3B82F6" stopOpacity={1}/>
                                            <stop offset="100%" stopColor="#3B82F6" stopOpacity={0.7}/>
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#f1f5f9"/>
                                    <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} axisLine={false} tickLine={false} fontWeight="900" />
                                    <YAxis stroke="#cbd5e1" fontSize={10} fontWeight="800" axisLine={false} tickLine={false}/>
                                    <Tooltip content={<CustomTooltip/>}/>
                                    <Bar dataKey="value" name="Frequency" radius={[8, 8, 0, 0]} barSize={64} cursor="pointer" onClick={(p) => handleTimeBarClick(p, 'dayOfWeek')} animationDuration={2000} animationBegin={500}>
                                        {dayData.map((entry, index) => (
                                            <Cell 
                                                key={`cell-${index}`} 
                                                fillOpacity={box1Filters.dayOfWeek === 'All' || box1Filters.dayOfWeek === entry.name ? 1 : 0.2}
                                                fill={box1Filters.dayOfWeek === entry.name ? '#2563EB' : 'url(#colorDay)'}
                                                className="transition-all duration-500"
                                            />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                     </div>
                </div>
            </div>

            {/* Operational Risk Heatmap */}
            <div id="chart-heatmap" className="bg-white p-12 rounded-[3.5rem] shadow-2xl border border-slate-100 ring-1 ring-slate-950/[0.03] mx-2 transition-all hover:shadow-3xl duration-500 group/chart">
                <div className="flex justify-between items-start mb-12">
                    <div>
                        <h3 className="text-sm font-black text-slate-900 uppercase tracking-[0.3em] flex items-center gap-4">
                            <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100"><Crosshair size={24}/></div>
                            Systemic Risk Heatmap
                        </h3>
                        <p className="text-[10px] text-slate-400 font-bold uppercase mt-3 tracking-widest pl-[60px]">Cross-referencing Chronological Intensity (Hour) vs Shift Cycles (Day). Click nodes to isolate specific operational windows.</p>
                    </div>
                    <button onClick={() => exportChartAsPNG('chart-heatmap', 'Operational_Risk_Heatmap')} className="p-3 bg-slate-50 text-slate-400 hover:text-indigo-600 rounded-2xl border border-slate-100 opacity-0 group-hover/chart:opacity-100 transition-all hover:shadow-md">
                        <Camera size={18}/>
                    </button>
                </div>
                
                <div className="overflow-x-auto pb-6 custom-scrollbar px-4">
                    <div className="min-w-[900px]">
                        {/* Hour Labels */}
                        <div className="flex mb-6 pl-20">
                            {Array.from({length: 24}, (_, i) => (
                                <div key={i} className="flex-1 text-[9px] font-black text-slate-400 text-center uppercase tracking-tighter opacity-70">
                                    {i}:00
                                </div>
                            ))}
                        </div>

                        {/* Grid Rows */}
                        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                            <div key={day} className="flex h-14 items-center group/row">
                                <div className="w-20 shrink-0 text-[11px] font-black text-slate-500 uppercase pr-6 text-right group-hover/row:text-indigo-600 transition-colors">{day}</div>
                                <div className="flex flex-1 gap-1.5 h-full">
                                    {Array.from({length: 24}, (_, h) => {
                                        const cell = heatmapGrid.find(m => m.day === day && m.hour === h);
                                        const count = cell?.count || 0;
                                        const maxCount = Math.max(1, ...heatmapGrid.map(m => m.count));
                                        const intensity = count > 0 ? 0.15 + (count / maxCount) * 0.85 : 0.05;
                                        const isSelected = box1Filters.dayOfWeek === day && box1Filters.hour === h.toString();
                                        
                                        return (
                                            <button 
                                                key={h}
                                                onClick={() => handleHeatmapCellClick(day, h)}
                                                className={`flex-1 rounded-[6px] transition-all relative group/cell ${
                                                    isSelected ? 'ring-4 ring-indigo-500 scale-125 z-10 shadow-2xl shadow-indigo-200' : 'hover:scale-110 active:scale-95'
                                                }`}
                                                style={{ 
                                                    backgroundColor: count > 0 ? '#4F46E5' : '#F8FAFC',
                                                    opacity: intensity
                                                }}
                                                title={`${day} @ ${h}:00 - ${count} Failure Events`}
                                            >
                                                {count > 0 && (
                                                    <span className="absolute inset-0 flex items-center justify-center text-[9px] font-black text-white opacity-0 group-hover/cell:opacity-100 transition-opacity">
                                                        {count}
                                                    </span>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="mt-12 flex justify-center items-center gap-10 pt-10 border-t border-slate-50">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Risk Intensity:</span>
                    <div className="flex items-center gap-3">
                        <div className="w-5 h-5 rounded-md bg-slate-50 border border-slate-100"></div>
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Normal</span>
                    </div>
                    <div className="flex gap-2">
                        {[0.2, 0.4, 0.6, 0.8, 1].map((v, i) => (
                            <div key={i} className="w-5 h-5 rounded-md bg-indigo-600" style={{ opacity: v }}></div>
                        ))}
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">Critical Outage Zone</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default RootCauseHunter;
