
import React, { useState, useEffect } from 'react';
import { AssetStrategyInput, PMRecord, RawRecord, SavedPlan } from '../types';
import PMDataGrid from './PMDataGrid';
import PMScheduler from './PMScheduler';
import { generateCorePlan } from '../services/geminiService';
import { Hammer, BrainCircuit, Loader2, Wand2, Calendar, List, Save, FolderOpen, Trash2, PlusCircle } from 'lucide-react';

interface PMPlanBuilderProps {
  initialData: PMRecord[];
  onUpdate: (data: PMRecord[]) => void;
  failureData: RawRecord[]; // From Box 1
  currentPMs: PMRecord[];   // From Box 2 or Box 3 Base Upload
  loadingAI: boolean;
  setLoadingAI: (v: boolean) => void;
  onAutoAssignTrades: () => void;
}

const PMPlanBuilder: React.FC<PMPlanBuilderProps> = ({ 
    initialData, 
    onUpdate, 
    failureData, 
    currentPMs, 
    loadingAI, 
    setLoadingAI,
    onAutoAssignTrades 
}) => {
  // Strategy Inputs
  const [strategy, setStrategy] = useState<AssetStrategyInput>({
    assetName: '',
    criticality: 'High',
    operationalContext: '',
    oemRecommendations: '',
    resourceCount: 2,
    includeFailures: true,
    includeCurrentPMs: false
  });

  const [activeTab, setActiveTab] = useState<'define' | 'schedule'>('define');
  const [savedPlans, setSavedPlans] = useState<SavedPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');

  // Load plans from local storage on mount
  useEffect(() => {
    const stored = localStorage.getItem('reliability_app_saved_plans');
    if (stored) {
        try {
            setSavedPlans(JSON.parse(stored));
        } catch (e) {
            console.error("Failed to load saved plans");
        }
    }
  }, []);

  const handleGenerate = async () => {
    if (!strategy.assetName) return alert("Please enter an Asset Name first.");
    setLoadingAI(true);
    try {
        const newPlan = await generateCorePlan(strategy, failureData, currentPMs);
        onUpdate([...initialData, ...newPlan]);
        setActiveTab('define'); // Switch to view result
    } catch (e) {
        alert("Failed to generate plan.");
    } finally {
        setLoadingAI(false);
    }
  };

  const handleSavePlan = () => {
    if (!strategy.assetName) return alert("Enter Asset Name to save.");
    
    const newPlan: SavedPlan = {
        id: selectedPlanId || `plan-${Date.now()}`,
        lastModified: new Date().toISOString(),
        strategy: strategy,
        tasks: initialData
    };

    let updatedPlans;
    if (selectedPlanId) {
        // Update existing
        updatedPlans = savedPlans.map(p => p.id === selectedPlanId ? newPlan : p);
    } else {
        // Create new
        updatedPlans = [...savedPlans, newPlan];
        setSelectedPlanId(newPlan.id);
    }

    setSavedPlans(updatedPlans);
    localStorage.setItem('reliability_app_saved_plans', JSON.stringify(updatedPlans));
    alert(`Saved progress for ${strategy.assetName}`);
  };

  const handleLoadPlan = (planId: string) => {
    if (!planId) {
        setSelectedPlanId('');
        handleNewPlan();
        return;
    }
    const plan = savedPlans.find(p => p.id === planId);
    if (plan) {
        setStrategy(plan.strategy);
        onUpdate(plan.tasks);
        setSelectedPlanId(plan.id);
    }
  };

  const handleNewPlan = () => {
      setSelectedPlanId('');
      setStrategy({
        assetName: '',
        criticality: 'High',
        operationalContext: '',
        oemRecommendations: '',
        resourceCount: 2,
        includeFailures: true,
        includeCurrentPMs: false
      });
      onUpdate([]);
  };

  const handleDeletePlan = () => {
      if (!selectedPlanId) return;
      if (confirm('Are you sure you want to delete this saved plan?')) {
          const updated = savedPlans.filter(p => p.id !== selectedPlanId);
          setSavedPlans(updated);
          localStorage.setItem('reliability_app_saved_plans', JSON.stringify(updated));
          handleNewPlan();
      }
  };

  return (
    <div className="flex h-full gap-6">
        {/* LEFT PANEL: Strategy Definition */}
        <div className="w-1/3 bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col overflow-hidden">
            <div className="p-4 bg-purple-50 border-b border-purple-100">
                <h3 className="font-bold text-purple-900 flex items-center gap-2">
                    <BrainCircuit size={18}/> Asset Strategy Definition
                </h3>
                
                {/* Save/Load Controls */}
                <div className="mt-3 flex flex-col gap-2">
                    <select 
                        className="w-full text-xs border-purple-200 rounded focus:ring-purple-500 bg-white"
                        value={selectedPlanId}
                        onChange={(e) => handleLoadPlan(e.target.value)}
                    >
                        <option value="">-- Create New Strategy --</option>
                        {savedPlans.map(p => (
                            <option key={p.id} value={p.id}>{p.strategy.assetName} ({new Date(p.lastModified).toLocaleDateString()})</option>
                        ))}
                    </select>
                    <div className="flex gap-2">
                        <button onClick={handleNewPlan} className="flex-1 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 py-1.5 px-2 rounded text-xs flex items-center justify-center gap-1 font-medium transition">
                            <PlusCircle size={14} /> New
                        </button>
                        <button onClick={handleSavePlan} className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-1.5 px-2 rounded text-xs flex items-center justify-center gap-1 font-medium transition">
                            <Save size={14} /> Save
                        </button>
                        {selectedPlanId && (
                            <button onClick={handleDeletePlan} className="bg-white border border-red-200 hover:bg-red-50 text-red-600 py-1.5 px-2 rounded text-xs transition">
                                <Trash2 size={14} />
                            </button>
                        )}
                    </div>
                </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-5 space-y-5 custom-scrollbar">
                
                {/* 1. Asset Profile */}
                <div className="space-y-3">
                    <label className="block text-sm font-semibold text-gray-700">Asset Name</label>
                    <input 
                        type="text" 
                        placeholder="e.g. Main Conveyor CV-101"
                        className="w-full border-gray-300 rounded-lg focus:ring-purple-500 focus:border-purple-500 text-sm"
                        value={strategy.assetName}
                        onChange={e => setStrategy({...strategy, assetName: e.target.value})}
                    />
                    
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 mb-1">Criticality</label>
                            <select 
                                className="w-full border-gray-300 rounded-lg focus:ring-purple-500 focus:border-purple-500 text-sm"
                                value={strategy.criticality}
                                onChange={e => setStrategy({...strategy, criticality: e.target.value as any})}
                            >
                                <option value="High">High (A)</option>
                                <option value="Medium">Medium (B)</option>
                                <option value="Low">Low (C)</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 mb-1">Techs Available</label>
                            <input 
                                type="number" 
                                className="w-full border-gray-300 rounded-lg focus:ring-purple-500 focus:border-purple-500 text-sm"
                                value={strategy.resourceCount}
                                onChange={e => setStrategy({...strategy, resourceCount: parseInt(e.target.value)})}
                                min={1}
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Operational Context</label>
                        <textarea 
                            rows={3}
                            placeholder="Describe environment (e.g. High heat, dust, 24/7 operation...)"
                            className="w-full border-gray-300 rounded-lg focus:ring-purple-500 focus:border-purple-500 text-sm resize-none"
                            value={strategy.operationalContext}
                            onChange={e => setStrategy({...strategy, operationalContext: e.target.value})}
                        />
                    </div>
                </div>

                <hr className="border-gray-100"/>

                {/* 2. Data Sources */}
                <div className="space-y-3">
                    <h4 className="text-sm font-semibold text-gray-700">Data Sources</h4>
                    
                    <div className="flex items-center justify-between bg-gray-50 p-3 rounded-lg border border-gray-200">
                         <div className="text-xs">
                             <span className="font-bold text-gray-700 block">Box 1: Failure History</span>
                             <span className="text-gray-500">{failureData.length} records available</span>
                         </div>
                         <input 
                            type="checkbox" 
                            className="rounded text-purple-600 focus:ring-purple-500 h-4 w-4"
                            checked={strategy.includeFailures}
                            onChange={e => setStrategy({...strategy, includeFailures: e.target.checked})}
                         />
                    </div>

                    <div className="flex items-center justify-between bg-gray-50 p-3 rounded-lg border border-gray-200">
                         <div className="text-xs">
                             <span className="font-bold text-gray-700 block">Current / Uploaded Plan</span>
                             <span className="text-gray-500">{currentPMs.length} tasks available</span>
                         </div>
                         <input 
                            type="checkbox" 
                            className="rounded text-purple-600 focus:ring-purple-500 h-4 w-4"
                            checked={strategy.includeCurrentPMs}
                            onChange={e => setStrategy({...strategy, includeCurrentPMs: e.target.checked})}
                         />
                    </div>
                </div>

                <hr className="border-gray-100"/>

                {/* 3. OEM Input */}
                <div>
                     <label className="block text-sm font-semibold text-gray-700 mb-1">OEM Recommendations / Manual Text</label>
                     <textarea 
                        rows={6}
                        placeholder="Paste manufacturer maintenance guidelines here..."
                        className="w-full border-gray-300 rounded-lg focus:ring-purple-500 focus:border-purple-500 text-xs resize-none font-mono text-gray-600"
                        value={strategy.oemRecommendations}
                        onChange={e => setStrategy({...strategy, oemRecommendations: e.target.value})}
                    />
                </div>

            </div>

            <div className="p-4 bg-gray-50 border-t border-gray-200">
                <button 
                    onClick={handleGenerate}
                    disabled={loadingAI}
                    className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 rounded-lg shadow-sm flex items-center justify-center gap-2 disabled:opacity-50 transition"
                >
                    {loadingAI ? <Loader2 className="animate-spin" /> : <Wand2 size={18} />} Generate Core Plan
                </button>
            </div>
        </div>

        {/* RIGHT PANEL: Result Grid & Scheduler */}
        <div className="w-2/3 flex flex-col h-full gap-4">
            
            {/* Tabs */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-1 flex">
                 <button 
                    onClick={() => setActiveTab('define')}
                    className={`flex-1 py-2 text-sm font-medium rounded-lg flex items-center justify-center gap-2 transition ${activeTab === 'define' ? 'bg-purple-100 text-purple-800' : 'text-gray-500 hover:text-gray-700'}`}
                 >
                     <List size={16} /> Task Definition
                 </button>
                 <button 
                    onClick={() => setActiveTab('schedule')}
                    className={`flex-1 py-2 text-sm font-medium rounded-lg flex items-center justify-center gap-2 transition ${activeTab === 'schedule' ? 'bg-blue-100 text-blue-800' : 'text-gray-500 hover:text-gray-700'}`}
                 >
                     <Calendar size={16} /> Planning & Scheduling
                 </button>
            </div>

            <div className="flex-1 min-h-0">
                {activeTab === 'define' ? (
                     <PMDataGrid 
                        title={`Core Plan: ${strategy.assetName || 'Draft'}`} 
                        data={initialData} 
                        onUpdate={onUpdate}
                        onAutoAssignTrades={onAutoAssignTrades}
                        loadingAI={loadingAI}
                        enableCopy={true}
                    />
                ) : (
                    <PMScheduler 
                        tasks={initialData}
                        onUpdateTasks={onUpdate}
                        resourceCount={strategy.resourceCount}
                        loadingAI={loadingAI}
                        setLoadingAI={setLoadingAI}
                    />
                )}
            </div>
        </div>
    </div>
  );
};

export default PMPlanBuilder;
