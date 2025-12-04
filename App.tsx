
import React, { useState, useMemo, useEffect } from 'react';
import { RawRecord, MaintenanceCost, InputMode, PMRecord, SavedDataset } from './types';
import DataGrid from './components/DataGrid';
import PMDataGrid from './components/PMDataGrid';
import Dashboard from './components/Dashboard';
import PMDashboard from './components/PMDashboard';
import OptimizationPanel from './components/OptimizationPanel';
import PMAuditPanel from './components/PMAuditPanel';
import TrendAnalysis from './components/TrendAnalysis';
import AIWizard from './components/AIWizard';
import RCMGenerator from './components/RCMGenerator';
import { parseExcelFile, parsePMExcel, calculateMetrics, calculateTimeBetweenFailures, calculateWeibull } from './utils/reliabilityMath';
import { classifyFailureModes, predictTaskMetadata } from './services/geminiService';
import { UploadCloud, BarChart2, Table, Settings, Cpu, Loader2, FileSpreadsheet, Presentation, Upload, PlusSquare, DollarSign, TrendingUp, Save, FolderOpen, Trash2, Sparkles, Hammer, BookOpen, AppWindow } from 'lucide-react';

const App: React.FC = () => {
  // Navigation State
  const [activeTab, setActiveTab] = useState<string>('b1_data');

  // --- BOX 1 STATE: Delay Record Reliability Analysis ---
  const [box1Data, setBox1Data] = useState<RawRecord[]>([]);
  const [box1Filters, setBox1Filters] = useState({ asset: 'All', failureMode: 'All' });
  const [savedDatasets, setSavedDatasets] = useState<SavedDataset[]>([]);
  const [box1Costs, setBox1Costs] = useState<MaintenanceCost>({ 
      preventive: { material: 50, labor: 25, productionLoss: 100 }, 
      corrective: { material: 200, labor: 40, productionLoss: 100 } 
  });
  const [box1PmDuration, setBox1PmDuration] = useState<number>(2);
  const [box1AiAdvice, setBox1AiAdvice] = useState<string>('');
  const [box1OptimalPM, setBox1OptimalPM] = useState<number | null>(null);
  
  // --- BOX 2 STATE: PM Plan Review (Upload & Analyze) ---
  const [pmPlanData, setPmPlanData] = useState<PMRecord[]>([]);
  const [box2Filters, setBox2Filters] = useState({ asset: 'All', trade: 'All', frequency: 'All', executorType: 'All', criticality: 'All' });

  const [loadingAI, setLoadingAI] = useState(false);

  // --- Initialize Saved Datasets ---
  useEffect(() => {
      const stored = localStorage.getItem('reliability_datasets');
      if (stored) {
          try {
              setSavedDatasets(JSON.parse(stored));
          } catch (e) {
              console.error("Failed to parse saved datasets", e);
          }
      }
  }, []);

  // --- Handlers ---

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, targetBox: 'box1' | 'box2') => {
    if (e.target.files && e.target.files[0]) {
      try {
        if (targetBox === 'box1') {
            const records = await parseExcelFile(e.target.files[0]);
            setBox1Data(records);
            setActiveTab('b1_data');
        } else if (targetBox === 'box2') {
            const tasks = await parsePMExcel(e.target.files[0]);
            setPmPlanData(tasks);
            setActiveTab('b2_upload');
        }
      } catch (err) {
        alert("Error parsing Excel file. Ensure standard column headers.");
      }
    }
  };

  const handleSaveDataset = () => {
      if (box1Data.length === 0) {
          alert("No records to save. Please upload a file or add data first.");
          return;
      }
      
      const defaultName = `Dataset ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
      const name = prompt("Enter a name for this dataset:", defaultName);
      
      if (!name) return; // User cancelled
      
      try {
        const newDataset: SavedDataset = {
            id: Date.now().toString(),
            name,
            date: new Date().toISOString(),
            records: box1Data
        };
        
        const updated = [...savedDatasets, newDataset];
        
        // Attempt to save to localStorage first to catch quota errors
        localStorage.setItem('reliability_datasets', JSON.stringify(updated));
        
        // Only update state if localStorage write succeeded
        setSavedDatasets(updated);
        alert(`Dataset "${name}" saved successfully!`);
      } catch (e) {
          console.error("Storage Error:", e);
          alert("Failed to save dataset. Your browser's Local Storage might be full (Quota Exceeded). Try deleting old datasets to free up space.");
      }
  };

  const handleLoadDataset = (id: string) => {
      if (!id) return;
      const ds = savedDatasets.find(d => d.id === id);
      if (ds) {
          if (box1Data.length > 0 && !confirm(`Overwrite current data with "${ds.name}"? Unsaved changes will be lost.`)) return;
          setBox1Data(ds.records);
          alert(`Loaded: ${ds.name}`);
      }
  };

  const handleDeleteDataset = (id: string) => {
      const ds = savedDatasets.find(d => d.id === id);
      if (!ds) return;
      if (confirm(`Are you sure you want to delete "${ds.name}"? This cannot be undone.`)) {
          try {
            const updated = savedDatasets.filter(d => d.id !== id);
            localStorage.setItem('reliability_datasets', JSON.stringify(updated));
            setSavedDatasets(updated);
          } catch (e) {
            console.error("Delete failed", e);
            alert("Failed to update storage.");
          }
      }
  };

  const runAIClassificationBox1 = async () => {
    if (box1Data.length === 0) return;
    setLoadingAI(true);
    try {
      const modeMap = await classifyFailureModes(box1Data);
      const updatedData = box1Data.map(r => {
        const cleanDesc = r.description?.trim();
        const standardizedMode = modeMap.get(cleanDesc);
        return {
          ...r,
          failureMode: standardizedMode || r.failureMode || 'Uncategorized'
        };
      });
      setBox1Data(updatedData);
      alert(`Success! Standardized ${updatedData.length} records into ${new Set(updatedData.map(r => r.failureMode)).size} categories.`);
    } catch (e: any) {
      console.error(e);
      alert(`AI Classification failed: ${e.message || "Unknown error"}. Please check API Key and try again.`);
    } finally {
      setLoadingAI(false);
    }
  };

  const handleAutoAssignTrades = async () => {
      if (pmPlanData.length === 0) return;
      setLoadingAI(true);
      try {
          const predictedData = await predictTaskMetadata(pmPlanData);
          const updated = pmPlanData.map(task => {
              const meta = predictedData[task.id];
              if (meta) {
                  return { 
                      ...task, 
                      trade: meta.trade || task.trade,
                      taskType: (meta.taskType as any) || task.taskType
                  };
              }
              return task;
          });
          setPmPlanData(updated);
          alert("Success! Trades and Strategy types assigned.");
      } catch (e) {
          alert("Failed to auto-assign metadata.");
      } finally {
          setLoadingAI(false);
      }
  };

  const updateCost = (type: 'preventive' | 'corrective', field: keyof MaintenanceCost['preventive'], value: number) => {
      setBox1Costs(prev => ({ ...prev, [type]: { ...prev[type], [field]: value } }));
  };

  const handleExportExcel = () => {
    const wb = (window as any).XLSX.utils.book_new();
    
    if (activeTab.startsWith('b1') && box1Data.length > 0) {
        const metrics = calculateMetrics(box1Data, 'timestamp');
        const tbf = calculateTimeBetweenFailures(box1Data, 'timestamp');
        const weibull = calculateWeibull(tbf);
        const ws1 = (window as any).XLSX.utils.json_to_sheet([{ Metric: "MTBF", Value: metrics.mtbf.toFixed(2) }, { Metric: "Beta", Value: weibull.beta.toFixed(3) }]);
        (window as any).XLSX.utils.book_append_sheet(wb, ws1, "Stats");
        (window as any).XLSX.writeFile(wb, `Reliability_Report.xlsx`);
    } else if (activeTab.startsWith('b2') && pmPlanData.length > 0) {
        const ws = (window as any).XLSX.utils.json_to_sheet(pmPlanData);
        (window as any).XLSX.utils.book_append_sheet(wb, ws, "PM_Plan_Review");
        (window as any).XLSX.writeFile(wb, `PM_Plan_Review.xlsx`);
    } else {
        alert("No data available to export for the active view.");
    }
  };

  const handleExportPPT = () => {
      // 1. Setup PPT
      const pptx = new (window as any).PptxGenJS();
      pptx.layout = 'LAYOUT_16x9';

      // Title Slide
      let slide = pptx.addSlide();
      slide.addText("Reliability & Maintenance Strategy Report", { x: 1, y: 1, fontSize: 24, bold: true, color: '363636' });
      slide.addText(`Generated: ${new Date().toLocaleDateString()}`, { x: 1, y: 1.5, fontSize: 14, color: '808080' });
      
      let context = 'Analysis';
      if(activeTab.startsWith('b1')) context = 'Delay Reliability';
      if(activeTab.startsWith('b2')) context = 'PM Review';

      slide.addText(`Context: ${context}`, { x: 1, y: 2, fontSize: 18, color: '4f46e5' });

      // If Box 1 Active -> Stats Charts
      if (activeTab.startsWith('b1') && box1Data.length > 0) {
          const metrics = calculateMetrics(box1Data, 'timestamp');
          const tbf = calculateTimeBetweenFailures(box1Data, 'timestamp');
          const weibull = calculateWeibull(tbf);
          
          let slide2 = pptx.addSlide();
          slide2.addText("Key Performance Indicators", { x: 0.5, y: 0.5, fontSize: 18, bold: true, color: '363636' });
          const kpiOpts = { x: 0.5, w: 2.5, h: 1.5, fill: 'f3f4f6', align: 'center', valign: 'middle' };
          slide2.addText(`MTBF: ${metrics.mtbf.toFixed(1)} hrs`, { ...kpiOpts, y: 1.5 });
          slide2.addText(`MTTR: ${metrics.mttr.toFixed(1)} hrs`, { ...kpiOpts, x: 3.5, y: 1.5 });
          slide2.addText(`Availability: ${metrics.availability.toFixed(1)}%`, { ...kpiOpts, x: 6.5, y: 1.5 });
          slide2.addText(`Beta (Shape): ${weibull.beta.toFixed(2)}`, { ...kpiOpts, x: 9.5, y: 1.5 });

          let slide3 = pptx.addSlide();
          slide3.addText("Top Failure Modes (Downtime)", { x: 0.5, y: 0.5, fontSize: 18, bold: true });
          const chartData = [];
          const modeMap = new Map();
          box1Data.forEach(r => {
              const m = r.failureMode || 'Uncategorized';
              modeMap.set(m, (modeMap.get(m) || 0) + r.durationMinutes);
          });
          Array.from(modeMap.entries()).sort((a,b) => b[1] - a[1]).slice(0, 10).forEach(([name, val]) => chartData.push({ name, value: val }));
          slide3.addChart(pptx.ChartType.bar, [{ name: "Downtime (Min)", labels: chartData.map(d => d.name), values: chartData.map(d => d.value) }], { x: 0.5, y: 1, w: 9, h: 4.5, showLegend: false, barDir: 'col', chartColors: ['4f46e5'] });
      } 
      else if (activeTab.startsWith('b2') && pmPlanData.length > 0) {
           let slide2 = pptx.addSlide();
           slide2.addText("Maintenance Plan Summary", { x: 0.5, y: 0.5, fontSize: 18, bold: true });
           slide2.addText(`Total Tasks: ${pmPlanData.length}`, { x: 1, y: 1.5, fontSize: 14 });
           const internal = pmPlanData.filter(t => t.executorType !== 'Contractor').length;
           const external = pmPlanData.length - internal;
           slide2.addChart(pptx.ChartType.pie, [{ name: "Executor Split", labels: ['Internal', 'Contractor'], values: [internal, external] }], { x: 1, y: 2, w: 5, h: 3 });
      }

      pptx.writeFile({ fileName: 'Reliability_Presentation.pptx' });
  };

  const getHeaderTitle = () => {
    switch(activeTab) {
        case 'b1_data': return 'Delay Record Management (Box 1)';
        case 'b1_stats': return 'Reliability Statistics (Box 1)';
        case 'b1_trends': return 'Reliability Growth & Trends (Box 1)';
        
        case 'b2_upload': return 'PM Plan Management (Box 2)';
        case 'b2_stats': return 'Workload & Strategy Analytics (Box 2)';
        case 'b2_opt': return 'AI Audit & Gap Analysis (Box 2)';
        case 'b2_cost_opt': return 'Maintenance Strategy Optimization By Cost (Box 2)';

        case 'b3_rcm': return 'RCM Generator (Box 3)';
        
        default: return 'Dashboard';
    }
  };

  const dataSummary = useMemo(() => {
    if (activeTab.startsWith('b1')) {
        const m = calculateMetrics(box1Data, 'timestamp');
        return `Records: ${box1Data.length}. MTBF: ${m.mtbf.toFixed(1)}h. MTTR: ${m.mttr.toFixed(1)}h.`;
    } else if (activeTab.startsWith('b2')) {
        return `Tasks: ${pmPlanData.length}.`;
    } else {
        return `Reliability App.`;
    }
  }, [box1Data, pmPlanData, activeTab]);

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900">
      {/* Sidebar */}
      <aside className="w-72 bg-slate-900 text-slate-300 flex flex-col flex-shrink-0">
        <div className="p-6 border-b border-slate-800">
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Cpu className="text-indigo-400" /> ReliabilityAI
          </h1>
          <p className="text-xs mt-2 text-slate-500">Asset Intelligence Platform</p>
        </div>
        
        <nav className="flex-1 p-4 space-y-6 overflow-y-auto custom-scrollbar">
          
          {/* BOX 1 */}
          <div className="border border-indigo-900/50 rounded-lg overflow-hidden">
             <div className="bg-slate-800 px-4 py-2 border-b border-indigo-900/50">
                 <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Delay record reliability analysis</h3>
             </div>
             <div className="p-2 space-y-1 bg-slate-800/30">
                <button onClick={() => setActiveTab('b1_data')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-md transition text-sm font-medium ${activeTab === 'b1_data' ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800'}`}>
                    <Table size={18} /> Delay record management
                </button>
                <button onClick={() => setActiveTab('b1_stats')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-md transition text-sm font-medium ${activeTab === 'b1_stats' ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800'}`}>
                    <BarChart2 size={18} /> Reliability statistics
                </button>
                <button onClick={() => setActiveTab('b1_trends')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-md transition text-sm font-medium ${activeTab === 'b1_trends' ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800'}`}>
                    <TrendingUp size={18} /> Trend Analysis
                </button>
             </div>
          </div>

          {/* BOX 2 */}
          <div className="border border-emerald-900/50 rounded-lg overflow-hidden">
             <div className="bg-slate-800 px-4 py-2 border-b border-emerald-900/50">
                 <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Preventive maintenance plan review</h3>
             </div>
             <div className="p-2 space-y-1 bg-slate-800/30">
                <button onClick={() => setActiveTab('b2_upload')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-md transition text-sm font-medium ${activeTab === 'b2_upload' ? 'bg-emerald-600 text-white' : 'hover:bg-slate-800'}`}>
                    <UploadCloud size={18} /> PM plan upload
                </button>
                <button onClick={() => setActiveTab('b2_stats')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-md transition text-sm font-medium ${activeTab === 'b2_stats' ? 'bg-emerald-600 text-white' : 'hover:bg-slate-800'}`}>
                    <BarChart2 size={18} /> Workload Analytics
                </button>
                <button onClick={() => setActiveTab('b2_opt')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-md transition text-sm font-medium ${activeTab === 'b2_opt' ? 'bg-emerald-600 text-white' : 'hover:bg-slate-800'}`}>
                    <Cpu size={18} /> AI Audit & Gap Analysis
                </button>
                <button onClick={() => setActiveTab('b2_cost_opt')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-md transition text-sm font-medium ${activeTab === 'b2_cost_opt' ? 'bg-emerald-600 text-white' : 'hover:bg-slate-800'}`}>
                    <DollarSign size={18} /> Maintenance strategy optimization by cost
                </button>
             </div>
          </div>

          {/* BOX 3 */}
          <div className="border border-purple-900/50 rounded-lg overflow-hidden">
             <div className="bg-slate-800 px-4 py-2 border-b border-purple-900/50">
                 <h3 className="text-xs font-bold text-purple-400 uppercase tracking-wider">Preventive Maintenance Plan Builder</h3>
             </div>
             <div className="p-2 space-y-1 bg-slate-800/30">
                 <button onClick={() => setActiveTab('b3_rcm')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-md transition text-sm font-medium ${activeTab === 'b3_rcm' ? 'bg-purple-600 text-white' : 'hover:bg-slate-800'}`}>
                    <Hammer size={18} /> RCM Generator
                </button>
             </div>
          </div>

        </nav>

        <div className="p-4 border-t border-slate-800 flex flex-col gap-3">
             <div className="grid grid-cols-2 gap-2">
                 <button onClick={handleExportExcel} className="bg-emerald-600 hover:bg-emerald-700 text-white py-2 px-2 rounded-md text-xs font-medium flex justify-center gap-1 shadow-lg">
                    <FileSpreadsheet size={16} /> Excel
                 </button>
                 <button onClick={handleExportPPT} className="bg-orange-600 hover:bg-orange-700 text-white py-2 px-2 rounded-md text-xs font-medium flex justify-center gap-1 shadow-lg">
                    <Presentation size={16} /> PPT
                 </button>
             </div>
             <div className="bg-slate-800 rounded p-3 text-xs text-center">
                API Key: <span className={process.env.API_KEY ? "text-green-400 font-bold" : "text-red-400 font-bold"}>{process.env.API_KEY ? "CONNECTED" : "MISSING"}</span>
             </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden relative">
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-8">
            <h2 className="text-xl font-semibold text-gray-800 capitalize">{getHeaderTitle()}</h2>
            <div className="flex items-center gap-4">
                {activeTab.startsWith('b1') && (
                    <label className="flex items-center gap-2 px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded cursor-pointer transition text-sm font-medium border border-indigo-200">
                        <Upload size={18} /> <span>Upload Delay Records</span>
                        <input type="file" accept=".xlsx, .xls" className="hidden" onChange={(e) => handleFileUpload(e, 'box1')} />
                    </label>
                )}
                {activeTab.startsWith('b2') && (
                    <label className="flex items-center gap-2 px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded cursor-pointer transition text-sm font-medium border border-emerald-200">
                        <Upload size={18} /> <span>Upload PM Plan</span>
                        <input type="file" accept=".xlsx, .xls" className="hidden" onChange={(e) => handleFileUpload(e, 'box2')} />
                    </label>
                )}
            </div>
        </header>

        <div className="flex-1 overflow-auto p-8 custom-scrollbar">
            
            {/* --- BOX 1 CONTENT --- */}
            {activeTab === 'b1_data' && (
                <div className="flex flex-col h-full gap-4">
                     <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm flex items-center gap-4">
                        <h4 className="text-sm font-bold text-gray-700 flex items-center gap-2">
                            <FolderOpen size={18} className="text-indigo-600"/> Dataset Manager
                        </h4>
                        <div className="h-6 w-px bg-gray-300 mx-2"></div>
                        <select 
                            className="bg-gray-50 border border-gray-300 text-gray-900 text-xs rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-2 w-64"
                            onChange={(e) => handleLoadDataset(e.target.value)}
                            value=""
                        >
                            <option value="">-- Load Saved Dataset --</option>
                            {savedDatasets.map(d => (
                                <option key={d.id} value={d.id}>{d.name} ({new Date(d.date).toLocaleDateString()})</option>
                            ))}
                        </select>
                         <button onClick={handleSaveDataset} className="flex items-center gap-1 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-3 py-1.5 rounded text-xs font-medium transition">
                            <Save size={14} /> Save Current
                        </button>
                         {savedDatasets.length > 0 && (
                             <button onClick={() => {
                                 const idToDelete = prompt("Enter the Exact Name of the dataset to delete:\n" + savedDatasets.map(d => d.name).join('\n'));
                                 const ds = savedDatasets.find(d => d.name === idToDelete);
                                 if(ds) handleDeleteDataset(ds.id);
                             }} className="text-gray-400 hover:text-red-500 ml-auto" title="Delete a Dataset">
                                <Trash2 size={16} />
                            </button>
                         )}
                     </div>

                    <div className="flex-1 min-h-0">
                        <DataGrid 
                            data={box1Data} 
                            onUpdate={setBox1Data} 
                            title="Delay Records"
                            externalAssetFilter={box1Filters.asset}
                            externalModeFilter={box1Filters.failureMode}
                            onGlobalFilterChange={(key, val) => setBox1Filters(prev => ({ ...prev, [key]: val }))}
                        />
                    </div>
                    <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm flex justify-between items-center">
                        <div>
                            <p className="text-sm font-semibold text-gray-800">AI Assistance</p>
                            <p className="text-xs text-gray-500">Use AI to standardize failure modes from raw descriptions.</p>
                        </div>
                        <button 
                            onClick={runAIClassificationBox1}
                            disabled={loadingAI || box1Data.length === 0}
                            className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded flex items-center gap-2 disabled:opacity-50 transition text-sm font-medium"
                        >
                            {loadingAI ? <Loader2 className="animate-spin" /> : <Sparkles size={16} />} 
                            Check All Failure Modes with AI
                        </button>
                    </div>
                </div>
            )}
            
            {activeTab === 'b1_stats' && (
                <div className="h-full">
                    <Dashboard 
                        data={box1Data} 
                        inputMode="timestamp"
                        selectedAsset={box1Filters.asset}
                        onAssetChange={(val) => setBox1Filters(prev => ({...prev, asset: val}))}
                        selectedMode={box1Filters.failureMode}
                        onModeChange={(val) => setBox1Filters(prev => ({...prev, failureMode: val}))}
                    />
                </div>
            )}

            {activeTab === 'b1_trends' && (
                <div className="h-full">
                    <TrendAnalysis 
                        data={box1Data}
                        selectedAsset={box1Filters.asset}
                    />
                </div>
            )}

            {/* --- BOX 2 CONTENT --- */}
            {activeTab === 'b2_upload' && (
                <div className="flex flex-col h-full gap-4">
                     <div className="flex-1 min-h-0">
                        <PMDataGrid 
                            data={pmPlanData} 
                            onUpdate={setPmPlanData} 
                            title="Preventive Maintenance Plan"
                            onAutoAssignTrades={handleAutoAssignTrades}
                            loadingAI={loadingAI}
                            enableCopy={true}
                            externalAssetFilter={box2Filters.asset}
                            externalTradeFilter={box2Filters.trade}
                            externalFreqFilter={box2Filters.frequency}
                            externalTypeFilter={box2Filters.executorType}
                            externalCriticalityFilter={box2Filters.criticality}
                            onGlobalFilterChange={(key, val) => setBox2Filters(prev => ({ ...prev, [key]: val }))}
                        />
                    </div>
                </div>
            )}

            {activeTab === 'b2_stats' && (
                <div className="h-full">
                    <PMDashboard 
                        data={pmPlanData}
                        selectedAsset={box2Filters.asset}
                        onAssetChange={(val) => setBox2Filters(prev => ({...prev, asset: val}))}
                        selectedTrade={box2Filters.trade}
                        onTradeChange={(val) => setBox2Filters(prev => ({...prev, trade: val}))}
                        selectedFreq={box2Filters.frequency}
                        onFreqChange={(val) => setBox2Filters(prev => ({...prev, frequency: val}))}
                        selectedType={box2Filters.executorType}
                        onTypeChange={(val) => setBox2Filters(prev => ({...prev, executorType: val}))}
                        selectedCriticality={box2Filters.criticality}
                        onCriticalityChange={(val) => setBox2Filters(prev => ({...prev, criticality: val}))}
                    />
                </div>
            )}

            {activeTab === 'b2_opt' && (
                <div className="h-full">
                    <PMAuditPanel 
                        pmData={pmPlanData}
                        failureData={box1Data}
                        loadingAI={loadingAI}
                        setLoadingAI={setLoadingAI}
                        selectedAsset={box2Filters.asset}
                    />
                </div>
            )}

            {activeTab === 'b2_cost_opt' && (
                 <div className="h-full overflow-hidden">
                    <OptimizationPanel 
                        data={box1Data}
                        inputMode="timestamp"
                        costs={box1Costs}
                        updateCost={updateCost}
                        pmDuration={box1PmDuration}
                        setPmDuration={setBox1PmDuration}
                        optimalPM={box1OptimalPM}
                        setOptimalPM={setBox1OptimalPM}
                        aiAdvice={box1AiAdvice}
                        setAiAdvice={setBox1AiAdvice}
                        loadingAI={loadingAI}
                        setLoadingAI={setLoadingAI}
                        selectedAsset={box1Filters.asset}
                        selectedMode={box1Filters.failureMode}
                    />
                </div>
            )}

            {/* --- BOX 3 CONTENT --- */}
            {activeTab === 'b3_rcm' && (
                <div className="h-full">
                    <RCMGenerator />
                </div>
            )}

        </div>
        
        {/* Floating AI Wizard */}
        <AIWizard contextBox={activeTab.startsWith('b1') ? 'box1' : 'box2'} dataSummary={dataSummary} />

      </main>
    </div>
  );
};

export default App;
