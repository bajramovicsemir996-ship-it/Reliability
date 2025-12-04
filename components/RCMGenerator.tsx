
import React, { useState, useEffect } from 'react';
import { RCMFunction, AttachedFile, RCMFunctionalFailure, RCMFailureMode, InspectionPoint } from '../types';
import { rcmSuggestFunctions, rcmGenFailures, rcmGenModes, rcmGenTask, generateInspectionSheet } from '../services/geminiService';
import { Sparkles, Loader2, CheckCircle2, Copy, Paperclip, X, FileText, Image as ImageIcon, Check, User, Clock, Users, Save, FolderOpen, Trash2, PlusCircle, Pencil, AlertCircle, ClipboardList, Printer, Plus, Download, FileDown, FileSpreadsheet, ListChecks } from 'lucide-react';

interface SavedRCMStudy {
    id: string;
    name: string;
    date: string;
    inputText: string;
    analysisData: RCMFunction[];
    files: AttachedFile[];
}

const RCMGenerator: React.FC = () => {
    // Content State
    const [inputText, setInputText] = useState('');
    const [analysisData, setAnalysisData] = useState<RCMFunction[]>([]);
    const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
    const [studyName, setStudyName] = useState('New RCM Study');
    
    // UI State
    const [loading, setLoading] = useState(false);
    const [generatingId, setGeneratingId] = useState<string | null>(null); 
    const [copied, setCopied] = useState(false);
    const [detailedCopied, setDetailedCopied] = useState(false);

    // Edit Modal State
    const [editModal, setEditModal] = useState<{
        isOpen: boolean;
        type: 'func' | 'ff' | 'fm' | 'task';
        data: any;
        indices: { fIndex: number, ffIndex?: number, fmIndex?: number };
    } | null>(null);

    // Inspection Modal State
    const [inspectionModal, setInspectionModal] = useState<{
        isOpen: boolean;
        taskDesc: string;
        taskDurationMinutes: number; // Task budget (in minutes)
        points: InspectionPoint[];
        indices: { fIndex: number, ffIndex: number, fmIndex: number };
        loading: boolean;
    } | null>(null);

    // Database State
    const [savedStudies, setSavedStudies] = useState<SavedRCMStudy[]>([]);
    const [currentStudyId, setCurrentStudyId] = useState<string>('');

    // 1. Initial Load & Persistence
    useEffect(() => {
        const db = localStorage.getItem('rcm_database');
        if (db) setSavedStudies(JSON.parse(db));

        const draft = localStorage.getItem('rcm_workspace_draft');
        if (draft) {
            try {
                const d = JSON.parse(draft);
                setInputText(d.inputText || '');
                setAnalysisData(d.analysisData || []);
                setAttachedFiles(d.files || []);
                setStudyName(d.studyName || 'New RCM Study');
                if (d.studyId) setCurrentStudyId(d.studyId);
            } catch (e) { console.error("Draft load error", e); }
        }
    }, []);

    // 2. Auto-Save Draft
    useEffect(() => {
        const draft = {
            inputText,
            analysisData,
            files: attachedFiles,
            studyId: currentStudyId,
            studyName
        };
        localStorage.setItem('rcm_workspace_draft', JSON.stringify(draft));
    }, [inputText, analysisData, attachedFiles, currentStudyId, studyName]);

    // --- Database Handlers ---
    const handleSaveStudy = () => {
        if (!inputText && analysisData.length === 0) return alert("Nothing to save.");
        if (!studyName.trim()) return alert("Please name your study.");

        const newStudy: SavedRCMStudy = {
            id: currentStudyId || `study-${Date.now()}`,
            name: studyName,
            date: new Date().toISOString(),
            inputText,
            analysisData,
            files: attachedFiles
        };

        const updatedDB = currentStudyId 
            ? savedStudies.map(s => s.id === currentStudyId ? newStudy : s)
            : [...savedStudies, newStudy];
        
        setSavedStudies(updatedDB);
        localStorage.setItem('rcm_database', JSON.stringify(updatedDB));
        setCurrentStudyId(newStudy.id);
        alert(`Study "${studyName}" saved!`);
    };

    const handleLoadStudy = (id: string) => {
        if (!id) { handleNewStudy(); return; }
        const study = savedStudies.find(s => s.id === id);
        if (study) {
            setInputText(study.inputText);
            setAnalysisData(study.analysisData);
            setAttachedFiles(study.files);
            setStudyName(study.name);
            setCurrentStudyId(study.id);
        }
    };

    const handleNewStudy = () => {
        setInputText('');
        setAnalysisData([]);
        setAttachedFiles([]);
        setStudyName('New RCM Study');
        setCurrentStudyId('');
    };

    const handleDeleteStudy = () => {
        if (!currentStudyId) return;
        if (confirm("Delete this study permanently?")) {
            const updated = savedStudies.filter(s => s.id !== currentStudyId);
            setSavedStudies(updated);
            localStorage.setItem('rcm_database', JSON.stringify(updated));
            handleNewStudy();
        }
    };

    // --- AI Handlers ---

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const newFiles: AttachedFile[] = [];
            for (let i = 0; i < e.target.files.length; i++) {
                const file = e.target.files[i];
                try {
                    const base64 = await new Promise<string>((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve((reader.result as string).split(',')[1]);
                        reader.onerror = reject;
                        reader.readAsDataURL(file);
                    });
                    newFiles.push({ id: `file-${Date.now()}-${i}`, name: file.name, type: file.type, data: base64 });
                } catch (err) { console.error("File error", err); }
            }
            setAttachedFiles(prev => [...prev, ...newFiles]);
        }
        e.target.value = '';
    };

    const removeFile = (id: string) => setAttachedFiles(prev => prev.filter(f => f.id !== id));

    // STEP 1: Generate Functions Only
    const handleGenerateFunctions = async () => {
        if (!inputText.trim()) return alert("Enter operational context first.");
        setLoading(true);
        try {
            const result = await rcmSuggestFunctions(inputText, attachedFiles);
            setAnalysisData(result);
        } catch (e) { alert("Generation failed."); } 
        finally { setLoading(false); }
    };

    // STEP 2: Generate Failures for Function
    const handleGenFailures = async (funcId: string, funcDesc: string) => {
        setGeneratingId(funcId);
        try {
            const failures = await rcmGenFailures(funcDesc, inputText, attachedFiles);
            setAnalysisData(prev => prev.map(f => f.id === funcId ? { ...f, functionalFailures: failures } : f));
        } catch (e) { alert("Failed to generate failures."); }
        finally { setGeneratingId(null); }
    };

    // STEP 3: Generate Modes for Failure
    const handleGenModes = async (funcId: string, ffId: string, failDesc: string, funcDesc: string) => {
        setGeneratingId(ffId);
        try {
            const modes = await rcmGenModes(failDesc, funcDesc, inputText, attachedFiles);
            setAnalysisData(prev => prev.map(f => f.id === funcId ? { 
                ...f, 
                functionalFailures: f.functionalFailures.map(ff => ff.id === ffId ? { ...ff, failureModes: modes } : ff)
            } : f));
        } catch (e) { alert("Failed to generate modes."); }
        finally { setGeneratingId(null); }
    };

    // STEP 4: Generate Task for Mode
    const handleGenTask = async (funcId: string, ffId: string, fmId: string, modeDesc: string, failDesc: string) => {
        setGeneratingId(fmId);
        try {
            const task = await rcmGenTask(modeDesc, failDesc, inputText, attachedFiles);
            setAnalysisData(prev => prev.map(f => f.id === funcId ? { 
                ...f, 
                functionalFailures: f.functionalFailures.map(ff => ff.id === ffId ? { 
                    ...ff, 
                    failureModes: ff.failureModes.map(fm => fm.id === fmId ? { ...fm, task: task } : fm)
                } : ff)
            } : f));
        } catch (e) { alert("Failed to generate task."); }
        finally { setGeneratingId(null); }
    };

    // STEP 5: Bulk Inspection Generation
    const handleBulkGenInspections = async () => {
        setLoading(true);
        const newFuncs = JSON.parse(JSON.stringify(analysisData)); // Deep copy
        let count = 0;
        try {
            // Sequential processing to handle API limits naturally
            for (let fI = 0; fI < newFuncs.length; fI++) {
                for (let ffI = 0; ffI < newFuncs[fI].functionalFailures.length; ffI++) {
                    for (let fmI = 0; fmI < newFuncs[fI].functionalFailures[ffI].failureModes.length; fmI++) {
                        const fm = newFuncs[fI].functionalFailures[ffI].failureModes[fmI];
                        // If task exists but NO inspection sheet
                        if (fm.task && fm.task.description && (!fm.task.inspectionSheet || fm.task.inspectionSheet.length === 0)) {
                            try {
                                const points = await generateInspectionSheet(fm.task.description, inputText, attachedFiles);
                                fm.task.inspectionSheet = points;
                                count++;
                            } catch (e) { 
                                console.warn("Skipping inspection gen for a task due to error");
                            }
                        }
                    }
                }
            }
            setAnalysisData(newFuncs);
            if (count > 0) alert(`Success! Generated inspection plans for ${count} tasks.`);
            else alert("No eligible tasks found (tasks without inspection sheets).");
        } catch (e) {
            console.error(e);
            alert("Error during bulk inspection generation.");
        } finally {
            setLoading(false);
        }
    };

    const handleCopyTable = () => {
        const headers = [
            'Func Code', 'Function', 'Func Type',
            'Fail Code', 'Functional Failure', 'Fail Type',
            'Mode Code', 'Failure Mode', 'Effect', 'Human Error?',
            'Task Code', 'Task Description', 'Task Type', 'Frequency', 'Duration', 'Executor', 'Qty'
        ];
        const rows: string[][] = [];
        analysisData.forEach(f => {
            if (f.functionalFailures.length === 0) rows.push([f.code||'', f.description, f.type||'', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
            f.functionalFailures.forEach(ff => {
                if (ff.failureModes.length === 0) rows.push([f.code||'', f.description, f.type||'', ff.code||'', ff.description, ff.type||'', '', '', '', '', '', '', '', '', '', '', '']);
                ff.failureModes.forEach(fm => {
                    const t = fm.task;
                    rows.push([
                        f.code||'', f.description, f.type||'',
                        ff.code||'', ff.description, ff.type||'',
                        fm.code||'', fm.description, fm.effect||'', fm.isHumanError ? 'YES' : 'NO',
                        t?.code||'', t?.description||'', t?.type||'', t?.frequency||'', (t?.duration||0).toString(), t?.executor||'', (t?.executorCount||1).toString()
                    ]);
                });
            });
        });
        const tsv = [headers.join('\t'), ...rows.map(row => row.map(c => `"${c.replace(/"/g, '""')}"`).join('\t'))].join('\n');
        navigator.clipboard.writeText(tsv).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
    };

    const handleCopyDetailedTable = () => {
        const headers = [
            'Func Code', 'Function', 'Func Type',
            'Fail Code', 'Functional Failure', 'Fail Type',
            'Mode Code', 'Failure Mode', 'Effect', 'Human Error?',
            'Task Code', 'Task Description', 'Task Type', 'Frequency', 'Duration', 'Executor', 'Qty',
            'Insp Step', 'Insp Description', 'Insp Type', 'Est Time', 'Criteria', 'Min', 'Max', 'Unit'
        ];

        const rows: string[][] = [];

        // Recursive flattening
        analysisData.forEach(f => {
            if(f.functionalFailures.length === 0) {
                // Just function
                rows.push([f.code||'', f.description, f.type||'', ...Array(22).fill('')]);
            } else {
                f.functionalFailures.forEach(ff => {
                    if(ff.failureModes.length === 0) {
                        // Function + Failure
                        rows.push([
                            f.code||'', f.description, f.type||'',
                            ff.code||'', ff.description, ff.type||'',
                            ...Array(19).fill('')
                        ]);
                    } else {
                        ff.failureModes.forEach(fm => {
                            const t = fm.task;
                            if(!t) {
                                // Function + Failure + Mode
                                rows.push([
                                    f.code||'', f.description, f.type||'',
                                    ff.code||'', ff.description, ff.type||'',
                                    fm.code||'', fm.description, fm.effect||'', fm.isHumanError ? 'YES' : 'NO',
                                    ...Array(15).fill('')
                                ]);
                            } else {
                                if(!t.inspectionSheet || t.inspectionSheet.length === 0) {
                                    // ... + Task (No Inspection)
                                    rows.push([
                                        f.code||'', f.description, f.type||'',
                                        ff.code||'', ff.description, ff.type||'',
                                        fm.code||'', fm.description, fm.effect||'', fm.isHumanError ? 'YES' : 'NO',
                                        t.code||'', t.description||'', t.type||'', t.frequency||'', (t.duration||0).toString(), t.executor||'', (t.executorCount||1).toString(),
                                        ...Array(8).fill('')
                                    ]);
                                } else {
                                    // ... + Task + Inspection Points (One row per point)
                                    t.inspectionSheet.forEach((insp, i) => {
                                        rows.push([
                                            f.code||'', f.description, f.type||'',
                                            ff.code||'', ff.description, ff.type||'',
                                            fm.code||'', fm.description, fm.effect||'', fm.isHumanError ? 'YES' : 'NO',
                                            t.code||'', t.description||'', t.type||'', t.frequency||'', (t.duration||0).toString(), t.executor||'', (t.executorCount||1).toString(),
                                            (i+1).toString(),
                                            insp.description || '',
                                            insp.type || '',
                                            (insp.timeMinutes || 0).toString(),
                                            insp.nominal || '',
                                            insp.min !== undefined ? insp.min.toString() : '',
                                            insp.max !== undefined ? insp.max.toString() : '',
                                            insp.unit || ''
                                        ]);
                                    });
                                }
                            }
                        });
                    }
                });
            }
        });

        const tsv = [headers.join('\t'), ...rows.map(row => row.map(c => `"${c.replace(/"/g, '""')}"`).join('\t'))].join('\n');
        navigator.clipboard.writeText(tsv).then(() => { setDetailedCopied(true); setTimeout(() => setDetailedCopied(false), 2000); });
    };

    // --- Deletion Logic ---
    const deleteItem = (type: 'func' | 'ff' | 'fm' | 'task', indices: { fIndex: number, ffIndex?: number, fmIndex?: number }) => {
        if (!confirm("Are you sure you want to delete this item?")) return;
        const newData = [...analysisData];
        if (type === 'func') {
            newData.splice(indices.fIndex, 1);
        } else if (type === 'ff' && indices.ffIndex !== undefined) {
            newData[indices.fIndex].functionalFailures.splice(indices.ffIndex, 1);
        } else if (type === 'fm' && indices.ffIndex !== undefined && indices.fmIndex !== undefined) {
            newData[indices.fIndex].functionalFailures[indices.ffIndex].failureModes.splice(indices.fmIndex, 1);
        } else if (type === 'task' && indices.ffIndex !== undefined && indices.fmIndex !== undefined) {
            delete newData[indices.fIndex].functionalFailures[indices.ffIndex].failureModes[indices.fmIndex].task;
        }
        setAnalysisData(newData);
    };

    // --- Edit Modal Logic ---
    const openEdit = (type: 'func' | 'ff' | 'fm' | 'task', data: any, indices: { fIndex: number, ffIndex?: number, fmIndex?: number }) => {
        setEditModal({ isOpen: true, type, data: { ...data }, indices });
    };

    const saveEdit = () => {
        if (!editModal) return;
        const { type, data, indices } = editModal;
        const newData = [...analysisData];

        if (type === 'func') {
            newData[indices.fIndex] = { ...newData[indices.fIndex], ...data };
        } else if (type === 'ff' && indices.ffIndex !== undefined) {
            newData[indices.fIndex].functionalFailures[indices.ffIndex] = { ...newData[indices.fIndex].functionalFailures[indices.ffIndex], ...data };
        } else if (type === 'fm' && indices.ffIndex !== undefined && indices.fmIndex !== undefined) {
            newData[indices.fIndex].functionalFailures[indices.ffIndex].failureModes[indices.fmIndex] = { ...newData[indices.fIndex].functionalFailures[indices.ffIndex].failureModes[indices.fmIndex], ...data };
        } else if (type === 'task' && indices.ffIndex !== undefined && indices.fmIndex !== undefined) {
            newData[indices.fIndex].functionalFailures[indices.ffIndex].failureModes[indices.fmIndex].task = data;
        }
        setAnalysisData(newData);
        setEditModal(null);
    };

    // --- Inspection Sheet Logic ---
    const handleGenInspection = async (indices: { fIndex: number, ffIndex: number, fmIndex: number }) => {
        const fm = analysisData[indices.fIndex].functionalFailures[indices.ffIndex].failureModes[indices.fmIndex];
        const task = fm.task;
        if (!task || !task.description) return alert("Generate a task first.");

        // Calculate Task Budget in Minutes
        const durationHours = task.duration || 0;
        const budgetMinutes = durationHours * 60;

        // If sheet exists, open it. If not, generate it.
        const existingSheet = task.inspectionSheet || [];
        
        setInspectionModal({
            isOpen: true,
            taskDesc: task.description,
            taskDurationMinutes: budgetMinutes,
            points: existingSheet,
            indices,
            loading: existingSheet.length === 0
        });

        if (existingSheet.length === 0) {
            try {
                const points = await generateInspectionSheet(task.description, inputText, attachedFiles);
                setInspectionModal(prev => prev ? { ...prev, points, loading: false } : null);
                
                // Save back to main state
                const newData = [...analysisData];
                const targetTask = newData[indices.fIndex].functionalFailures[indices.ffIndex].failureModes[indices.fmIndex].task!;
                targetTask.inspectionSheet = points;
                setAnalysisData(newData);
            } catch (e) {
                alert("Failed to generate inspection sheet.");
                setInspectionModal(null);
            }
        }
    };

    const handleUpdatePoint = (idx: number, field: keyof InspectionPoint, value: any) => {
        if (!inspectionModal) return;
        const newPoints = [...inspectionModal.points];
        newPoints[idx] = { ...newPoints[idx], [field]: value };
        
        setInspectionModal({ ...inspectionModal, points: newPoints });
        
        const { indices } = inspectionModal;
        const newData = [...analysisData];
        if (newData[indices.fIndex]?.functionalFailures[indices.ffIndex]?.failureModes[indices.fmIndex]?.task) {
             newData[indices.fIndex].functionalFailures[indices.ffIndex].failureModes[indices.fmIndex].task!.inspectionSheet = newPoints;
             setAnalysisData(newData);
        }
    };

    const handleDeletePoint = (idx: number) => {
        if (!inspectionModal) return;
        const newPoints = inspectionModal.points.filter((_, i) => i !== idx);
        
        setInspectionModal({ ...inspectionModal, points: newPoints });
        
        const { indices } = inspectionModal;
        const newData = [...analysisData];
        if (newData[indices.fIndex]?.functionalFailures[indices.ffIndex]?.failureModes[indices.fmIndex]?.task) {
             newData[indices.fIndex].functionalFailures[indices.ffIndex].failureModes[indices.fmIndex].task!.inspectionSheet = newPoints;
             setAnalysisData(newData);
        }
    };

    const handleAddPoint = () => {
        if (!inspectionModal) return;
        const newPoint: InspectionPoint = { description: 'New Check Point', type: 'Qualitative', nominal: 'OK', timeMinutes: 5 };
        const newPoints = [...inspectionModal.points, newPoint];
        
        setInspectionModal({ ...inspectionModal, points: newPoints });
        
        const { indices } = inspectionModal;
        const newData = [...analysisData];
        if (newData[indices.fIndex]?.functionalFailures[indices.ffIndex]?.failureModes[indices.fmIndex]?.task) {
             newData[indices.fIndex].functionalFailures[indices.ffIndex].failureModes[indices.fmIndex].task!.inspectionSheet = newPoints;
             setAnalysisData(newData);
        }
    };

    // Helper to calculate total check time
    const calculateTotalTime = (points: InspectionPoint[]) => {
        return points.reduce((acc, p) => acc + (p.timeMinutes || 0), 0);
    };

    // --- CSV Export Logic ---
    const generateCSV = (separator: string) => {
        if (!inspectionModal) return '';
        const headers = ['#', 'Description', 'Type', 'Est. Time (min)', 'Criteria/Nominal', 'Min', 'Max', 'Unit', 'Status', 'Remarks'];
        const escape = (val: any) => {
            const str = String(val || '');
            if (str.includes(separator) || str.includes('"') || str.includes('\n')) {
                return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
        };

        const rows = inspectionModal.points.map((p, i) => {
            const criteria = p.type === 'Qualitative' ? p.nominal : '';
            return [
                i + 1,
                escape(p.description),
                escape(p.type),
                p.timeMinutes || 0,
                escape(criteria),
                p.min !== undefined ? p.min : '',
                p.max !== undefined ? p.max : '',
                escape(p.unit),
                '', // Status placeholder
                ''  // Remarks placeholder
            ].join(separator);
        });
        return [headers.join(separator), ...rows].join('\n');
    };

    const handleDownloadCSV = () => {
        const csv = generateCSV(',');
        if (!csv) return;
        // Add BOM so Excel opens it correctly with columns in most regions
        const blob = new Blob(["\ufeff" + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        const filename = `Inspection_${(inspectionModal?.taskDesc || 'Sheet').substring(0, 20).replace(/[^a-z0-9]/gi, '_')}.csv`;
        link.setAttribute("download", filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleCopyCSV = () => {
        // Use TSV for clipboard copy - pastes into Excel columns perfectly
        const tsv = generateCSV('\t');
        if (tsv) {
            navigator.clipboard.writeText(tsv).then(() => alert("Data copied! Ready to paste into Excel."));
        }
    };

    return (
        <div className="flex flex-col h-full bg-slate-50 gap-4 p-6 overflow-hidden relative">
            
            {/* 1. Database Toolbar */}
            <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm flex justify-between items-center shrink-0">
                <div className="flex items-center gap-4">
                    <h2 className="text-sm font-bold text-purple-900 flex items-center gap-2">
                        <FolderOpen size={18}/> RCM Study Manager
                    </h2>
                    <select 
                        className="bg-gray-50 border border-gray-200 text-gray-700 text-xs rounded-lg focus:ring-purple-500 block p-2 w-64"
                        value={currentStudyId}
                        onChange={(e) => handleLoadStudy(e.target.value)}
                    >
                        <option value="">-- Unsaved Draft / New --</option>
                        {savedStudies.map(s => (
                            <option key={s.id} value={s.id}>{s.name} ({new Date(s.date).toLocaleDateString()})</option>
                        ))}
                    </select>
                    
                    <div className="h-6 w-px bg-gray-300"></div>
                    
                    {/* Explicit Naming Input */}
                    <input 
                        type="text" 
                        placeholder="Name your study..."
                        className="border border-purple-200 rounded px-2 py-1.5 text-sm w-64 focus:ring-purple-500 focus:border-purple-500 font-medium"
                        value={studyName}
                        onChange={(e) => setStudyName(e.target.value)}
                    />
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={handleNewStudy} className="flex items-center gap-1 bg-white border hover:bg-gray-50 px-3 py-1.5 rounded text-xs font-medium"><PlusCircle size={14}/> New</button>
                    <button onClick={handleSaveStudy} className="flex items-center gap-1 bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded text-xs font-medium"><Save size={14}/> Save</button>
                    {currentStudyId && <button onClick={handleDeleteStudy} className="text-red-400 hover:text-red-600 p-1.5"><Trash2 size={16}/></button>}
                </div>
            </div>

            {/* 2. Input Section */}
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm shrink-0 flex gap-6">
                <div className="flex-1 space-y-2">
                    <label className="text-sm font-bold text-gray-700">Operational Context & System Description</label>
                    <textarea 
                        className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-purple-500 min-h-[100px]"
                        placeholder="Describe system, standards, and boundaries..."
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                    />
                    <div className="flex flex-wrap items-center gap-2">
                        <label className="cursor-pointer bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-300 transition flex items-center gap-1">
                            <Paperclip size={14} /> Attach PDF/Images
                            <input type="file" multiple accept=".pdf,image/*" className="hidden" onChange={handleFileChange} />
                        </label>
                        {attachedFiles.map(f => (
                            <div key={f.id} className="flex items-center gap-2 bg-purple-50 text-purple-700 px-3 py-1 rounded-full border border-purple-100 text-xs font-medium">
                                {f.type.includes('image') ? <ImageIcon size={12}/> : <FileText size={12}/>}
                                <span className="max-w-[100px] truncate">{f.name}</span>
                                <button onClick={() => removeFile(f.id)} className="hover:text-red-500"><X size={12}/></button>
                            </div>
                        ))}
                    </div>
                </div>
                <button 
                    onClick={handleGenerateFunctions}
                    disabled={loading}
                    className="w-36 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-bold flex flex-col items-center justify-center gap-2 disabled:opacity-50"
                >
                    {loading && !generatingId ? <Loader2 className="animate-spin" size={24}/> : <Sparkles size={24}/>}
                    <span className="text-center text-xs">Generate Functions (Step 1)</span>
                </button>
            </div>

            {/* 3. Worksheet Table */}
            <div className="flex-1 bg-white rounded-xl border border-gray-200 shadow-sm overflow-auto custom-scrollbar flex flex-col relative">
                <div className="p-3 bg-gray-50 border-b border-gray-200 flex justify-between items-center sticky top-0 z-20">
                     <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">RCM Worksheet</span>
                     <div className="flex gap-2">
                        {analysisData.length > 0 && (
                            <button 
                                onClick={handleCopyDetailedTable} 
                                className="flex items-center gap-1 bg-indigo-50 border border-indigo-100 text-indigo-700 hover:bg-indigo-100 px-3 py-1.5 rounded text-xs font-bold transition"
                                title="Export every inspection point as a row for Excel"
                            >
                                {detailedCopied ? <CheckCircle2 size={14} className="text-green-600"/> : <FileSpreadsheet size={14} />} 
                                {detailedCopied ? 'Copied' : 'Copy Detailed Table (w/ Insp)'}
                            </button>
                        )}
                        {analysisData.length > 0 && (
                            <button onClick={handleCopyTable} className="flex items-center gap-1 bg-white border hover:bg-gray-100 px-3 py-1.5 rounded text-xs font-medium">
                                {copied ? <CheckCircle2 size={14} className="text-green-600"/> : <Copy size={14} />} {copied ? 'Copied' : 'Copy Table'}
                            </button>
                        )}
                     </div>
                </div>

                <div className="grid grid-cols-12 bg-gray-100 border-b border-gray-200 text-xs font-bold text-gray-700 uppercase tracking-wider sticky top-[53px] z-10 min-w-[1400px]">
                    <div className="col-span-3 p-4 border-r border-gray-200">1. Function</div>
                    <div className="col-span-3 p-4 border-r border-gray-200">2. Functional Failure</div>
                    <div className="col-span-3 p-4 border-r border-gray-200">3. Failure Mode</div>
                    <div className="col-span-3 p-4 flex justify-between items-center">
                        <span>4. Task</span>
                        {analysisData.length > 0 && (
                            <button 
                                onClick={handleBulkGenInspections}
                                disabled={loading}
                                className="text-[10px] bg-emerald-100 hover:bg-emerald-200 text-emerald-800 px-2 py-0.5 rounded flex items-center gap-1 transition shadow-sm border border-emerald-200"
                                title="Auto-Generate Inspection Sheets for all tasks"
                            >
                                {loading ? <Loader2 size={10} className="animate-spin"/> : <ListChecks size={12}/>} Auto-Insp Plans
                            </button>
                        )}
                    </div>
                </div>

                <div className="flex-1 min-w-[1400px]">
                    {analysisData.length === 0 ? (
                        <div className="text-center py-20 text-gray-400">Contextualize system above to start.</div>
                    ) : (
                        <div>
                            {analysisData.map((func, fIndex) => (
                                <div key={func.id} className="group/func border-b border-gray-200 last:border-0 grid grid-cols-12">
                                    
                                    {/* COL 1: Function */}
                                    <div className="col-span-3 p-4 border-r border-gray-200 bg-purple-50/20">
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-mono font-bold text-purple-700 bg-purple-100 px-1.5 rounded">{func.code}</span>
                                                <span className="text-[10px] uppercase font-bold text-gray-400 border px-1 rounded bg-white">{func.type}</span>
                                            </div>
                                            <div className="flex gap-1">
                                                <button onClick={() => handleGenFailures(func.id, func.description)} className="text-purple-600 hover:bg-purple-100 p-1 rounded" title="AI Generate Failures">
                                                    {generatingId === func.id ? <Loader2 size={12} className="animate-spin"/> : <Sparkles size={12}/>}
                                                </button>
                                                <button onClick={() => openEdit('func', func, {fIndex})} className="text-gray-500 hover:text-blue-600 hover:bg-gray-100 p-1 rounded" title="Edit">
                                                    <Pencil size={12}/>
                                                </button>
                                                <button onClick={() => deleteItem('func', {fIndex})} className="text-gray-400 hover:text-red-500 hover:bg-red-50 p-1 rounded" title="Delete">
                                                    <Trash2 size={12}/>
                                                </button>
                                            </div>
                                        </div>
                                        <p className="text-sm font-semibold text-gray-800 whitespace-pre-wrap">{func.description}</p>
                                    </div>

                                    {/* COL 2-4 */}
                                    <div className="col-span-9">
                                        {func.functionalFailures.length === 0 && (
                                            <div className="p-4 text-xs text-gray-400 italic">No failures. Click AI icon on function to generate.</div>
                                        )}
                                        {func.functionalFailures.map((ff, ffIndex) => (
                                            <div key={ff.id} className={`grid grid-cols-9 border-b border-gray-100 last:border-0 ${ffIndex % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}>
                                                
                                                {/* COL 2: Functional Failure */}
                                                <div className="col-span-3 p-4 border-r border-gray-200">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-xs font-mono font-bold text-blue-700 bg-blue-100 px-1.5 rounded">{ff.code}</span>
                                                            <span className={`text-[10px] uppercase font-bold px-1 rounded border bg-white ${ff.type === 'Total' ? 'text-red-500 border-red-100' : 'text-orange-500 border-orange-100'}`}>{ff.type}</span>
                                                        </div>
                                                        <div className="flex gap-1">
                                                            <button onClick={() => handleGenModes(func.id, ff.id, ff.description, func.description)} className="text-blue-600 hover:bg-blue-50 p-1 rounded" title="AI Generate Modes">
                                                                {generatingId === ff.id ? <Loader2 size={12} className="animate-spin"/> : <Sparkles size={12}/>}
                                                            </button>
                                                            <button onClick={() => openEdit('ff', ff, {fIndex, ffIndex})} className="text-gray-500 hover:text-blue-600 hover:bg-gray-100 p-1 rounded" title="Edit">
                                                                <Pencil size={12}/>
                                                            </button>
                                                            <button onClick={() => deleteItem('ff', {fIndex, ffIndex})} className="text-gray-400 hover:text-red-500 hover:bg-red-50 p-1 rounded" title="Delete">
                                                                <Trash2 size={12}/>
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{ff.description}</p>
                                                </div>

                                                {/* COL 3-4 */}
                                                <div className="col-span-6">
                                                    {ff.failureModes.length === 0 && (
                                                        <div className="p-4 text-xs text-gray-400 italic">No modes. Click AI icon on failure.</div>
                                                    )}
                                                    {ff.failureModes.map((fm, fmIndex) => (
                                                        <div key={fm.id} className="grid grid-cols-2 border-b border-gray-100 last:border-0">
                                                            
                                                            {/* COL 3: Mode */}
                                                            <div className="p-4 border-r border-gray-200">
                                                                <div className="flex items-center justify-between mb-2">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="text-xs font-mono font-bold text-red-700 bg-red-100 px-1.5 rounded">{fm.code}</span>
                                                                        {fm.isHumanError && <span className="text-[10px] bg-amber-100 text-amber-800 px-1 rounded flex gap-1 items-center border border-amber-200"><User size={8}/> Human</span>}
                                                                    </div>
                                                                    <div className="flex gap-1">
                                                                        <button onClick={() => handleGenTask(func.id, ff.id, fm.id, fm.description, ff.description)} className="text-red-600 hover:bg-red-50 p-1 rounded" title="AI Generate Task">
                                                                            {generatingId === fm.id ? <Loader2 size={12} className="animate-spin"/> : <Sparkles size={12}/>}
                                                                        </button>
                                                                        <button onClick={() => openEdit('fm', fm, {fIndex, ffIndex, fmIndex})} className="text-gray-500 hover:text-blue-600 hover:bg-gray-100 p-1 rounded" title="Edit">
                                                                            <Pencil size={12}/>
                                                                        </button>
                                                                        <button onClick={() => deleteItem('fm', {fIndex, ffIndex, fmIndex})} className="text-gray-400 hover:text-red-500 hover:bg-red-50 p-1 rounded" title="Delete">
                                                                            <Trash2 size={12}/>
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                                <p className="text-sm font-medium text-gray-800 whitespace-pre-wrap">{fm.description}</p>
                                                                {fm.effect && <p className="text-xs text-gray-500 mt-2 italic border-l-2 border-gray-200 pl-2">Effect: {fm.effect}</p>}
                                                            </div>

                                                            {/* COL 4: Task */}
                                                            <div className="p-4 bg-green-50/10 relative group">
                                                                {fm.task ? (
                                                                    <div>
                                                                        <div className="flex items-center justify-between mb-2">
                                                                            <div className="flex flex-wrap items-center gap-2">
                                                                                <span className="text-xs font-mono font-bold text-green-700 bg-green-100 px-1.5 rounded">{fm.task.code}</span>
                                                                                <span className="text-[10px] font-bold uppercase text-gray-500 border px-1 rounded bg-white">{fm.task.type || 'N/A'}</span>
                                                                            </div>
                                                                            <div className="flex gap-1">
                                                                                <button 
                                                                                    onClick={() => handleGenInspection({fIndex, ffIndex, fmIndex})} 
                                                                                    className={`p-1 rounded transition ${fm.task.inspectionSheet && fm.task.inspectionSheet.length > 0 ? 'text-emerald-700 bg-emerald-100 hover:bg-emerald-200' : 'text-gray-400 hover:bg-emerald-50 hover:text-emerald-600'}`}
                                                                                    title={fm.task.inspectionSheet && fm.task.inspectionSheet.length > 0 ? "View Inspection Sheet" : "Generate Inspection Sheet"}
                                                                                >
                                                                                    <ClipboardList size={12}/>
                                                                                </button>
                                                                                <button onClick={() => openEdit('task', fm.task, {fIndex, ffIndex, fmIndex})} className="text-gray-500 hover:text-blue-600 hover:bg-gray-100 p-1 rounded" title="Edit">
                                                                                    <Pencil size={12}/>
                                                                                </button>
                                                                                <button onClick={() => deleteItem('task', {fIndex, ffIndex, fmIndex})} className="text-gray-400 hover:text-red-500 hover:bg-red-50 p-1 rounded" title="Delete">
                                                                                    <Trash2 size={12}/>
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                        <p className="text-sm font-medium text-emerald-800 whitespace-pre-wrap mb-2">{fm.task.description}</p>
                                                                        <div className="flex items-center gap-3 text-[10px] text-gray-500 bg-white p-1 rounded border border-gray-200 shadow-sm">
                                                                            <div className="flex items-center gap-1"><Clock size={10} className="text-indigo-500"/><span className="font-semibold">{fm.task.frequency}</span></div>
                                                                            <div className="h-3 w-px bg-gray-300"></div>
                                                                            <div>{fm.task.duration}h</div>
                                                                            <div className="h-3 w-px bg-gray-300"></div>
                                                                            <div className="flex items-center gap-1"><Users size={10} className="text-blue-500"/><span>{fm.task.executor} (x{fm.task.executorCount})</span></div>
                                                                        </div>
                                                                    </div>
                                                                ) : (
                                                                    <div className="h-full flex items-center justify-center">
                                                                        <div className="text-xs text-gray-300 italic">No Task</div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* EDIT MODAL */}
            {editModal && (
                <div className="absolute inset-0 z-50 bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="px-6 py-4 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
                            <h3 className="font-bold text-gray-800 flex items-center gap-2">
                                <Pencil size={16} /> Edit {editModal.type === 'func' ? 'Function' : editModal.type === 'ff' ? 'Functional Failure' : editModal.type === 'fm' ? 'Failure Mode' : 'Maintenance Task'}
                            </h3>
                            <button onClick={() => setEditModal(null)} className="text-gray-400 hover:text-gray-600"><X size={20}/></button>
                        </div>
                        
                        <div className="p-6 overflow-y-auto custom-scrollbar space-y-4">
                            {/* Common Fields */}
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Code</label>
                                <input className="w-full border-gray-300 rounded text-sm" value={editModal.data.code || ''} onChange={e => setEditModal({...editModal, data: {...editModal.data, code: e.target.value}})} />
                            </div>
                            
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Description</label>
                                <textarea rows={3} className="w-full border-gray-300 rounded text-sm" value={editModal.data.description || ''} onChange={e => setEditModal({...editModal, data: {...editModal.data, description: e.target.value}})} />
                            </div>

                            {/* Specific Fields */}
                            {(editModal.type === 'func' || editModal.type === 'ff') && (
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Type</label>
                                    <select className="w-full border-gray-300 rounded text-sm" value={editModal.data.type || ''} onChange={e => setEditModal({...editModal, data: {...editModal.data, type: e.target.value}})}>
                                        {editModal.type === 'func' ? (
                                            <>
                                                <option value="Primary">Primary</option>
                                                <option value="Environmental Integrity">Environmental Integrity</option>
                                                <option value="Security">Security</option>
                                                <option value="Protection">Protection</option>
                                                <option value="Economy">Economy</option>
                                                <option value="Appearance">Appearance</option>
                                            </>
                                        ) : (
                                            <>
                                                <option value="Total">Total</option>
                                                <option value="Partial">Partial</option>
                                            </>
                                        )}
                                    </select>
                                </div>
                            )}

                            {editModal.type === 'fm' && (
                                <>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Effect</label>
                                        <textarea rows={2} className="w-full border-gray-300 rounded text-sm" value={editModal.data.effect || ''} onChange={e => setEditModal({...editModal, data: {...editModal.data, effect: e.target.value}})} />
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input type="checkbox" checked={editModal.data.isHumanError || false} onChange={e => setEditModal({...editModal, data: {...editModal.data, isHumanError: e.target.checked}})} />
                                        <label className="text-sm font-medium text-gray-700">Is Human Error?</label>
                                    </div>
                                </>
                            )}

                            {editModal.type === 'task' && (
                                <>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Task Type</label>
                                        <input className="w-full border-gray-300 rounded text-sm" value={editModal.data.type || ''} onChange={e => setEditModal({...editModal, data: {...editModal.data, type: e.target.value}})} />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Frequency</label>
                                            <input className="w-full border-gray-300 rounded text-sm" value={editModal.data.frequency || ''} onChange={e => setEditModal({...editModal, data: {...editModal.data, frequency: e.target.value}})} />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Duration (Hrs)</label>
                                            <input type="number" className="w-full border-gray-300 rounded text-sm" value={editModal.data.duration || 0} onChange={e => setEditModal({...editModal, data: {...editModal.data, duration: Number(e.target.value)}})} />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Executor</label>
                                            <input className="w-full border-gray-300 rounded text-sm" value={editModal.data.executor || ''} onChange={e => setEditModal({...editModal, data: {...editModal.data, executor: e.target.value}})} />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Quantity</label>
                                            <input type="number" className="w-full border-gray-300 rounded text-sm" value={editModal.data.executorCount || 1} onChange={e => setEditModal({...editModal, data: {...editModal.data, executorCount: Number(e.target.value)}})} />
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>

                        <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-2">
                            <button onClick={() => setEditModal(null)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-200 rounded font-medium">Cancel</button>
                            <button onClick={saveEdit} className="px-4 py-2 text-sm text-white bg-indigo-600 hover:bg-indigo-700 rounded font-medium">Save Changes</button>
                        </div>
                    </div>
                </div>
            )}

            {/* INSPECTION MODAL */}
            {inspectionModal && (
                <div className="absolute inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="px-6 py-4 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
                            <h3 className="font-bold text-gray-800 flex items-center gap-2">
                                <ClipboardList size={20} className="text-emerald-600" /> 
                                Inspection Sheet (Template)
                            </h3>
                            <button onClick={() => setInspectionModal(null)} className="text-gray-400 hover:text-gray-600"><X size={20}/></button>
                        </div>

                        <div className="p-6 bg-slate-50 border-b border-gray-100 flex justify-between items-center">
                            <div>
                                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Task Context</p>
                                <p className="text-sm font-semibold text-gray-800">{inspectionModal.taskDesc}</p>
                            </div>
                            <button 
                                onClick={handleAddPoint}
                                className="bg-emerald-100 hover:bg-emerald-200 text-emerald-700 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition"
                            >
                                <Plus size={14}/> Add Point
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto custom-scrollbar p-0">
                            {inspectionModal.loading ? (
                                <div className="flex flex-col items-center justify-center h-64 text-gray-400 gap-2">
                                    <Loader2 className="animate-spin text-emerald-500" size={32}/>
                                    <p>Generating checklist points...</p>
                                </div>
                            ) : (
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-gray-100 text-xs font-bold text-gray-500 uppercase sticky top-0">
                                        <tr>
                                            <th className="px-6 py-3 w-12">#</th>
                                            <th className="px-6 py-3">Check Point Description</th>
                                            <th className="px-6 py-3 w-32">Type</th>
                                            <th className="px-6 py-3 w-32">Est. Time (min)</th>
                                            <th className="px-6 py-3">Criteria / Nominal / Limits</th>
                                            {/* NEW COLUMNS */}
                                            <th className="px-6 py-3 w-32">Status (Operator)</th>
                                            <th className="px-6 py-3">Remarks (Operator)</th>
                                            <th className="px-6 py-3 text-right w-20">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {inspectionModal.points.map((p, i) => (
                                            <tr key={i} className="bg-white hover:bg-gray-50 group align-top">
                                                <td className="px-6 py-3 text-gray-400 font-mono text-xs">{i + 1}</td>
                                                <td className="px-6 py-3">
                                                    <textarea 
                                                        rows={2}
                                                        className="w-full border-none bg-transparent focus:ring-0 font-medium text-gray-800 p-0 resize-y whitespace-pre-wrap min-h-[2.5rem]" 
                                                        value={p.description} 
                                                        onChange={(e) => handleUpdatePoint(i, 'description', e.target.value)}
                                                    />
                                                </td>
                                                <td className="px-6 py-3">
                                                    <select 
                                                        className="border-none bg-transparent focus:ring-0 text-xs font-bold p-0 cursor-pointer"
                                                        value={p.type}
                                                        onChange={(e) => handleUpdatePoint(i, 'type', e.target.value)}
                                                    >
                                                        <option value="Qualitative">Qualitative</option>
                                                        <option value="Quantitative">Quantitative</option>
                                                    </select>
                                                </td>
                                                <td className="px-6 py-3">
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        className="w-16 bg-transparent border-gray-200 rounded px-1 py-0.5 text-xs text-center"
                                                        value={p.timeMinutes || 0}
                                                        onChange={(e) => handleUpdatePoint(i, 'timeMinutes', Number(e.target.value))}
                                                    />
                                                </td>
                                                <td className="px-6 py-3">
                                                    {p.type === 'Qualitative' ? (
                                                        <textarea 
                                                            rows={2}
                                                            className="w-full border-none bg-transparent focus:ring-0 text-gray-600 p-0 resize-y whitespace-pre-wrap min-h-[2.5rem]" 
                                                            value={p.nominal || ''} 
                                                            placeholder="e.g. No leaks"
                                                            onChange={(e) => handleUpdatePoint(i, 'nominal', e.target.value)}
                                                        />
                                                    ) : (
                                                        <div className="flex gap-2 items-center flex-wrap">
                                                            <input 
                                                                className="w-16 border border-gray-200 rounded px-1 text-xs" 
                                                                placeholder="Min" 
                                                                value={p.min !== undefined ? p.min : ''} 
                                                                onChange={(e) => handleUpdatePoint(i, 'min', Number(e.target.value))}
                                                                type="number"
                                                            />
                                                            <span className="text-gray-400">-</span>
                                                            <input 
                                                                className="w-16 border border-gray-200 rounded px-1 text-xs" 
                                                                placeholder="Max" 
                                                                value={p.max !== undefined ? p.max : ''} 
                                                                onChange={(e) => handleUpdatePoint(i, 'max', Number(e.target.value))}
                                                                type="number"
                                                            />
                                                            <input 
                                                                className="w-12 border border-gray-200 rounded px-1 text-xs" 
                                                                placeholder="Unit" 
                                                                value={p.unit || ''} 
                                                                onChange={(e) => handleUpdatePoint(i, 'unit', e.target.value)}
                                                            />
                                                        </div>
                                                    )}
                                                </td>
                                                {/* NEW COLUMNS CONTENT */}
                                                <td className="px-6 py-3">
                                                    {p.type === 'Qualitative' ? (
                                                        <div className="flex gap-2 items-center h-full">
                                                            <label className="flex items-center gap-1 text-xs text-gray-500 font-medium bg-gray-50 px-2 py-1 rounded border border-gray-200"><input type="checkbox" disabled className="rounded text-green-500"/> OK</label>
                                                            <label className="flex items-center gap-1 text-xs text-gray-500 font-medium bg-gray-50 px-2 py-1 rounded border border-gray-200"><input type="checkbox" disabled className="rounded text-red-500"/> NOK</label>
                                                        </div>
                                                    ) : (
                                                        <div className="w-24 h-8 bg-gray-50 border border-gray-300 rounded flex items-center px-2 text-xs text-gray-400 italic">
                                                            Value...
                                                        </div> 
                                                    )}
                                                </td>
                                                <td className="px-6 py-3">
                                                    <div className="w-full h-8 bg-gray-50 border border-gray-300 rounded flex items-center px-2 text-xs text-gray-400 italic">
                                                        Remarks...
                                                    </div>
                                                </td>

                                                <td className="px-6 py-3 text-right">
                                                    <button 
                                                        onClick={() => handleDeletePoint(i)}
                                                        className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition"
                                                    >
                                                        <Trash2 size={16}/>
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                        {inspectionModal.points.length === 0 && (
                                            <tr>
                                                <td colSpan={8} className="px-6 py-12 text-center text-gray-400 italic">
                                                    No inspection points yet. Add one manually or regenerate.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            )}
                        </div>

                        {/* Footer Summary */}
                        {inspectionModal.points.length > 0 && (
                            <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 flex justify-between items-center text-xs">
                                <div className="flex items-center gap-4">
                                    <div className="flex gap-1 items-center">
                                        <span className="text-gray-500 font-bold uppercase">Total Insp. Time:</span>
                                        <span className={`font-mono font-bold text-sm ${calculateTotalTime(inspectionModal.points) > inspectionModal.taskDurationMinutes ? 'text-red-600' : 'text-emerald-600'}`}>
                                            {calculateTotalTime(inspectionModal.points)} min
                                        </span>
                                    </div>
                                    <div className="h-4 w-px bg-gray-300"></div>
                                    <div className="flex gap-1 items-center">
                                        <span className="text-gray-500 font-bold uppercase">Planned Task Duration:</span>
                                        <span className="font-mono font-bold text-sm text-gray-800">
                                            {inspectionModal.taskDurationMinutes} min
                                        </span>
                                    </div>
                                    {calculateTotalTime(inspectionModal.points) > inspectionModal.taskDurationMinutes && (
                                        <div className="flex items-center gap-1 text-red-600 font-semibold bg-red-50 px-2 py-0.5 rounded border border-red-200">
                                            <AlertCircle size={12}/> Warning: Exceeds Planned Duration
                                        </div>
                                    )}
                                </div>
                                <div className="flex justify-end gap-2">
                                    <button 
                                        onClick={handleCopyCSV} 
                                        className="px-4 py-2 bg-white border border-gray-300 rounded text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                        title="Copy Data for Excel (TSV)"
                                    >
                                        <Copy size={16}/> Copy for Excel
                                    </button>
                                    <button 
                                        onClick={handleDownloadCSV} 
                                        className="px-4 py-2 bg-white border border-gray-300 rounded text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                        title="Download CSV File"
                                    >
                                        <FileDown size={16}/> Download CSV
                                    </button>
                                    <button className="px-4 py-2 bg-white border border-gray-300 rounded text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                                        <Printer size={16}/> Print Sheet
                                    </button>
                                    <button onClick={() => setInspectionModal(null)} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-sm font-medium">Done</button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

        </div>
    );
};

export default RCMGenerator;
