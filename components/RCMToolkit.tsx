import React, { useState, useEffect, useMemo } from 'react';
import { RCMAnalysis, RCMFunction, RCMFunctionalFailure, RCMFailureMode, RCMTask } from '../types';
import { rcmSuggestFunctions, rcmAnalyzeFMEA, rcmDetermineTask } from '../services/geminiService';
import { Save, Plus, Trash2, BrainCircuit, Loader2, FolderOpen, Hammer, ChevronDown, ChevronRight, Wand2, RefreshCw, Copy, AlertTriangle, AlertCircle } from 'lucide-react';

interface RCMToolkitProps {
    loadingAI: boolean;
    setLoadingAI: (v: boolean) => void;
}

const RCMToolkit: React.FC<RCMToolkitProps> = ({ loadingAI, setLoadingAI }) => {
    const [analysis, setAnalysis] = useState<RCMAnalysis>({
        id: `rcm-${Date.now()}`,
        assetName: 'New Asset Analysis',
        operationalContext: '',
        functions: [],
        lastModified: new Date().toISOString()
    });

    const [savedAnalyses, setSavedAnalyses] = useState<RCMAnalysis[]>([]);
    
    // Expand/Collapse state for hierarchy
    const [expandedFuncs, setExpandedFuncs] = useState<Record<string, boolean>>({});
    const [copied, setCopied] = useState(false);

    // 1. Load Saved Analyses & Active Draft on Mount
    useEffect(() => {
        const storedAnalyses = localStorage.getItem('rcm_analyses');
        if (storedAnalyses) setSavedAnalyses(JSON.parse(storedAnalyses));

        // Load Draft (Persistence memory)
        const draft = localStorage.getItem('rcm_draft');
        if (draft) {
            try {
                const parsedDraft = JSON.parse(draft);
                setAnalysis(parsedDraft);
                // Auto-expand functions in draft
                const expands: Record<string, boolean> = {};
                parsedDraft.functions.forEach((f: any) => expands[f.id] = true);
                setExpandedFuncs(expands);
            } catch (e) { console.error("Failed to load draft"); }
        }
    }, []);

    // 2. Auto-Save Draft on Change
    useEffect(() => {
        localStorage.setItem('rcm_draft', JSON.stringify(analysis));
    }, [analysis]);

    const toggleFunc = (id: string) => {
        setExpandedFuncs(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const handleSave = () => {
        if (!analysis.assetName.trim()) return alert("Please enter an Analysis Name.");
        const updated = { ...analysis, lastModified: new Date().toISOString() };
        const newSaved = savedAnalyses.some(a => a.id === analysis.id) 
            ? savedAnalyses.map(a => a.id === analysis.id ? updated : a)
            : [...savedAnalyses, updated];
        
        setSavedAnalyses(newSaved);
        localStorage.setItem('rcm_analyses', JSON.stringify(newSaved));
        localStorage.setItem('rcm_draft', JSON.stringify(updated)); // Update draft too
        setAnalysis(updated);
        alert(`Analysis "${analysis.assetName}" Saved!`);
    };

    const handleLoad = (id: string) => {
        if (!id) return;
        const found = savedAnalyses.find(a => a.id === id);
        if (found) {
            setAnalysis(found);
            const expands: Record<string, boolean> = {};
            found.functions.forEach(f => expands[f.id] = true);
            setExpandedFuncs(expands);
        }
    };

    const handleCopyTable = () => {
        const headers = ['Function', 'Functional Failure', 'Failure Mode', 'Effect', 'Consequence', 'Task Description', 'Strategy', 'Interval', 'Trade'];
        const rows: string[][] = [];

        analysis.functions.forEach(f => {
            if (f.functionalFailures.length === 0) {
                rows.push([f.description, '', '', '', '', '', '', '', '']);
            }
            f.functionalFailures.forEach(ff => {
                if (ff.failureModes.length === 0) {
                    rows.push([f.description, ff.description, '', '', '', '', '', '', '']);
                }
                ff.failureModes.forEach(fm => {
                    const task = fm.task;
                    rows.push([
                        f.description,
                        ff.description,
                        fm.description,
                        fm.effect,
                        fm.consequence,
                        task?.description || '',
                        task?.strategy || '',
                        task?.interval || '',
                        task?.trade || ''
                    ]);
                });
            });
        });

        const tsv = [headers.join('\t'), ...rows.map(row => row.map(c => `"${c.replace(/"/g, '""')}"`).join('\t'))].join('\n');
        navigator.clipboard.writeText(tsv).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    const handleSuggestFunctions = async () => {
        if (!analysis.operationalContext) return alert("Please define Operational Context first.");
        setLoadingAI(true);
        try {
            const contextString = `Asset: ${analysis.assetName}\nOperational Context: ${analysis.operationalContext}`;
            const funcs = await rcmSuggestFunctions(contextString, []);
            setAnalysis(prev => ({ ...prev, functions: [...prev.functions, ...funcs] }));
            const newExpands = { ...expandedFuncs };
            funcs.forEach(f => newExpands[f.id] = true);
            setExpandedFuncs(newExpands);
        } catch (e) {
            alert("AI Suggestion failed.");
        } finally {
            setLoadingAI(false);
        }
    };

    const handleAnalyzeFMEA = async (funcIndex: number) => {
        setLoadingAI(true);
        try {
            const func = analysis.functions[funcIndex];
            const failures = await rcmAnalyzeFMEA(func.description, analysis.assetName);
            const newFuncs = [...analysis.functions];
            newFuncs[funcIndex] = { ...func, functionalFailures: [...func.functionalFailures, ...failures] };
            setAnalysis(prev => ({ ...prev, functions: newFuncs }));
        } catch (e) {
            alert("AI FMEA failed.");
        } finally {
            setLoadingAI(false);
        }
    };

    const handleRecommendTask = async (fI: number, ffI: number, fmI: number) => {
        setLoadingAI(true);
        try {
            const fm = analysis.functions[fI].functionalFailures[ffI].failureModes[fmI];
            const task = await rcmDetermineTask(fm.description, fm.effect, fm.consequence);
            if (task) {
                const newFuncs = [...analysis.functions];
                newFuncs[fI].functionalFailures[ffI].failureModes[fmI].task = task;
                setAnalysis(prev => ({ ...prev, functions: newFuncs }));
            }
        } catch (e) {
            alert("AI Task Recommendation failed.");
        } finally {
            setLoadingAI(false);
        }
    };

    const handleBulkRecommendTasks = async () => {
        setLoadingAI(true);
        const newFuncs = JSON.parse(JSON.stringify(analysis.functions)); // Deep copy
        let changesCount = 0;

        try {
             // We'll execute sequentially to ensure we don't hit rate limits aggressively, 
             // but user sees one loading state.
             for(let fI=0; fI < newFuncs.length; fI++) {
                for(let ffI=0; ffI < newFuncs[fI].functionalFailures.length; ffI++) {
                    for(let fmI=0; fmI < newFuncs[fI].functionalFailures[ffI].failureModes.length; fmI++) {
                        const fm = newFuncs[fI].functionalFailures[ffI].failureModes[fmI];
                        // Only recommend if no task exists
                        if (!fm.task || !fm.task.description) {
                             const task = await rcmDetermineTask(fm.description, fm.effect, fm.consequence);
                             if (task) {
                                 newFuncs[fI].functionalFailures[ffI].failureModes[fmI].task = task;
                                 changesCount++;
                             }
                        }
                    }
                }
             }
             if (changesCount > 0) {
                 setAnalysis(prev => ({ ...prev, functions: newFuncs }));
                 alert(`Successfully generated tasks for ${changesCount} failure modes.`);
             } else {
                 alert("All failure modes already have tasks.");
             }
        } catch (e) {
            console.error(e);
            alert("Error during bulk generation.");
        } finally {
            setLoadingAI(false);
        }
    };

    // Duplicate Detection Logic
    const duplicates = useMemo(() => {
        const textMap: Record<string, string[]> = {};
        const duplicateIds = new Set<string>();

        analysis.functions.forEach(f => 
            f.functionalFailures.forEach(ff => 
                ff.failureModes.forEach(fm => {
                    const txt = fm.description.trim().toLowerCase();
                    if (!txt) return;
                    if (!textMap[txt]) textMap[txt] = [];
                    textMap[txt].push(fm.id);
                })
            )
        );

        Object.values(textMap).forEach(ids => {
            if (ids.length > 1) ids.forEach(id => duplicateIds.add(id));
        });

        return duplicateIds;
    }, [analysis]);

    // --- Update Helpers ---
    const updateFunction = (idx: number, field: string, val: string) => {
        const newFuncs = [...analysis.functions];
        (newFuncs[idx] as any)[field] = val;
        setAnalysis({ ...analysis, functions: newFuncs });
    };

    const updateFailure = (fI: number, ffI: number, field: string, val: string) => {
        const newFuncs = [...analysis.functions];
        (newFuncs[fI].functionalFailures[ffI] as any)[field] = val;
        setAnalysis({ ...analysis, functions: newFuncs });
    };

    const updateMode = (fI: number, ffI: number, fmI: number, field: string, val: string) => {
        const newFuncs = [...analysis.functions];
        (newFuncs[fI].functionalFailures[ffI].failureModes[fmI] as any)[field] = val;
        setAnalysis({ ...analysis, functions: newFuncs });
    };

    const updateTask = (fI: number, ffI: number, fmI: number, field: string, val: any) => {
        const newFuncs = [...analysis.functions];
        const task = newFuncs[fI].functionalFailures[ffI].failureModes[fmI].task || {
             description: '', strategy: 'On-Condition', interval: '', trade: '', duration: 0
        };
        (task as any)[field] = val;
        newFuncs[fI].functionalFailures[ffI].failureModes[fmI].task = task;
        setAnalysis({ ...analysis, functions: newFuncs });
    };

    const addFunction = () => {
        const newF: RCMFunction = { id: `f-${Date.now()}`, description: 'New Function', functionalFailures: [] };
        setAnalysis({ ...analysis, functions: [...analysis.functions, newF] });
        setExpandedFuncs({ ...expandedFuncs, [newF.id]: true });
    };

    const addFailure = (fI: number) => {
        const newFuncs = [...analysis.functions];
        newFuncs[fI].functionalFailures.push({ id: `ff-${Date.now()}`, description: 'New Functional Failure', failureModes: [] });
        setAnalysis({ ...analysis, functions: newFuncs });
    };

    const addMode = (fI: number, ffI: number) => {
        const newFuncs = [...analysis.functions];
        newFuncs[fI].functionalFailures[ffI].failureModes.push({ 
            id: `fm-${Date.now()}`, description: 'New Failure Mode', effect: '', consequence: 'Operational' 
        });
        setAnalysis({ ...analysis, functions: newFuncs });
    };

    return (
        <div className="flex flex-col h-full bg-slate-50 gap-4">
            
            {/* 1. TOP BAR */}
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col md:flex-row items-center gap-4">
                <div className="flex items-center gap-3 flex-1 w-full">
                    <button 
                        onClick={handleSave}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white p-2 rounded-lg shadow-sm transition flex items-center gap-2 font-bold text-sm"
                        title="Save Analysis"
                    >
                        <Save size={18} /> Save
                    </button>
                    <div className="flex-1">
                        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">Analysis Name</label>
                        <input 
                            type="text" 
                            className="w-full font-bold text-gray-800 text-lg border-none focus:ring-0 p-0 placeholder-gray-300"
                            placeholder="e.g. Hydraulic System RCM"
                            value={analysis.assetName}
                            onChange={(e) => setAnalysis({ ...analysis, assetName: e.target.value })}
                        />
                    </div>
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto">
                     <button 
                        onClick={handleCopyTable}
                        className="flex items-center gap-1 bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded text-xs transition font-medium"
                    >
                        {copied ? <RefreshCw size={14} className="animate-spin text-green-600"/> : <Copy size={14} />}
                        {copied ? 'Copied' : 'Copy Table'}
                    </button>
                     <select 
                        className="bg-gray-50 border-gray-200 text-gray-600 text-xs rounded-lg focus:ring-indigo-500 block p-2 w-64"
                        onChange={(e) => handleLoad(e.target.value)}
                        value=""
                    >
                        <option value="">-- Load Saved Analysis --</option>
                        {savedAnalyses.map(a => (
                            <option key={a.id} value={a.id}>{a.assetName} ({new Date(a.lastModified).toLocaleDateString()})</option>
                        ))}
                    </select>
                    <button onClick={() => {
                        if(confirm("Start fresh?")) setAnalysis({ id: `rcm-${Date.now()}`, assetName: 'New Analysis', operationalContext: '', functions: [], lastModified: new Date().toISOString() });
                    }} className="text-gray-400 hover:text-red-500 p-2"><RefreshCw size={16}/></button>
                </div>
            </div>

            {/* 2. CONTEXT BAR */}
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                 <div className="flex items-center gap-2 mb-2">
                    <BrainCircuit size={16} className="text-indigo-600"/>
                    <label className="text-sm font-bold text-gray-700 uppercase">Operational Context</label>
                 </div>
                 <textarea 
                    rows={2}
                    className="w-full bg-gray-50 border-gray-200 rounded-lg text-sm text-gray-700 focus:ring-indigo-500 focus:border-indigo-500 resize-y whitespace-pre-wrap"
                    placeholder="Describe the operating environment, duty cycle, and performance standards..."
                    value={analysis.operationalContext}
                    onChange={(e) => setAnalysis({ ...analysis, operationalContext: e.target.value })}
                />
            </div>

            {/* 3. RCM WORKSHEET MATRIX */}
            <div className="flex-1 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
                
                {/* Headers */}
                <div className="grid grid-cols-12 bg-gray-100 border-b border-gray-200 text-xs font-bold text-gray-600 uppercase tracking-wider sticky top-0 z-10 shadow-sm">
                    <div className="col-span-3 p-3 border-r border-gray-200">1. Functions</div>
                    <div className="col-span-3 p-3 border-r border-gray-200">2. Functional Failures</div>
                    <div className="col-span-2 p-3 border-r border-gray-200">3. Failure Modes</div>
                    <div className="col-span-2 p-3 border-r border-gray-200">4. Effects</div>
                    <div className="col-span-2 p-3 flex justify-between items-center">
                        <span>5. Recommended Action</span>
                        {analysis.functions.length > 0 && (
                            <button 
                                onClick={handleBulkRecommendTasks}
                                disabled={loadingAI}
                                className="text-[10px] bg-indigo-100 hover:bg-indigo-200 text-indigo-700 px-2 py-0.5 rounded flex items-center gap-1 transition"
                                title="Auto-fill tasks for all modes"
                            >
                                {loadingAI ? <Loader2 size={10} className="animate-spin"/> : <Wand2 size={10}/>} Recommend All
                            </button>
                        )}
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-50 p-4 space-y-4">
                    {/* Empty State */}
                    {analysis.functions.length === 0 && (
                        <div className="text-center py-10 flex flex-col items-center">
                            <p className="text-gray-400 mb-4">No functions defined yet.</p>
                            <button 
                                onClick={handleSuggestFunctions}
                                disabled={loadingAI || !analysis.operationalContext}
                                className="bg-indigo-600 text-white px-6 py-3 rounded-lg shadow-md font-bold flex items-center gap-2 hover:bg-indigo-700 disabled:opacity-50 transition"
                            >
                                {loadingAI ? <Loader2 className="animate-spin"/> : <BrainCircuit size={18}/>}
                                AI Suggest Functions
                            </button>
                        </div>
                    )}

                    {analysis.functions.map((func, fIndex) => (
                        <div key={func.id} className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                            {/* Function Row */}
                            <div className="bg-indigo-50/50 p-3 border-b border-gray-100 flex justify-between items-start group">
                                <div className="flex items-start gap-3 flex-1">
                                    <button onClick={() => toggleFunc(func.id)} className="mt-1 text-indigo-400 hover:text-indigo-700">
                                        {expandedFuncs[func.id] ? <ChevronDown size={18}/> : <ChevronRight size={18}/>}
                                    </button>
                                    <div className="flex-1">
                                        <label className="text-[10px] font-bold text-indigo-400 uppercase block mb-1">Function</label>
                                        <textarea 
                                            rows={2} 
                                            className="w-full bg-transparent border-none p-0 text-sm font-semibold text-gray-800 focus:ring-0 resize-y whitespace-pre-wrap min-h-[3rem]"
                                            value={func.description}
                                            onChange={(e) => updateFunction(fIndex, 'description', e.target.value)}
                                        />
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition">
                                    <button 
                                        onClick={() => handleAnalyzeFMEA(fIndex)} 
                                        className="bg-white border border-indigo-200 text-indigo-700 px-2 py-1 rounded text-xs font-bold flex items-center gap-1 hover:bg-indigo-50"
                                    >
                                        {loadingAI ? <Loader2 size={12} className="animate-spin"/> : <BrainCircuit size={12}/>} AI FMEA
                                    </button>
                                    <button onClick={() => addFailure(fIndex)} className="text-gray-400 hover:text-green-600"><Plus size={16}/></button>
                                    <button 
                                        onClick={() => {
                                            const newFuncs = analysis.functions.filter((_, i) => i !== fIndex);
                                            setAnalysis({...analysis, functions: newFuncs});
                                        }}
                                        className="text-gray-400 hover:text-red-500"
                                    ><Trash2 size={16}/></button>
                                </div>
                            </div>

                            {/* Failures Grid */}
                            {expandedFuncs[func.id] && (
                                <div className="divide-y divide-gray-100">
                                    {func.functionalFailures.map((ff, ffIndex) => (
                                        <div key={ff.id} className="grid grid-cols-12 text-sm">
                                            {/* Spacer */}
                                            <div className="col-span-3 bg-gray-50/30 border-r border-gray-100 p-3 text-xs text-gray-400 font-mono text-right pt-4">
                                                {fIndex + 1}.{ffIndex + 1}
                                            </div>

                                            <div className="col-span-9 grid grid-cols-9">
                                                {/* Functional Failure */}
                                                <div className="col-span-3 p-3 border-r border-gray-100 relative group">
                                                    <textarea 
                                                        className="w-full h-full bg-transparent border-none p-0 text-sm text-gray-700 focus:ring-0 resize-y whitespace-pre-wrap min-h-[4rem]"
                                                        value={ff.description}
                                                        onChange={(e) => updateFailure(fIndex, ffIndex, 'description', e.target.value)}
                                                    />
                                                    <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                                                        <button onClick={() => addMode(fIndex, ffIndex)} title="Add Mode" className="text-gray-400 hover:text-green-600 bg-white rounded-full shadow p-0.5"><Plus size={14}/></button>
                                                    </div>
                                                </div>
                                                
                                                {/* Modes & Effects */}
                                                <div className="col-span-6">
                                                    {ff.failureModes.map((fm, fmIndex) => (
                                                        <div key={fm.id} className={`grid grid-cols-6 border-b border-gray-100 last:border-0 ${fmIndex % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                                                            {/* Failure Mode */}
                                                            <div className="col-span-2 p-3 border-r border-gray-100 relative group/mode">
                                                                {duplicates.has(fm.id) && (
                                                                    <div className="absolute top-1 right-1 text-red-500" title="Duplicate Failure Mode Detected">
                                                                        <AlertCircle size={12} />
                                                                    </div>
                                                                )}
                                                                <textarea 
                                                                    className={`w-full bg-transparent border-none p-0 text-sm font-medium focus:ring-0 resize-y whitespace-pre-wrap min-h-[3rem] ${duplicates.has(fm.id) ? 'text-red-700' : 'text-gray-800'}`}
                                                                    value={fm.description}
                                                                    onChange={(e) => updateMode(fIndex, ffIndex, fmIndex, 'description', e.target.value)}
                                                                    placeholder="Root Cause..."
                                                                />
                                                                 <button 
                                                                    onClick={() => {
                                                                         const newFuncs = [...analysis.functions];
                                                                         newFuncs[fIndex].functionalFailures[ffIndex].failureModes = newFuncs[fIndex].functionalFailures[ffIndex].failureModes.filter((_, i) => i !== fmIndex);
                                                                         setAnalysis({...analysis, functions: newFuncs});
                                                                    }}
                                                                    className="absolute bottom-1 right-1 text-gray-300 hover:text-red-500 opacity-0 group-hover/mode:opacity-100 transition"
                                                                >
                                                                    <Trash2 size={12}/>
                                                                </button>
                                                            </div>
                                                            {/* Effect & Consequence */}
                                                            <div className="col-span-2 p-3 border-r border-gray-100">
                                                                <textarea 
                                                                    className="w-full bg-transparent border-none p-0 text-xs text-gray-600 focus:ring-0 resize-y whitespace-pre-wrap min-h-[3rem]"
                                                                    value={fm.effect}
                                                                    onChange={(e) => updateMode(fIndex, ffIndex, fmIndex, 'effect', e.target.value)}
                                                                    placeholder="Effect..."
                                                                />
                                                                <select 
                                                                    className={`mt-2 text-[10px] p-0 border-none bg-transparent font-bold uppercase cursor-pointer ${
                                                                        fm.consequence === 'Safety' ? 'text-red-600' : 
                                                                        fm.consequence === 'Environmental' ? 'text-green-600' : 
                                                                        'text-gray-400'
                                                                    }`}
                                                                    value={fm.consequence}
                                                                    onChange={(e) => updateMode(fIndex, ffIndex, fmIndex, 'consequence', e.target.value)}
                                                                >
                                                                    <option value="Operational">Operational</option>
                                                                    <option value="Safety">Safety</option>
                                                                    <option value="Environmental">Environmental</option>
                                                                    <option value="Non-Operational">Non-Operational</option>
                                                                </select>
                                                            </div>
                                                            {/* Recommended Action */}
                                                            <div className="col-span-2 p-3 relative group">
                                                                {fm.task ? (
                                                                    <div className="space-y-2">
                                                                        <textarea 
                                                                            rows={3}
                                                                            className="w-full text-xs font-bold text-indigo-700 bg-indigo-50 border-none rounded px-1 resize-y whitespace-pre-wrap"
                                                                            value={fm.task.description}
                                                                            onChange={(e) => updateTask(fIndex, ffIndex, fmIndex, 'description', e.target.value)}
                                                                        />
                                                                        <div className="flex gap-1">
                                                                             <input 
                                                                                className="w-1/2 text-[10px] bg-gray-100 border-none rounded px-1"
                                                                                value={fm.task.interval}
                                                                                onChange={(e) => updateTask(fIndex, ffIndex, fmIndex, 'interval', e.target.value)}
                                                                                placeholder="Interval"
                                                                            />
                                                                             <input 
                                                                                className="w-1/2 text-[10px] bg-gray-100 border-none rounded px-1"
                                                                                value={fm.task.trade}
                                                                                onChange={(e) => updateTask(fIndex, ffIndex, fmIndex, 'trade', e.target.value)}
                                                                                placeholder="Trade"
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                ) : (
                                                                    <div className="h-full flex items-center justify-center">
                                                                        <button 
                                                                            onClick={() => handleRecommendTask(fIndex, ffIndex, fmIndex)}
                                                                            className="opacity-0 group-hover:opacity-100 text-indigo-500 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-full transition flex items-center gap-1 text-xs font-bold"
                                                                            title="Recommend Task"
                                                                        >
                                                                            <Wand2 size={12}/> Recommend
                                                                        </button>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))}
                                                    {ff.failureModes.length === 0 && (
                                                        <div className="p-3 text-center text-xs text-gray-300 italic">No failure modes defined</div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    {func.functionalFailures.length === 0 && (
                                        <div className="p-4 text-center text-sm text-gray-400">
                                            No failures identified. <button onClick={() => addFailure(fIndex)} className="text-indigo-600 hover:underline">Add one manually</button> or use AI FMEA.
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                    
                     <button 
                        onClick={addFunction}
                        className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-400 hover:border-indigo-400 hover:text-indigo-600 font-bold text-sm transition flex items-center justify-center gap-2"
                    >
                        <Plus size={18}/> Add Function Manually
                    </button>

                </div>
            </div>
        </div>
    );
};

export default RCMToolkit;