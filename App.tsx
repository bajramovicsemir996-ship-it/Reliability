import React, { useState, useEffect } from 'react';
import { readExcelRaw, processMappedData } from './utils/reliabilityMath';
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
import { 
  UploadCloud, BarChart2, Table, Cpu, FileSpreadsheet, Target, 
  TrendingUp, Calculator, ShieldCheck, Zap, Users, FileUp, 
  Database, HelpCircle, X, Info, ZapOff, Play, BookOpen, Globe
} from 'lucide-react';
import { RawRecord, PMRecord, MaintenanceCost, ImportMode, FieldMapping, AppLanguage } from './types';
import { useAppStore } from './store';
import { dbApi } from './utils/db';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>('b1_data');
  const [isGlossaryOpen, setIsGlossaryOpen] = useState(false);

  // --- STORE STATE ---
  const { 
    box1Data, setBox1Data, 
    box1Filters, setBox1Filter, 
    box1Costs, updateCost, 
    box1PmDuration, setBox1PmDuration,
    pmPlanData, setPmPlanData,
    box2Filters, setBox2Filter,
    loadingAI, setLoadingAI,
    language, setLanguage
  } = useAppStore();

  // --- PERSISTENCE LOGIC ---
  
  // 1. Hydrate state from DB on mount
  useEffect(() => {
    const hydrate = async () => {
        try {
            const saved = await dbApi.getSession();
            if (saved) {
                if (saved.box1Data) setBox1Data(saved.box1Data);
                if (saved.pmPlanData) setPmPlanData(saved.pmPlanData);
                if (saved.box1PmDuration) setBox1PmDuration(saved.box1PmDuration);
                if (saved.language) setLanguage(saved.language);
                
                // Hydrate Costs
                if (saved.box1Costs) {
                    const types: ('preventive' | 'corrective')[] = ['preventive', 'corrective'];
                    types.forEach(t => {
                        Object.entries(saved.box1Costs[t]).forEach(([field, value]) => {
                            updateCost(t, field as any, value as number);
                        });
                    });
                }

                // Hydrate Filters
                if (saved.box1Filters) {
                    Object.entries(saved.box1Filters).forEach(([k, v]) => setBox1Filter(k, v as string));
                }
                if (saved.box2Filters) {
                    Object.entries(saved.box2Filters).forEach(([k, v]) => setBox2Filter(k, v as string));
                }
                
                if (saved.activeTab && saved.activeTab !== 'edu_hub') setActiveTab(saved.activeTab);
            }
        } catch (e) {
            console.error("Hydration failed", e);
        }
    };
    hydrate();
  }, []);

  // 2. Auto-save state on changes (debounced)
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
            timestamp: Date.now()
        });
    }, 1000);
    return () => clearTimeout(timeout);
  }, [box1Data, pmPlanData, box1Costs, box1PmDuration, box1Filters, box2Filters, language, activeTab]);


  // --- LOCAL UI STATE ---
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
          
          if (importState.mode === 'box1') {
              setBox1Data(processed as RawRecord[]);
              setActiveTab('b1_data');
          } else {
              setPmPlanData(processed as PMRecord[]);
              setActiveTab('b2_upload');
          }
      } catch (e) { alert("Error processing mapping."); } finally { setImportState(null); }
  };

  const handleEnrichAttribute = async (attribute: 'trade' | 'frequency' | 'taskType' | 'shutdownRequired') => {
      const targets = pmPlanData.filter(t => {
          if (attribute === 'shutdownRequired') return true; // AI state review for all
          return !t[attribute] || t[attribute] === '';
      });

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

  const getHeaderTitle = () => {
    switch(activeTab) {
        case 'b1_data': return 'Delay Intelligence';
        case 'b1_stats': return 'Reliability Analytics';
        case 'b1_rch': return 'Root Cause Analysis';
        case 'b1_trends': return 'Trend Evolution';
        case 'b2_upload': return 'Plan Repository';
        case 'b2_stats': return 'Strategy Insights';
        case 'b2_opt': return 'AI Compliance & Gaps';
        case 'b2_cost': return 'Financial Optimizer';
        default: return 'Control Center';
    }
  };

  const NavButton = ({ tab, icon: Icon, label, colorClass }: any) => {
    const isActive = activeTab === tab;
    return (
        <button 
            onClick={() => setActiveTab(tab)} 
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 text-xs font-black uppercase tracking-widest relative group ${
                isActive 
                ? `${colorClass} text-white shadow-lg ring-1 ring-white/20` 
                : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'
            }`}
        >
            <Icon size={18} className={isActive ? 'text-white' : 'text-slate-600 group-hover:text-slate-400'} />
            {label}
            {isActive && <div className="absolute left-[-1rem] top-1/2 -translate-y-1/2 w-1.5 h-6 bg-white rounded-r-full shadow-[0_0_15px_rgba(255,255,255,0.5)]"></div>}
        </button>
    );
  };

  const languages: AppLanguage[] = ['English', 'French', 'Spanish', 'German', 'Polish'];

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
                 <h3 className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-3 ml-1 flex items-center gap-2">
                     <Globe size={12} /> AI Response Language
                 </h3>
                 <div className="grid grid-cols-1 gap-1">
                     <select 
                        value={language} 
                        onChange={(e) => setLanguage(e.target.value as AppLanguage)}
                        className="bg-slate-900 border border-slate-800 text-slate-300 text-[10px] font-black uppercase py-2.5 px-3 rounded-xl outline-none focus:ring-1 focus:ring-indigo-500 transition-all cursor-pointer"
                     >
                        {languages.map(lang => <option key={lang} value={lang}>{lang}</option>)}
                     </select>
                 </div>
             </div>
             <button onClick={handleExportExcel} className="w-full bg-slate-900 hover:bg-slate-800 text-slate-300 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 border border-slate-800 transition-all shadow-lg">
                <FileSpreadsheet size={16} className="text-emerald-500" /> Export Bundle
             </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col h-screen overflow-hidden relative bg-slate-50">
        <header className="h-20 bg-white/80 backdrop-blur-md border-b border-slate-200 flex items-center justify-between px-10 shrink-0">
            <h2 className="text-xl font-black text-slate-900 tracking-tight uppercase tracking-widest">{getHeaderTitle()}</h2>
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
                    <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between ring-1 ring-slate-900/5">
                        <div className="flex items-center gap-3 px-3">
                            <FileUp size={18} className="text-indigo-500"/>
                            <div>
                                <p className="text-[9px] text-slate-400 font-black uppercase tracking-tighter">Delay Source</p>
                                <p className="text-[11px] font-black text-slate-700">
                                    {box1Data.length > 0 ? `Active: ${box1Data.length} records` : 'Ready for import'}
                                </p>
                            </div>
                        </div>
                        <label className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition shadow-lg cursor-pointer">
                            <UploadCloud size={16} /> Import Delay Logs
                            <input type="file" accept=".xlsx, .xls" className="hidden" onChange={(e) => e.target.files?.[0] && handleImportFile(e.target.files[0], 'box1')} />
                        </label>
                    </div>
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
                    <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between ring-1 ring-slate-900/5">
                        <div className="flex items-center gap-3 px-3">
                            <ShieldCheck size={18} className="text-emerald-500"/>
                            <div>
                                <p className="text-[9px] text-slate-400 font-black uppercase tracking-tighter">PM Strategy</p>
                                <p className="text-[11px] font-black text-slate-700">
                                    {pmPlanData.length > 0 ? `Plan: ${pmPlanData.length} tasks` : 'Load maintenance schedule'}
                                </p>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button 
                                onClick={() => setIsGlossaryOpen(true)}
                                className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-600 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition border border-slate-200"
                            >
                                <HelpCircle size={16} /> Strategy Glossary
                            </button>
                            <label className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition shadow-lg cursor-pointer">
                                <UploadCloud size={16} /> Import PM Strategy
                                <input type="file" accept=".xlsx, .xls" className="hidden" onChange={(e) => e.target.files?.[0] && handleImportFile(e.target.files[0], 'box2')} />
                            </label>
                        </div>
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
        
        {/* Strategy Glossary Modal */}
        {isGlossaryOpen && (
            <div className="fixed inset-0 bg-slate-950/80 z-[100] flex items-center justify-center p-4 backdrop-blur-md animate-in fade-in duration-200">
                <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden ring-1 ring-white/20">
                    <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-indigo-600 rounded-2xl shadow-lg shadow-indigo-600/20 text-white"><BookOpen size={24}/></div>
                            <div>
                                <h3 className="text-xl font-black text-slate-800 uppercase tracking-widest">Strategy & State Glossary</h3>
                                <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">Understanding RCM Strategy Classifications</p>
                            </div>
                        </div>
                        <button onClick={() => setIsGlossaryOpen(false)} className="text-slate-400 hover:text-slate-600 transition p-2 hover:bg-slate-100 rounded-full"><X size={28}/></button>
                    </div>

                    <div className="flex-1 overflow-auto p-8 custom-scrollbar space-y-10 bg-white">
                        <section>
                            <h4 className="text-xs font-black text-indigo-600 uppercase tracking-[0.2em] mb-6 flex items-center gap-2 border-b border-indigo-100 pb-2">
                                <ShieldCheck size={16}/> Maintenance Strategy Types
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {[
                                    { title: 'Time Based (PM)', desc: 'Maintenance performed at fixed intervals (e.g., Monthly). Best for parts with predictable wear patterns.', color: 'bg-blue-50 text-blue-700 border-blue-100' },
                                    { title: 'Condition Based (PdM)', desc: 'Triggered by health indicators (vibration, heat). Only performed when failure is imminent.', color: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
                                    { title: 'Scheduled Restoration', desc: 'Shop-level overhaul to return asset to "as-new" condition at fixed intervals.', color: 'bg-purple-50 text-purple-700 border-purple-100' },
                                    { title: 'Scheduled Replacement', desc: 'Removing an item and replacing with new before it has a chance to fail.', color: 'bg-amber-50 text-amber-700 border-amber-100' },
                                    { title: 'Failure Finding', desc: 'Functional tests to check if hidden safety functions (valves, alarms) still work.', color: 'bg-rose-50 text-rose-700 border-rose-100' }
                                ].map((item, idx) => (
                                    <div key={idx} className={`p-5 rounded-2xl border ${item.color} flex flex-col gap-1 shadow-sm`}>
                                        <h5 className="font-black text-[11px] uppercase tracking-wider">{item.title}</h5>
                                        <p className="text-xs font-medium opacity-80 leading-relaxed">{item.desc}</p>
                                    </div>
                                ))}
                            </div>
                        </section>

                        <section>
                            <h4 className="text-xs font-black text-slate-500 uppercase tracking-[0.2em] mb-6 flex items-center gap-2 border-b border-indigo-100 pb-2">
                                <Zap size={16}/> Operational State
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="p-6 rounded-[2rem] bg-slate-50 border border-slate-200 flex flex-col items-center text-center shadow-sm">
                                    <div className="p-3 bg-rose-50 rounded-2xl text-rose-600 mb-4 border border-rose-100 shadow-inner"><ZapOff size={24}/></div>
                                    <h5 className="font-black text-slate-800 text-xs uppercase tracking-widest mb-2">Shutdown Required</h5>
                                    <p className="text-xs text-slate-500 font-medium leading-relaxed">
                                        Asset must be fully stopped and isolated. This adds to "Planned Downtime" and impacts production capacity.
                                    </p>
                                </div>
                                <div className="p-6 rounded-[2rem] bg-slate-50 border border-slate-200 flex flex-col items-center text-center shadow-sm">
                                    <div className="p-3 bg-emerald-50 rounded-2xl text-emerald-600 mb-4 border border-emerald-100 shadow-inner"><Play size={24}/></div>
                                    <h5 className="font-black text-slate-800 text-xs uppercase tracking-widest mb-2">Running Maintenance</h5>
                                    <p className="text-xs text-slate-500 font-medium leading-relaxed">
                                        Maintenance is performed while the asset is online. Zero production loss. Ideal for condition monitoring.
                                    </p>
                                </div>
                            </div>
                        </section>
                    </div>

                    <div className="p-8 border-t bg-slate-50/50 flex justify-end shrink-0">
                        <button 
                            onClick={() => setIsGlossaryOpen(false)}
                            className="px-10 py-3 rounded-2xl bg-slate-900 text-white font-black text-[10px] uppercase tracking-[0.2em] shadow-xl hover:bg-slate-800 transition-all active:scale-95 border border-white/10"
                        >
                            Close Glossary
                        </button>
                    </div>
                </div>
            </div>
        )}
      </main>
    </div>
  );
};

export default App;
