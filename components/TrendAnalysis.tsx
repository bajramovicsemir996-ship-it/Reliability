
import React, { useMemo } from 'react';
import { RawRecord } from '../types';
import { calculateCrowAMSAA, calculateRollingMTBF } from '../utils/reliabilityMath';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ScatterChart, Scatter } from 'recharts';
import { TrendingUp, Activity, Info, Filter } from 'lucide-react';

interface TrendAnalysisProps {
  data: RawRecord[];
  selectedAsset: string;
}

const TrendAnalysis: React.FC<TrendAnalysisProps> = ({ data, selectedAsset }) => {
  // Filters now handled by parent via props

  const filteredData = useMemo(() => {
      if (selectedAsset === 'All') return data;
      return data.filter(r => r.location === selectedAsset);
  }, [data, selectedAsset]);

  // Calculations
  const growth = useMemo(() => calculateCrowAMSAA(filteredData), [filteredData]);
  const rolling = useMemo(() => calculateRollingMTBF(filteredData, 5), [filteredData]);

  // Determine Growth Interpretation
  const growthStatus = useMemo(() => {
      if (growth.beta === 0) return { text: "Insufficient Data", color: "text-gray-400" };
      if (growth.beta > 1.1) return { text: "Deteriorating (Beta > 1)", color: "text-red-600" };
      if (growth.beta < 0.9) return { text: "Improving (Beta < 1)", color: "text-green-600" };
      return { text: "Stable (Beta ≈ 1)", color: "text-blue-600" };
  }, [growth.beta]);

  return (
    <div className="space-y-6 h-full flex flex-col">
         {/* Info Header */}
         <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 flex items-center gap-4">
             <div className="flex items-center gap-2 text-gray-700 font-medium">
                <Filter size={20} className="text-indigo-600"/>
                <span>Current Analysis Scope:</span>
            </div>
            <span className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full text-sm font-semibold border border-indigo-200">
                {selectedAsset === 'All' ? 'System Level (All Assets)' : selectedAsset}
            </span>
         </div>

         <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 min-h-0">
             
             {/* LEFT: Crow-AMSAA */}
             <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 flex flex-col">
                 <div className="flex justify-between items-start mb-4">
                     <div>
                         <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                             <TrendingUp size={20} className="text-purple-600"/> Reliability Growth (Crow-AMSAA)
                         </h3>
                         <p className="text-sm text-gray-500 mt-1">Duane Plot: Cumulative Failures vs Cumulative Time</p>
                     </div>
                     <div className="text-right">
                         <p className="text-xs text-gray-400 uppercase font-bold">Growth Slope (Beta)</p>
                         <p className={`text-2xl font-bold ${growthStatus.color}`}>{growth.beta.toFixed(3)}</p>
                         <p className={`text-xs font-semibold ${growthStatus.color}`}>{growthStatus.text}</p>
                     </div>
                 </div>

                 <div className="flex-1 min-h-[300px]">
                    {growth.points.length > 2 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                                <CartesianGrid />
                                <XAxis 
                                    type="number" 
                                    dataKey="cumulativeTime" 
                                    name="Time" 
                                    scale="log" 
                                    domain={['auto', 'auto']}
                                    label={{ value: 'Cumulative Time (Hours) - Log Scale', position: 'insideBottom', offset: -10 }}
                                />
                                <YAxis 
                                    type="number" 
                                    dataKey="cumulativeFailures" 
                                    name="Failures" 
                                    scale="log" 
                                    domain={['auto', 'auto']}
                                    label={{ value: 'Cumulative Failures - Log Scale', angle: -90, position: 'insideLeft' }}
                                />
                                <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                                <Scatter name="Failures" data={growth.points} fill="#8884d8" />
                            </ScatterChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-full flex items-center justify-center text-gray-400 bg-gray-50 rounded">
                            Need at least 3 failure points sorted by time.
                        </div>
                    )}
                 </div>
                 <div className="mt-4 bg-blue-50 p-3 rounded text-xs text-blue-800 flex gap-2">
                     <Info size={16} className="shrink-0" />
                     <p>
                        This plot shows system behavior over time. A straight line indicates the failure process follows a Power Law. 
                        Slope &gt; 1 implies the system is wearing out. Slope &lt; 1 implies reliability is improving (infant mortality or successful maintenance).
                     </p>
                 </div>
             </div>

             {/* RIGHT: Rolling MTBF */}
             <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 flex flex-col">
                 <div className="flex justify-between items-start mb-4">
                     <div>
                         <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                             <Activity size={20} className="text-emerald-600"/> Rolling MTBF Trend
                         </h3>
                         <p className="text-sm text-gray-500 mt-1">Moving average (Window: Last 5 Failures)</p>
                     </div>
                 </div>

                 <div className="flex-1 min-h-[300px]">
                    {rolling.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={rolling} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis 
                                    dataKey="date" 
                                    tick={{fontSize: 10}}
                                />
                                <YAxis 
                                    label={{ value: 'MTBF (Hours)', angle: -90, position: 'insideLeft' }}
                                />
                                <Tooltip />
                                <Legend />
                                <Line 
                                    type="monotone" 
                                    dataKey="mtbf" 
                                    stroke="#059669" 
                                    strokeWidth={3}
                                    dot={{ r: 3 }}
                                    activeDot={{ r: 6 }}
                                    name="MTBF Trend"
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-full flex items-center justify-center text-gray-400 bg-gray-50 rounded">
                            Need at least 5 failures to calculate rolling trend.
                        </div>
                    )}
                 </div>
                 <div className="mt-4 bg-emerald-50 p-3 rounded text-xs text-emerald-800 flex gap-2">
                     <Info size={16} className="shrink-0" />
                     <p>
                        Unlike the global MTBF which averages everything, this chart reveals <strong>seasonality</strong> or <strong>sudden drops</strong> in reliability. 
                        Look for downward slopes to identify when problems started.
                     </p>
                 </div>
             </div>
         </div>
    </div>
  );
};

export default TrendAnalysis;
