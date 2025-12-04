import React, { useState, useMemo, useEffect } from 'react';
import { PMRecord } from '../types';
import { Trash2, Plus, ArrowUpDown, ArrowUp, ArrowDown, Wand2, Loader2, Copy, Check, Sparkles, Briefcase, Activity } from 'lucide-react';

interface PMDataGridProps {
  title?: string;
  data: PMRecord[];
  onUpdate: (data: PMRecord[]) => void;
  onAutoAssignTrades?: () => void;
  loadingAI?: boolean;
  enableCopy?: boolean;
  externalAssetFilter?: string;
  externalTradeFilter?: string;
  externalFreqFilter?: string;
  externalTypeFilter?: string;
  externalCriticalityFilter?: string;
  onGlobalFilterChange?: (key: 'asset' | 'trade' | 'frequency' | 'executorType' | 'criticality', value: string) => void;
}

const PMDataGrid: React.FC<PMDataGridProps> = ({ 
    title = "PM Editor", 
    data, 
    onUpdate, 
    onAutoAssignTrades, 
    loadingAI = false, 
    enableCopy = false,
    externalAssetFilter,
    externalTradeFilter,
    externalFreqFilter,
    externalTypeFilter,
    externalCriticalityFilter,
    onGlobalFilterChange
}) => {
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [sortConfig, setSortConfig] = useState<{ key: keyof PMRecord | string | null, direction: 'asc' | 'desc' }>({ key: null, direction: 'asc' });
  const [copied, setCopied] = useState(false);

  // Sync external filters (from Dashboard/App) to local state
  useEffect(() => {
      setFilters(prev => ({
          ...prev,
          asset: externalAssetFilter === 'All' ? '' : (externalAssetFilter || ''),
          trade: externalTradeFilter === 'All' ? '' : (externalTradeFilter || ''),
          frequency: externalFreqFilter === 'All' ? '' : (externalFreqFilter || ''),
          executorType: externalTypeFilter === 'All' ? '' : (externalTypeFilter || ''),
          criticality: externalCriticalityFilter === 'All' ? '' : (externalCriticalityFilter || '')
      }));
  }, [externalAssetFilter, externalTradeFilter, externalFreqFilter, externalTypeFilter, externalCriticalityFilter]);

  const handleDelete = (id: string) => {
    onUpdate(data.filter(r => r.id !== id));
  };

  const handleChange = (id: string, field: keyof PMRecord, value: any) => {
    const newData = data.map(r => r.id === id ? { ...r, [field]: value } : r);
    onUpdate(newData);
  };

  const handleAdd = () => {
    const newRecord: PMRecord = {
      id: `new-pm-${Date.now()}`,
      asset: externalAssetFilter && externalAssetFilter !== 'All' ? externalAssetFilter : 'New Asset',
      taskDescription: 'New Maintenance Task',
      frequency: '1',
      trade: '',
      estimatedDuration: 1, 
      shutdownRequired: false,
      numberOfExecutors: 1,
      executorType: 'Internal',
      origin: 'New',
      criticality: 'Medium',
      taskType: 'TBM'
    };
    onUpdate([newRecord, ...data]);
  };

  const handleClear = () => {
      if(confirm('Clear all PM tasks?')) onUpdate([]);
  };

  const handleSort = (key: keyof PMRecord) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };

  const handleFilterChange = (key: string, value: string) => {
      setFilters(prev => ({ ...prev, [key]: value }));
      
      if (onGlobalFilterChange) {
          const globalValue = value === '' ? 'All' : value;
          if (key === 'asset') onGlobalFilterChange('asset', globalValue);
          if (key === 'trade') onGlobalFilterChange('trade', globalValue);
          if (key === 'frequency') onGlobalFilterChange('frequency', globalValue);
          if (key === 'executorType') onGlobalFilterChange('executorType', globalValue);
          if (key === 'criticality') onGlobalFilterChange('criticality', globalValue);
      }
  };

  const getUniqueValues = (key: keyof PMRecord) => {
    const values = Array.from(new Set(data.map(r => String(r[key] || '').trim()))).filter(v => v !== '');
    // Sort numeric values properly if frequency
    if (key === 'frequency') {
        return values.sort((a: string, b: string) => parseFloat(a) - parseFloat(b));
    }
    return values.sort();
  };

  const processedData = useMemo(() => {
    let result = [...data];
    
    // 1. Column Specific Filtering
    Object.keys(filters).forEach(key => {
        const filterValue = filters[key].toLowerCase();
        if (filterValue) {
            result = result.filter(r => {
                const cellValue = String(r[key as keyof PMRecord] || '').toLowerCase();
                const isDropdown = ['asset', 'frequency', 'trade', 'executorType', 'criticality', 'taskType'].includes(key);
                return isDropdown ? cellValue === filterValue : cellValue.includes(filterValue);
            });
        }
    });

    // 2. Sort
    if (sortConfig.key) {
        result.sort((a: any, b: any) => {
            let valA = a[sortConfig.key!];
            let valB = b[sortConfig.key!];
            if (typeof valA === 'string') { valA = valA.toLowerCase(); valB = valB.toLowerCase(); }
            if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
            if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }
    return result;
  }, [data, filters, sortConfig]);

  const handleCopyTable = () => {
      const headers = ['Asset', 'Description', 'Interval(M)', 'Trade', 'Executors', 'Type', 'Est.Hours', 'Shutdown?', 'Source', 'Criticality', 'Strategy'];
      const rows = processedData.map(r => [
          r.asset,
          r.taskDescription,
          r.frequency,
          r.trade,
          r.numberOfExecutors,
          r.executorType,
          r.estimatedDuration,
          r.shutdownRequired ? 'Yes' : 'No',
          r.origin || 'N/A',
          r.criticality || 'Medium',
          r.taskType || 'TBM'
      ]);
      const tsv = [headers.join('\t'), ...rows.map(row => row.join('\t'))].join('\n');
      navigator.clipboard.writeText(tsv).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
      });
  };

  const ColumnHeader = ({ label, columnKey, width }: { label: string, columnKey: keyof PMRecord, width?: string }) => {
      const isDropdown = ['asset', 'frequency', 'trade', 'executorType', 'criticality', 'taskType'].includes(columnKey);
      return (
        <th className={`px-4 py-3 align-top bg-gray-100 border-b border-gray-200 ${width || ''}`}>
            <div className="flex flex-col gap-2">
                <div className="flex items-center gap-1 cursor-pointer hover:text-emerald-600 select-none" onClick={() => handleSort(columnKey)}>
                    <span className="font-semibold">{label}</span>
                    {sortConfig.key === columnKey ? (
                        sortConfig.direction === 'asc' ? <ArrowUp size={14}/> : <ArrowDown size={14}/>
                    ) : <ArrowUpDown size={14} className="opacity-30"/>}
                </div>
                {isDropdown ? (
                    <select
                        value={filters[columnKey] || ''}
                        onChange={(e) => handleFilterChange(columnKey, e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full text-xs px-2 py-1.5 rounded border border-gray-300 focus:ring-1 focus:ring-emerald-500 bg-white"
                    >
                        <option value="">All</option>
                        {getUniqueValues(columnKey).map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                ) : (
                    <input 
                        type="text" placeholder="Filter..."
                        value={filters[columnKey] || ''}
                        onChange={(e) => handleFilterChange(columnKey, e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full text-xs px-2 py-1 rounded border border-gray-300 focus:ring-1 focus:ring-emerald-500"
                    />
                )}
            </div>
        </th>
      );
  };

  return (
    <div className="bg-white rounded-lg shadow border border-gray-200 flex flex-col h-full">
      <div className="p-4 border-b border-gray-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-gray-50">
        <div className="flex items-center gap-4">
            <h3 className="font-semibold text-gray-700 flex items-center gap-2">
                {title} <span className="text-xs font-normal text-gray-500">({processedData.length} tasks)</span>
            </h3>
            {externalAssetFilter && externalAssetFilter !== 'All' && (
                <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-1 rounded border border-emerald-100">
                    Filtered
                </span>
            )}
        </div>
        
        <div className="flex items-center gap-2">
            <div className="hidden lg:flex items-center gap-3 mr-4 text-xs">
                <div className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded-full bg-blue-100 border border-blue-200"></span>
                    <span className="text-gray-500">Current Plan</span>
                </div>
                <div className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded-full bg-emerald-100 border border-emerald-200"></span>
                    <span className="text-gray-500">AI Recommended</span>
                </div>
            </div>

            {onAutoAssignTrades && (
                <button 
                    onClick={onAutoAssignTrades} 
                    disabled={loadingAI}
                    className="flex items-center gap-1 bg-purple-100 hover:bg-purple-200 text-purple-700 px-3 py-1.5 rounded text-sm transition border border-purple-200 disabled:opacity-50 mr-2"
                    title="Enrich Trade & Strategy (MTA)"
                >
                    {loadingAI ? <Loader2 size={16} className="animate-spin"/> : <Wand2 size={16} />} 
                    <span className="hidden sm:inline">AI Auto-Enrich</span>
                </button>
            )}
             {enableCopy && (
                <button 
                    onClick={handleCopyTable}
                    className="flex items-center gap-1 bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded text-sm transition border border-gray-300 mr-2"
                >
                    {copied ? <Check size={16} className="text-green-600"/> : <Copy size={16} />}
                    <span className="hidden sm:inline">{copied ? 'Copied!' : 'Copy Table'}</span>
                </button>
            )}
            <button onClick={handleClear} className="text-gray-500 hover:text-red-600 px-3 py-1.5 text-sm transition">Clear</button>
            <button onClick={handleAdd} className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded text-sm transition">
                <Plus size={16} /> Add Task
            </button>
        </div>
      </div>
      
      <div className="overflow-auto flex-1 custom-scrollbar">
        <table className="w-full text-sm text-left text-gray-500">
          <thead className="text-xs text-gray-700 uppercase bg-gray-100 sticky top-0 z-10 shadow-sm">
            <tr>
              <ColumnHeader label="Asset / Location" columnKey="asset" width="min-w-[150px]" />
              <ColumnHeader label="Task Description" columnKey="taskDescription" width="min-w-[300px]" />
              <ColumnHeader label="Interval (M)" columnKey="frequency" width="min-w-[100px]" />
              <ColumnHeader label="Trade" columnKey="trade" width="min-w-[120px]" />
              <ColumnHeader label="Executors" columnKey="numberOfExecutors" width="min-w-[80px]" />
              <ColumnHeader label="Type" columnKey="executorType" width="min-w-[100px]" />
              <ColumnHeader label="Est. Hours" columnKey="estimatedDuration" width="min-w-[80px]" />
              {/* New MTA Columns */}
              <ColumnHeader label="Strategy" columnKey="taskType" width="min-w-[100px]" />
              <ColumnHeader label="Criticality" columnKey="criticality" width="min-w-[100px]" />

              <th className="px-4 py-3 align-top bg-gray-100 border-b border-gray-200 w-[100px]">
                  <div className="font-semibold mb-2">Shutdown?</div>
              </th>
              <th className="px-4 py-3 bg-gray-100 border-b border-gray-200 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {processedData.length === 0 ? (
                <tr><td colSpan={11} className="text-center py-12 text-gray-400">No tasks found (Try adjusting filters).</td></tr>
            ) : (
                processedData.map((row) => (
                <tr 
                    key={row.id} 
                    className={`border-b transition align-top ${
                        row.origin === 'New' ? 'bg-emerald-50 hover:bg-emerald-100' : 
                        row.origin === 'Current' ? 'bg-blue-50 hover:bg-blue-100' : 
                        'bg-white hover:bg-gray-50'
                    }`}
                >
                    <td className="px-4 py-2">
                        <input type="text" className={`bg-transparent w-full border-none focus:ring-0 p-0 ${!row.asset || row.asset === 'Unknown' ? 'text-red-500 font-bold' : ''}`}
                            value={row.asset} onChange={(e) => handleChange(row.id, 'asset', e.target.value)} />
                    </td>
                    <td className="px-4 py-2 relative group">
                        <div className="flex items-start gap-2">
                             <div className="mt-1">
                                 {row.origin === 'New' && (
                                    <span title="AI Recommendation">
                                        <Sparkles size={14} className="text-emerald-500 shrink-0" />
                                    </span>
                                 )}
                                 {row.origin === 'Current' && (
                                    <span title="Existing Task">
                                        <Briefcase size={14} className="text-blue-500 shrink-0" />
                                    </span>
                                 )}
                             </div>
                             <textarea 
                                rows={3} 
                                className="bg-transparent w-full border-none focus:ring-0 p-0 resize-y min-h-[3rem] whitespace-pre-wrap"
                                value={row.taskDescription} 
                                onChange={(e) => handleChange(row.id, 'taskDescription', e.target.value)} 
                             />
                        </div>
                    </td>
                    <td className="px-4 py-2">
                        <input type="text" className="bg-transparent w-full border-none focus:ring-0 p-0 text-center"
                            value={row.frequency} onChange={(e) => handleChange(row.id, 'frequency', e.target.value)} />
                    </td>
                    <td className="px-4 py-2">
                         <select className={`bg-transparent w-full border-none focus:ring-0 p-0 ${!row.trade || row.trade === 'General' ? 'text-gray-400' : 'text-gray-900 font-medium'}`}
                            value={row.trade} onChange={(e) => handleChange(row.id, 'trade', e.target.value)}>
                            <option value="">Select...</option>
                            <option value="Mechanical">Mechanical</option>
                            <option value="Electrical">Electrical</option>
                            <option value="Instrumentation">Instrumentation</option>
                            <option value="Production">Production</option>
                            <option value="Lubrication">Lubrication</option>
                            <option value="General">General</option>
                        </select>
                    </td>
                    <td className="px-4 py-2">
                        <input type="number" min="1" className="bg-transparent w-full border-none focus:ring-0 p-0 text-center"
                            value={row.numberOfExecutors} onChange={(e) => handleChange(row.id, 'numberOfExecutors', parseInt(e.target.value))} />
                    </td>
                    <td className="px-4 py-2">
                         <select className={`bg-transparent w-full border-none focus:ring-0 p-0 ${row.executorType === 'Contractor' ? 'text-orange-600 font-medium' : row.executorType === 'Internal + Contractor' ? 'text-purple-600 font-medium' : 'text-emerald-700'}`}
                            value={row.executorType} onChange={(e) => handleChange(row.id, 'executorType', e.target.value)}>
                            <option value="Internal">Internal</option>
                            <option value="Contractor">Contractor</option>
                            <option value="Internal + Contractor">Internal + Contractor</option>
                        </select>
                    </td>
                    <td className="px-4 py-2 font-mono text-emerald-700">
                        <input type="number" className="bg-transparent w-full border-none focus:ring-0 p-0 text-center"
                            value={row.estimatedDuration} onChange={(e) => handleChange(row.id, 'estimatedDuration', Number(e.target.value))} />
                    </td>
                    {/* Strategy Column */}
                    <td className="px-4 py-2">
                         <select className={`bg-transparent w-full border-none focus:ring-0 p-0 font-bold text-xs ${
                             row.taskType === 'CBM' ? 'text-green-600' : 
                             row.taskType === 'TBM' ? 'text-blue-600' : 
                             row.taskType === 'FF' ? 'text-orange-600' : 'text-gray-400'
                         }`}
                            value={row.taskType || ''} onChange={(e) => handleChange(row.id, 'taskType', e.target.value)}>
                            <option value="">Unknown</option>
                            <option value="TBM">TBM (Time)</option>
                            <option value="CBM">CBM (Cond)</option>
                            <option value="FF">FF (Failure Finding)</option>
                        </select>
                    </td>
                    {/* Criticality Column */}
                    <td className="px-4 py-2">
                         <select className={`bg-transparent w-full border-none focus:ring-0 p-0 font-bold text-xs ${
                             row.criticality === 'High' ? 'text-red-600' : 
                             row.criticality === 'Medium' ? 'text-yellow-600' : 'text-gray-400'
                         }`}
                            value={row.criticality || ''} onChange={(e) => handleChange(row.id, 'criticality', e.target.value)}>
                            <option value="Low">Low</option>
                            <option value="Medium">Medium</option>
                            <option value="High">High</option>
                        </select>
                    </td>

                    <td className="px-4 py-2 text-center">
                        <input type="checkbox" className="rounded text-emerald-600 focus:ring-emerald-500"
                            checked={row.shutdownRequired} onChange={(e) => handleChange(row.id, 'shutdownRequired', e.target.checked)} />
                    </td>
                    <td className="px-4 py-2 text-right">
                        <button onClick={() => handleDelete(row.id)} className="text-gray-400 hover:text-red-500 p-1"><Trash2 size={16} /></button>
                    </td>
                </tr>
                ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
export default PMDataGrid;