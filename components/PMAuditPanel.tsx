
import React, { useState, useMemo } from 'react';
import { PMRecord, RawRecord, PMTaskAudit, GapAnalysisResult, StoppageType } from '../types';
import { auditPMPlan, performGapAnalysis } from '../services/geminiService';
import { 
  FileText, Loader2, Info, ShieldCheck, Zap, Sparkles, Database, Layers, 
  ShieldAlert, Search, ClipboardList, CheckCircle, Clock, AlertTriangle, 
  ArrowRight, Target, ShieldX, TrendingUp, BarChart3, ListChecks
} from 'lucide-react';
import { useAppStore } from '../store';

interface PMAuditPanelProps {
  pmPlanData: PMRecord[];
  box1Data: RawRecord[];
  loadingAI: boolean;
  setLoadingAI: (loading: boolean) => void;
  box2Filters: { asset: string };
  setFilter: (key: string, value: string) => void;
}

const TableSkeleton = () => (
    <div className="h-4 w-full animate-skeleton rounded-full opacity-50"></div>
);

const PMAuditPanel: React.FC<PMAuditPanelProps> = ({ pmPlanData, box1Data, loadingAI, setLoadingAI, box2Filters, setFilter }) => {
  const { language } = useAppStore();
  const [auditResults, setAuditResults] = useState<PMTaskAudit[]>([]);
  const [stagedTasks, setStagedTasks] = useState<PMRecord[]>([]);
  const [gapResults, setGapResults] = useState<GapAnalysisResult[]>([]);
  const [activeTab, setActiveTab] = useState<'audit'|'gap'>('audit');
  
  // Interactive Gap State
  const [leftAsset, setLeftAsset] = useState<string>('All');
  const [leftFailure, setLeftFailure] = useState<string>('All');
  const [rightAsset, setRightAsset] = useState<string>('All');

  const uniqueAssetsPM = useMemo(() => Array.from(new Set(pmPlanData.map(r => r.asset || 'Unknown'))).sort(), [pmPlanData]);
  const uniqueAssetsDelay = useMemo(() => Array.from(new Set(box1Data.map(r => r.location || 'Unknown'))).sort(), [box1Data]);

  const availableFailures = useMemo(() => {
    const subset = leftAsset === 'All' ? box1Data : box1Data.filter(r => r.location === leftAsset);
    return Array.from(new Set(subset.map(r => r.failureMode))).filter(m => !!m).sort();
  }, [box1Data, leftAsset]);

  const rightTasks = useMemo(() => {
    return rightAsset === 'All' ? pmPlanData : pmPlanData.filter(p => p.asset === rightAsset);
  }, [pmPlanData, rightAsset]);

  const gapStats = useMemo(() => {
    if (gapResults.length === 0) return null;
    const highRisk = gapResults.filter(g => g.criticality === 'High').length;
    const weakCoverage = gapResults.filter(g => g.coverageScore === 'Weak' || g.coverageScore === 'None').length;
    const total = gapResults.length;
    return { highRisk, weakCoverage, total };
  }, [gapResults]);

  const handleStageTasks = () => {
      const target = pmPlanData.filter(t => box2Filters.asset === 'All' || t.asset === box2Filters.asset);
      if(!target.length) {
          alert("No tasks found for the current selection.");
          return;
      }
      setStagedTasks(target);
      setAuditResults([]);
  };

  const handleAudit = async () => {
      if(!stagedTasks.length) return alert("Please stage tasks first.");
      setLoadingAI(true);
      try {
          const results = await auditPMPlan(stagedTasks, language);
          setAuditResults(results);
      } catch(e) { alert("Audit failed."); } finally { setLoadingAI(false); }
  };

  const handleInteractiveGap = async () => {
      setLoadingAI(true);
      try {
          const selectedFailures = box1Data.filter(r => 
            (leftAsset === 'All' || r.location === leftAsset) && 
            (leftFailure === 'All' || r.failureMode === leftFailure)
          );

          if (selectedFailures.length === 0) {
              alert("No failure data found for the selected criteria.");
              setLoadingAI(false);
              return;
          }

          const modesFound = Array.from(new Set(selectedFailures.map(r => r.failureMode))).filter(Boolean);
          const historySummary = modesFound.map(mode => {
              const modeRecords = selectedFailures.filter(r => r.failureMode === mode);
              return { 
                  failureMode: mode, 
                  asset: modeRecords[0]?.location, 
                  eventCount: modeRecords.length,
                  totalDowntime: modeRecords.reduce((acc, r) => acc + r.durationMinutes, 0)
              };
          });

          const results = await performGapAnalysis(historySummary, rightTasks, language);
          setGapResults(results);
      } catch(e) { alert("Gap analysis failed."); } finally { setLoadingAI(false); }
  };

  const ScoreBadge = ({ score }: { score: number }) => {
    const colorClass = score <= 2 ? 'bg-rose-50 text-rose-600 border-rose-100' : 
                       score === 3 ? 'bg-amber-50 text-amber-600 border-amber-100' : 
                       'bg-emerald-50 text-emerald-600 border-emerald-100';
    const label = score <= 2 ? 'CRITICAL' : score === 3 ? 'FAIR' : 'GOOD';
    
    return (
        <div className={`px-2 py-1 rounded-lg border text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 ${colorClass}`}>
            <div className={`w-1.5 h-1.5 rounded-full ${score <= 2 ? 'bg-rose-500' : score === 3 ? 'bg-amber-500' : 'bg-emerald-500'}`}></div>
            {label} ({score}/5)
        </div>
    );
  };

  return (
    <div className="h-full flex flex-col gap-6">
        <div className="bg-white p-2 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between ring-1 ring-slate-900/5">
            <div className="flex bg-slate-100/80 p-1 rounded-xl">
                <button onClick={()=>setActiveTab('audit')} className={`flex items-center gap-2 px-8 py-2.5 rounded-lg font-black text-[10px] uppercase tracking-widest transition-all ${activeTab==='audit'?'bg-white shadow-md text-emerald-600':'text-slate-500 hover:text-slate-700'}`}>
                    <FileText size={16}/> Content Quality Audit
                </button>
                <button onClick={()=>setActiveTab('gap')} className={`flex items-center gap-2 px-8 py-2.5 rounded-lg font-black text-[10px] uppercase tracking-widest transition-all ${activeTab==='gap'?'bg-white shadow-md text-indigo-600':'text-slate-500 hover:text-slate-700'}`}>
                    <ShieldAlert size={16}/> Strategy Gap Explorer
                </button>
            </div>
            
            {activeTab === 'audit' && (
                <div className="flex items-center gap-3 px-4">
                    <div className="flex items-center gap-2">
                        <Database size={14} className="text-slate-400"/>
                        <span className="text-[10px] font-black text-slate-400 uppercase">Select Asset:</span>
                        <select 
                            value={box2Filters.asset} 
                            onChange={e => setFilter('asset', e.target.value)}
                            className="border-none bg-slate-50 rounded-lg text-[10px] w-48 font-black text-indigo-600 py-1.5 uppercase outline-none ring-1 ring-slate-200"
                        >
                            <option value="All">All Plan Assets</option>
                            {uniqueAssetsPM.map(a => <option key={a} value={a}>{a}</option>)}
                        </select>
                    </div>
                    <button 
                        onClick={handleStageTasks}
                        className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition shadow-md"
                    >
                        <ClipboardList size={14}/> Stage for Audit
                    </button>
                </div>
            )}
        </div>

        <div className="flex-1 bg-white rounded-[2.5rem] border border-slate-200 shadow-2xl overflow-hidden flex flex-col ring-1 ring-slate-900/5 relative">
            {activeTab === 'audit' ? (
                <div className="h-full flex flex-col">
                    <div className="p-8 border-b bg-slate-50/50 flex justify-between items-center">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-emerald-600 rounded-2xl shadow-lg shadow-emerald-600/20 text-white"><ShieldCheck size={24}/></div>
                            <div>
                                <h3 className="text-lg font-black text-slate-800 uppercase tracking-widest">Task Quality Workspace</h3>
                                <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">
                                    {stagedTasks.length > 0 
                                        ? `${stagedTasks.length} tasks staged for ${box2Filters.asset === 'All' ? 'global' : box2Filters.asset} audit` 
                                        : 'Stage tasks from the top bar to begin review'}
                                </p>
                            </div>
                        </div>
                        <button 
                            onClick={handleAudit} 
                            disabled={loadingAI || stagedTasks.length === 0} 
                            className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-3 rounded-2xl flex gap-3 items-center text-[10px] font-black uppercase tracking-widest transition shadow-xl shadow-emerald-600/20 disabled:opacity-50"
                        >
                            {loadingAI ? <Loader2 className="animate-spin" size={18}/> : <Zap size={18}/>} 
                            Run Task Review
                        </button>
                    </div>
                    
                    <div className="flex-1 overflow-auto bg-slate-50 custom-scrollbar">
                        {stagedTasks.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-slate-300">
                                <Search size={64} className="mb-4 opacity-10 animate-pulse"/>
                                <p className="text-xs font-black uppercase tracking-widest">Select an asset and click "Stage for Audit"</p>
                            </div>
                        ) : (
                            <div className="p-6">
                                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden ring-1 ring-slate-900/5">
                                    <table className="w-full text-left border-collapse table-fixed">
                                        <thead>
                                            <tr className="bg-slate-50 text-[10px] font-black uppercase text-slate-400 tracking-[0.1em] border-b border-slate-100">
                                                <th className="px-6 py-5 w-[15%]">Asset</th>
                                                <th className="px-6 py-5 w-[25%]">Task Description</th>
                                                <th className="px-6 py-5 w-[12%]">Audit Status</th>
                                                <th className="px-6 py-5 w-[23%]">AI Critique</th>
                                                <th className="px-6 py-5 w-[25%]">AI Recommendation</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50">
                                            {stagedTasks.map((task) => {
                                                const res = auditResults.find(r => r.taskId === task.id);
                                                return (
                                                    <tr key={task.id} className="hover:bg-slate-50/50 transition-colors group align-top">
                                                        <td className="px-6 py-5 text-[11px] font-black uppercase text-slate-500 truncate">{task.asset}</td>
                                                        <td className="px-6 py-5">
                                                            <div className="text-[11px] font-bold text-slate-700 leading-relaxed italic">"{task.taskDescription}"</div>
                                                        </td>
                                                        <td className="px-6 py-5">
                                                            {loadingAI && !res ? (
                                                                <div className="h-6 w-24 animate-skeleton rounded-lg"></div>
                                                            ) : res ? (
                                                                <>
                                                                    <ScoreBadge score={res.score} />
                                                                    {res.isDuplicate && <span className="mt-1 block text-[8px] font-black text-rose-500 uppercase tracking-tighter">POTENTIAL DUPLICATE</span>}
                                                                </>
                                                            ) : (
                                                                <div className="px-2 py-1 rounded-lg border border-slate-200 bg-slate-50 text-slate-400 text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5">
                                                                    <Clock size={12} /> Pending Review
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td className="px-6 py-5">
                                                            {loadingAI && !res ? (
                                                                <div className="space-y-2">
                                                                    <div className="h-3 w-full animate-skeleton rounded-full"></div>
                                                                    <div className="h-3 w-5/6 animate-skeleton rounded-full"></div>
                                                                </div>
                                                            ) : res ? (
                                                                <div className="text-[11px] text-slate-600 leading-relaxed flex items-start gap-2">
                                                                    {res.critique}
                                                                </div>
                                                            ) : (
                                                                <div className="h-4 w-full bg-slate-100 rounded opacity-20"></div>
                                                            )}
                                                        </td>
                                                        <td className="px-6 py-5">
                                                            {loadingAI && !res ? (
                                                                <div className="bg-slate-100 p-3 rounded-xl animate-skeleton h-16 w-full"></div>
                                                            ) : res ? (
                                                                <div className="bg-emerald-50/50 border border-emerald-100 p-3 rounded-xl text-[11px] font-medium text-emerald-800 leading-relaxed relative group/rec">
                                                                    <Sparkles size={12} className="absolute -top-1.5 -left-1.5 text-emerald-500" />
                                                                    {res.recommendation}
                                                                </div>
                                                            ) : (
                                                                <div className="h-10 w-full bg-slate-100 rounded opacity-20"></div>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                <div className="h-full flex flex-col">
                    <div className="flex-1 flex min-h-0">
                        {/* Interactive Selection Panel - Left Side */}
                        <div className="w-1/4 border-r border-slate-200 bg-slate-50/50 p-8 flex flex-col gap-6 overflow-y-auto shrink-0">
                            <div className="flex flex-col gap-1">
                                <h4 className="text-[11px] font-black text-indigo-600 uppercase tracking-[0.2em] flex items-center gap-2 mb-2">
                                    <Database size={16}/> Historical Threats
                                </h4>
                                <p className="text-[10px] text-slate-400 font-bold uppercase leading-relaxed mb-4">Select the failure history you want to defend against.</p>
                            </div>

                            <div className="space-y-4">
                                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                                    <label className="text-[9px] font-black text-slate-400 uppercase mb-2 block">1. Asset Domain</label>
                                    <select value={leftAsset} onChange={e => {setLeftAsset(e.target.value); setLeftFailure('All');}} className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-xs font-black uppercase text-indigo-600 outline-none focus:ring-2 focus:ring-indigo-500">
                                        <option value="All">All Historical Assets</option>
                                        {uniqueAssetsDelay.map(a => <option key={a} value={a}>{a}</option>)}
                                    </select>
                                </div>
                                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                                    <label className="text-[9px] font-black text-slate-400 uppercase mb-2 block">2. Mode Specification</label>
                                    <select value={leftFailure} onChange={e => setLeftFailure(e.target.value)} className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-xs font-black uppercase text-indigo-600 outline-none focus:ring-2 focus:ring-indigo-500">
                                        <option value="All">All Identified Modes</option>
                                        {availableFailures.map(m => <option key={m} value={m}>{m}</option>)}
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* Middle Analysis Area */}
                        <div className="flex-1 overflow-y-auto p-10 flex flex-col gap-8 bg-white">
                            <div className="flex justify-between items-center shrink-0">
                                <div>
                                    <h3 className="text-lg font-black text-slate-800 uppercase tracking-widest flex items-center gap-3">
                                        <Layers className="text-indigo-600" size={24}/> AI Strategy Gap Comparison
                                    </h3>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">Cross-referencing historical downtime with preventive defense tasks.</p>
                                </div>
                                <button onClick={handleInteractiveGap} disabled={loadingAI} className="bg-indigo-600 hover:bg-indigo-700 text-white px-10 py-4 rounded-2xl flex gap-3 items-center text-[10px] font-black uppercase tracking-widest transition shadow-xl shadow-indigo-600/20 active:scale-95">
                                    {loadingAI ? <Loader2 className="animate-spin" size={18}/> : <Zap size={18}/>} 
                                    {leftFailure === 'All' ? 'Compare All Modes' : 'Analyze Specific Gap'}
                                </button>
                            </div>

                            {loadingAI && gapResults.length === 0 ? (
                                <div className="space-y-8">
                                    <div className="grid grid-cols-3 gap-6">
                                        <div className="h-20 animate-skeleton rounded-3xl"></div>
                                        <div className="h-20 animate-skeleton rounded-3xl"></div>
                                        <div className="h-20 animate-skeleton rounded-3xl"></div>
                                    </div>
                                    <div className="h-64 animate-skeleton rounded-[2rem]"></div>
                                    <div className="h-64 animate-skeleton rounded-[2rem]"></div>
                                </div>
                            ) : gapResults.length === 0 ? (
                                <div className="flex-1 flex flex-col items-center justify-center text-slate-300">
                                    <div className="relative mb-6">
                                        <div className="absolute inset-0 bg-indigo-100 rounded-full blur-3xl opacity-30 animate-pulse"></div>
                                        <ShieldAlert size={84} className="relative z-10 text-slate-200"/>
                                    </div>
                                    <p className="text-xs font-black uppercase tracking-widest mb-2">Comparison Engine Ready</p>
                                    <p className="text-[10px] font-bold text-slate-400 max-w-xs text-center leading-relaxed">Select a failure context on the left and click compare to see where your defense is weak.</p>
                                </div>
                            ) : (
                                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
                                    <div className="grid grid-cols-3 gap-6 shrink-0">
                                        <div className="bg-slate-50 p-5 rounded-3xl border border-slate-100 flex flex-col items-center text-center">
                                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Modes Analyzed</span>
                                            <span className="text-2xl font-black text-slate-800 tracking-tighter">{gapStats?.total}</span>
                                        </div>
                                        <div className="bg-rose-50 p-5 rounded-3xl border border-rose-100 flex flex-col items-center text-center">
                                            <span className="text-[9px] font-black text-rose-400 uppercase tracking-widest mb-1">Defense Gaps</span>
                                            <span className="text-2xl font-black text-rose-600 tracking-tighter">{gapStats?.weakCoverage}</span>
                                        </div>
                                        <div className="bg-emerald-50 p-5 rounded-3xl border border-emerald-100 flex flex-col items-center text-center">
                                            <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest mb-1">Protected Ratio</span>
                                            <span className="text-2xl font-black text-emerald-600 tracking-tighter">
                                                {gapStats ? Math.round(((gapStats.total - gapStats.weakCoverage) / gapStats.total) * 100) : 0}%
                                            </span>
                                        </div>
                                    </div>

                                    <div className="space-y-6">
                                        {gapResults.map((gap, idx) => (
                                            <div key={idx} className="bg-white rounded-[2rem] border border-slate-200 shadow-xl overflow-hidden ring-1 ring-slate-900/5 transition-all hover:border-indigo-300">
                                                <div className="flex flex-col md:flex-row">
                                                    <div className="w-full md:w-64 bg-slate-50 border-r border-slate-100 p-6 flex flex-col gap-4">
                                                        <div>
                                                            <div className="flex items-center gap-2 mb-2">
                                                                <Target size={14} className="text-indigo-500"/>
                                                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Failure Mode</span>
                                                            </div>
                                                            <p className="text-xs font-black text-slate-800 uppercase leading-tight">{gap.failureMode}</p>
                                                        </div>
                                                        <div className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase text-center border ${
                                                            gap.criticality === 'High' ? 'bg-rose-50 text-rose-600 border-rose-100' :
                                                            gap.criticality === 'Medium' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                                                            'bg-slate-50 text-slate-500 border-slate-200'
                                                        }`}>
                                                            Risk: {gap.criticality}
                                                        </div>
                                                    </div>

                                                    <div className="flex-1 p-8">
                                                        <div className="flex justify-between items-center mb-6">
                                                            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-tight ${
                                                                gap.coverageScore === 'Good' ? 'bg-emerald-100 text-emerald-700' : 
                                                                gap.coverageScore === 'Weak' ? 'bg-amber-100 text-amber-700' : 
                                                                'bg-rose-100 text-rose-700'
                                                            }`}>
                                                                {gap.coverageScore === 'Good' ? <CheckCircle size={14}/> : gap.coverageScore === 'Weak' ? <AlertTriangle size={14}/> : <ShieldX size={14}/>}
                                                                Coverage Status: {gap.coverageScore}
                                                            </div>
                                                        </div>

                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                            <div>
                                                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Current Defense Stack</p>
                                                                <p className="text-[11px] font-bold text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-100 italic">
                                                                    {gap.currentTasks || 'No preventive tasks found for this asset.'}
                                                                </p>
                                                            </div>
                                                            <div>
                                                                <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                                                                    <Sparkles size={12}/> Engineering Recommendation
                                                                </p>
                                                                <div className="bg-indigo-950 text-white p-4 rounded-2xl text-[11px] font-medium leading-relaxed shadow-lg ring-1 ring-white/10">
                                                                    {gap.recommendation}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Interactive Selection Panel - Right Side */}
                        <div className="w-1/4 border-l border-slate-200 bg-slate-50/50 p-8 flex flex-col gap-6 overflow-y-auto shrink-0">
                            <div className="flex flex-col gap-1">
                                <h4 className="text-[11px] font-black text-emerald-600 uppercase tracking-[0.2em] flex items-center gap-2 mb-2">
                                    <ShieldCheck size={16}/> Defense Strategy
                                </h4>
                                <p className="text-[10px] text-slate-400 font-bold uppercase leading-relaxed mb-4">Review the preventive tasks currently being used as defense.</p>
                            </div>

                            <div className="space-y-4">
                                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                                    <label className="text-[9px] font-black text-slate-400 uppercase mb-2 block">1. Strategy Asset (Plan)</label>
                                    <select value={rightAsset} onChange={e => setRightAsset(e.target.value)} className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-xs font-black uppercase text-emerald-600 outline-none focus:ring-2 focus:ring-emerald-500">
                                        <option value="All">All Planned Assets</option>
                                        {uniqueAssetsPM.map(a => <option key={a} value={a}>{a}</option>)}
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    </div>
  );
};
export default PMAuditPanel;