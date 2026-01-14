import React, { useMemo } from 'react';
import { RawRecord, StoppageType } from '../types';
import { calculateCrowAMSAA, calculateRollingMTBF, exportChartAsPNG } from '../utils/reliabilityMath';
import { ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip, ScatterChart, Scatter, AreaChart, Area, ZAxis, Cell } from 'recharts';
import { TrendingUp, Activity, Filter, ArrowUpRight, ArrowDownRight, Minus, Calendar, Crosshair, Info, BarChart3, HelpCircle, Camera } from 'lucide-react';

interface TrendAnalysisProps {
  box1Data: RawRecord[];
  selectedAsset: string;
  onAssetChange: (asset: string) => void;
  selectedFailureMode: string;
  onFailureModeChange: (mode: string) => void;
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
                            {typeof p.value === 'number' ? p.value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : p.value}
                        </span>
                    </div>
                ))}
            </div>
        );
    }
    return null;
};

const TrendCard = ({ title, value, subtext, status, icon: Icon, explanation, description, isWarning }: { title: string, value: string, subtext: string, status: 'good'|'bad'|'neutral', icon: any, explanation: string, description: string, isWarning?: boolean }) => {
    const statusColors = {
        good: 'text-emerald-600 bg-emerald-50 border-emerald-100 ring-emerald-500/10',
        bad: 'text-rose-600 bg-rose-50 border-rose-100 ring-rose-500/10',
        neutral: 'text-indigo-600 bg-indigo-50 border-indigo-100 ring-indigo-500/10'
    };
    const style = statusColors[status];

    return (
        <div className={`p-8 rounded-[2.5rem] border transition-all duration-500 ring-1 ring-slate-950/[0.03] group overflow-visible relative hover:z-30 ${isWarning ? 'bg-rose-50 border-rose-300 shadow-[0_0_25px_-5px_rgba(244,63,94,0.4)]' : 'bg-white border-slate-200 shadow-sm hover:shadow-2xl hover:-translate-y-1'}`}>
            <div className="flex justify-between items-start mb-6">
                <div className={`p-3 rounded-2xl ${isWarning ? 'text-rose-600 bg-white border-rose-100' : style} transition-transform group-hover:scale-110 duration-500 shadow-sm`}>
                    <Icon size={24} />
                </div>
                <div className={`flex items-center gap-1.5 text-[9px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest shadow-sm border ${isWarning ? 'bg-rose-600 text-white border-transparent' : style}`}>
                    {status === 'good' ? <ArrowDownRight size={14}/> : status === 'bad' ? <ArrowUpRight size={14}/> : <Minus size={14}/>}
                    {status === 'good' ? 'Improving' : status === 'bad' ? 'Degrading' : 'Consistent'}
                </div>
            </div>
            <div>
                <div className="relative">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] mb-2 cursor-help border-b border-dotted border-slate-300 w-fit peer pb-0.5">{title}</h3>
                    {/* Tooltip positioned below label */}
                    <div className="absolute left-0 top-full mt-3 w-64 bg-slate-900/95 backdrop-blur-md text-white text-[10px] p-4 rounded-2xl shadow-2xl invisible peer-hover:visible z-50 leading-relaxed border border-white/10 animate-in fade-in slide-in-from-top-2 duration-200 pointer-events-none">
                        <p className="font-black text-indigo-400 mb-1 uppercase tracking-widest">{title} Analysis</p>
                        <p className="text-slate-300 font-medium leading-relaxed">{description}</p>
                    </div>
                </div>
                <div className={`text-4xl font-black tracking-tighter ${isWarning ? 'text-rose-600' : 'text-slate-900'}`}>{value}</div>
                <p className={`text-[10px] font-bold mt-3 uppercase tracking-[0.1em] ${isWarning ? 'text-rose-500' : 'text-slate-500'}`}>{subtext}</p>
            </div>
            <div className="mt-6 pt-6 border-t border-slate-100 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <p className="text-[10px] text-slate-500 font-medium leading-relaxed italic">{explanation}</p>
            </div>
        </div>
    );
};

const TrendAnalysis: React.FC<TrendAnalysisProps> = ({ box1Data, selectedAsset, onAssetChange, selectedFailureMode, onFailureModeChange }) => {
  const uniqueAssets = useMemo(() => Array.from(new Set(box1Data.map(r => r.location || 'Unknown'))).sort(), [box1Data]);
  const uniqueModes = useMemo(() => Array.from(new Set(box1Data.map(r => r.failureMode || 'Uncategorized'))).sort(), [box1Data]);

  const filteredData = useMemo(() => {
      let data = box1Data;
      if (selectedAsset !== 'All') data = data.filter(r => r.location === selectedAsset);
      if (selectedFailureMode !== 'All') data = data.filter(r => r.failureMode === selectedFailureMode);
      return data;
  }, [box1Data, selectedAsset, selectedFailureMode]);

  const growth = useMemo(() => calculateCrowAMSAA(filteredData), [filteredData]);
  const rolling = useMemo(() => calculateRollingMTBF(filteredData, 5), [filteredData]);

  const beta = growth.beta;
  const growthStatus = beta > 1.1 ? 'bad' : beta < 0.9 ? 'good' : 'neutral';
  
  const latestMTBF = rolling.length > 0 ? rolling[rolling.length-1].mtbf : 0;
  const previousMTBF = rolling.length > 5 ? rolling[rolling.length-5].mtbf : latestMTBF;
  const mtbfTrend = latestMTBF > previousMTBF ? 'good' : latestMTBF < previousMTBF ? 'bad' : 'neutral';

  const scatterData = useMemo(() => {
      const isSystemView = selectedAsset === 'All';
      const groupBy = isSystemView ? 'location' : 'failureMode';
      const agg: Record<string, { count: number, duration: number }> = {};
      
      filteredData.filter(r => r.type === StoppageType.Unplanned).forEach(r => {
          const key = r[groupBy as keyof RawRecord] ? String(r[groupBy as keyof RawRecord]) : (isSystemView ? 'Unknown' : 'Uncategorized');
          if (!agg[key]) agg[key] = { count: 0, duration: 0 };
          agg[key].count++;
          agg[key].duration += r.durationMinutes;
      });

      return Object.entries(agg).map(([name, d]) => ({
          name,
          x: d.count,
          y: d.duration,
          z: 1 
      }));
  }, [filteredData, selectedAsset]);

  const handleScatterClick = (data: any) => {
    if (!data || !data.name) return;
    if (selectedAsset === 'All') {
        onAssetChange(data.name);
    } else {
        onFailureModeChange(data.name === selectedFailureMode ? 'All' : data.name);
    }
  };

  return (
    <div className="space-y-12 animate-in fade-in duration-1000 pb-20 px-2">
         <div className="bg-white/80 backdrop-blur-2xl p-3 rounded-[2.5rem] shadow-2xl border border-white/50 flex flex-wrap gap-4 items-center justify-between sticky top-4 z-40 mx-2 ring-1 ring-slate-950/5">
             <div className="flex items-center gap-4 bg-slate-100/60 px-8 py-3 rounded-2xl border border-slate-200/50">
                 <Filter size={20} className="text-indigo-600" />
                 <span className="text-xs font-black text-slate-900 uppercase tracking-[0.2em]">Trend Scope Explorer</span>
             </div>
             
             <div className="flex gap-4 items-center pr-2">
                <select value={selectedAsset} onChange={e => onAssetChange(e.target.value)} className="bg-white border-slate-200 text-slate-800 text-[10px] font-black uppercase rounded-2xl py-3 px-8 shadow-sm outline-none focus:ring-2 focus:ring-indigo-100 transition-all cursor-pointer">
                    <option value="All">All Assets</option>
                    {uniqueAssets.map(a=><option key={a} value={a}>{a}</option>)}
                </select>
                <select value={selectedFailureMode} onChange={e => onFailureModeChange(e.target.value)} className="bg-white border-slate-200 text-slate-800 text-[10px] font-black uppercase rounded-2xl py-3 px-8 shadow-sm outline-none focus:ring-2 focus:ring-indigo-100 transition-all cursor-pointer">
                    <option value="All">All Modes</option>
                    {uniqueModes.map(m=><option key={m} value={m}>{m}</option>)}
                </select>
            </div>
         </div>

         <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
             <TrendCard 
                title="Growth Alpha" explanation="Tracking reliability growth over time. Slope < 1 means reliability is improving." 
                description="The Crow-AMSAA slope parameter. Alpha < 1 indicates a reliable growth (improvement) phase. Alpha > 1 indicates a reliability degradation (increasing failure rate) phase."
                value={beta.toFixed(3)} subtext="Crow-AMSAA Parameter" status={growthStatus} icon={TrendingUp} isWarning={beta > 1.2}
             />
             <TrendCard 
                title="Rolling MTBF" explanation="Average uptime in the most recent window. Identifies short-term stability." 
                description="Mean Time Between Failures calculated over a sliding window of the last 5 failures. Helps identify if the current system performance is better or worse than the long-term average."
                value={`${latestMTBF.toFixed(1)} h`} subtext="Most Recent Window" status={mtbfTrend} icon={Activity} 
             />
             <TrendCard 
                title="Data Population" explanation="Total failure samples used for this trend curve." 
                description="The sample size of unplanned events used to calculate trend curves. Higher populations lead to more statistically significant growth models."
                value={filteredData.length.toString()} subtext="Failure Samples" status="neutral" icon={Calendar} 
             />
         </div>

         <div className="space-y-16">
              {/* Rolling MTBF */}
              <div id="chart-stability-matrix" className="bg-white p-12 rounded-[3.5rem] shadow-xl border border-slate-100 h-[42rem] flex flex-col ring-1 ring-slate-950/[0.03] transition-all hover:shadow-2xl duration-500 group/chart">
                 <div className="flex justify-between items-start mb-12">
                    <div>
                        <h3 className="text-sm font-black text-slate-900 uppercase tracking-[0.3em] flex items-center gap-4">
                            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100"><BarChart3 size={24}/></div>
                            Stability Evolution Matrix
                        </h3>
                        <p className="text-[10px] text-slate-400 font-bold uppercase mt-3 tracking-widest pl-[60px]">Continuous monitoring of short-term MTBF volatility over historical events.</p>
                    </div>
                    <button onClick={() => exportChartAsPNG('chart-stability-matrix', 'Stability_Evolution_Matrix')} className="p-3 bg-slate-50 text-slate-400 hover:text-indigo-600 rounded-2xl border border-slate-100 opacity-0 group-hover/chart:opacity-100 transition-all hover:shadow-md">
                        <Camera size={18}/>
                    </button>
                 </div>
                 <div className="flex-1 w-full min-h-0">
                    <ResponsiveContainer>
                        <AreaChart data={rolling} margin={{ top: 10, right: 30, bottom: 40, left: 0 }}>
                            <defs><linearGradient id="colorRollingMtbf" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10B981" stopOpacity={0.6}/><stop offset="95%" stopColor="#10B981" stopOpacity={0}/></linearGradient></defs>
                            <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#f1f5f9"/>
                            <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} fontWeight="900" axisLine={false} tickLine={false} height={40} />
                            <YAxis stroke="#94a3b8" fontSize={10} fontWeight="800" axisLine={false} tickLine={false}/>
                            <Tooltip content={<CustomTooltip />}/>
                            <Area type="monotone" dataKey="mtbf" name="MTBF (hrs)" stroke="#10B981" strokeWidth={6} fillOpacity={1} fill="url(#colorRollingMtbf)" animationDuration={2000} />
                        </AreaChart>
                    </ResponsiveContainer>
                 </div>
              </div>

              {/* Cumulative Growth Plot */}
              <div id="chart-log-growth" className="bg-white p-12 rounded-[3.5rem] shadow-xl border border-slate-100 h-[42rem] flex flex-col ring-1 ring-slate-950/[0.03] transition-all hover:shadow-2xl duration-500 group/chart">
                 <div className="flex justify-between items-start mb-12">
                    <div>
                        <h3 className="text-sm font-black text-slate-900 uppercase tracking-[0.3em] flex items-center gap-4">
                            <div className="p-2 rounded-xl bg-purple-50 text-purple-600 border border-purple-100"><TrendingUp size={24}/></div>
                            Logarithmic Growth Model
                        </h3>
                        <p className="text-[10px] text-slate-400 font-bold uppercase mt-3 tracking-widest pl-[60px]">Detecting subtle shifts in failure intensity using Crow-AMSAA logarithmic modeling.</p>
                    </div>
                    <button onClick={() => exportChartAsPNG('chart-log-growth', 'Logarithmic_Growth_Model')} className="p-3 bg-slate-50 text-slate-400 hover:text-indigo-600 rounded-2xl border border-slate-100 opacity-0 group-hover/chart:opacity-100 transition-all hover:shadow-md">
                        <Camera size={18}/>
                    </button>
                 </div>
                 <div className="flex-1 w-full min-h-0">
                    <ResponsiveContainer>
                        <ScatterChart margin={{ top: 10, right: 40, bottom: 60, left: 20 }}>
                            <CartesianGrid strokeDasharray="4 4" stroke="#f1f5f9" vertical={false}/>
                            <XAxis type="number" dataKey="cumulativeTime" scale="log" domain={['auto','auto']} stroke="#94a3b8" fontSize={10} fontWeight="900" axisLine={false} tickLine={false} label={{ value: 'LOG CUMULATIVE OPERATING TIME', position: 'insideBottom', offset: -15, fontSize: 9, fontWeight: 900, fill: '#cbd5e1' }}/>
                            <YAxis type="number" dataKey="cumulativeFailures" scale="log" domain={['auto','auto']} stroke="#94a3b8" fontSize={10} fontWeight="800" axisLine={false} tickLine={false} label={{ value: 'LOG CUMULATIVE FAILURES', angle: -90, position: 'insideLeft', fontSize: 9, fontWeight: 900, fill: '#cbd5e1' }}/>
                            <Tooltip content={<CustomTooltip />} />
                            <Scatter name="Measurement" data={growth.points} fill="#8b5cf6" stroke="white" strokeWidth={2} />
                        </ScatterChart>
                    </ResponsiveContainer>
                 </div>
              </div>

              {/* Contribution Matrix */}
              <div id="chart-contribution-matrix" className="bg-white p-12 rounded-[3.5rem] shadow-xl border border-slate-100 h-[42rem] flex flex-col ring-1 ring-slate-950/[0.03] transition-all hover:shadow-2xl duration-500 group/chart">
                 <div className="flex justify-between items-start mb-12">
                    <div>
                        <h3 className="text-sm font-black text-slate-900 uppercase tracking-[0.3em] flex items-center gap-4">
                            <div className="p-2 rounded-xl bg-rose-50 text-rose-600 border border-rose-100"><Crosshair size={24}/></div>
                            Contribution Intensity Matrix
                        </h3>
                        <p className="text-[10px] text-slate-400 font-bold uppercase mt-3 tracking-widest pl-[60px]">Analyzing assets by Volume (Frequency) vs Severity (Downtime). Click nodes to isolate.</p>
                    </div>
                    <button onClick={() => exportChartAsPNG('chart-contribution-matrix', 'Contribution_Intensity_Matrix')} className="p-3 bg-slate-50 text-slate-400 hover:text-indigo-600 rounded-2xl border border-slate-100 opacity-0 group-hover/chart:opacity-100 transition-all hover:shadow-md">
                        <Camera size={18}/>
                    </button>
                 </div>
                 <div className="flex-1 w-full min-h-0 relative">
                    <ResponsiveContainer>
                        <ScatterChart margin={{ top: 20, right: 40, bottom: 60, left: 20 }}>
                            <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#f1f5f9"/>
                            <XAxis type="number" dataKey="x" name="Frequency" stroke="#94a3b8" fontSize={10} fontWeight="900" axisLine={false} tickLine={false} label={{ value: 'FAILURE VOLUME (QTY)', position: 'insideBottom', offset: -15, fontSize:9, fontWeight: 900, fill: '#cbd5e1' }}/>
                            <YAxis type="number" dataKey="y" name="Downtime" stroke="#94a3b8" fontSize={10} fontWeight="800" axisLine={false} tickLine={false} label={{ value: 'TOTAL DOWNTIME (MIN)', angle: -90, position: 'insideLeft', fontSize:9, fontWeight: 900, fill: '#cbd5e1' }}/>
                            <ZAxis type="number" dataKey="z" range={[400, 400]} />
                            <Tooltip content={<CustomTooltip />} />
                            <Scatter name="Contribution Node" data={scatterData} cursor="pointer" animationDuration={1500} onClick={(data) => handleScatterClick(data)}>
                                {scatterData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={selectedAsset === entry.name || selectedFailureMode === entry.name ? '#4F46E5' : '#F43F5E'} stroke="white" strokeWidth={2} className="transition-all duration-300" />
                                ))}
                            </Scatter>
                        </ScatterChart>
                    </ResponsiveContainer>
                 </div>
              </div>
         </div>
    </div>
  );
};

export default TrendAnalysis;
