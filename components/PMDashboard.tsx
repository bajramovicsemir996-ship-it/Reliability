
import React, { useMemo, useState } from 'react';
import { PMRecord, MaintenanceRoute } from '../types';
import { normalizeFrequency, exportChartAsPNG } from '../utils/reliabilityMath';
import { 
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, 
    ResponsiveContainer, PieChart, Pie, Cell, Legend, ReferenceLine
} from 'recharts';
import { 
    Filter, RefreshCcw, Clock, Users, AlertOctagon, 
    Activity, Euro, CheckCircle2, CalendarDays, Briefcase, 
    LayoutGrid, HelpCircle, ShieldCheck, TrendingUp, Layers,
    MapPin, ArrowRight, Sparkles, Zap, ChevronRight, Hash, Target, Camera
} from 'lucide-react';
import ResourcePlanning from './ResourcePlanning';
import { useAppStore } from '../store';

interface PMDashboardProps {
  data: PMRecord[];
  filters: { asset: string; trade: string; frequency: string; executorType: string; criticality: string; strategy: string; state: string };
  setFilter: (key: string, value: string) => void;
  laborRate?: number; 
}

const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-slate-900/90 backdrop-blur-md text-white p-4 rounded-2xl shadow-2xl text-[11px] border border-white/10 min-w-[160px] z-50 animate-in fade-in zoom-in-95 duration-200">
                <p className="font-black border-b border-white/10 pb-2 mb-3 text-emerald-400 uppercase tracking-widest">{label}</p>
                {payload.map((p: any, i: number) => (
                    <div key={i} className="flex justify-between items-center gap-6 mb-2 last:mb-0">
                        <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: p.color || p.fill }}></div>
                            <span className="text-slate-400 font-bold">{p.name}:</span>
                        </div>
                        <span className="font-mono font-black text-white">
                            {typeof p.value === 'number' ? p.value.toLocaleString(undefined, { maximumFractionDigits: 1 }) : p.value}
                            {p.name.includes('Load') || p.name.includes('Hours') ? ' hrs' : ''}
                        </span>
                    </div>
                ))}
            </div>
        );
    }
    return null;
};

const StatCard = ({ title, value, unit, subValue, icon: Icon, color, explanation, description }: { title: string, value: string, unit: string, subValue?: string, icon: any, color: string, explanation: string, description: string }) => {
    const colorStyles: Record<string, string> = {
        indigo: "text-indigo-600 bg-indigo-50 border-indigo-100 ring-indigo-500/10",
        orange: "text-orange-600 bg-orange-50 border-orange-100 ring-orange-500/10",
        emerald: "text-emerald-600 bg-emerald-50 border-emerald-100 ring-emerald-500/10",
        purple: "text-purple-600 bg-purple-50 border-purple-100 ring-purple-100/10",
        rose: "text-rose-600 bg-rose-50 border-rose-100 ring-rose-500/10",
    };
    const style = colorStyles[color] || colorStyles.indigo;

    return (
        <div className="relative group overflow-hidden bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm hover:shadow-2xl hover:-translate-y-1 transition-all duration-500 ring-1 ring-slate-950/[0.03]">
            <div className="relative z-10 flex flex-col h-full">
                <div className="flex items-center gap-4 mb-5">
                    <div className={`p-3 rounded-2xl shadow-sm ${style} transition-transform group-hover:scale-110 duration-500`}>
                        <Icon size={24} />
                    </div>
                    <div>
                        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{title}</h3>
                        <p className="text-[10px] font-bold text-slate-500 leading-tight mt-0.5 uppercase">{explanation}</p>
                    </div>
                </div>
                
                <div className="mt-auto">
                    <div className="flex items-baseline gap-2">
                        <span className="text-4xl font-black text-slate-900 tracking-tighter uppercase">{value}</span>
                        <span className="text-xs font-black text-slate-400 uppercase tracking-widest">{unit}</span>
                    </div>
                    {subValue && (
                        <div className="mt-4 flex items-center gap-2 bg-slate-50 py-1.5 px-3 rounded-full border border-slate-100 w-fit">
                             <div className={`h-1.5 w-1.5 rounded-full animate-pulse ${style.split(' ')[0]}`}></div>
                             <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{subValue}</span>
                        </div>
                    )}
                </div>
            </div>
            <div className="absolute top-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <div className="relative">
                    <HelpCircle size={18} className="text-slate-300 peer cursor-help hover:text-emerald-500 transition-colors" />
                    <div className="absolute right-0 top-8 w-64 bg-slate-900/95 backdrop-blur-md text-white text-[10px] p-5 rounded-2xl shadow-2xl hidden peer-hover:block z-50 leading-relaxed border border-white/10 animate-in fade-in slide-in-from-top-2 duration-200">
                        <p className="font-black text-emerald-400 mb-2 uppercase tracking-[0.15em] border-b border-white/10 pb-2">Strategy Context</p>
                        <p className="text-slate-300 font-medium">{description}</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

const SectionHeader = ({ title, description, icon: Icon, iconColor }: any) => (
    <div className="mb-10 pl-2">
        <div className="flex items-center gap-4">
            <div className={`p-2.5 rounded-xl bg-white border border-slate-200 shadow-sm ${iconColor}`}>
                <Icon size={24} />
            </div>
            <h3 className="text-lg font-black text-slate-900 uppercase tracking-widest">{title}</h3>
        </div>
        <p className="text-[11px] text-slate-500 mt-3 font-bold uppercase tracking-widest max-w-2xl leading-relaxed pl-[64px] border-l-2 border-slate-100 ml-[20px]">{description}</p>
    </div>
);

const PMDashboard: React.FC<PMDashboardProps> = ({ data, filters, setFilter, laborRate = 25 }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'resources'>('overview');
  const { resources } = useAppStore();

  const assetList = useMemo(() => Array.from(new Set(data.map(r => r.asset || 'Unknown'))).filter(Boolean).sort(), [data]);
  const tradeList = useMemo(() => Array.from(new Set(data.map(r => r.trade || 'Unassigned'))).filter(Boolean).sort(), [data]);
  const strategyList = useMemo(() => Array.from(new Set(data.map(r => r.taskType || 'Unassigned'))).filter(Boolean).sort(), [data]);

  const filteredData = useMemo(() => {
      return data.filter(r => {
          if (filters.asset !== 'All' && r.asset !== filters.asset) return false;
          if (filters.trade !== 'All' && r.trade !== filters.trade) return false;
          if (filters.frequency !== 'All' && r.frequency !== filters.frequency) return false;
          if (filters.executorType !== 'All' && r.executorType !== filters.executorType) return false;
          if (filters.criticality !== 'All' && r.criticality !== filters.criticality) return false;
          if (filters.strategy !== 'All' && r.taskType !== filters.strategy) return false;
          if (filters.state !== 'All') {
              const isShutdown = filters.state === 'Shutdown';
              if (r.shutdownRequired !== isShutdown) return false;
          }
          return true;
      });
  }, [data, filters]);

  const workloadData = useMemo(() => {
    const tradeHours: Record<string, number> = {};
    filteredData.forEach(task => {
        const h = normalizeFrequency(task.frequency) * task.estimatedDuration * (task.numberOfExecutors||1);
        tradeHours[task.trade||'Other'] = (tradeHours[task.trade||'Other']||0) + h;
    });
    return Object.entries(tradeHours).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value);
  }, [filteredData]);

  const strategyData = useMemo(() => {
      const c: Record<string, number> = {};
      filteredData.forEach(t => { 
          const type = t.taskType || 'Unassigned';
          c[type] = (c[type] || 0) + 1; 
      });
      return Object.entries(c).map(([name,value])=>({name,value})).filter(d=>d.value>0);
  }, [filteredData]);

  const strategyColors = ["#6366F1", "#10B981", "#F59E0B", "#8B5CF6", "#F43F5E"];

  return (
    <div className="space-y-12 animate-in fade-in duration-700 pb-20 px-2">
        <div className="bg-white/80 backdrop-blur-2xl p-3 rounded-[2.5rem] shadow-2xl border border-white/50 flex flex-wrap gap-4 items-center justify-between sticky top-4 z-40 mx-2 ring-1 ring-slate-950/5">
            <div className="flex bg-slate-100/60 p-1.5 rounded-2xl border border-slate-200/50">
                <button onClick={() => setActiveTab('overview')} className={`flex items-center gap-3 px-8 py-3 rounded-[1.25rem] text-xs font-black transition-all duration-300 ${activeTab === 'overview' ? 'bg-white shadow-xl text-emerald-600 ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-800'}`}>
                    <LayoutGrid size={18}/> STRATEGY MODEL
                </button>
                <button onClick={() => setActiveTab('resources')} className={`flex items-center gap-3 px-8 py-3 rounded-[1.25rem] text-xs font-black transition-all duration-300 ${activeTab === 'resources' ? 'bg-white shadow-xl text-blue-600 ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-800'}`}>
                    <Briefcase size={18}/> CAPACITY PLAN
                </button>
            </div>

            <div className="flex flex-1 items-center gap-3 px-4 overflow-x-auto no-scrollbar">
                {[
                    { key: 'asset', icon: Filter, options: assetList, label: 'Asset' },
                    { key: 'trade', icon: Briefcase, options: tradeList, label: 'Trade' },
                    { key: 'strategy', icon: Target, options: strategyList, label: 'Strategy' }
                ].map((item) => (
                    <div key={item.key} className="flex items-center gap-2 bg-white px-4 py-2.5 rounded-2xl border border-slate-200 shadow-sm shrink-0 transition-all hover:border-emerald-300 focus-within:ring-2 focus-within:ring-emerald-50">
                        <item.icon size={14} className="text-slate-400" />
                        <select 
                            value={(filters as any)[item.key]} 
                            onChange={(e) => setFilter(item.key, e.target.value)}
                            className="text-[10px] font-black uppercase outline-none bg-transparent min-w-[120px] cursor-pointer"
                        >
                            <option value="All">All {item.label}s</option>
                            {item.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                    </div>
                ))}
            </div>

            <div className="flex gap-3 px-2">
                <button onClick={() => {
                    setFilter('asset', 'All');
                    setFilter('trade', 'All');
                    setFilter('frequency', 'All');
                    setFilter('strategy', 'All');
                    setFilter('executorType', 'All');
                    setFilter('criticality', 'All');
                    setFilter('state', 'All');
                }} className="p-3 rounded-2xl bg-slate-900 border border-slate-800 hover:bg-emerald-600 text-white transition-all shadow-lg shrink-0" title="Reset All Filters">
                    <RefreshCcw size={20}/>
                </button>
            </div>
        </div>

        {activeTab === 'resources' ? (
             <ResourcePlanning pmData={data} />
        ) : (
            <>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 px-2">
                    <StatCard title="Tasks" explanation="Active Activities" value={filteredData.length.toString()} unit="qty" icon={CheckCircle2} color="indigo" description="Unique PM jobs in plan." />
                    <StatCard title="Annual Load" explanation="Capacity Hours" value={workloadData.reduce((a,b)=>a+b.value,0).toFixed(0)} unit="hrs" icon={Clock} color="emerald" description="Cumulative annual maintenance man-hours." />
                    <StatCard title="Budget Est." explanation="Labor Spend" value={(workloadData.reduce((a,b)=>a+b.value,0) * laborRate).toLocaleString()} unit="€" icon={Euro} color="purple" description="Projected annual labor spend." />
                    <StatCard title="Criticality" explanation="Strategic Risk" value={(filteredData.length ? (filteredData.filter(t=>t.criticality==='High').length/filteredData.length)*100 : 0).toFixed(0)} unit="%" icon={AlertOctagon} color="rose" description="Percentage of tasks on high-criticality assets." />
                </div>

                <div className="space-y-12">
                    <SectionHeader title="Resource Distribution & Strategy Alignment" description="Visual breakdown of annual workload requirements and tactical maintenance methodologies." icon={ShieldCheck} iconColor="text-indigo-600" />
                    
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                        <div id="chart-annual-workload" className="bg-white p-12 rounded-[3.5rem] shadow-xl border border-slate-100 h-[40rem] flex flex-col ring-1 ring-slate-950/[0.03] transition-all hover:shadow-2xl duration-500 group/chart">
                            <div className="flex justify-between items-center mb-10">
                                <h4 className="font-black text-slate-900 text-xs tracking-[0.25em] uppercase flex items-center gap-4">
                                    <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100"><Clock size={20}/></div>
                                    Annual Workload by Trade (Hrs)
                                </h4>
                                <button onClick={() => exportChartAsPNG('chart-annual-workload', 'Annual_Workload_By_Trade')} className="p-3 bg-slate-50 text-slate-400 hover:text-indigo-600 rounded-2xl border border-slate-100 opacity-0 group-hover/chart:opacity-100 transition-all hover:shadow-md">
                                    <Camera size={18}/>
                                </button>
                            </div>
                            <div className="flex-1 min-h-0">
                                <ResponsiveContainer>
                                    <BarChart layout="vertical" data={workloadData} barSize={32} margin={{left: 30, right: 30}}>
                                        <defs>
                                            <linearGradient id="colorWorkload" x1="0" y1="0" x2="1" y2="0">
                                                <stop offset="0%" stopColor="#10B981" stopOpacity={0.8}/>
                                                <stop offset="100%" stopColor="#10B981" stopOpacity={1}/>
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="4 4" horizontal={true} vertical={false} stroke="#f1f5f9"/>
                                        <XAxis type="number" stroke="#cbd5e1" fontSize={10} fontWeight="800" axisLine={false} tickLine={false} />
                                        <YAxis dataKey="name" type="category" width={110} stroke="#64748b" fontSize={11} fontWeight="900" axisLine={false} tickLine={false}/>
                                        <Tooltip content={<CustomTooltip/>}/>
                                        <Bar dataKey="value" name="Annual Hours" fill="url(#colorWorkload)" radius={[0,12,12,0]} animationDuration={2000} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        <div id="chart-strategy-mix" className="bg-white p-12 rounded-[3.5rem] shadow-xl border border-slate-100 h-[40rem] flex flex-col ring-1 ring-slate-950/[0.03] transition-all hover:shadow-2xl duration-500 group/chart">
                            <div className="flex justify-between items-center mb-10">
                                <h4 className="font-black text-slate-900 text-xs tracking-[0.25em] uppercase flex items-center gap-4">
                                    <div className="p-2 rounded-xl bg-purple-50 text-purple-600 border border-purple-100"><Activity size={20}/></div>
                                    Strategic Maintenance Methodology Mix
                                </h4>
                                <button onClick={() => exportChartAsPNG('chart-strategy-mix', 'Maintenance_Strategy_Mix')} className="p-3 bg-slate-50 text-slate-400 hover:text-indigo-600 rounded-2xl border border-slate-100 opacity-0 group-hover/chart:opacity-100 transition-all hover:shadow-md">
                                    <Camera size={18}/>
                                </button>
                            </div>
                            <div className="flex-1 min-h-0">
                                <ResponsiveContainer>
                                    <PieChart>
                                        <Pie 
                                            data={strategyData} 
                                            dataKey="value" 
                                            nameKey="name" 
                                            cx="50%" 
                                            cy="50%" 
                                            innerRadius={90} 
                                            outerRadius={140} 
                                            paddingAngle={8}
                                            stroke="none"
                                            animationDuration={1500}
                                        >
                                            {strategyData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={strategyColors[index % strategyColors.length]} className="hover:opacity-80 transition-opacity duration-300 outline-none" />
                                            ))}
                                        </Pie>
                                        <Tooltip content={<CustomTooltip/>}/>
                                        <Legend verticalAlign="bottom" height={40} iconType="circle" wrapperStyle={{ paddingTop: '20px', fontWeight: '900', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em' }} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>
                </div>
            </>
        )}
    </div>
  );
};
export default PMDashboard;
