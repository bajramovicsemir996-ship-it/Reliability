
import React, { useMemo, useState } from 'react';
import { useAppStore } from '../store';
import { PMRecord, ResourceOptimizationResult } from '../types';
import { normalizeFrequency } from '../utils/reliabilityMath';
import { analyzeResourceGap } from '../services/geminiService';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell, ReferenceLine } from 'recharts';
import { Users, Clock, Percent, BrainCircuit, Loader2, AlertTriangle, CheckCircle2, MinusCircle, Info, HelpCircle } from 'lucide-react';

interface ResourcePlanningProps {
    pmData: PMRecord[];
}

const ResourcePlanning: React.FC<ResourcePlanningProps> = ({ pmData }) => {
    const { resources, updateResource, loadingAI, setLoadingAI } = useAppStore();
    const [aiResults, setAiResults] = useState<ResourceOptimizationResult[]>([]);
    const [showHelp, setShowHelp] = useState(true);

    // Calculate Demand (Annual Hours) from PM Plan
    const workload = useMemo(() => {
        const demand: Record<string, number> = {};
        pmData.forEach(task => {
            // Filter out External tasks from internal resource demand
            if (task.executorType === 'External') return;

            const annualOccurrences = normalizeFrequency(task.frequency);
            const totalHours = annualOccurrences * task.estimatedDuration * (task.numberOfExecutors || 1);
            const trade = task.trade || 'General';
            
            demand[trade] = (demand[trade] || 0) + totalHours;
        });
        return demand;
    }, [pmData]);

    // Combine Supply & Demand for Charting
    const chartData = useMemo(() => {
        return resources.map(res => {
            const annualAvailable = res.headcount * res.weeklyHours * 52 * res.utilizationRate;
            const required = workload[res.trade] || 0;
            const utilizationPercent = annualAvailable > 0 ? (required / annualAvailable) * 100 : 0;
            
            return {
                name: res.trade,
                Available: annualAvailable,
                Required: required,
                Utilization: utilizationPercent,
                Gap: annualAvailable - required
            };
        });
    }, [resources, workload]);

    const handleRunAnalysis = async () => {
        setLoadingAI(true);
        try {
            // Fix: Explicitly cast annualHours to number to avoid type error
            const demandList = Object.entries(workload).map(([trade, annualHours]) => ({ trade, annualHours: Number(annualHours) }));
            const results = await analyzeResourceGap(resources, demandList);
            setAiResults(results);
        } catch (e) {
            alert("Analysis failed.");
        } finally {
            setLoadingAI(false);
        }
    };

    return (
        <div className="flex flex-col h-full space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full">
                
                {/* LEFT: Configuration Input */}
                <div className="lg:col-span-4 bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col h-full">
                    <div className="p-4 border-b border-gray-100 bg-gray-50 rounded-t-xl flex justify-between items-start">
                        <div>
                            <h3 className="font-bold text-gray-700 flex items-center gap-2">
                                <Users size={18} className="text-blue-600"/> Resource Configuration
                            </h3>
                            <p className="text-xs text-gray-500 mt-1">Define your available workforce capacity.</p>
                        </div>
                        <button onClick={() => setShowHelp(!showHelp)} className="text-gray-400 hover:text-blue-600 transition">
                            <HelpCircle size={16} />
                        </button>
                    </div>

                    {showHelp && (
                        <div className="mx-4 mt-4 p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-800 space-y-3 relative">
                             <div className="flex items-start gap-2">
                                <Users size={14} className="mt-0.5 shrink-0 text-blue-600"/>
                                <p><strong>Count:</strong> Number of technicians available for this trade.</p>
                            </div>
                            <div className="flex items-start gap-2">
                                <Clock size={14} className="mt-0.5 shrink-0 text-blue-600"/>
                                <p><strong>Wk/Hrs:</strong> Standard shift hours (e.g. 40h/week).</p>
                            </div>
                            <div className="flex items-start gap-2">
                                 <Percent size={14} className="mt-0.5 shrink-0 text-blue-600"/>
                                 <div>
                                     <p><strong>Wrench Time (Efficiency):</strong></p>
                                     <p className="opacity-75 leading-relaxed mt-0.5">
                                         The % of time spent actually fixing assets (excluding breaks, meetings, travel).
                                         <br/>
                                         <i>Example: 0.75 (75%) = 6 hours of actual work in an 8-hour shift.</i>
                                     </p>
                                 </div>
                            </div>
                        </div>
                    )}
                    
                    <div className="p-4 space-y-4 overflow-y-auto custom-scrollbar flex-1">
                        {resources.map((res) => (
                            <div key={res.trade} className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="font-bold text-sm text-slate-800">{res.trade}</span>
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                        (workload[res.trade]||0) > (res.headcount * res.weeklyHours * 52 * res.utilizationRate) 
                                        ? 'bg-red-100 text-red-600' 
                                        : 'bg-green-100 text-green-600'
                                    }`}>
                                        Req: {(workload[res.trade]||0).toFixed(0)} hrs
                                    </span>
                                </div>
                                
                                <div className="grid grid-cols-3 gap-2">
                                    <div>
                                        <label className="text-[10px] text-gray-500 font-semibold block mb-1 flex items-center gap-1">Count</label>
                                        <input 
                                            type="number" 
                                            className="w-full text-xs border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500 text-center font-bold"
                                            value={res.headcount}
                                            onChange={(e) => updateResource(res.trade, 'headcount', Math.max(0, Number(e.target.value)))}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-gray-500 font-semibold block mb-1 flex items-center gap-1">Wk/Hrs</label>
                                        <input 
                                            type="number" 
                                            className="w-full text-xs border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500 text-center"
                                            value={res.weeklyHours}
                                            onChange={(e) => updateResource(res.trade, 'weeklyHours', Math.max(0, Number(e.target.value)))}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-gray-500 font-semibold block mb-1 flex items-center gap-1" title="Wrench Time Efficiency (0.0 - 1.0)">Wrench %</label>
                                        <input 
                                            type="number" 
                                            step="0.05"
                                            max="1"
                                            className="w-full text-xs border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500 text-center"
                                            value={res.utilizationRate}
                                            onChange={(e) => updateResource(res.trade, 'utilizationRate', Math.min(1, Math.max(0, Number(e.target.value))))}
                                        />
                                    </div>
                                </div>
                                <div className="mt-2 pt-2 border-t border-slate-200 text-right">
                                    <span className="text-[10px] text-gray-400">Capacity: </span>
                                    <span className="text-xs font-bold text-blue-600">
                                        {(res.headcount * res.weeklyHours * 52 * res.utilizationRate).toFixed(0)} hrs/yr
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                    
                    <div className="p-4 border-t border-gray-100">
                        <button 
                            onClick={handleRunAnalysis} 
                            disabled={loadingAI}
                            className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white py-3 rounded-xl font-bold flex justify-center items-center gap-2 shadow-lg shadow-blue-200 transition-all disabled:opacity-50"
                        >
                            {loadingAI ? <Loader2 className="animate-spin" /> : <BrainCircuit size={18} />}
                            AI Capacity Analysis
                        </button>
                    </div>
                </div>

                {/* RIGHT: Charts & Analysis */}
                <div className="lg:col-span-8 flex flex-col gap-6 h-full overflow-hidden">
                    
                    {/* CHART */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 flex-1 min-h-[350px] flex flex-col">
                         <div className="flex justify-between items-center mb-4">
                            <h3 className="font-bold text-gray-700 flex items-center gap-2">
                                <Clock size={18} className="text-emerald-500"/> Capacity vs Demand (Annual Hours)
                            </h3>
                            <div className="flex gap-4 text-xs font-medium">
                                <div className="flex items-center gap-1"><div className="w-3 h-3 bg-emerald-400 rounded"></div> Available</div>
                                <div className="flex items-center gap-1"><div className="w-3 h-3 bg-slate-800 rounded"></div> Required (PM)</div>
                            </div>
                        </div>
                        <div className="flex-1 w-full min-h-0">
                            <ResponsiveContainer>
                                <BarChart data={chartData} margin={{top: 20, right: 30, left: 20, bottom: 5}}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9"/>
                                    <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false}/>
                                    <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false}/>
                                    <Tooltip 
                                        cursor={{fill: '#f8fafc'}}
                                        contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                                    />
                                    <Bar dataKey="Available" fill="#34d399" radius={[4, 4, 0, 0]} barSize={30} />
                                    <Bar dataKey="Required" fill="#1e293b" radius={[4, 4, 0, 0]} barSize={30} />
                                    <ReferenceLine y={0} stroke="#000" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* AI RECOMMENDATIONS */}
                    {aiResults.length > 0 && (
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 flex flex-col h-64">
                            <h3 className="font-bold text-gray-700 mb-3 flex items-center gap-2">
                                <BrainCircuit size={18} className="text-purple-500"/> Strategic Recommendations
                            </h3>
                            <div className="flex-1 overflow-auto custom-scrollbar space-y-3 pr-2">
                                {aiResults.map((res, i) => (
                                    <div key={i} className={`p-3 rounded-lg border flex gap-3 ${
                                        res.status === 'Overloaded' ? 'bg-red-50 border-red-100' :
                                        res.status === 'Balanced' ? 'bg-green-50 border-green-100' :
                                        'bg-blue-50 border-blue-100'
                                    }`}>
                                        <div className="shrink-0 mt-0.5">
                                            {res.status === 'Overloaded' ? <AlertTriangle size={16} className="text-red-600"/> :
                                             res.status === 'Balanced' ? <CheckCircle2 size={16} className="text-green-600"/> :
                                             <MinusCircle size={16} className="text-blue-600"/>}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="font-bold text-sm text-gray-800">{res.trade}</span>
                                                <span className={`text-[10px] font-bold px-2 rounded-full border ${
                                                    res.status === 'Overloaded' ? 'bg-red-200 text-red-800 border-red-300' :
                                                    res.status === 'Balanced' ? 'bg-green-200 text-green-800 border-green-300' :
                                                    'bg-blue-200 text-blue-800 border-blue-300'
                                                }`}>{res.status} (Gap: {res.gapHours.toFixed(0)} hrs)</span>
                                            </div>
                                            <p className="text-xs text-gray-600 leading-relaxed">{res.recommendation}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ResourcePlanning;
