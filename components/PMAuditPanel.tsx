import React, { useState, useMemo, useEffect } from 'react';
import { PMRecord, RawRecord, PMTaskAudit, GapAnalysisResult } from '../types';
import { auditPMPlan, performGapAnalysis } from '../services/geminiService';
import { AlertOctagon, RefreshCw, FileText, Loader2, Filter, ArrowRight, CheckCircle2, AlertTriangle, AlertCircle, PlayCircle, Lightbulb, Search } from 'lucide-react';

interface PMAuditPanelProps {
  pmData: PMRecord[];
  failureData: RawRecord[];
  loadingAI: boolean;
  setLoadingAI: (v: boolean) => void;
  selectedAsset: string;
}

const PMAuditPanel: React.FC<PMAuditPanelProps> = ({ pmData, failureData, loadingAI, setLoadingAI, selectedAsset }) => {
  const [auditResults, setAuditResults] = useState<PMTaskAudit[]>([]);
  const [gapResults, setGapResults] = useState<GapAnalysisResult[]>([]);
  const [activeTab, setActiveTab] = useState<'audit' | 'gap'>('audit');
  
  // Local state for the audit target
  const [targetAuditAsset, setTargetAuditAsset] = useState(selectedAsset);

  // Local state for Gap Analysis Filters
  const [leftAssetFilter, setLeftAssetFilter] = useState('All');
  const [leftModeFilter, setLeftModeFilter] = useState('All');
  const [rightAssetFilter, setRightAssetFilter] = useState('All');

  // Keep target synced with global, but allow user to change it
  useEffect(() => {
      setTargetAuditAsset(selectedAsset);
      setLeftAssetFilter(selectedAsset);
      setRightAssetFilter(selectedAsset);
  }, [selectedAsset]);

  // Unique assets from PM data for the dropdowns
  const pmAssets = useMemo(() => Array.from(new Set(pmData.map(t => t.asset))).sort(), [pmData]);
  
  // Unique data for Gap Filters (Extracted from source files)
  const failureAssets = useMemo(() => Array.from(new Set(failureData.map(r => r.location || 'Unknown'))).sort(), [failureData]);
  const failureModes = useMemo(() => Array.from(new Set(failureData.map(r => r.failureMode || 'Uncategorized'))).sort(), [failureData]);

  // Handle Audit Trigger
  const handleRunAudit = async () => {
      const tasksToAudit = targetAuditAsset === 'All' 
        ? pmData.slice(0, 50) // Safety limit if All
        : pmData.filter(t => t.asset === targetAuditAsset);

      if (tasksToAudit.length === 0) return alert("No tasks found for the selected asset.");

      setLoadingAI(true);
      const res = await auditPMPlan(tasksToAudit);
      setAuditResults(res);
      setLoadingAI(false);
  };

  const handleGapAnalysis = async () => {
      setLoadingAI(true);
      // Pass the specific asset filter to the service if set
      const target = leftAssetFilter !== 'All' ? leftAssetFilter : undefined;
      const res = await performGapAnalysis(failureData, pmData, target);
      setGapResults(res);
      setLoadingAI(false);
  };

  // --- Audit Stats Calculation ---
  const auditStats = useMemo(() => {
      if (auditResults.length === 0) return null;
      const total = auditResults.length;
      const avgScore = auditResults.reduce((a,b) => a + b.score, 0) / total;
      const critical = auditResults.filter(r => r.score <= 2).length;
      return { total, avgScore, critical };
  }, [auditResults]);

  // Group results by severity
  const groupedAudit = useMemo(() => {
      return {
          critical: auditResults.filter(r => r.score <= 2),
          warning: auditResults.filter(r => r.score === 3 || r.score === 4),
          good: auditResults.filter(r => r.score === 5)
      };
  }, [auditResults]);

  // Filtered Results for Gap Analysis Split Views
  const leftDisplayedRows = useMemo(() => {
      let filtered = gapResults;
      if (leftAssetFilter !== 'All') filtered = filtered.filter(r => r.asset === leftAssetFilter);
      if (leftModeFilter !== 'All') filtered = filtered.filter(r => r.failureMode === leftModeFilter);
      return filtered;
  }, [gapResults, leftAssetFilter, leftModeFilter]);

  const rightDisplayedRows = useMemo(() => {
      let filtered = gapResults;
      // We generally want to see the same assets on right as left, but allowing independent filter if user desires
      // Default behavior: if left filter is active, right side should likely match it via gap result data structure
      if (rightAssetFilter !== 'All') filtered = filtered.filter(r => r.asset === rightAssetFilter);
      return filtered;
  }, [gapResults, rightAssetFilter]);

  return (
    <div className="h-full flex flex-col gap-6">
        {/* Navigation Tabs */}
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
             <div className="flex gap-4">
                 <button 
                    onClick={() => setActiveTab('audit')}
                    className={`px-4 py-2 rounded-lg font-medium text-sm transition ${activeTab === 'audit' ? 'bg-emerald-100 text-emerald-800' : 'text-gray-500 hover:bg-gray-100'}`}
                 >
                     PM Health Audit
                 </button>
                 <button 
                    onClick={() => setActiveTab('gap')}
                    className={`px-4 py-2 rounded-lg font-medium text-sm transition ${activeTab === 'gap' ? 'bg-emerald-100 text-emerald-800' : 'text-gray-500 hover:bg-gray-100'}`}
                 >
                     Reliability Gap Analysis
                 </button>
             </div>
             
             {activeTab === 'gap' && selectedAsset !== 'All' && (
                 <div className="text-xs bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-full border border-emerald-100 font-semibold flex items-center gap-1">
                     <Filter size={12}/> Dashboard Context: {selectedAsset}
                 </div>
             )}
        </div>

        <div className="flex-1 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
            
            {/* --- TAB 1: PM HEALTH AUDIT (REDESIGNED) --- */}
            {activeTab === 'audit' && (
                <div className="flex flex-col h-full">
                    {/* Control Bar */}
                    <div className="p-5 border-b border-gray-200 bg-gray-50 flex flex-col md:flex-row justify-between items-center gap-4">
                        <div className="flex items-center gap-3">
                            <div className="bg-emerald-100 p-2 rounded-lg text-emerald-700">
                                <FileText size={20} />
                            </div>
                            <div>
                                <h3 className="font-bold text-gray-800 text-sm">Task Quality Review</h3>
                                <p className="text-xs text-gray-500">Select an asset to analyze its maintenance instructions.</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3 bg-white p-2 rounded-lg border border-gray-200 shadow-sm">
                            <div className="flex flex-col px-2 border-r border-gray-100">
                                <label className="text-[10px] uppercase font-bold text-gray-400">Target Asset</label>
                                <select 
                                    className="text-xs font-semibold text-gray-700 bg-transparent border-none focus:ring-0 p-0 w-48 cursor-pointer"
                                    value={targetAuditAsset}
                                    onChange={(e) => setTargetAuditAsset(e.target.value)}
                                >
                                    <option value="All">All Assets (Limit 50)</option>
                                    {pmAssets.map(a => <option key={a} value={a}>{a}</option>)}
                                </select>
                            </div>
                            <button 
                                onClick={handleRunAudit}
                                disabled={loadingAI || pmData.length === 0}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-md flex items-center gap-2 text-sm font-medium transition disabled:opacity-50"
                            >
                                {loadingAI ? <Loader2 className="animate-spin" size={16}/> : <PlayCircle size={16} />}
                                {targetAuditAsset === 'All' ? 'Audit Top 50 Tasks' : `Audit ${targetAuditAsset}`}
                            </button>
                        </div>
                    </div>

                    {/* Content Area */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-gray-50/50">
                        {!auditStats ? (
                            <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-3">
                                <SearchPlaceholder />
                                <p>Select an asset and click Audit to start AI review.</p>
                            </div>
                        ) : (
                            <div className="space-y-6 max-w-5xl mx-auto">
                                {/* Summary Card */}
                                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm grid grid-cols-1 md:grid-cols-3 gap-6">
                                    <div className="text-center">
                                        <p className="text-xs text-gray-500 font-bold uppercase">Tasks Reviewed</p>
                                        <p className="text-3xl font-bold text-gray-800 mt-1">{auditStats.total}</p>
                                    </div>
                                    <div className="text-center border-l border-r border-gray-100">
                                        <p className="text-xs text-gray-500 font-bold uppercase">Average Quality Score</p>
                                        <div className="flex items-center justify-center gap-2 mt-1">
                                            <p className={`text-3xl font-bold ${auditStats.avgScore >= 4 ? 'text-green-600' : auditStats.avgScore >= 2.5 ? 'text-yellow-600' : 'text-red-600'}`}>
                                                {auditStats.avgScore.toFixed(1)}
                                            </p>
                                            <span className="text-sm text-gray-400">/ 5.0</span>
                                        </div>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-xs text-gray-500 font-bold uppercase">Critical Issues</p>
                                        <p className={`text-3xl font-bold mt-1 ${auditStats.critical > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                            {auditStats.critical}
                                        </p>
                                    </div>
                                </div>

                                {/* Results Sections */}
                                
                                {/* 1. Critical */}
                                {groupedAudit.critical.length > 0 && (
                                    <div className="space-y-3">
                                        <h4 className="flex items-center gap-2 text-red-700 font-bold text-sm">
                                            <AlertCircle size={16}/> Needs Attention ({groupedAudit.critical.length})
                                        </h4>
                                        {groupedAudit.critical.map((res, i) => (
                                            <ResultCard key={i} result={res} pmData={pmData} />
                                        ))}
                                    </div>
                                )}

                                {/* 2. Warning */}
                                {groupedAudit.warning.length > 0 && (
                                    <div className="space-y-3">
                                        <h4 className="flex items-center gap-2 text-yellow-700 font-bold text-sm">
                                            <AlertTriangle size={16}/> Optimization Opportunities ({groupedAudit.warning.length})
                                        </h4>
                                        {groupedAudit.warning.map((res, i) => (
                                            <ResultCard key={i} result={res} pmData={pmData} />
                                        ))}
                                    </div>
                                )}

                                {/* 3. Good */}
                                {groupedAudit.good.length > 0 && (
                                    <div className="space-y-3">
                                        <h4 className="flex items-center gap-2 text-green-700 font-bold text-sm">
                                            <CheckCircle2 size={16}/> Excellent Tasks ({groupedAudit.good.length})
                                        </h4>
                                        {groupedAudit.good.map((res, i) => (
                                            <ResultCard key={i} result={res} pmData={pmData} />
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* --- TAB 2: GAP ANALYSIS --- */}
            {activeTab === 'gap' && (
                 <div className="flex flex-col h-full">
                    {/* Header */}
                    <div className="p-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
                        <div>
                            <h3 className="font-bold text-gray-800">Reliability Gap Analysis</h3>
                            <p className="text-xs text-gray-500">Cross-reference historical failures (Box 1) with current PM controls (Box 2).</p>
                        </div>
                        <button 
                            onClick={handleGapAnalysis} 
                            disabled={loadingAI || failureData.length === 0 || pmData.length === 0}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded flex items-center gap-2 disabled:opacity-50 text-sm transition shadow-sm"
                        >
                             {loadingAI ? <Loader2 className="animate-spin" size={16}/> : <AlertOctagon size={16} />} 
                             {leftAssetFilter !== 'All' ? `Find Gaps for ${leftAssetFilter}` : 'Find Gaps (Top 20 Assets)'}
                        </button>
                    </div>

                    {/* Split View Content */}
                    <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
                        
                        {/* LEFT: Box 1 Failures */}
                        <div className="flex-1 border-r border-gray-200 flex flex-col bg-white">
                            {/* Left Filters */}
                            <div className="p-2 border-b border-gray-100 flex gap-2 bg-red-50/50">
                                <div className="flex flex-col w-1/2">
                                    <label className="text-[10px] uppercase font-bold text-red-800/60 mb-0.5">Filter Asset (Box 1)</label>
                                    <select 
                                        value={leftAssetFilter}
                                        onChange={(e) => setLeftAssetFilter(e.target.value)}
                                        className="text-xs border-red-200 rounded focus:ring-red-500 bg-white"
                                    >
                                        <option value="All">All Assets</option>
                                        {failureAssets.map(a => <option key={a} value={a}>{a}</option>)}
                                    </select>
                                </div>
                                <div className="flex flex-col w-1/2">
                                    <label className="text-[10px] uppercase font-bold text-red-800/60 mb-0.5">Filter Mode</label>
                                    <select 
                                        value={leftModeFilter}
                                        onChange={(e) => setLeftModeFilter(e.target.value)}
                                        className="text-xs border-red-200 rounded focus:ring-red-500 bg-white"
                                    >
                                        <option value="All">All Modes</option>
                                        {failureModes.map(m => <option key={m} value={m}>{m}</option>)}
                                    </select>
                                </div>
                            </div>
                            
                            <div className="p-2 bg-red-50 border-b border-red-100 text-red-800 text-xs font-bold uppercase tracking-wide text-center">
                                Problem: Observed Failures
                            </div>
                            
                            <div className="flex-1 overflow-y-auto custom-scrollbar">
                                <table className="w-full text-sm text-left">
                                    <thead className="text-xs text-gray-500 bg-gray-50 sticky top-0 z-10">
                                        <tr>
                                            <th className="px-4 py-2 font-medium">Asset</th>
                                            <th className="px-4 py-2 font-medium">Failure Mode</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {leftDisplayedRows.map((gap, i) => (
                                            <tr key={`L-${i}`} className="hover:bg-gray-50 h-20">
                                                <td className="px-4 py-2 font-semibold text-gray-700">{gap.asset}</td>
                                                <td className="px-4 py-2 text-red-600 font-medium">{gap.failureMode}</td>
                                            </tr>
                                        ))}
                                        {leftDisplayedRows.length === 0 && (
                                            <tr><td colSpan={2} className="text-center py-8 text-gray-400 text-xs">No records match filters.</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* MIDDLE: Arrow Indicator */}
                        <div className="hidden md:flex flex-col justify-center items-center w-8 bg-gray-50 border-r border-gray-200">
                             <ArrowRight size={16} className="text-gray-300"/>
                        </div>

                        {/* RIGHT: Box 2 Solutions */}
                        <div className="flex-[1.5] flex flex-col bg-white">
                             {/* Right Filters */}
                             <div className="p-2 border-b border-gray-100 flex gap-2 bg-blue-50/50">
                                <div className="flex flex-col w-full">
                                    <label className="text-[10px] uppercase font-bold text-blue-800/60 mb-0.5">Filter Asset (Box 2)</label>
                                    <select 
                                        value={rightAssetFilter}
                                        onChange={(e) => setRightAssetFilter(e.target.value)}
                                        className="text-xs border-blue-200 rounded focus:ring-blue-500 bg-white"
                                    >
                                        <option value="All">All Assets</option>
                                        {pmAssets.map(a => <option key={a} value={a}>{a}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div className="p-2 bg-blue-50 border-b border-blue-100 text-blue-800 text-xs font-bold uppercase tracking-wide text-center">
                                Solution: Current Controls & Recommendations
                            </div>

                            <div className="flex-1 overflow-y-auto custom-scrollbar">
                                <table className="w-full text-sm text-left">
                                    <thead className="text-xs text-gray-500 bg-gray-50 sticky top-0 z-10">
                                        <tr>
                                            <th className="px-4 py-2 font-medium">Current Asset</th>
                                            <th className="px-4 py-2 font-medium">Current PM Tasks</th>
                                            <th className="px-4 py-2 font-medium">AI Recommendation</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {rightDisplayedRows.map((gap, i) => (
                                            <tr key={`R-${i}`} className="hover:bg-gray-50 h-20 align-top">
                                                <td className="px-4 py-2 text-gray-500 text-xs">{gap.asset}</td>
                                                <td className="px-4 py-2 text-xs text-blue-600 whitespace-pre-wrap">
                                                    {gap.currentTasks}
                                                </td>
                                                <td className="px-4 py-2 text-xs border-l border-gray-100 bg-emerald-50/30">
                                                    <div className="flex flex-col gap-1">
                                                        <span className={`inline-block w-fit px-1.5 py-0.5 rounded text-[10px] font-bold uppercase border ${
                                                            gap.coverageScore === 'Good' ? 'bg-green-100 text-green-700 border-green-200' :
                                                            gap.coverageScore === 'Weak' ? 'bg-yellow-100 text-yellow-700 border-yellow-200' :
                                                            'bg-red-100 text-red-700 border-red-200'
                                                        }`}>
                                                            Coverage: {gap.coverageScore}
                                                        </span>
                                                        <span className="text-gray-700">{gap.recommendation}</span>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                         {rightDisplayedRows.length === 0 && (
                                            <tr><td colSpan={3} className="text-center py-8 text-gray-400 text-xs">No records match filters.</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                    </div>
                 </div>
            )}
        </div>
    </div>
  );
};

const ResultCard: React.FC<{ result: PMTaskAudit, pmData: PMRecord[] }> = ({ result, pmData }) => {
    const task = pmData.find(t => t.id === result.taskId);
    if (!task) return null;

    const borderColor = result.score >= 5 ? 'border-green-200' : result.score >= 3 ? 'border-yellow-200' : 'border-red-200';
    const bgColor = result.score >= 5 ? 'bg-green-50' : result.score >= 3 ? 'bg-yellow-50' : 'bg-red-50';

    return (
        <div className={`bg-white rounded-lg border ${borderColor} shadow-sm overflow-hidden flex flex-col md:flex-row`}>
            {/* Score Side */}
            <div className={`w-full md:w-16 ${bgColor} flex items-center justify-center py-2 md:py-0 border-b md:border-b-0 md:border-r ${borderColor}`}>
                <span className={`text-2xl font-bold ${result.score >= 4 ? 'text-green-700' : result.score >= 3 ? 'text-yellow-700' : 'text-red-700'}`}>
                    {result.score}
                </span>
            </div>
            
            {/* Content Side */}
            <div className="flex-1 p-4">
                <div className="flex justify-between items-start gap-4">
                    <h5 className="font-semibold text-gray-800 text-sm">
                        {task.taskDescription}
                    </h5>
                    {result.isDuplicate && (
                        <span className="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-full border border-red-200 font-bold whitespace-nowrap">
                            Duplicate
                        </span>
                    )}
                </div>
                
                <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                    <span className="bg-gray-100 px-2 py-0.5 rounded border border-gray-200">{task.trade}</span>
                    <span>Interval: {task.frequency} M</span>
                </div>

                <div className="mt-3 text-sm bg-gray-50 p-3 rounded-lg border border-gray-100 text-gray-700 flex gap-2">
                    <Lightbulb size={16} className="text-indigo-500 shrink-0 mt-0.5"/>
                    <span className="italic">{result.critique}</span>
                </div>
            </div>
        </div>
    )
}

const SearchPlaceholder = () => (
    <svg width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="text-gray-200">
        <circle cx="11" cy="11" r="8"></circle>
        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        <path d="M11 7v4l3 3"></path>
    </svg>
)

export default PMAuditPanel;