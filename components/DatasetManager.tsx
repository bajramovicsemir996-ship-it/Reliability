import React, { useState, useEffect, useCallback } from 'react';
import { dbApi } from '../utils/db';
import { SavedDataset, SavedPMPlan } from '../types';
import { 
    FolderOpen, Save, Trash2, Edit2, Check, X, Database, 
    Loader2, Upload, PlusCircle, Activity, ShieldCheck, Eraser
} from 'lucide-react';

type DatasetType = 'failure' | 'pm';

interface DatasetManagerProps {
    type: DatasetType;
    currentData: any[];
    onLoad: (data: any[]) => void;
    onSaveName?: (name: string) => void; 
    activeId: string | null;
    onActiveIdChange: (id: string | null) => void;
    onImport: (file: File) => void;
}

const DatasetManager: React.FC<DatasetManagerProps> = ({ 
    type, currentData, onLoad, onSaveName,
    activeId, onActiveIdChange, onImport 
}) => {
    const isFailure = type === 'failure';
    const storeName = isFailure ? 'datasets' : 'pm_plans';
    const themeColor = isFailure ? 'indigo' : 'emerald';
    
    const config = {
        title: isFailure ? 'Delay Records Library' : 'PM Strategy Library',
        subTitle: isFailure ? 'Manage historical failure logs and downtime data' : 'Manage preventive maintenance plans and schedules',
        emptyLabel: isFailure ? 'New Manual Delay Log' : 'New PM Strategy Plan',
        importLabel: isFailure ? 'Import Delay Logs' : 'Import PM Plan',
        btnLabel: isFailure ? 'Open Library' : 'Open Library',
        icon: isFailure ? <Activity size={16} className="text-indigo-400"/> : <ShieldCheck size={16} className="text-emerald-400"/>,
        modalIcon: isFailure ? <Activity size={24}/> : <ShieldCheck size={24}/>
    };

    const [items, setItems] = useState<any[]>([]);
    const [isLibraryOpen, setIsLibraryOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');

    const refreshList = useCallback(async () => {
        setIsLoading(true);
        try {
            const list = await dbApi.getAll(storeName);
            list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            setItems(list);
        } catch (error) {
            console.error("Failed to fetch library items:", error);
        } finally {
            setIsLoading(false);
        }
    }, [storeName]);

    useEffect(() => {
        if (isLibraryOpen) {
            refreshList();
        }
    }, [isLibraryOpen, activeId, refreshList]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setIsLibraryOpen(false);
            onImport(file);
            e.target.value = ''; 
        }
    };

    const handleSave = async () => {
        if (!currentData || currentData.length === 0) {
            alert("Current view is empty. Import or add data first.");
            return;
        }

        const activeItem = items.find(i => i.id === activeId);
        const defaultName = activeItem?.name || `Dataset ${new Date().toLocaleDateString()}`;
        
        const inputName = prompt("Enter a name for this library entry:", defaultName);
        if (!inputName) return; 

        const targetId = Date.now().toString();
        const payload = {
            id: targetId,
            name: inputName,
            date: new Date().toISOString(),
            records: currentData 
        };

        try {
            await dbApi.save(storeName, payload);
            onActiveIdChange(targetId);
            if (onSaveName) onSaveName(inputName);
            await refreshList();
            alert(`Success: "${inputName}" saved to library.`);
        } catch (e) {
            alert("Failed to save data.");
            console.error(e);
        }
    };

    const handleWipeCurrent = async () => {
        if (!activeId) return;
        const activeItem = items.find(i => i.id === activeId);
        if (confirm(`PERMANENTLY REMOVE "${activeItem?.name || 'this dataset'}" from internal memory? This action cannot be undone.`)) {
            try {
                await dbApi.delete(storeName, activeId);
                onActiveIdChange(null);
                onLoad([]);
                await refreshList();
            } catch (e) {
                alert("Wipe operation failed.");
            }
        }
    };

    const handleLoad = (item: any) => {
        onLoad(item.records);
        onActiveIdChange(item.id);
        setIsLibraryOpen(false);
    };

    const handleDelete = async (id: string) => {
        const itemToDelete = items.find(i => i.id === id);
        if (confirm(`PERMANENTLY DELETE "${itemToDelete?.name}"?`)) {
            await dbApi.delete(storeName, id);
            if (activeId === id) {
                onActiveIdChange(null);
                onLoad([]);
            }
            await refreshList();
        }
    };

    const saveRename = async (item: any) => {
        if (!editName.trim()) return;
        const updated = { ...item, name: editName, date: new Date().toISOString() };
        await dbApi.save(storeName, updated);
        setEditingId(null);
        await refreshList();
    };

    const activeItem = items.find(i => i.id === activeId);
    const hasData = currentData.length > 0;

    return (
        <div className="flex flex-col gap-2">
            <div className="bg-white p-3 rounded-[1.5rem] border border-slate-200 shadow-sm flex items-center gap-4 flex-wrap ring-1 ring-slate-900/5">
                <button 
                    onClick={() => setIsLibraryOpen(true)}
                    className={`flex items-center gap-2 px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition shadow-lg ${
                        isFailure 
                        ? 'bg-slate-900 hover:bg-slate-800 text-white shadow-slate-950/20' 
                        : 'bg-emerald-900 hover:bg-emerald-800 text-white shadow-emerald-950/20'
                    }`}
                >
                    <FolderOpen size={16}/> {config.btnLabel}
                </button>

                <div className="h-8 w-px bg-slate-100 mx-1"></div>

                <div className="flex items-center gap-3 px-3 flex-1 min-w-[200px]">
                    <Database size={18} className={activeId ? `text-${themeColor}-500` : "text-slate-300"}/>
                    <div className="flex flex-col">
                        <p className="text-[9px] text-slate-400 font-black uppercase tracking-tighter">Memory Slot</p>
                        <p className={`text-[11px] font-black truncate max-w-[250px] ${activeId ? 'text-slate-800' : 'text-slate-400 italic'}`}>
                            {activeId ? activeItem?.name : (hasData ? 'Unsaved Buffer' : 'Empty')}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                     {activeId && (
                         <button 
                            onClick={handleWipeCurrent}
                            className="flex items-center gap-2 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition"
                         >
                            <Eraser size={14}/> Wipe Current Slot
                         </button>
                     )}
                     
                     <button 
                        onClick={handleSave}
                        disabled={!hasData}
                        className={`flex items-center gap-2 px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition shadow-md border ${
                            hasData 
                            ? `bg-${themeColor}-600 hover:bg-${themeColor}-700 text-white border-transparent` 
                            : 'bg-slate-50 text-slate-300 border-slate-100'
                        } disabled:cursor-not-allowed`}
                     >
                        <Save size={14}/> Save to Library
                     </button>
                </div>
            </div>

            {isLibraryOpen && (
                <div className="fixed inset-0 bg-slate-950/80 z-[100] flex items-center justify-center p-4 backdrop-blur-md animate-in fade-in duration-200">
                    <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-5xl max-h-[85vh] flex flex-col overflow-hidden ring-1 ring-white/20">
                        <div className={`p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50`}>
                            <div className="flex items-center gap-5">
                                <div className={`p-3 bg-${themeColor}-600 rounded-2xl shadow-lg text-white`}>{config.modalIcon}</div>
                                <div>
                                    <h3 className="text-xl font-black text-slate-800 uppercase tracking-widest">{config.title}</h3>
                                    <p className="text-[10px] text-slate-400 font-black uppercase mt-1 tracking-widest">{config.subTitle}</p>
                                </div>
                            </div>
                            <button onClick={() => setIsLibraryOpen(false)} className="text-slate-400 hover:text-slate-600 transition p-2 hover:bg-slate-100 rounded-full"><X size={28}/></button>
                        </div>

                        <div className="p-8 bg-white border-b border-slate-100 flex gap-6">
                            <label className={`flex-1 flex items-center justify-center gap-4 bg-${isFailure ? 'indigo' : 'emerald'}-50 hover:bg-${isFailure ? 'indigo' : 'emerald'}-100 text-${isFailure ? 'indigo' : 'emerald'}-700 border-2 border-dashed border-${isFailure ? 'indigo' : 'emerald'}-200 p-8 rounded-[1.5rem] text-sm font-black uppercase tracking-widest transition cursor-pointer`}>
                                <Upload size={24}/> {config.importLabel}
                                <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleFileChange} />
                            </label>
                            <button 
                                onClick={async () => {
                                    const name = prompt(`Enter name for manual entry:`, `Manual Set ${new Date().toLocaleDateString()}`);
                                    if (!name) return;
                                    const id = Date.now().toString();
                                    await dbApi.save(storeName, { id, name, date: new Date().toISOString(), records: [] });
                                    onLoad([]);
                                    onActiveIdChange(id);
                                    await refreshList();
                                    setIsLibraryOpen(false);
                                }}
                                className={`flex-1 flex items-center justify-center gap-4 bg-slate-50 hover:bg-slate-100 text-slate-700 border-2 border-dashed border-slate-200 p-8 rounded-[1.5rem] text-sm font-black uppercase tracking-widest transition`}
                            >
                                <PlusCircle size={24}/> {config.emptyLabel}
                            </button>
                        </div>

                        <div className="flex-1 overflow-auto bg-white custom-scrollbar p-8">
                            {isLoading ? (
                                <div className="flex flex-col items-center justify-center h-48 text-slate-400">
                                    <Loader2 size={32} className="animate-spin mb-2"/>
                                    <p className="text-xs font-black uppercase tracking-widest">Accessing Internal Database...</p>
                                </div>
                            ) : items.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-64 text-slate-300">
                                    <FolderOpen size={64} className="mb-4 opacity-10"/>
                                    <p className="text-xs font-black uppercase tracking-widest">Library is empty.</p>
                                </div>
                            ) : (
                                <table className="w-full text-left">
                                    <thead className="text-slate-400 uppercase text-[10px] font-black tracking-widest border-b border-slate-100">
                                        <tr>
                                            <th className="px-6 py-4">Label</th>
                                            <th className="px-6 py-4">Last Modified</th>
                                            <th className="px-6 py-4 text-center">Size</th>
                                            <th className="px-6 py-4 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {items.map(item => (
                                            <tr key={item.id} className={`group hover:bg-slate-50 transition-all ${activeId === item.id ? `bg-${themeColor}-50/50` : ''}`}>
                                                <td className="px-6 py-5">
                                                    {editingId === item.id ? (
                                                        <div className="flex items-center gap-2">
                                                            <input 
                                                                autoFocus
                                                                className={`border border-${themeColor}-300 rounded-xl px-4 py-2 text-sm font-black text-slate-800 outline-none`}
                                                                value={editName}
                                                                onChange={e => setEditName(e.target.value)}
                                                                onKeyDown={e => e.key === 'Enter' && saveRename(item)}
                                                            />
                                                            <button onClick={() => saveRename(item)} className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-xl"><Check size={18}/></button>
                                                        </div>
                                                    ) : (
                                                        <div className="flex flex-col">
                                                            <span className="font-black text-slate-800 text-sm flex items-center gap-2">
                                                                {item.name}
                                                                {activeId === item.id && <span className={`bg-${themeColor}-600 text-white text-[9px] px-2 py-0.5 rounded-full uppercase`}>ACTIVE</span>}
                                                            </span>
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-6 py-5 text-slate-500 text-[11px] font-bold uppercase">
                                                    {new Date(item.date).toLocaleString()}
                                                </td>
                                                <td className="px-6 py-5 text-center">
                                                    <span className="bg-slate-100 text-slate-600 px-3 py-1 rounded-full text-[10px] font-black">
                                                        {item.records?.length || 0} rows
                                                    </span>
                                                </td>
                                                <td className="px-6 py-5 text-right">
                                                    <div className="flex items-center justify-end gap-3">
                                                        <button 
                                                            onClick={() => handleLoad(item)}
                                                            className={`bg-${themeColor}-600 hover:bg-${themeColor}-700 text-white px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-md`}
                                                        >
                                                            Load
                                                        </button>
                                                        <button 
                                                            onClick={() => { setEditingId(item.id); setEditName(item.name); }}
                                                            className="p-2.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition"
                                                        >
                                                            <Edit2 size={18}/>
                                                        </button>
                                                        <button 
                                                            onClick={() => handleDelete(item.id)}
                                                            className="p-2.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition"
                                                        >
                                                            <Trash2 size={18}/>
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DatasetManager;