
import React, { useState, useMemo, useEffect } from 'react';
import { RawRecord, StoppageType } from '../types';
import { Trash2, Plus, ArrowUpDown, ArrowUp, ArrowDown, Sparkles, Loader2 } from 'lucide-react';
import { suggestFailureMode } from '../services/geminiService';

interface DataGridProps {
  title?: string;
  data: RawRecord[];
  onUpdate: (data: RawRecord[]) => void;
  externalAssetFilter?: string;
  externalModeFilter?: string;
  onGlobalFilterChange?: (key: 'asset' | 'failureMode', value: string) => void;
}

const DataGrid: React.FC<DataGridProps> = ({ 
    title = "Data Editor", 
    data, 
    onUpdate,
    externalAssetFilter,
    externalModeFilter,
    onGlobalFilterChange
}) => {
  // State for column-specific filters
  const [filters, setFilters] = useState<Record<string, string>>({});
  
  const [sortConfig, setSortConfig] = useState<{ key: keyof RawRecord | string | null, direction: 'asc' | 'desc' }>({ key: null, direction: 'asc' });
  const [suggestingId, setSuggestingId] = useState<string | null>(null);

  // Sync external filters (from Dashboard) to local state
  useEffect(() => {
      setFilters(prev => ({
          ...prev,
          location: externalAssetFilter === 'All' ? '' : (externalAssetFilter || ''),
          failureMode: externalModeFilter === 'All' ? '' : (externalModeFilter || '')
      }));
  }, [externalAssetFilter, externalModeFilter]);

  const handleDelete = (id: string) => {
    onUpdate(data.filter(r => r.id !== id));
  };

  const handleChange = (id: string, field: keyof RawRecord, value: any) => {
    const newData = data.map(r => r.id === id ? { ...r, [field]: value } : r);
    onUpdate(newData);
  };

  const handleSuggestMode = async (id: string, description: string) => {
      if (!description) return;
      setSuggestingId(id);
      const suggestedMode = await suggestFailureMode(description);
      if (suggestedMode) {
          handleChange(id, 'failureMode', suggestedMode);
      }
      setSuggestingId(null);
  };

  const handleAdd = () => {
    const newRecord: RawRecord = {
      id: `new-${Date.now()}`,
      startTime: new Date().toISOString(),
      ttbf: 0,
      durationMinutes: 60,
      type: StoppageType.Unplanned,
      description: 'New Entry',
      location: 'Asset A',
      failureMode: ''
    };
    onUpdate([newRecord, ...data]);
  };

  const handleClear = () => {
      if(confirm('Are you sure you want to clear all data?')) {
          onUpdate([]);
      }
  }

  const handleSort = (key: keyof RawRecord) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
        direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const handleFilterChange = (key: string, value: string) => {
      // Update local state for immediate feedback
      setFilters(prev => ({
          ...prev,
          [key]: value
      }));

      // Notify parent if this is a global filter key
      if (onGlobalFilterChange) {
          if (key === 'location') {
              onGlobalFilterChange('asset', value === '' ? 'All' : value);
          } else if (key === 'failureMode') {
              onGlobalFilterChange('failureMode', value === '' ? 'All' : value);
          }
      }
  };

  // Helper to get unique values for dropdowns
  const getUniqueValues = (key: keyof RawRecord) => {
    const values = Array.from(new Set(data.map(r => String(r[key] || '').trim()))).filter(v => v !== '');
    return values.sort();
  };

  const processedData = useMemo(() => {
    let result = [...data];

    // 1. Column Specific Filtering
    Object.keys(filters).forEach(key => {
        const filterValue = filters[key].toLowerCase();
        if (filterValue) {
            result = result.filter(r => {
                let cellValue = r[key as keyof RawRecord];
                
                // Format dates for string comparison
                if (key === 'startTime' && cellValue) {
                    cellValue = String(cellValue).substring(0, 16).replace('T', ' ');
                }
                
                // Exact match for dropdowns (Asset, Type, Failure Mode), partial match for others
                const isDropdown = ['location', 'type', 'failureMode'].includes(key);
                if (isDropdown) {
                     return String(cellValue || '').toLowerCase() === filterValue;
                }
                
                return String(cellValue || '').toLowerCase().includes(filterValue);
            });
        }
    });

    // 2. Sort
    if (sortConfig.key) {
        result.sort((a: any, b: any) => {
            let valA = a[sortConfig.key!];
            let valB = b[sortConfig.key!];

            // Handle Dates
            if (sortConfig.key === 'startTime') {
                valA = valA ? new Date(valA).getTime() : 0;
                valB = valB ? new Date(valB).getTime() : 0;
            }
            // Handle Strings
            else if (typeof valA === 'string') {
                valA = valA.toLowerCase();
                valB = valB ? valB.toLowerCase() : '';
            }
            // Handle Numbers (ttbf, durationMinutes) defaults
            else {
                valA = valA || 0;
                valB = valB || 0;
            }

            if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
            if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }

    return result;
  }, [data, filters, sortConfig]);

  const ColumnHeader = ({ label, columnKey, width }: { label: string, columnKey: keyof RawRecord, width?: string }) => {
      const isDropdown = ['location', 'type', 'failureMode'].includes(columnKey as string);
      const uniqueOptions = isDropdown ? getUniqueValues(columnKey) : [];

      return (
        <th 
            className={`px-4 py-3 align-top bg-gray-100 border-b border-gray-200 ${width || ''}`}
        >
            <div className="flex flex-col gap-2">
                {/* Sortable Label */}
                <div 
                    className="flex items-center gap-1 cursor-pointer hover:text-indigo-600 select-none"
                    onClick={() => handleSort(columnKey)}
                >
                    <span className="font-semibold">{label}</span>
                    <span className="flex flex-col">
                        {sortConfig.key === columnKey ? (
                            sortConfig.direction === 'asc' ? <ArrowUp size={14} className="text-indigo-600"/> : <ArrowDown size={14} className="text-indigo-600"/>
                        ) : (
                            <ArrowUpDown size={14} className="text-gray-400 opacity-50"/>
                        )}
                    </span>
                </div>

                {/* Filter Input */}
                {isDropdown ? (
                    <select
                        value={filters[columnKey as string] || ''}
                        onChange={(e) => handleFilterChange(columnKey as string, e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full text-xs px-2 py-1.5 rounded border border-gray-300 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 font-normal bg-white text-gray-700 cursor-pointer"
                    >
                        <option value="">All</option>
                        {uniqueOptions.map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                        ))}
                    </select>
                ) : (
                    <input 
                        type="text" 
                        placeholder="Filter..."
                        value={filters[columnKey as string] || ''}
                        onChange={(e) => handleFilterChange(columnKey as string, e.target.value)}
                        onClick={(e) => e.stopPropagation()} // Prevent sorting when clicking input
                        className="w-full text-xs px-2 py-1 rounded border border-gray-300 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 font-normal"
                    />
                )}
            </div>
        </th>
      );
  };

  return (
    <div className="bg-white rounded-lg shadow border border-gray-200 flex flex-col h-full">
      <div className="p-4 border-b border-gray-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-gray-50">
        
        {/* Left Side: Title */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
             <h3 className="font-semibold text-gray-700 flex items-center gap-2 whitespace-nowrap">
                {title} <span className="text-xs font-normal text-gray-500">({processedData.length} records)</span>
            </h3>
            {(externalAssetFilter && externalAssetFilter !== 'All') || (externalModeFilter && externalModeFilter !== 'All') ? (
                <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-1 rounded border border-indigo-100 flex items-center gap-1">
                    Filtered by Dashboard: 
                    {externalAssetFilter !== 'All' && <span className="font-bold">{externalAssetFilter}</span>}
                    {externalAssetFilter !== 'All' && externalModeFilter !== 'All' && <span>&</span>}
                    {externalModeFilter !== 'All' && <span className="font-bold">{externalModeFilter}</span>}
                </span>
            ) : null}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2 w-full md:w-auto justify-end">
            <button 
                onClick={handleClear}
                className="text-gray-500 hover:text-red-600 px-3 py-1.5 text-sm transition"
            >
                Clear
            </button>
            <button 
                onClick={handleAdd}
                className="flex items-center gap-1 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded text-sm transition whitespace-nowrap"
            >
                <Plus size={16} /> Add Record
            </button>
        </div>
      </div>
      
      <div className="overflow-auto flex-1 custom-scrollbar">
        <table className="w-full text-sm text-left text-gray-500">
          <thead className="text-xs text-gray-700 uppercase bg-gray-100 sticky top-0 z-10 shadow-sm">
            <tr>
              <ColumnHeader label="Start Time" columnKey="startTime" width="min-w-[160px]" />
              <ColumnHeader label="Duration (Min)" columnKey="durationMinutes" width="min-w-[100px]" />
              <ColumnHeader label="Asset" columnKey="location" width="min-w-[140px]" />
              <ColumnHeader label="Type" columnKey="type" width="min-w-[120px]" />
              <ColumnHeader label="Description" columnKey="description" width="min-w-[300px]" />
              <ColumnHeader label="Failure Mode" columnKey="failureMode" width="min-w-[160px]" />
              <th className="px-4 py-3 bg-gray-100 border-b border-gray-200 text-right align-top">
                  <div className="mt-7">Actions</div>
              </th>
            </tr>
          </thead>
          <tbody>
            {processedData.length === 0 ? (
                <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                        <div className="flex flex-col items-center justify-center gap-3">
                            <p>{data.length === 0 ? "No records found." : "No matches found for your active filters."}</p>
                            {data.length === 0 && (
                                <button onClick={handleAdd} className="text-indigo-600 hover:underline">Add a new record manually</button>
                            )}
                        </div>
                    </td>
                </tr>
            ) : (
                processedData.map((row) => (
                <tr key={row.id} className="bg-white border-b hover:bg-gray-50 align-top">
                    <td className="px-4 py-2">
                        <input 
                            type="datetime-local" 
                            className="bg-transparent border border-transparent hover:border-gray-200 rounded px-2 py-1 focus:ring-1 focus:ring-indigo-500 focus:bg-white text-gray-900 w-full transition"
                            value={row.startTime ? row.startTime.substring(0, 16) : ''}
                            onChange={(e) => handleChange(row.id, 'startTime', new Date(e.target.value).toISOString())}
                        />
                    </td>
                    <td className="px-4 py-2">
                        <input 
                            type="number" 
                            className="bg-transparent w-24 border border-transparent hover:border-gray-200 rounded px-2 py-1 focus:ring-1 focus:ring-indigo-500 focus:bg-white text-gray-900 transition"
                            value={row.durationMinutes}
                            onChange={(e) => handleChange(row.id, 'durationMinutes', Number(e.target.value))}
                        />
                    </td>
                    <td className="px-4 py-2">
                        <input 
                            type="text" 
                            className="bg-transparent w-full border border-transparent hover:border-gray-200 rounded px-2 py-1 focus:ring-1 focus:ring-indigo-500 focus:bg-white text-gray-900 transition"
                            value={row.location}
                            onChange={(e) => handleChange(row.id, 'location', e.target.value)}
                        />
                    </td>
                    <td className="px-4 py-2">
                        <select 
                            className="bg-transparent border border-transparent hover:border-gray-200 rounded px-1 py-1 focus:ring-1 focus:ring-indigo-500 focus:bg-white text-gray-900 transition"
                            value={row.type}
                            onChange={(e) => handleChange(row.id, 'type', e.target.value)}
                        >
                            {Object.values(StoppageType).map(t => (
                                <option key={t} value={t}>{t}</option>
                            ))}
                        </select>
                    </td>
                    <td className="px-4 py-2">
                        <textarea 
                            className="bg-transparent w-full border border-transparent hover:border-gray-200 rounded px-2 py-1 focus:ring-1 focus:ring-indigo-500 focus:bg-white text-gray-900 transition h-auto min-h-[2.5rem] resize-y"
                            rows={2}
                            value={row.description}
                            onChange={(e) => handleChange(row.id, 'description', e.target.value)}
                        />
                    </td>
                    <td className="px-4 py-2">
                        <div className="flex items-center gap-1">
                            <input 
                                type="text" 
                                className="bg-transparent w-full border border-transparent hover:border-gray-200 rounded px-2 py-1 focus:ring-1 focus:ring-indigo-500 focus:bg-white text-gray-900 transition"
                                value={row.failureMode}
                                onChange={(e) => handleChange(row.id, 'failureMode', e.target.value)}
                                placeholder="Uncategorized"
                            />
                            <button 
                                onClick={() => handleSuggestMode(row.id, row.description)}
                                disabled={suggestingId === row.id || !row.description || row.description === 'No description'}
                                className="p-1.5 text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition disabled:opacity-30"
                                title="Auto-classify using AI"
                            >
                                {suggestingId === row.id ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                            </button>
                        </div>
                    </td>
                    <td className="px-4 py-2 text-right">
                        <button 
                            onClick={() => handleDelete(row.id)}
                            className="text-gray-400 hover:text-red-500 p-1 transition"
                        >
                            <Trash2 size={16} />
                        </button>
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

export default DataGrid;
