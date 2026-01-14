
import React, { useState, useMemo } from 'react';
import { PMRecord, SavedPMPlan } from '../types';
import { Trash2, Plus, ArrowUpDown, Loader2, Sparkles, Hash, Users, Layers, Search, Filter, Briefcase, CalendarClock, Target, Zap, Activity } from 'lucide-react';

interface PMDataGridProps {
  data: PMRecord[];
  setData: (data: PMRecord[]) => void;
  enableCopy?: boolean;
  loadingAI: boolean;
  enrichingField?: string | null;
  onEnrich?: (field: 'trade' | 'frequency' | 'taskType' | 'shutdownRequired') => void;
  title?: string;
  filters?: { asset: string; trade: string; frequency: string; executorType: string; criticality: string; strategy?: string; state?: string };
  onGlobalFilterChange?: (key: string, value: string) => void;
  savedPlans?: SavedPMPlan[];
  onSavePlan?: () => void;
  onLoadPlan?: (id: string) => void;
  onDeletePlan?: (id: string) => void;
}

const PMDataGrid: React.FC<PMDataGridProps> = ({ 
    data, setData, enableCopy, loadingAI, enrichingField, onEnrich, title, 
    filters, onGlobalFilterChange,
    savedPlans, onSavePlan, onLoadPlan, onDeletePlan
}) => {
  const [localFilters, setLocalFilters] = useState<Record<string, string>>({});
  const [sortConfig, setSortConfig] = useState<{ key: keyof PMRecord | null, direction: 'asc' | 'desc' }>({ key: null, direction: 'asc' });

  const handleDelete = (id: string) => setData(data.filter(r => r.id !== id));
  const handleChange = (id: string, field: keyof PMRecord, value: any) => setData(data.map(r => r.id === id ? { ...r, [field]: value } : r));

  const handleAdd = () => {
    const newRecord: PMRecord = {
      id: `new-pm-${Date.now()}`,
      asset: filters && filters.asset !== 'All' ? filters.asset : '',
      taskDescription: '',
      frequency: '',
      trade: '',
      estimatedDuration: 0, 
      shutdownRequired: false,
      numberOfExecutors: 0,
      executorType: 'Internal',
      origin: 'Current',
      criticality: 'Medium',
      taskType: 'Time Based'
    };
    setData([newRecord, ...data]);
  };

  const handleFilterChange = (key: string, value: string) => {
      setLocalFilters(prev => ({ ...prev, [key]: value }));
      const globalKeyMap: Record<string, string> = {
          asset: 'asset',
          trade: 'trade',
          frequency: 'frequency',
          taskType: 'strategy',
          shutdownRequired: 'state'
      };
      if (globalKeyMap[key] && onGlobalFilterChange) {
          onGlobalFilterChange(globalKeyMap[key], value || 'All');
      }
  };

  const getUniqueValues = (key: keyof PMRecord) => {
    if (key === 'shutdownRequired') return ['Shutdown', 'Running'];
    const values = Array.from(new Set(data.map(r => r[key]))).filter(v => v !== undefined && v !== null && v !== '');
    return values.sort((a, b) => {
        if (typeof a === 'number' && typeof b === 'number') return a - b;
        return String(a).localeCompare(String(b));
    }).map(v => String(v));
  };

  const processedData = useMemo(() => {
    let result = [...data];
    Object.keys(localFilters).forEach(key => {
        const val = localFilters[key];
        if (!val || val === '' || val === 'All') return;

        if (key === 'shutdownRequired') {
            const wantShutdown = val === 'Shutdown';
            result = result.filter(r => r.shutdownRequired === wantShutdown);
        } else if (key === 'taskDescription') {
            const searchVal = val.toLowerCase();
            result = result.filter(r => String(r.taskDescription || '').toLowerCase().includes(searchVal));
        } else {
            result = result.filter(r => String(r[key as keyof PMRecord] || '') === val);
        }
    });

    if (sortConfig.key) {
        result.sort((a: any, b: any) => {
            const valA = a[sortConfig.key!];
            const valB = b[sortConfig.key!];
            return (valA < valB ? -1 : 1) * (sortConfig.direction === 'asc' ? 1 : -1);
        });
    }
    return result;
  }, [data, localFilters, sortConfig]);

  const ColumnHeader = ({ label, col, widthClass, icon: Icon }: { label: string, col: keyof PMRecord, widthClass?: string, icon?: any }) => {
      const val = localFilters[col] || '';
      return (
        <th className={`px-4 py-4 align-top bg-slate-50 border-b border-slate-200 ${widthClass || ''}`}>
            <div className="flex flex-col gap-2">
                <div 
                    className="flex items-center gap-1 cursor-pointer hover:text-indigo-600 select-none text-[10px] font-black uppercase tracking-wider text-slate-400 group"
                    onClick={() => setSortConfig({ key: col, direction: sortConfig.key === col && sortConfig.direction === 'asc' ? 'desc' : 'asc' })}
                >
                    {Icon && <Icon size={12} className="shrink-0" />}
                    {label}
                    <ArrowUpDown size={12} className={`shrink-0 transition-opacity ${sortConfig.key === col ? 'opacity-100' : 'opacity-0 group-hover:opacity-30'}`} />
                </div>
                {col === 'taskDescription' ? (
                    <div className="relative">
                        <input value={val} onChange={e => handleFilterChange(col, e.target.value)} placeholder="Search..." className="w-full text-[10px] font-bold py-1.5 px-2 pr-7 rounded-lg border border-slate-200 bg-white outline-none focus:ring-1 focus:ring-indigo-500 transition-all shadow-sm"/>
                        <Search size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none" />
                    </div>
                ) : (
                    <div className="relative group/sel">
                        <select value={val} onChange={e => handleFilterChange(col, e.target.value)} className={`w-full text-[10px] font-bold uppercase py-1.5 px-2 rounded-lg border appearance-none outline-none focus:ring-1 focus:ring-indigo-500 transition-all shadow-sm cursor-pointer truncate pr-6 ${val ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-200 text-slate-600'}`}>
                            <option value="">All {label}</option>
                            {getUniqueValues(col).map(v => <option key={v} value={v}>{v}</option>)}
                        </select>
                        <Filter size={10} className={`absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none ${val ? 'text-indigo-400' : 'text-slate-300'}`} />
                    </div>
                )}
            </div>
        </th>
      );
  };

  const frequencyOptions = ["Daily", "Weekly", "Fortnightly", "Monthly", "Quarterly", "6 Monthly", "Yearly"];
  const tradeOptions = ["Mechanical", "Electrical", "Hydraulic", "Automation", "Production"];

  const AIButton = ({ icon: Icon, label, field, colorClass }: any) => {
    const isEnriching = enrichingField === field;
    return (
        <button 
            disabled={loadingAI}
            onClick={() => onEnrich && onEnrich(field)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition shadow-sm border ${colorClass} disabled:opacity-50`}
        >
            {isEnriching ? <Loader2 size={12} className="animate-spin" /> : <Icon size={12} />}
            {label}
        </button>
    );
  };

  return (
    <div className="bg-white rounded-[2rem] shadow-xl border border-slate-200 flex flex-col h-full relative overflow-hidden ring-1 ring-slate-900/5">
      <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white shrink-0">
        <div>
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                <Layers className="text-emerald-500" size={18}/> Strategy Repository
            </h3>
            <p className="text-[10px] text-slate-400 font-bold uppercase mt-1 tracking-tighter">
                {processedData.length === data.length 
                    ? `Active: ${data.length} tasks scheduled` 
                    : `Filtered: ${processedData.length} of ${data.length} tasks`}
            </p>
        </div>
        <div className="flex gap-2">
            {Object.keys(localFilters).some(k => localFilters[k] !== '') && (
                <button onClick={() => { setLocalFilters({}); if (onGlobalFilterChange) { onGlobalFilterChange('asset', 'All'); onGlobalFilterChange('trade', 'All'); onGlobalFilterChange('frequency', 'All'); onGlobalFilterChange('strategy', 'All'); onGlobalFilterChange('state', 'All'); } }} className="flex gap-2 items-center bg-slate-100 text-slate-600 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border border-slate-200 hover:bg-slate-200 transition">Clear Filters</button>
            )}
            <button onClick={handleAdd} className="flex gap-2 items-center bg-emerald-600 text-white px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 transition"><Plus size={16}/> New Task</button>
        </div>
      </div>

      <div className="bg-slate-50/50 p-3 px-6 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
              <Sparkles size={16} className="text-indigo-500" />
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mr-2">AI Enrichment Tools</span>
              <div className="flex gap-2">
                  <AIButton field="trade" icon={Briefcase} label="Assign Trades" colorClass="bg-white hover:bg-indigo-50 text-indigo-700 border-indigo-100" />
                  <AIButton field="frequency" icon={CalendarClock} label="Set Frequencies" colorClass="bg-white hover:bg-emerald-50 text-emerald-700 border-emerald-100" />
                  <AIButton field="taskType" icon={Target} label="Define Strategies" colorClass="bg-white hover:bg-purple-50 text-purple-700 border-purple-100" />
                  <AIButton field="shutdownRequired" icon={Activity} label="Determine State" colorClass="bg-white hover:bg-rose-50 text-rose-700 border-rose-100" />
              </div>
          </div>
          <div className="text-[9px] font-bold text-slate-400 uppercase italic">Only populates missing data</div>
      </div>

      <div className="overflow-auto flex-1 custom-scrollbar">
        <table className="w-full text-sm text-left border-collapse table-fixed">
          <thead className="text-[10px] text-slate-700 uppercase bg-slate-50 sticky top-0 z-10 shadow-sm">
            <tr>
              <ColumnHeader label="Asset" col="asset" widthClass="w-[180px]" />
              <ColumnHeader label="Description" col="taskDescription" widthClass="w-[450px]" />
              <ColumnHeader label="Freq" col="frequency" widthClass="w-[140px]" />
              <ColumnHeader label="Trade" col="trade" widthClass="w-[140px]" />
              <ColumnHeader label="Dur (h)" col="estimatedDuration" widthClass="w-[100px]" icon={Hash} />
              <ColumnHeader label="Exec" col="numberOfExecutors" widthClass="w-[100px]" icon={Users} />
              <ColumnHeader label="Strat" col="taskType" widthClass="w-[180px]" />
              <ColumnHeader label="State" col="shutdownRequired" widthClass="w-[130px]" />
              <th className="px-4 py-4 bg-slate-50 border-b text-right font-black text-slate-400 uppercase tracking-widest w-[60px]">Del</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {processedData.map(r => (
                <tr key={r.id} className="hover:bg-slate-50/80 align-top transition-colors group">
                    <td className="p-3 border-r border-slate-100 overflow-hidden"><input className="w-full bg-transparent text-[11px] font-black uppercase outline-none focus:bg-white px-1 rounded" value={r.asset} onChange={e=>handleChange(r.id,'asset',e.target.value)}/></td>
                    <td className="p-3 border-r border-slate-100"><textarea rows={2} className="w-full bg-transparent text-[11px] font-medium text-slate-600 outline-none resize-y min-h-[3rem] focus:bg-white px-1 rounded" value={r.taskDescription} onChange={e=>handleChange(r.id,'taskDescription',e.target.value)}/></td>
                    <td className="p-3 border-r border-slate-100 overflow-hidden">
                        <input list={`freq-list-${r.id}`} className="w-full bg-transparent text-[11px] font-black outline-none focus:bg-white px-1 rounded border-none" value={r.frequency} placeholder="Interval..." onChange={e=>handleChange(r.id,'frequency',e.target.value)}/>
                        <datalist id={`freq-list-${r.id}`}>{frequencyOptions.map(opt => <option key={opt} value={opt} />)}</datalist>
                    </td>
                    <td className="p-3 border-r border-slate-100">
                        <div className="flex flex-col">
                            <input 
                                list={`trade-list-${r.id}`}
                                className={`w-full bg-transparent text-[11px] font-black uppercase outline-none focus:bg-white px-1 rounded ${!r.trade ? 'text-slate-300 placeholder:text-slate-300' : 'text-indigo-600'}`} 
                                value={r.trade} 
                                placeholder="Trade..."
                                onChange={e=>handleChange(r.id,'trade',e.target.value)}
                            />
                            <datalist id={`trade-list-${r.id}`}>
                                {tradeOptions.map(opt => <option key={opt} value={opt} />)}
                                {getUniqueValues('trade').filter(v => !tradeOptions.includes(v)).map(v => <option key={v} value={v} />)}
                            </datalist>
                        </div>
                    </td>
                    <td className="p-3 border-r border-slate-100 overflow-hidden"><input type="number" step="0.5" className="w-full bg-transparent text-[11px] font-black text-right outline-none focus:bg-white px-1 rounded" value={r.estimatedDuration} onChange={e=>handleChange(r.id,'estimatedDuration',Number(e.target.value))}/></td>
                    <td className="p-3 border-r border-slate-100 overflow-hidden"><input type="number" className="w-full bg-transparent text-[11px] font-black text-right outline-none focus:bg-white px-1 rounded" value={r.numberOfExecutors} onChange={e=>handleChange(r.id,'numberOfExecutors',Number(e.target.value))}/></td>
                    <td className="p-3 border-r border-slate-100 overflow-hidden">
                        <select className={`w-full bg-transparent text-[10px] font-black uppercase outline-none focus:bg-white px-1 rounded ${!r.taskType ? 'text-slate-300' : 'text-slate-800'}`} value={r.taskType} onChange={e=>handleChange(r.id,'taskType',e.target.value)}>
                            <option value="">-- Unassigned --</option>
                            <option value="Time Based">Time Based</option>
                            <option value="Condition Based">Condition Based</option>
                            <option value="Scheduled Restoration">Scheduled Restoration</option>
                            <option value="Scheduled Replacement">Scheduled Replacement</option>
                            <option value="Failure Finding">Failure Finding</option>
                        </select>
                    </td>
                    <td className="p-3 border-r border-slate-100 text-center overflow-hidden"><button onClick={() => handleChange(r.id, 'shutdownRequired', !r.shutdownRequired)} className={`px-2 py-1 rounded text-[9px] font-black border transition-all ${r.shutdownRequired ? 'bg-rose-50 text-rose-600 border-rose-200' : 'bg-emerald-50 text-emerald-600 border-emerald-200'}`}>{r.shutdownRequired ? 'SHUTDOWN' : 'RUNNING'}</button></td>
                    <td className="p-3 text-right overflow-hidden"><button onClick={()=>handleDelete(r.id)} className="text-slate-300 hover:text-rose-500 transition-colors"><Trash2 size={16}/></button></td>
                </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
export default PMDataGrid;
