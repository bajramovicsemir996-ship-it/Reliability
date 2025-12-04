import React, { useState, useEffect } from 'react';
import { RCMContext, PMRecord, SavedRCMPlan, RawRecord } from '../types';
import { generateRCMPlan } from '../services/geminiService';
import PMDataGrid from './PMDataGrid';
import { BrainCircuit, Save, PlusCircle, Trash2, FolderOpen, Loader2, Wand2 } from 'lucide-react';

interface RCMBuilderProps {
  initialData: PMRecord[];
  onUpdate: (data: PMRecord[]) => void;
  loadingAI: boolean;
  setLoadingAI: (v: boolean) => void;
  failureData: RawRecord[];
  currentPMs: PMRecord[];
  onAutoAssignTrades: () => void;
}

const RCMBuilder: React.FC<RCMBuilderProps> = ({ 
    initialData, 
    onUpdate, 
    loadingAI, 
    setLoadingAI,
    failureData,
    currentPMs,
    onAutoAssignTrades
}) => {
  // RCM Inputs
  const [context, setContext] = useState<RCMContext>({
    assetName: '',
    operationalContext: '',
    failureModes: '',
    criticality: 'High'
  });

  const [savedPlans, setSavedPlans] = useState<SavedRCMPlan[]>([]);
  const [activePlanId, setActivePlanId] = useState<string>('');

  // Load saved plans on mount
  useEffect(() => {
      const stored = localStorage.getItem('rcm_plans');
      if (stored) {
          try {
              setSavedPlans(JSON.parse(stored));
          } catch(e) { console.error("Failed to load RCM plans"); }
      }
  }, []);

  const handleGenerate = async () => {
      if (!context.assetName) return alert("Please enter an Asset Name.");
      if (!context.failureModes) return alert("Please list some failure modes.");
      
      setLoadingAI(true);
      try {
          const newTasks = await generateRCMPlan(context);
          // If we are editing an existing plan, we might want to append or replace. 
          // For "Builder", let's append but warn? Or just replace?
          // Let's Append to allow iterative building
          onUpdate([...initialData, ...newTasks]);
      } catch (e) {
          alert("Error generating plan. Please try again.");
      } finally {
          setLoadingAI(false);
      }
  };

  const handleSave = () => {
      if (!context.assetName) return alert("Asset Name required to save.");
      
      const newPlan: SavedRCMPlan = {
          id: activePlanId || `rcm-${Date.now()}`,
          name: context.assetName,
          updatedAt: new Date().toISOString(),
          context: context,
          tasks: initialData
      };

      const updatedList = activePlanId 
        ? savedPlans.map(p => p.id === activePlanId ? newPlan : p)
        : [...savedPlans, newPlan];
      
      setSavedPlans(updatedList);
      localStorage.setItem('rcm_plans', JSON.stringify(updatedList));
      setActivePlanId(newPlan.id);
      alert("Plan Saved Successfully!");
  };

  const handleLoad = (id: string) => {
      if (!id) {
          handleNew();
          return;
      }
      const plan = savedPlans.find(p => p.id === id);
      if (plan) {
          setContext(plan.context);
          onUpdate(plan.tasks);
          setActivePlanId(plan.id);
      }
  };

  const handleNew = () => {
      setActivePlanId('');
      setContext({ assetName: '', operationalContext: '', failureModes: '', criticality: 'High' });
      onUpdate([]);
  };

  const handleDelete = () => {
      if (!activePlanId) return;
      if (confirm("Delete this plan?")) {
          const updated = savedPlans.filter(p => p.id !== activePlanId);
          setSavedPlans(updated);
          localStorage.setItem('rcm_plans', JSON.stringify(updated));
          handleNew();
      }
  };

  return (
    <div className="flex h-full gap-6">
        {/* Left: Input Panel */}
        <div className="w-1/3 bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col overflow-hidden">
            <div className="p-4 bg-purple-50 border-b border-purple-100">
                <h3 className="font-bold text-purple-900 flex items-center gap-2">
                    <BrainCircuit size={18}/> RCM Context Definition
                </h3>
                
                {/* Saved Plans Dropdown */}
                <div className="mt-3 flex flex-col gap-2">
                    <select 
                        className="w-full text-xs border-purple-200 rounded focus:ring-purple-500 bg-white"
                        value={activePlanId}
                        onChange={(e) => handleLoad(e.target.value)}
                    >
                        <option value="">-- Create New RCM Plan --</option>
                        {savedPlans.map(p => (
                            <option key={p.id} value={p.id}>{p.name} ({new Date(p.updatedAt).toLocaleDateString()})</option>
                        ))}
                    </select>
                    <div className="flex gap-2">
                         <button onClick={handleNew} className="flex-1 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 py-1.5 px-2 rounded text-xs flex items-center justify-center gap-1 font-medium transition">
                            <PlusCircle size={14} /> New
                        </button>
                        <button onClick={handleSave} className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-1.5 px-2 rounded text-xs flex items-center justify-center gap-1 font-medium transition">
                            <Save size={14} /> Save
                        </button>
                        {activePlanId && (
                            <button onClick={handleDelete} className="bg-white border border-red-200 hover:bg-red-50 text-red-600 py-1.5 px-2 rounded text-xs transition">
                                <Trash2 size={14} />
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5 custom-scrollbar">
                
                <div>
                    <label className="block text-sm font-semibold text-gray-700">Asset Name</label>
                    <input 
                        type="text" 
                        placeholder="e.g. Hydraulic Power Unit 01"
                        className="w-full border-gray-300 rounded-lg focus:ring-purple-500 focus:border-purple-500 text-sm mt-1"
                        value={context.assetName}
                        onChange={e => setContext({...context, assetName: e.target.value})}
                    />
                </div>

                <div>
                    <label className="block text-sm font-semibold text-gray-700">Criticality</label>
                    <select 
                        className="w-full border-gray-300 rounded-lg focus:ring-purple-500 focus:border-purple-500 text-sm mt-1"
                        value={context.criticality}
                        onChange={e => setContext({...context, criticality: e.target.value as any})}
                    >
                        <option value="High">High (Safety/Production Critical)</option>
                        <option value="Medium">Medium (Secondary Support)</option>
                        <option value="Low">Low (General)</option>
                    </select>
                </div>

                <div>
                    <label className="block text-sm font-semibold text-gray-700">Operational Context</label>
                    <p className="text-xs text-gray-500 mb-1">Describe environment, duty cycle, etc.</p>
                    <textarea 
                        rows={4}
                        placeholder="e.g. Outdoors, dusty environment, runs 16 hours/day. Standby unit available."
                        className="w-full border-gray-300 rounded-lg focus:ring-purple-500 focus:border-purple-500 text-sm resize-none"
                        value={context.operationalContext}
                        onChange={e => setContext({...context, operationalContext: e.target.value})}
                    />
                </div>

                <div>
                    <label className="block text-sm font-semibold text-gray-700">Common Failure Modes</label>
                    <p className="text-xs text-gray-500 mb-1">List failures you want to prevent (one per line or comma separated).</p>
                    <textarea 
                        rows={6}
                        placeholder="e.g.&#10;Pump Seal Leak&#10;Motor Overheat&#10;Filter Clogged&#10;Valve Sticking"
                        className="w-full border-gray-300 rounded-lg focus:ring-purple-500 focus:border-purple-500 text-sm resize-none"
                        value={context.failureModes}
                        onChange={e => setContext({...context, failureModes: e.target.value})}
                    />
                </div>

            </div>

            <div className="p-4 bg-gray-50 border-t border-gray-200">
                <button 
                    onClick={handleGenerate}
                    disabled={loadingAI}
                    className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 rounded-lg shadow-sm flex items-center justify-center gap-2 disabled:opacity-50 transition"
                >
                    {loadingAI ? <Loader2 className="animate-spin" /> : <Wand2 size={18} />} Generate Plan from RCM
                </button>
            </div>
        </div>

        {/* Right: Output Grid */}
        <div className="flex-1 min-w-0">
            <PMDataGrid 
                title={`Generated Plan: ${context.assetName || 'New Asset'}`}
                data={initialData}
                onUpdate={onUpdate}
                enableCopy={true}
                onAutoAssignTrades={onAutoAssignTrades}
                loadingAI={loadingAI}
            />
        </div>
    </div>
  );
};

export default RCMBuilder;