
import React, { useState, useEffect, useMemo } from 'react';
import { readExcelRaw, processMappedData, calculateMetrics } from './utils/reliabilityMath';
import { predictSpecificAttribute } from './services/geminiService';
import DataGrid from './components/DataGrid';
import PMDataGrid from './components/PMDataGrid';
import Dashboard from './components/Dashboard';
import PMDashboard from './components/PMDashboard';
import PMAuditPanel from './components/PMAuditPanel';
import TrendAnalysis from './components/TrendAnalysis';
import OptimizationPanel from './components/OptimizationPanel';
import RootCauseHunter from './components/RootCauseHunter';
import AIWizard from './components/AIWizard';
import ImportWizard from './components/ImportWizard';
import DatasetManager from './components/DatasetManager';
import { 
  UploadCloud, BarChart2, Table, Cpu, FileSpreadsheet, Target, 
  TrendingUp, Calculator, ShieldCheck, Zap, Users, FileUp, 
  Database, HelpCircle, X, Info, ZapOff, Play, BookOpen, Globe, Undo2, Redo2, Loader2
} from 'lucide-react';
import { RawRecord, PMRecord, MaintenanceCost, ImportMode, FieldMapping, AppLanguage } from './types';
import { useAppStore } from './store';
import { dbApi } from './utils/db';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>('b1_data');
  const [isGlossaryOpen, setIsGlossaryOpen] = useState(false);
  const [activeBox1Id, setActiveBox1Id] = useState<string | null>(null);
  const [activeBox2Id, setActiveBox2Id] = useState<string | null>(null);

  const { 
    box1Data, setBox1Data, 
    box1Filters, setBox1Filter, 
    box1Costs, updateCost, 
    box1PmDuration, setBox1PmDuration,
    pmPlanData, setPmPlanData,
    box2Filters, setBox2Filter,
    loadingAI, setLoadingAI,
    language, setLanguage,
    history, undo, redo
  } = useAppStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo(); }
        if ((e.ctrlKey || e.metaKey) && e.key === 'y') { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  // STRENGHTENED HYDRATION
  useEffect(() => {
    const hydrate = async () => {
        try {
            await dbApi.migrateFromLocalStorage();
            const saved = await dbApi.getSession();
            
            // IF NO SAVED SESSION: FORCE EMPTY
            if (!saved) {
                setBox1Data([]);
                setPmPlanData([]);
                return;
            }

            // ONLY HYDRATE IF DATA EXISTS
            if (saved.box1Data && Array.isArray(saved.box1Data)) setBox1Data(saved.box1Data);
            if (saved.pmPlanData && Array.isArray(saved.pmPlanData)) setPmPlanData(saved.pmPlanData);
            
            if (saved.box1PmDuration !== undefined) setBox1PmDuration(saved.box1PmDuration);
            if (saved.language) setLanguage(saved.language);
            if (saved.activeBox1Id) setActiveBox1Id(saved.activeBox1Id);
            if (saved.activeBox2Id) setActiveBox2Id(saved.activeBox2Id);
            
            if (saved.box1Costs) {
                const types: ('preventive' | 'corrective')[] = ['preventive', 'corrective'];
                types.forEach(t => {
                    if (saved.box1Costs[t]) {
                        Object.entries(saved.box1Costs[t]).forEach(([field, value]) => {
                            updateCost(t, field as any, value as number);
                        });
                    }
                });
            }

            if (saved.box1Filters) {
                Object.entries(saved.box1Filters).forEach(([k, v]) => setBox1Filter(k, v as string));
            }
            if (saved.box2Filters) {
                Object.entries(saved.box2Filters).forEach(([k, v]) => setBox2Filter(k, v as string));
            }
            
            if (saved.activeTab && saved.activeTab !== 'edu_hub') setActiveTab(saved.activeTab);
        } catch (e) { 
            console.error("Hydration failed", e);
            setBox1Data([]);
            setPmPlanData([]);
        }
    };
    hydrate();
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
        dbApi.saveSession({
            box1Data,
            pmPlanData,
            box1Costs,
            box1PmDuration,
            box1Filters,
            box2Filters,
            language,
            activeTab,
            activeBox1Id,
            activeBox2Id,
            timestamp: Date.now()
        });
    }, 1000);
    return () => clearTimeout(timeout);
  }, [box1Data, pmPlanData, box1Costs, box1PmDuration, box1Filters, box2Filters, language, activeTab, activeBox1Id, activeBox2Id]);

  const [enrichingField, setEnrichingField] = useState<string | null>(null);
  const [importState, setImportState] = useState<{ open: boolean, mode: ImportMode, headers: string[], rows: any[], name: string } | null>(null);

  const handleImportFile = async (file: File, targetBox: ImportMode) => {
      try {
        const { headers, rows } = await readExcelRaw(file);
        const name = file.name.replace(/\.[^/.]+$/, "");
        setImportState({ open: true, mode: targetBox, headers, rows, name });
      } catch (err) { alert("Error parsing Excel file."); }
  };

  const handleImportConfirm = async (mapping: FieldMapping[], dateFormat: 'auto' | 'dd/mm' | 'mm/dd') => {
      if (!importState) return;
      try {
          const processed = processMappedData(importState.rows, mapping, importState.mode, dateFormat);
          const finalName = importState.name || (importState.mode === 'box1' ? 'New Delay Dataset' : 'New PM Strategy');
          
          const newId = Date.now().toString();
          const storeName = importState.mode === 'box1' ? 'datasets' : 'pm_plans';
          
          await dbApi.save(storeName, {
              id: newId,
              name: finalName,
              date: new Date().toISOString(),
              records: processed
          });

          if (importState.mode === 'box1') {
              setBox1Data(processed as RawRecord[]);
              setActiveBox1Id(newId);
              setActiveTab('b1_data');
          } else {
              setPmPlanData(processed as PMRecord[]);
              setActiveBox2Id(newId);
              setActiveTab('b2_upload');
          }
      } catch (e) { 
        console.error(e);
        alert("Error processing mapping."); 
      } finally { 
        setImportState(null); 
      }
  };

  const handleEnrichAttribute = async (attribute: 'trade' | 'frequency' | 'taskType' | 'shutdownRequired') => {
      const targets = pmPlanData.filter(t => attribute === 'shutdownRequired' ? true : (!t[attribute] || t[attribute] === ''));
      if (targets.length === 0 && attribute !== 'shutdownRequired') {
          alert(`All tasks already have a assigned ${attribute}.`);
          return;
      }
      setLoadingAI(true);
      setEnrichingField(attribute);
      try {
          const predictions = await predictSpecificAttribute(targets, attribute, language);
          const updated = pmPlanData.map(task => {
              const val = predictions[task.id];
              if (val === undefined) return task;
              return { ...task, [attribute]: val };
          });
          setPmPlanData(updated);
      } catch (e) { alert("AI Enrichment Failed."); } finally { setLoadingAI(false); setEnrichingField(null); }
  };

  const handleExportExcel = () => {
    const wb = (window as any).XLSX.utils.book_new();
    if (activeTab.startsWith('b1') && box1Data.length > 0) {
        const ws = (window as any).XLSX.utils.json_to_sheet(box1Data);
        (window as any).XLSX.utils.book_append_sheet(wb, ws, "Raw Data");
        (window as any).XLSX.writeFile(wb, `Reliability_Data.xlsx`);
    } else if (activeTab.startsWith('b2') && pmPlanData.length > 0) {
        const ws = (window as any).XLSX.utils.json_to_sheet(pmPlanData);
        (window as any).XLSX.utils.book_append_sheet(wb, ws, "PM_Plan");
        (window as any).XLSX.writeFile(wb, `PM_Plan.xlsx`);
    } else { alert("No data available to export."); }
  };

  const NavButton = ({ tab, icon: Icon, label, colorClass }: any) => {
    const isActive = activeTab === tab;
    return (
        <button onClick={() => setActiveTab(tab)} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 text-xs font-black uppercase tracking-widest relative group ${isActive ? `${colorClass} text-white shadow-lg ring-1 ring-white/20` : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'}`}>
            <Icon size={18} className={isActive ? 'text-white' : 'text-slate-600 group-hover:text-slate-400'} />
            {label}
            {isActive && <div className="absolute left-[-1rem] top-1/2 -translate-y-1/2 w-1.5 h-6 bg-white rounded-r-full shadow-[0_0_15px_rgba(255,255,255,0.5)]"></div>}
        </button>
    );
  };

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 overflow-hidden">
      <aside className="w-72 bg-slate-950 text-slate-300 flex flex-col flex-shrink-0 shadow-2xl z-50">
        <div className="p-8 border-b border-slate-900">
          <div className="flex items-center gap-3">
             <div className="p-2.5 bg-indigo-600 rounded-2xl shadow-lg shadow-indigo-600/20 ring-1 ring-white/20">
                <ShieldCheck size={24} className="text-white fill-white" />
             </div>
             <h1 className="text-xl font-black text-white tracking-tighter">ReliabilityToolkit</h1>
          </div>
        </div>
        
        <nav className="flex-1 p-5 space-y-8 overflow-y-auto custom-scrollbar">
          <div className="space-y-2">
             <h3 className="text-[10px] font-black text-slate-600 uppercase tracking-[0.25em] mb-4 ml-2">Analytics</h3>
             <NavButton tab="b1_data" icon={Table} label="Data Grid" colorClass="bg-indigo-600" />
             <NavButton tab="b1_stats" icon={BarChart2} label="Reliability" colorClass="bg-indigo-600" />
             <NavButton tab="b1_rch" icon={Target} label="Root Cause" colorClass="bg-indigo-600" />
             <NavButton tab="b1_trends" icon={TrendingUp} label="Trends" colorClass="bg-indigo-600" />
          </div>
          <div className="space-y-2">
             <h3 className="text-[10px] font-black text-slate-600 uppercase tracking-[0.25em] mb-4 ml-2">Planning</h3>
             <NavButton tab="b2_upload" icon={UploadCloud} label="PM Repository" colorClass="bg-emerald-600" />
             <NavButton tab="b2_stats" icon={ShieldCheck} label="Strategy" colorClass="bg-emerald-600" />
             <NavButton tab="b2_opt" icon={Cpu} label="AI Compliance" colorClass="bg-emerald-600" />
             <NavButton tab="b2_cost" icon={Calculator} label="Cost Strategy" colorClass="bg-emerald-600" />
          </div>
        </nav>

        <div className="p-6 border-t border-slate-900 bg-slate-950/50 flex flex-col gap-3">
             <div className="mb-2">
                 <h3 className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-3 ml-1 flex items-center gap-2"><Globe size={12} /> AI Language</h3>
                 <select value={language} onChange={(e) => setLanguage(e.target.value as AppLanguage)} className="bg-slate-900 border border-slate-800 text-slate-300 text-[10px] font-black uppercase py-2.5 px-3 rounded-xl outline-none focus:ring-1 focus:ring-indigo-500 transition-all cursor-pointer w-full">
                    {['English', 'French', 'Spanish', 'German', 'Polish'].map(lang => <option key={lang} value={lang}>{lang}</option>)}
                 </select>
             </div>
             <div className="grid grid-cols-2 gap-2">
                 <button 
                    onClick={undo} 
                    disabled={history.past.length === 0}
                    className="bg-slate-900 hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-slate-900 text-slate-300 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 border border-slate-800 transition-all shadow-lg"
                    title="Undo (Ctrl+Z)"
                 >
                    <Undo2 size={16}/> Undo
                 </button>
                 <button 
                    onClick={redo} 
                    disabled={history.future.length === 0}
                    className="bg-slate-900 hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-slate-900 text-slate-300 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 border border-slate-800 transition-all shadow-lg"
                    title="Redo (Ctrl+Y)"
                 >
                    <Redo2 size={16}/> Redo
                 </button>
             </div>
             <button onClick={handleExportExcel} className="w-full bg-slate-900 hover:bg-slate-800 text-slate-300 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 border border-slate-800 transition-all shadow-lg">
                <FileSpreadsheet size={16} className="text-emerald-500" /> Export Bundle
             </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col h-screen overflow-hidden relative bg-slate-50">
        <header className="h-20 bg-white/80 backdrop-blur-md border-b border-slate-200 flex items-center justify-between px-10 shrink-0">
            <h2 className="text-xl font-black text-slate-900 tracking-tight uppercase tracking-widest">
                {activeTab === 'b1_data' ? 'Delay Intelligence' : activeTab === 'b1_stats' ? 'Reliability Analytics' : activeTab === 'b1_rch' ? 'Root Cause' : activeTab === 'b1_trends' ? 'Trends' : activeTab === 'b2_upload' ? 'PM Repository' : activeTab === 'b2_stats' ? 'Strategy' : activeTab === 'b2_opt' ? 'AI Compliance' : 'Finance'}
            </h2>
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 bg-slate-100 px-4 py-2 rounded-2xl border border-slate-200">
                    <Users className="text-slate-400" size={16} />
                    <span className="text-xs font-black text-slate-600 uppercase tracking-tighter">Pro Level</span>
                </div>
            </div>
        </header>

        <div className="flex-1 overflow-auto p-8 custom-scrollbar relative">
            {activeTab === 'b1_data' && (
                <div className="flex flex-col h-full gap-6">
                    <DatasetManager 
                        type="failure" 
                        currentData={box1Data} 
                        onLoad={setBox1Data} 
                        activeId={activeBox1Id} 
                        onActiveIdChange={setActiveBox1Id} 
                        onImport={(file) => handleImportFile(file, 'box1')} 
                    />
                    <div className="flex-1 min-h-0">
                        <DataGrid data={box1Data} setData={setBox1Data} loadingAI={loadingAI} setLoadingAI={setLoadingAI} filters={box1Filters} onGlobalFilterChange={(k, v) => setBox1Filter(k, v)} />
                    </div>
                </div>
            )}
            {activeTab === 'b1_stats' && <Dashboard box1Data={box1Data} box1Filters={box1Filters} setBox1Filter={(k,v) => setBox1Filter(k, v)} inputMode="timestamp" />}
            {activeTab === 'b1_rch' && <RootCauseHunter box1Data={box1Data} box1Filters={box1Filters} setBox1Filter={(k,v) => setBox1Filter(k, v)} />}
            {activeTab === 'b1_trends' && <TrendAnalysis box1Data={box1Data} selectedAsset={box1Filters.asset} onAssetChange={(val) => setBox1Filter('asset', val)} selectedFailureMode={box1Filters.failureMode} onFailureModeChange={(val) => setBox1Filter('failureMode', val)} />}
            
            {activeTab === 'b2_upload' && (
                <div className="flex flex-col h-full gap-6">
                    <div className="flex gap-4 items-center">
                        <div className="flex-1">
                            <DatasetManager 
                                type="pm" 
                                currentData={pmPlanData} 
                                onLoad={setPmPlanData} 
                                activeId={activeBox2Id} 
                                onActiveIdChange={setActiveBox2Id} 
                                onImport={(file) => handleImportFile(file, 'box2')} 
                            />
                        </div>
                        <button onClick={() => setIsGlossaryOpen(true)} className="flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-600 px-6 py-4 rounded-[1.25rem] text-[10px] font-black uppercase tracking-widest transition border border-slate-200 shadow-sm shrink-0">
                            <HelpCircle size={16} /> Strategy Glossary
                        </button>
                    </div>
                     <div className="flex-1 min-h-0">
                        <PMDataGrid 
                            data={pmPlanData} 
                            setData={setPmPlanData} 
                            enableCopy={true} 
                            loadingAI={loadingAI} 
                            enrichingField={enrichingField}
                            onEnrich={handleEnrichAttribute}
                            filters={box2Filters} 
                            onGlobalFilterChange={(k, v) => setBox2Filter(k, v)} 
                            savedPlans={[]} 
                        />
                    </div>
                </div>
            )}
            {activeTab === 'b2_stats' && <PMDashboard data={pmPlanData} filters={box2Filters} setFilter={(k, v) => setBox2Filter(k, v)} laborRate={box1Costs.preventive.labor} />}
            {activeTab === 'b2_opt' && <PMAuditPanel pmPlanData={pmPlanData} box1Data={box1Data} loadingAI={loadingAI} setLoadingAI={setLoadingAI} box2Filters={box2Filters} setFilter={(k, v) => setBox2Filter(k, v)} />}
            {activeTab === 'b2_cost' && <OptimizationPanel data={box1Data} filters={box1Filters} setBox1Filter={(k,v) => setBox1Filter(k, v)} costs={box1Costs} updateCost={updateCost} pmDuration={box1PmDuration} setPmDuration={setBox1PmDuration} loadingAI={loadingAI} setLoadingAI={setLoadingAI} inputMode="timestamp" />}
        </div>
        <AIWizard contextBox={activeTab.startsWith('b1') ? 'box1' : 'box2'} dataSummary={`Records: ${activeTab.includes('b1') ? box1Data.length : pmPlanData.length}`} />
        {importState && importState.open && <ImportWizard mode={importState.mode} rawHeaders={importState.headers} rawRows={importState.rows} onConfirm={handleImportConfirm} onCancel={() => setImportState(null)} />}
        
        {/* Glossary Modal */}
        {isGlossaryOpen && (
            <div className="fixed inset-0 bg-slate-950/80 z-[100] flex items-center justify-center p-4 backdrop-blur-md animate-in fade-in duration-200">
                <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden ring-1 ring-white/20">
                    <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-indigo-600 rounded-2xl shadow-lg shadow-indigo-600/20 text-white"><BookOpen size={24}/></div>
                            <div>
                                <h3 className="text-xl font-black text-slate-800 uppercase tracking-widest">Strategy Glossary</h3>
                            </div>
                        </div>
                        <button onClick={() => setIsGlossaryOpen(false)} className="text-slate-400 hover:text-slate-600 transition p-2 hover:bg-slate-100 rounded-full"><X size={28}/></button>
                    </div>
                    <div className="flex-1 overflow-auto p-8 custom-scrollbar space-y-10 bg-white">
                        <section>
                            <h4 className="text-xs font-black text-indigo-600 uppercase tracking-[0.2em] mb-6 flex items-center gap-2 border-b border-indigo-100 pb-2"><ShieldCheck size={16}/> Methodology</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {[
                                    { title: 'Time Based (PM)', desc: 'Maintenance at fixed intervals. Best for predictable wear.', color: 'bg-blue-50 text-blue-700' },
                                    { title: 'Condition Based (PdM)', desc: 'Triggered by health indicators. Only fixed when needed.', color: 'bg-emerald-50 text-emerald-700' },
                                    { title: 'Scheduled Restoration', desc: 'Overhaul to return asset to "as-new" condition.', color: 'bg-purple-50 text-purple-700' },
                                    { title: 'Scheduled Replacement', desc: 'Replacement before chance of failure.', color: 'bg-amber-50 text-amber-700' },
                                    { title: 'Failure Finding', desc: 'Checking hidden safety functions (valves, etc).', color: 'bg-rose-50 text-rose-700' }
                                ].map((item, idx) => (
                                    <div key={idx} className={`p-5 rounded-2xl border ${item.color} flex flex-col gap-1 shadow-sm`}>
                                        <h5 className="font-black text-[11px] uppercase">{item.title}</h5>
                                        <p className="text-xs font-medium opacity-80">{item.desc}</p>
                                    </div>
                                ))}
                            </div>
                        </section>
                    </div>
                    <div className="p-8 border-t bg-slate-50/50 flex justify-end shrink-0">
                        <button onClick={() => setIsGlossaryOpen(false)} className="px-10 py-3 rounded-2xl bg-slate-900 text-white font-black text-[10px] uppercase tracking-[0.2em] shadow-xl hover:bg-slate-800 transition-all active:scale-95 border border-white/10">Close</button>
                    </div>
                </div>
            </div>
        )}
      </main>
    </div>
  );
};

export default App;
