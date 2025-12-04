
import React, { useMemo } from 'react';
import { PMRecord } from '../types';
import { balanceWorkload } from '../services/geminiService';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts';
import { Calendar, RefreshCw, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface PMSchedulerProps {
  tasks: PMRecord[];
  onUpdateTasks: (tasks: PMRecord[]) => void;
  resourceCount: number;
  loadingAI: boolean;
  setLoadingAI: (v: boolean) => void;
}

const PMScheduler: React.FC<PMSchedulerProps> = ({ tasks, onUpdateTasks, resourceCount, loadingAI, setLoadingAI }) => {
  const WEEK_CAPACITY = resourceCount * 40; // 40 hours per tech

  const handleAutoSchedule = async () => {
      setLoadingAI(true);
      try {
          const scheduleMap = await balanceWorkload(tasks, resourceCount);
          const updatedTasks = tasks.map(t => {
              if (scheduleMap[t.id]) {
                  return { ...t, initialStartWeek: scheduleMap[t.id] };
              }
              return { ...t, initialStartWeek: t.initialStartWeek || 1 }; // Default to 1 if AI misses it
          });
          onUpdateTasks(updatedTasks);
      } catch (e) {
          alert("Scheduling optimization failed.");
      } finally {
          setLoadingAI(false);
      }
  };

  const handleStartWeekChange = (taskId: string, week: number) => {
      const updated = tasks.map(t => t.id === taskId ? { ...t, initialStartWeek: week } : t);
      onUpdateTasks(updated);
  };

  // Generate 52-Week Workload Data
  const weeklyLoad = useMemo(() => {
      const weeks = Array.from({ length: 52 }, (_, i) => ({ week: i + 1, hours: 0, taskCount: 0 }));
      
      tasks.forEach(task => {
          const intervalMonths = parseFloat(task.frequency);
          if (isNaN(intervalMonths) || intervalMonths <= 0) return;
          
          // Convert months to weeks (approx 4.33 weeks per month)
          const intervalWeeks = Math.max(1, Math.round(intervalMonths * 4.33));
          const startWeek = Math.max(1, Math.min(52, task.initialStartWeek || 1));
          const taskLoad = task.estimatedDuration * (task.numberOfExecutors || 1);

          for (let w = startWeek; w <= 52; w += intervalWeeks) {
              weeks[w - 1].hours += taskLoad;
              weeks[w - 1].taskCount += 1;
          }
      });
      return weeks;
  }, [tasks]);

  const maxLoad = Math.max(...weeklyLoad.map(w => w.hours), WEEK_CAPACITY * 1.2);

  return (
    <div className="flex flex-col h-full gap-4">
        {/* Header / Actions */}
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col md:flex-row justify-between items-center gap-4">
            <div>
                <h3 className="font-bold text-gray-800 flex items-center gap-2">
                    <Calendar size={20} className="text-blue-600"/> Planning & Scheduling
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                    Available Capacity: <span className="font-bold text-gray-800">{WEEK_CAPACITY} hrs/week</span> ({resourceCount} Techs)
                </p>
            </div>
            
            <button 
                onClick={handleAutoSchedule}
                disabled={loadingAI || tasks.length === 0}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition disabled:opacity-50"
            >
                {loadingAI ? <Loader2 className="animate-spin" size={16}/> : <RefreshCw size={16}/>} 
                AI Load Balancing
            </button>
        </div>

        {/* Workload Graph */}
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm h-64">
             <h4 className="text-sm font-semibold text-gray-700 mb-2">52-Week Workload Forecast</h4>
             <ResponsiveContainer width="100%" height="90%">
                <BarChart data={weeklyLoad} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="week" tick={{fontSize: 10}} interval={3} label={{ value: 'Week No.', position: 'insideBottom', offset: -5, fontSize: 10 }} />
                    <YAxis label={{ value: 'Hours', angle: -90, position: 'insideLeft', fontSize: 10 }} />
                    <Tooltip 
                        contentStyle={{ fontSize: '12px' }}
                        formatter={(val: number) => [`${val.toFixed(1)} hrs`, 'Total Load']}
                        labelFormatter={(label) => `Week ${label}`}
                    />
                    <ReferenceLine y={WEEK_CAPACITY} stroke="#dc2626" strokeDasharray="3 3" label={{ value: 'Capacity', fill: 'red', fontSize: 10 }} />
                    <Bar dataKey="hours" barSize={8}>
                        {weeklyLoad.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.hours > WEEK_CAPACITY ? '#ef4444' : '#3b82f6'} />
                        ))}
                    </Bar>
                </BarChart>
             </ResponsiveContainer>
        </div>

        {/* Task Offset Editor */}
        <div className="flex-1 bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col overflow-hidden">
            <div className="p-3 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
                <h4 className="text-sm font-bold text-gray-700">Task Schedule Parameters</h4>
                <span className="text-xs text-gray-500">Adjust 'Start Week' to smooth workload</span>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-0">
                <table className="w-full text-sm text-left">
                    <thead className="text-xs text-gray-600 bg-gray-100 uppercase sticky top-0">
                        <tr>
                            <th className="px-4 py-2">Task Description</th>
                            <th className="px-4 py-2 text-center">Interval</th>
                            <th className="px-4 py-2 text-center">Load (Hrs)</th>
                            <th className="px-4 py-2 w-32 text-center">Start Week</th>
                        </tr>
                    </thead>
                    <tbody>
                        {tasks.map(task => {
                             const load = task.estimatedDuration * (task.numberOfExecutors || 1);
                             return (
                                <tr key={task.id} className="border-b border-gray-100 hover:bg-gray-50">
                                    <td className="px-4 py-2 font-medium text-gray-800 truncate max-w-xs" title={task.taskDescription}>
                                        {task.taskDescription}
                                    </td>
                                    <td className="px-4 py-2 text-center text-gray-500">
                                        {task.frequency} Mo
                                    </td>
                                    <td className="px-4 py-2 text-center font-mono">
                                        {load}
                                    </td>
                                    <td className="px-4 py-2 text-center">
                                        <input 
                                            type="number" 
                                            min="1" max="52"
                                            className="w-16 text-center border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500 text-sm py-1"
                                            value={task.initialStartWeek || 1}
                                            onChange={(e) => handleStartWeekChange(task.id, parseInt(e.target.value))}
                                        />
                                    </td>
                                </tr>
                             );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    </div>
  );
};

export default PMScheduler;
