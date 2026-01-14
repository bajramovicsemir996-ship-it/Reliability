
import React, { useState, useMemo } from 'react';
import { RawRecord, MaintenanceCost } from '../types';
import { calculateMetrics, calculateTimeBetweenFailures, calculateWeibull, calculateOptimalPM, generateCostCurve, exportChartAsPNG } from '../utils/reliabilityMath';
import { getMaintenanceAdvice } from '../services/geminiService';
import { Filter, DollarSign, Clock, TrendingDown, Cpu, Loader2, Info, ChevronDown, Hash, AlertTriangle, Coins, ShieldCheck, Camera } from 'lucide-react';
import { ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Area } from 'recharts';
import { useAppStore } from '../store';

interface OptimizationPanelProps {
  data: RawRecord[];
  filters: { asset: string; failureMode: string };
  costs: MaintenanceCost;
  updateCost: (type: 'preventive' | 'corrective', field: keyof MaintenanceCost['preventive'], value: number) => void;
  pmDuration: number;
  setPmDuration: (v: number) => void;
  loadingAI: boolean;
  setLoadingAI: (v: boolean) => void;
  inputMode: 'timestamp' | 'manual_ttf';
  setBox1Filter: (key: string, value: string) => void;
}

const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-slate-900/90 backdrop-blur-md text-white p-4 rounded-2xl shadow-2xl text-[11px] border border-white/10 min-w-[160px] z-50">
                <p className="font-black border-b border-white/10 pb-2 mb-3 text-indigo-400 uppercase tracking-widest">{Math.round(label)} HRS</p>
                {payload.map((p: any, i: number) => (
                    <div key={i} className="flex justify-between items-center gap-6 mb-2 last:mb-0">
                        <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: p.color || p.fill }}></div>
                            <span className="text-slate-400 font-bold">{p.name}:</span>
                        </div>
                        <span className="font-mono font-black text-white uppercase tracking-tighter">
                            {typeof p.value === 'number' ? `€${p.value.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : p.value}
                        </span>
                    </div>
                ))}
            </div>
        );
    }
    return null;
};

const OptimizationPanel: React.FC<OptimizationPanelProps> = ({ 
    data, filters, costs, updateCost, 
    pmDuration, setPmDuration, 
    loadingAI, setLoadingAI, inputMode, setBox1Filter
}) => {
  const { language } = useAppStore();
  const [optimalPM, setOptimalPM] = useState<number | null>(null);
  const [aiAdvice, setAiAdvice] = useState<string>('');

  const assetList = useMemo(() => Array.from(new Set(data.map(r => r.location))).filter(Boolean).sort(), [data]);
  const modeList = useMemo(() => Array.from(new Set(data.map(r => r.failureMode))).filter(Boolean).sort(), [data]);

  const filteredData = useMemo(() => {
    return data.filter(r => {
        const matchAsset = filters.asset === 'All' || r.location === filters.asset;
        const matchMode = filters.failureMode === 'All' || r.failureMode === filters.failureMode;
        return matchAsset && matchMode;
    });
  }, [data, filters]);

  const metrics = useMemo(() => calculateMetrics(filteredData, inputMode), [filteredData, inputMode]);
  const tbfData = useMemo(() => calculateTimeBetweenFailures(filteredData, inputMode), [filteredData, inputMode]);
  const weibull = useMemo(() => calculateWeibull(tbfData), [tbfData]);
  
  const derivedMttr = metrics.failureCount > 0 ? Math.max(0.1, metrics.mttr) : 0;

  const totalPM = costs.preventive.material + (costs.preventive.labor * pmDuration) + (costs.preventive.productionLoss * pmDuration);
  const totalCM = costs.corrective.material + (costs.corrective.labor * derivedMttr) + (costs.corrective.productionLoss * derivedMttr);

  const costCurveData = useMemo(() => (optimalPM || weibull.beta > 1) ? generateCostCurve(weibull.beta, weibull.eta, totalPM, totalCM) : [], [weibull, totalPM, totalCM, optimalPM]);

  const handleOptimization = async () => {
    if (weibull.beta <= 1) {
        alert("Optimization requires a Weibull Beta > 1 (Wear-out pattern). Current Beta indicates random or infant mortality where scheduled PM is not mathematically optimal based on age alone.");
        return;
    }
    setLoadingAI(true);
    const opt = calculateOptimalPM(weibull.beta, weibull.eta, totalPM, totalCM);
    setOptimalPM(opt);
    const advice = await getMaintenanceAdvice(weibull, totalPM, totalCM, opt, language);
    setAiAdvice(advice);
    setLoadingAI(false);
  };

  const InputField = ({ label, value, onChange, unit = "€" }: { label: string, value: number, onChange: (val: number) => void, unit?: string }) => (
    <div className="flex flex-col gap-1.5">
        <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.1em] ml-1">{label}</label>
        <div className="relative group/field">
            <input 
                type="number" 
                className="w-full bg-white border border-slate-200 rounded-[1rem] px-4 py-3 text-[11px] font-black text-slate-800 outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all text-right pr-12 shadow-sm"
                value={value} 
                onChange={e => onChange(Number(e.target.value))}
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400 pointer-events-none group-focus-within/field:text-indigo-500 uppercase tracking-widest">{unit}</span>
        </div>
    </div>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 max-w-7xl mx-auto h-full animate-in fade-in duration-700 pb-10">
        <div className="lg:col-span-4 space-y-8 overflow-y-auto pr-2 custom-scrollbar">
            {/* Filter Group */}
            <div className="bg-white rounded-[2.5rem] shadow-xl border border-slate-200 p-8 ring-1 ring-slate-950/[0.03] overflow-visible relative">
                <div className="flex items-center gap-4 mb-8">
                    <div className="p-3 bg-indigo-50 rounded-2xl text-indigo-600 shadow-sm border border-indigo-100"><Filter size={24} /></div>
                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-[0.2em]">Strategy Scope</h3>
                </div>
                <div className="space-y-6">
                    <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2.5 ml-1">Asset Specification</label>
                        <select value={filters.asset} onChange={e => setBox1Filter('asset', e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-[1rem] px-6 py-4 text-xs font-black uppercase text-indigo-700 outline-none focus:ring-4 focus:ring-indigo-100 transition-all appearance-none cursor-pointer">
                            <option value="All">All Projects</option>
                            {assetList.map(a => <option key={a} value={a}>{a}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2.5 ml-1">Failure Mechanism</label>
                        <select value={filters.failureMode} onChange={e => setBox1Filter('failureMode', e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-[1rem] px-6 py-4 text-xs font-black uppercase text-indigo-700 outline-none focus:ring-4 focus:ring-indigo-100 transition-all appearance-none cursor-pointer">
                            <option value="All">All Failure Modes</option>
                            {modeList.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                    </div>
                </div>
                <div className="mt-10 pt-6 border-t border-slate-100 flex justify-between items-center px-1">
                    <span className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em]">Physics Trend:</span>
                    <div className={`flex items-center gap-2 px-5 py-2 rounded-full text-[10px] font-black uppercase shadow-sm border ${weibull.beta > 1 ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-rose-50 text-rose-600 border-rose-100'}`}>
                        {weibull.beta > 1 ? 'Wear-out (β > 1)' : 'Random Risk (β ≤ 1)'}
                        <span className="font-mono ml-2 border-l border-current pl-2">{weibull.beta.toFixed(2)}</span>
                    </div>
                </div>
            </div>

            {/* Costs Input Card */}
            <div className="bg-white rounded-[2.5rem] shadow-xl border border-slate-200 p-8 ring-1 ring-slate-950/[0.03] overflow-visible relative">
                <div className="flex items-center gap-4 mb-8">
                    <div className="p-3 bg-emerald-50 rounded-2xl text-emerald-700 shadow-sm border border-emerald-100"><Coins size={24} /></div>
                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-[0.2em]">Financial Parameters</h3>
                </div>
                <div className="space-y-8">
                    <div className="bg-indigo-50/40 p-6 rounded-[2rem] border border-indigo-100/50 relative">
                        <div className="relative">
                            <h4 className="text-[10px] font-black text-indigo-700 uppercase tracking-[0.3em] mb-6 border-b border-indigo-100 pb-3 cursor-help peer w-fit">Preventive Model (Cp)</h4>
                            {/* Tooltip positioned below label */}
                            <div className="absolute left-0 top-full mt-3 w-64 bg-slate-900/95 backdrop-blur-md text-white text-[10px] p-4 rounded-2xl shadow-2xl invisible peer-hover:visible z-50 leading-relaxed border border-white/10 animate-in fade-in slide-in-from-top-2 duration-200 pointer-events-none">
                                <p className="font-black text-indigo-400 mb-1 uppercase tracking-widest">Cp Parameter</p>
                                <p className="text-slate-300 font-medium leading-relaxed">The total economic cost of a planned preventive event. Includes materials, scheduled labor, and planned downtime production loss.</p>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 gap-4">
                            <InputField label="Material / Asset Cost" value={costs.preventive.material} onChange={v => updateCost('preventive', 'material', v)} />
                            <div className="grid grid-cols-2 gap-4">
                                <InputField label="Labor Hourly" value={costs.preventive.labor} onChange={v => updateCost('preventive', 'labor', v)} unit="€/H" />
                                <InputField label="Production Loss" value={costs.preventive.productionLoss} onChange={v => updateCost('preventive', 'productionLoss', v)} unit="€/H" />
                            </div>
                            <InputField label="Standard Task Duration" value={pmDuration} onChange={v => setPmDuration(v)} unit="HRS" />
                        </div>
                    </div>
                    <div className="bg-rose-50/40 p-6 rounded-[2rem] border border-rose-100/50 relative">
                        <div className="relative">
                            <h4 className="text-[10px] font-black text-rose-700 uppercase tracking-[0.3em] mb-6 border-b border-rose-100 pb-3 cursor-help peer w-fit">Corrective Model (Cc)</h4>
                            {/* Tooltip positioned below label */}
                            <div className="absolute left-0 top-full mt-3 w-64 bg-slate-900/95 backdrop-blur-md text-white text-[10px] p-4 rounded-2xl shadow-2xl invisible peer-hover:visible z-50 leading-relaxed border border-white/10 animate-in fade-in slide-in-from-top-2 duration-200 pointer-events-none">
                                <p className="font-black text-rose-400 mb-1 uppercase tracking-widest">Cc Parameter</p>
                                <p className="text-slate-300 font-medium leading-relaxed">The total economic cost of an unplanned failure. Includes emergency parts, overtime labor, and high-impact production losses.</p>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 gap-4">
                            <InputField label="Emergency Parts Cost" value={costs.corrective.material} onChange={v => updateCost('corrective', 'material', v)} />
                            <div className="grid grid-cols-2 gap-4">
                                <InputField label="OT Labor Rate" value={costs.corrective.labor} onChange={v => updateCost('corrective', 'labor', v)} unit="€/H" />
                                <InputField label="Critical Loss Rate" value={costs.corrective.productionLoss} onChange={v => updateCost('corrective', 'productionLoss', v)} unit="€/H" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <button 
                onClick={handleOptimization} 
                disabled={loadingAI || weibull.beta <= 1} 
                className="w-full bg-slate-900 hover:bg-indigo-700 text-white py-6 rounded-[2rem] font-black uppercase tracking-[0.3em] text-[10px] flex justify-center items-center gap-4 disabled:opacity-50 disabled:bg-slate-300 transition-all shadow-2xl shadow-indigo-200 hover:-translate-y-1 active:scale-95"
            >
                {loadingAI ? <Loader2 className="animate-spin" size={20} /> : <TrendingDown size={20} />}
                {weibull.beta <= 1 ? 'PHYSICS MISMATCH' : 'GENERATE STRATEGY'}
            </button>
        </div>

        <div className="lg:col-span-8 flex flex-col gap-10 h-full overflow-hidden">
            <div className={`rounded-[3.5rem] border p-12 transition-all duration-700 ${optimalPM ? 'bg-white border-emerald-300 shadow-[0_0_40px_-10px_rgba(16,185,129,0.3)]' : 'bg-white border-slate-100 shadow-2xl ring-1 ring-slate-950/[0.03]'}`}>
                <h3 className="font-black text-slate-900 text-xs uppercase tracking-[0.3em] mb-12 flex items-center gap-5">
                    <div className={`w-1.5 h-6 rounded-full shadow-lg ${optimalPM ? 'bg-emerald-500 shadow-emerald-200' : 'bg-indigo-500 shadow-indigo-200'}`}></div>
                    STRATEGIC OPTIMIZATION RESULTS
                </h3>
                <div className="flex flex-col md:flex-row gap-12">
                    <div className={`text-center p-12 rounded-[3rem] shadow-2xl min-w-[280px] flex flex-col justify-center items-center relative overflow-hidden group transition-colors duration-500 ${optimalPM ? 'bg-emerald-950' : 'bg-slate-900'}`}>
                        <div className={`absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity duration-500 ${optimalPM ? 'bg-white' : 'bg-indigo-600'}`}></div>
                        <p className={`text-[10px] font-black uppercase tracking-[0.3em] mb-8 relative z-10 ${optimalPM ? 'text-emerald-400' : 'text-indigo-400'}`}>Optimal PM Interval</p>
                        {loadingAI ? (
                            <div className="animate-skeleton h-16 w-32 rounded-[1rem] opacity-30"></div>
                        ) : optimalPM ? (
                            <div className="animate-in zoom-in-90 duration-700 relative z-10">
                                <p className="text-7xl font-black text-white tracking-tighter drop-shadow-xl">{optimalPM.toFixed(0)}</p>
                                <p className="text-[10px] text-emerald-400/60 font-black uppercase mt-5 tracking-[0.2em]">Operating Hours</p>
                            </div>
                        ) : (
                            <div className="text-slate-700 flex flex-col items-center gap-4 relative z-10 py-6">
                                <Clock size={48} className="opacity-20 animate-pulse"/>
                                <p className="font-black text-[10px] uppercase tracking-[0.2em] opacity-40">Awaiting Analysis</p>
                            </div>
                        )}
                    </div>
                    <div className="flex-1 bg-slate-50 p-10 rounded-[3rem] border border-slate-100 text-slate-700 leading-relaxed italic relative overflow-hidden group/logic shadow-inner">
                        <h4 className="font-black text-slate-900 text-[10px] uppercase mb-6 tracking-[0.2em] flex items-center gap-4 relative z-10">
                            <div className="p-2 rounded-lg bg-white border border-slate-200 shadow-sm"><Cpu size={18} className="text-purple-600"/></div>
                            Reliability Strategy Synthesis
                        </h4>
                        <div className="relative z-10 text-[11px] font-medium space-y-4 text-slate-600">
                            {loadingAI ? (
                                <div className="space-y-4">
                                    <div className="h-2.5 w-3/4 animate-skeleton rounded-full"></div>
                                    <div className="h-2.5 w-full animate-skeleton rounded-full"></div>
                                    <div className="h-2.5 w-5/6 animate-skeleton rounded-full"></div>
                                    <div className="h-2.5 w-2/3 animate-skeleton rounded-full"></div>
                                </div>
                            ) : aiAdvice ? (
                                <p className="line-clamp-8 leading-[1.8]">{aiAdvice}</p>
                            ) : (
                                <div className="space-y-4 opacity-10">
                                    <div className="h-2.5 w-3/4 bg-slate-300 rounded-full"></div>
                                    <div className="h-2.5 w-full bg-slate-300 rounded-full"></div>
                                    <div className="h-2.5 w-5/6 bg-slate-300 rounded-full"></div>
                                    <div className="h-2.5 w-2/3 bg-slate-300 rounded-full"></div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <div id="chart-tco-curve" className="bg-white rounded-[3.5rem] shadow-2xl border border-slate-100 p-12 flex-1 min-h-0 flex flex-col relative ring-1 ring-slate-950/[0.03] overflow-hidden transition-all hover:shadow-3xl duration-500 group/chart">
                 <div className="flex justify-between items-center mb-10 shrink-0 relative">
                    <h3 className="font-black text-slate-900 text-[10px] uppercase tracking-[0.3em] flex items-center gap-4 cursor-help border-b border-dotted border-slate-200 peer w-fit">
                        <div className="p-2 rounded-xl bg-blue-50 text-blue-500 border border-blue-100"><TrendingDown size={20}/></div>
                        TOTAL COST OF OWNERSHIP (TCO) VS. PM INTERVAL
                    </h3>
                    {/* Tooltip positioned below label */}
                    <div className="absolute left-0 top-full mt-3 w-80 bg-slate-900/95 backdrop-blur-md text-white text-[10px] p-4 rounded-2xl shadow-2xl invisible peer-hover:visible z-50 leading-relaxed border border-white/10 animate-in fade-in slide-in-from-top-2 duration-200 pointer-events-none">
                        <p className="font-black text-blue-400 mb-1 uppercase tracking-widest">Total Cost of Ownership Model</p>
                        <p className="text-slate-300 font-medium leading-relaxed">This curve represents the expected maintenance cost per unit time. The optimal interval is found at the lowest point (the minimum of the curve), balancing the costs of over-maintaining (PM cost) vs under-maintaining (CM cost).</p>
                    </div>
                    <button onClick={() => exportChartAsPNG('chart-tco-curve', 'Optimal_TCO_Curve')} className="p-3 bg-slate-50 text-slate-400 hover:text-indigo-600 rounded-2xl border border-slate-100 opacity-0 group-hover/chart:opacity-100 transition-all hover:shadow-md">
                        <Camera size={18}/>
                    </button>
                 </div>
                 <div className="flex-1 w-full min-h-0">
                    <ResponsiveContainer>
                        <ComposedChart data={costCurveData} margin={{top: 10, right: 30, left: 10, bottom: 20}}>
                            <defs>
                                <linearGradient id="colorCost" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#4F46E5" stopOpacity={0.15}/>
                                    <stop offset="95%" stopColor="#4F46E5" stopOpacity={0}/>
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#f1f5f9"/>
                            <XAxis dataKey="t" stroke="#94a3b8" fontSize={10} fontWeight="900" tickLine={false} axisLine={false} label={{ value: 'PREVENTIVE INTERVAL (HOURS)', position: 'insideBottom', offset: -10, fontSize: 9, fontWeight: 900, fill: '#cbd5e1' }}/>
                            <YAxis stroke="#94a3b8" fontSize={10} fontWeight="800" tickLine={false} axisLine={false} tickFormatter={(val)=>`€${val.toFixed(0)}`}/>
                            <Tooltip content={<CustomTooltip/>}/>
                            <Area type="monotone" dataKey="cost" fill="url(#colorCost)" stroke="none" animationDuration={2000} />
                            <Line type="monotone" dataKey="cost" name="System TCO" stroke="#4F46E5" strokeWidth={6} dot={false} activeDot={{r: 8, fill: '#4F46E5', stroke: 'white', strokeWidth: 4}} animationDuration={2000} />
                            {optimalPM && (
                                <ReferenceLine 
                                    x={optimalPM} 
                                    stroke="#10B981" 
                                    strokeDasharray="10 5" 
                                    strokeWidth={3} 
                                    label={{ value: 'OPTIMAL STRATEGY', position: 'top', fill: '#10B981', fontWeight: 900, fontSize: 10, letterSpacing: '0.1em' }}
                                />
                            )}
                        </ComposedChart>
                    </ResponsiveContainer>
                 </div>
            </div>
        </div>
    </div>
  );
};

export default OptimizationPanel;
