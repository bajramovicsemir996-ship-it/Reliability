
import React, { useState, useMemo } from 'react';
import { RawRecord, MaintenanceCost, InputMode } from '../types';
import { calculateMetrics, calculateTimeBetweenFailures, calculateWeibull, calculateOptimalPM, generateCostCurve } from '../utils/reliabilityMath';
import { getMaintenanceAdvice } from '../services/geminiService';
import { Filter, DollarSign, Clock, TrendingDown, Cpu, Loader2 } from 'lucide-react';
import { ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

interface OptimizationPanelProps {
  data: RawRecord[];
  inputMode: InputMode;
  costs: MaintenanceCost;
  updateCost: (type: 'preventive' | 'corrective', field: keyof MaintenanceCost['preventive'], value: number) => void;
  pmDuration: number;
  setPmDuration: (v: number) => void;
  optimalPM: number | null;
  setOptimalPM: (v: number | null) => void;
  aiAdvice: string;
  setAiAdvice: (v: string) => void;
  loadingAI: boolean;
  setLoadingAI: (v: boolean) => void;
  // Global Filters
  selectedAsset: string;
  selectedMode: string;
}

const OptimizationPanel: React.FC<OptimizationPanelProps> = ({
  data,
  inputMode,
  costs,
  updateCost,
  pmDuration,
  setPmDuration,
  optimalPM,
  setOptimalPM,
  aiAdvice,
  setAiAdvice,
  loadingAI,
  setLoadingAI,
  selectedAsset,
  selectedMode
}) => {
  // We no longer manage filters locally, we use props
  // But we might need unique lists to show what context we are in (although filters are usually set in dashboard)
  // For cost optimization, sometimes you want to override. But based on user request, filters should persist.

  // Filter Data
  const filteredData = useMemo(() => {
    return data.filter(r => {
        const matchAsset = selectedAsset === 'All' || r.location === selectedAsset;
        const matchMode = selectedMode === 'All' || r.failureMode === selectedMode;
        return matchAsset && matchMode;
    });
  }, [data, selectedAsset, selectedMode]);

  // Calculations
  const metrics = useMemo(() => calculateMetrics(filteredData, inputMode), [filteredData, inputMode]);
  
  const weibull = useMemo(() => {
      const tbf = calculateTimeBetweenFailures(filteredData, inputMode);
      return calculateWeibull(tbf);
  }, [filteredData, inputMode]);

  const derivedMttr = metrics.failureCount > 0 ? Math.max(0.1, metrics.mttr) : 0;

  const totalPM = useMemo(() => {
      return costs.preventive.material + 
             (costs.preventive.labor * pmDuration) + 
             (costs.preventive.productionLoss * pmDuration);
  }, [costs.preventive, pmDuration]);

  const totalCM = useMemo(() => {
      return costs.corrective.material + 
             (costs.corrective.labor * derivedMttr) + 
             (costs.corrective.productionLoss * derivedMttr);
  }, [costs.corrective, derivedMttr]);

  const costCurveData = useMemo(() => {
      if (!optimalPM) return [];
      return generateCostCurve(weibull.beta, weibull.eta, totalPM, totalCM);
  }, [weibull, totalPM, totalCM, optimalPM]);

  const handleOptimization = async () => {
    setLoadingAI(true);
    const opt = calculateOptimalPM(weibull.beta, weibull.eta, totalPM, totalCM);
    setOptimalPM(opt);
    const advice = await getMaintenanceAdvice(weibull, totalPM, totalCM, opt);
    setAiAdvice(advice);
    setLoadingAI(false);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 max-w-7xl mx-auto h-full">
        {/* Left Panel: Inputs (4 Columns) */}
        <div className="lg:col-span-4 space-y-6 overflow-y-auto pr-2 custom-scrollbar">
            
            {/* 1. Context Filters (Read Only / Info) */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <Filter size={16} /> Analysis Context
                </h3>
                <div className="space-y-3">
                    <div className="bg-gray-50 p-2 rounded border border-gray-100">
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Active Asset Filter</label>
                        <p className="font-medium text-gray-900">{selectedAsset}</p>
                    </div>
                    <div className="bg-gray-50 p-2 rounded border border-gray-100">
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Active Failure Mode</label>
                        <p className="font-medium text-gray-900">{selectedMode}</p>
                    </div>
                    <div className="text-xs text-gray-400 italic">
                        (To change context, use filters in Reliability Statistics dashboard)
                    </div>
                </div>
                
                <div className="mt-4 pt-4 border-t border-gray-100">
                    <h4 className="font-semibold text-slate-700 text-sm mb-2">Weibull Parameters</h4>
                    <div className="grid grid-cols-2 gap-2 text-sm bg-slate-50 p-2 rounded border border-slate-100">
                        <div>
                            <span className="text-slate-400 text-xs">Beta (Shape)</span>
                            <span className={`block font-mono text-base font-bold ${weibull.beta <= 1 ? 'text-red-500' : 'text-green-600'}`}>
                                {weibull.beta.toFixed(2)}
                            </span>
                        </div>
                        <div>
                            <span className="text-slate-400 text-xs">Eta (Life)</span>
                            <span className="block font-mono text-base font-bold text-slate-700">
                                {weibull.eta.toFixed(0)} <span className="text-xs font-normal">hrs</span>
                            </span>
                        </div>
                    </div>
                    {weibull.beta <= 1 && weibull.beta > 0 && (
                        <p className="text-xs text-red-500 mt-2 italic">
                            * Beta ≤ 1 indicates random failures. Preventive maintenance is usually ineffective.
                        </p>
                    )}
                </div>
            </div>

            {/* 2. Cost Inputs */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <DollarSign size={16} /> Cost Breakdown
                </h3>
                
                {/* Preventive Costs */}
                <div className="mb-6">
                    <div className="flex justify-between items-baseline mb-2">
                        <h4 className="text-indigo-700 font-semibold text-sm">Preventive (Planned)</h4>
                        <span className="text-xs font-mono font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded">Total: ${totalPM.toFixed(0)}</span>
                    </div>
                    
                    <div className="space-y-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
                        <div className="grid grid-cols-2 gap-2 items-center">
                            <label className="text-xs text-gray-600 font-medium">Material/Spares (€)</label>
                            <input type="number" className="text-right text-sm border-gray-300 rounded focus:ring-indigo-500 focus:border-indigo-500" 
                                value={costs.preventive.material} onChange={e => updateCost('preventive', 'material', Number(e.target.value))} />
                        </div>
                        <div className="grid grid-cols-2 gap-2 items-center">
                            <label className="text-xs text-gray-600 font-medium">Labor Rate (€/hr)</label>
                            <input type="number" className="text-right text-sm border-gray-300 rounded focus:ring-indigo-500 focus:border-indigo-500" 
                                value={costs.preventive.labor} onChange={e => updateCost('preventive', 'labor', Number(e.target.value))} />
                        </div>
                        <div className="grid grid-cols-2 gap-2 items-center">
                            <label className="text-xs text-gray-600 font-medium">Prod Loss (€/hr)</label>
                            <input type="number" className="text-right text-sm border-gray-300 rounded focus:ring-indigo-500 focus:border-indigo-500" 
                                value={costs.preventive.productionLoss} onChange={e => updateCost('preventive', 'productionLoss', Number(e.target.value))} />
                        </div>
                        {/* Planned Duration Input */}
                        <div className="pt-2 border-t border-gray-200 grid grid-cols-2 gap-2 items-center">
                            <label className="text-xs text-indigo-700 font-bold flex items-center gap-1">
                                <Clock size={10} /> Planned Duration (hrs)
                            </label>
                            <input type="number" className="text-right text-sm border-indigo-200 bg-indigo-50 rounded focus:ring-indigo-500 focus:border-indigo-500 font-semibold text-indigo-700" 
                                value={pmDuration} onChange={e => setPmDuration(Number(e.target.value))} min={0.5} step={0.5} />
                        </div>
                    </div>
                </div>

                {/* Corrective Costs */}
                <div>
                    <div className="flex justify-between items-baseline mb-2">
                        <h4 className="text-orange-700 font-semibold text-sm">Corrective (Failure)</h4>
                        <span className="text-xs font-mono font-bold bg-orange-50 text-orange-700 px-2 py-0.5 rounded">Total: ${totalCM.toFixed(0)}</span>
                    </div>
                    <div className="space-y-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
                        <div className="grid grid-cols-2 gap-2 items-center">
                            <label className="text-xs text-gray-600 font-medium">Material/Spares (€)</label>
                            <input type="number" className="text-right text-sm border-gray-300 rounded focus:ring-indigo-500 focus:border-indigo-500" 
                                value={costs.corrective.material} onChange={e => updateCost('corrective', 'material', Number(e.target.value))} />
                        </div>
                        <div className="grid grid-cols-2 gap-2 items-center">
                            <label className="text-xs text-gray-600 font-medium">Labor Rate (€/hr)</label>
                            <input type="number" className="text-right text-sm border-gray-300 rounded focus:ring-indigo-500 focus:border-indigo-500" 
                                value={costs.corrective.labor} onChange={e => updateCost('corrective', 'labor', Number(e.target.value))} />
                        </div>
                        <div className="grid grid-cols-2 gap-2 items-center">
                            <label className="text-xs text-gray-600 font-medium">Prod Loss (€/hr)</label>
                            <input type="number" className="text-right text-sm border-gray-300 rounded focus:ring-indigo-500 focus:border-indigo-500" 
                                value={costs.corrective.productionLoss} onChange={e => updateCost('corrective', 'productionLoss', Number(e.target.value))} />
                        </div>
                         {/* Derived MTTR Display */}
                         <div className="pt-2 border-t border-gray-200 flex justify-between items-center text-xs text-orange-800">
                            <span className="flex items-center gap-1 font-semibold"><Clock size={10} /> MTTR (Calculated)</span>
                            <span className="font-mono bg-orange-100 px-2 py-0.5 rounded">
                                {derivedMttr.toFixed(1)} hrs
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <button 
                onClick={handleOptimization}
                disabled={loadingAI || weibull.beta === 0}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 rounded-lg transition shadow-sm flex justify-center items-center gap-2 disabled:opacity-50"
            >
                 {loadingAI ? <Loader2 className="animate-spin" /> : 'Calculate Optimal Strategy'}
            </button>
        </div>

        {/* Right Panel: Results & Graph (8 Columns) */}
        <div className="lg:col-span-8 flex flex-col gap-6 overflow-y-auto custom-scrollbar">
             {/* Results Card */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 min-h-[160px]">
                <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center justify-between">
                    <span>Optimization Results</span>
                    {optimalPM && (
                        <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full font-medium">Calculation Complete</span>
                    )}
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="text-center p-4 bg-gray-50 rounded-lg border border-gray-100">
                        <p className="text-gray-500 uppercase text-xs font-bold tracking-wider">Recommended PM Interval</p>
                        {optimalPM ? (
                            <>
                                <p className="text-4xl font-extrabold text-indigo-600 mt-2">{optimalPM.toFixed(0)} <span className="text-lg text-gray-400 font-normal">hrs</span></p>
                                <p className="text-xs text-gray-400 mt-2">Replace part every {optimalPM.toFixed(0)} operating hours</p>
                            </>
                        ) : (
                            <p className="text-xl text-gray-400 mt-4 font-semibold italic">
                                {weibull.beta === 0 ? "No Data Available" : "Run-to-Failure (No PM)"}
                            </p>
                        )}
                    </div>
                    <div className="flex flex-col justify-center">
                        {aiAdvice ? (
                            <div className="text-sm text-slate-700 bg-indigo-50 p-4 rounded-r-lg border-l-4 border-indigo-500">
                                <p className="font-bold text-indigo-900 mb-1 flex items-center gap-2"><Cpu size={14}/> AI Insight:</p>
                                {aiAdvice}
                            </div>
                        ) : (
                            <p className="text-sm text-gray-400 text-center italic">Run calculation to see AI strategic advice and cost analysis.</p>
                        )}
                    </div>
                </div>
            </div>

            {/* Cost Curve Chart */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 flex-1 min-h-[400px]">
                 <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <TrendingDown size={20} className="text-emerald-600"/> Cost Optimization Curve
                </h3>
                <div className="h-[350px]">
                    {costCurveData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={costCurveData} margin={{ top: 10, right: 30, left: 10, bottom: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                                <XAxis 
                                    dataKey="t" 
                                    type="number" 
                                    label={{ value: 'Maintenance Interval (Hours)', position: 'insideBottom', offset: -10 }}
                                    tickFormatter={(v) => v.toFixed(0)}
                                    domain={['auto', 'auto']}
                                />
                                <YAxis 
                                    label={{ value: 'Cost ($) / Operating Hour', angle: -90, position: 'insideLeft' }}
                                    tickFormatter={(v) => `$${v.toFixed(2)}`}
                                />
                                <Tooltip 
                                    formatter={(val: number) => [`$${val.toFixed(2)}`, 'Cost/Hour']}
                                    labelFormatter={(val) => `${Number(val).toFixed(0)} Hours`}
                                />
                                <Line 
                                    type="monotone" 
                                    dataKey="cost" 
                                    stroke="#2563eb" 
                                    strokeWidth={3} 
                                    dot={false}
                                    activeDot={{ r: 6 }}
                                />
                                {optimalPM && (
                                    <ReferenceLine x={optimalPM} stroke="#16a34a" strokeDasharray="3 3" label={{ value: 'Optimal', fill: '#16a34a', fontSize: 12, position: 'top' }} />
                                )}
                            </ComposedChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-full flex items-center justify-center text-gray-400 bg-gray-50 rounded">
                            <p>Run calculation with valid Beta (> 1) to generate curve</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    </div>
  );
};

export default OptimizationPanel;
