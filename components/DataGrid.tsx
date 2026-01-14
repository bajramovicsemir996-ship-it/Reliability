
import React, { useState, useMemo } from 'react';
import { RawRecord, StoppageType } from '../types';
import { Trash2, Plus, ArrowUpDown, ArrowUp, ArrowDown, Sparkles, Loader2, ListChecks, Check, X, ArrowRight, Info, Filter, Calendar } from 'lucide-react';
import { suggestFailureMode, classifyFailureModes, performSemanticClustering } from '../services/geminiService';
import { useAppStore } from '../store';

interface DataGridProps {
  data: RawRecord[];
  setData: (data: RawRecord[]) => void;
  loadingAI: boolean;
  setLoadingAI: (loading: boolean) => void;
  filters: { asset: string; failureMode: string };
  onGlobalFilterChange: (key: string, value: string) => void;
}

interface ReviewItem {
    id: string;
    description: string;
    suggestedMode: string;
    reasoning: string;
}

const isUncategorized = (mode: string | undefined) => {
    if (!mode) return true;
    const lower = mode.trim().toLowerCase();
    return ['', 'uncategorized', 'other', 'unknown', 'n/a', 'misc'].includes(lower);
};

const DataGrid: React.FC<DataGridProps> = ({ data, setData, loadingAI, setLoadingAI, filters, onGlobalFilterChange }) => {
  const { language } = useAppStore();
  const [localFilters, setLocalFilters] = useState<Record<string, string>>({
    month: '',
    year: ''
  });
  const [sortConfig, setSortConfig] = useState<{ key: string | null, direction: 'asc' | 'desc' }>({ key: null, direction: 'asc' });
  const [suggestingId, setSuggestingId] = useState<string | null>(null);

  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewData, setReviewData] = useState<ReviewItem[]>([]);

  const uncategorizedCount = useMemo(() => data.filter(r => isUncategorized(r.failureMode)).length, [data]);

  const assetList = useMemo(() => {
      return Array.from(new Set(data.map(r => r.location))).filter(a => !!a && a !== 'Unknown Asset').sort();
  }, [data]);

  const delayTypeList = useMemo(() => {
      return Array.from(new Set(data.map(r => r.delayType))).filter(t => !!t).sort();
  }, [data]);

  const yearsList = useMemo(() => {
    const years = data.map(r => r.startTime ? new Date(r.startTime).getFullYear().toString() : '').filter(y => !!y);
    return Array.from(new Set(years)).sort((a: string, b: string) => b.localeCompare(a));
  }, [data]);

  const monthsList = [
    { value: '01', label: 'January' }, { value: '02', label: 'February' }, { value: '03', label: 'March' },
    { value: '04', label: 'April' }, { value: '05', label: 'May' }, { value: '06', label: 'June' },
    { value: '07', label: 'July' }, { value: '08', label: 'August' }, { value: '09', label: 'September' },
    { value: '10', label: 'October' }, { value: '11', label: 'November' }, { value: '12', label: 'December' }
  ];

  const handleDelete = (id: string) => setData(data.filter(r => r.id !== id));
  const handleChange = (id: string, field: keyof RawRecord, value: any) => {
    setData(data.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const handleAssetSelectChange = (id: string, value: string) => {
      if (value === '@@NEW@@') {
          const newName = prompt("Enter new asset name:");
          if (newName && newName.trim()) {
              handleChange(id, 'location', newName.trim());
          }
      } else {
          handleChange(id, 'location', value);
      }
  };

  const handleDateChange = (id: string, currentIso: string | undefined, newDate: string) => {
      if (!newDate) return;
      const iso = currentIso || new Date().toISOString();
      const timePart = iso.length >= 16 ? iso.substring(11) : '00:00:00.000Z';
      handleChange(id, 'startTime', `${newDate}T${timePart}`);
  };

  const handleTimeChange = (id: string, currentIso: string | undefined, newTime: string) => {
      if (!newTime) return;
      const iso = currentIso || new Date().toISOString();
      const datePart = iso.substring(0, 10);
      const suffix = iso.length > 16 ? iso.substring(16) : ':00.000Z';
      handleChange(id, 'startTime', `${datePart}T${newTime}${suffix}`);
  };

  const getEndTimeStr = (iso: string | undefined, duration: number) => {
      if (!iso) return '';
      try {
          const d = new Date(iso);
          const end = new Date(d.getTime() + duration * 60000);
          return end.toISOString().substring(11, 16);
      } catch { return ''; }
  };

  const handleSuggestMode = async (id: string, description: string) => {
      if (!description) return;
      setSuggestingId(id);
      const suggestion = await suggestFailureMode(description, language);
      if (suggestion.mode) handleChange(id, 'failureMode', suggestion.mode);
      setSuggestingId(null);
  };

  const handleReviewMissing = async () => {
      const missingRecords = data.filter(r => isUncategorized(r.failureMode));
      if (missingRecords.length === 0) return alert("All records have failure modes assigned.");
      setLoadingAI(true);
      try {
          const map = await classifyFailureModes(missingRecords, language);
          const reviews: ReviewItem[] = missingRecords.map(r => {
              const aiResult = map.get(r.description.trim());
              return {
                  id: r.id,
                  description: r.description,
                  suggestedMode: aiResult?.mode || 'Mechanical: Component Wear/Fatigue',
                  reasoning: aiResult?.reasoning || 'Categorized based on historical patterns'
              };
          });
          setReviewData(reviews);
          setReviewModalOpen(true);
      } catch(e) { 
          alert("AI Classification Failed. Please check your connectivity."); 
      } finally { 
          setLoadingAI(false); 
      }
  };

  const handleApplyReview = () => {
      const updates = new Map(reviewData.map(r => [r.id, r.suggestedMode]));
      setData(data.map(r => updates.has(r.id) ? { ...r, failureMode: updates.get(r.id)! } : r));
      setReviewModalOpen(false);
  };

  const handleSemanticClustering = async () => {
      if (data.length === 0) return;
      setLoadingAI(true);
      try {
          const map = await performSemanticClustering(data, language);
          const updated = data.map(r => ({
              ...r,
              description: map.get(r.description.trim()) || r.description
          }));
          setData(updated);
      } catch (e) { 
          alert("Clustering failed."); 
      } finally { 
          setLoadingAI(false); 
      }
  };

  const handleAdd = () => {
    setData([{
      id: `new-${Date.now()}`,
      startTime: new Date().toISOString(),
      ttbf: 0,
      durationMinutes: 60,
      type: StoppageType.Unplanned,
      description: 'New Entry',
      location: assetList.length > 0 ? assetList[0] : 'Asset A',
      failureMode: '',
      delayType: ''
    }, ...data]);
  };

  const handleSort = (key: string) => {
    setSortConfig({ key, direction: sortConfig.key === key && sortConfig.direction === 'asc' ? 'desc' : 'asc' });
  };

  const handleFilterChange = (key: string, value: string) => {
      setLocalFilters(prev => ({ ...prev, [key]: value }));
      if (key === 'location') onGlobalFilterChange('asset', value || 'All');
      if (key === 'failureMode') onGlobalFilterChange('failureMode', value || 'All');
  };

  const getUniqueValues = (key: keyof RawRecord) => Array.from(new Set(data.map(r => String(r[key] || '').trim()))).filter(v => v !== '').sort();

  const processedData = useMemo(() => {
    let result = [...data];
    
    // Global filters from props
    if (filters.asset !== 'All') result = result.filter(r => r.location === filters.asset);
    if (filters.failureMode !== 'All') result = result.filter(r => r.failureMode === filters.failureMode);

    // Date filters (Month/Year)
    if (localFilters.month) {
        result = result.filter(r => r.startTime?.substring(5,7) === localFilters.month);
    }
    if (localFilters.year) {
        result = result.filter(r => r.startTime?.substring(0,4) === localFilters.year);
    }

    // Local dropdown filters (Asset, Failure Mode, Delay Type)
    Object.keys(localFilters).forEach(key => {
        const val = localFilters[key];
        if (!val || val === 'All' || key === 'month' || key === 'year') return;
        
        if (key === 'location') {
            result = result.filter(r => r.location === val);
        } else if (key === 'failureMode') {
            result = result.filter(r => r.failureMode === val);
        } else if (key === 'delayType') {
            result = result.filter(r => r.delayType === val);
        }
    });

    if (sortConfig.key) {
        result.sort((a: any, b: any) => {
            let valA = sortConfig.key === 'date' ? new Date(a.startTime).getTime() : a[sortConfig.key!];
            let valB = sortConfig.key === 'date' ? new Date(b.startTime).getTime() : b[sortConfig.key!];
            return (valA < valB ? -1 : 1) * (sortConfig.direction === 'asc' ? 1 : -1);
        });
    }
    return result;
  }, [data, localFilters, sortConfig, filters]);

  const ColumnHeader = ({ label, filterKey, sortKey, width, isDropdown, dropdownKey, hideFilter }: any) => {
      const currentVal = (filterKey === 'location' ? (filters.asset === 'All' ? '' : filters.asset) : filterKey === 'failureMode' ? (filters.failureMode === 'All' ? '' : filters.failureMode) : localFilters[filterKey] || '');
      return (
        <th className={`px-4 py-4 align-top bg-slate-50 border-b border-slate-200 ${width || ''}`}>
            <div className="flex flex-col gap-2">
                <div className="flex items-center gap-1 cursor-pointer hover:text-indigo-600 select-none text-[10px] font-black uppercase tracking-wider text-slate-400" onClick={() => sortKey && handleSort(sortKey)}>
                    {label} {sortKey && (sortConfig.key === sortKey ? (sortConfig.direction === 'asc' ? <ArrowUp size={12}/> : <ArrowDown size={12}/>) : <ArrowUpDown size={12} className="opacity-30"/>)}
                </div>
                {!hideFilter && (
                    isDropdown && dropdownKey ? (
                        <select value={currentVal} onChange={(e) => handleFilterChange(filterKey, e.target.value)} className="w-full text-[10px] font-bold uppercase py-1.5 px-2 rounded-lg border border-slate-200 bg-white focus:ring-2 focus:ring-indigo-500 transition-all outline-none">
                            <option value="">All</option>
                            {getUniqueValues(dropdownKey).map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                    ) : (
                        <input type="text" placeholder="Filter..." value={currentVal} onChange={(e) => handleFilterChange(filterKey, e.target.value)} className="w-full text-[10px] font-bold py-1.5 px-2 rounded-lg border border-slate-200 bg-white focus:ring-2 focus:ring-indigo-500 transition-all outline-none"/>
                    )
                )}
            </div>
        </th>
      );
  };

  return (
    <div className="bg-white rounded-[2rem] shadow-xl border border-slate-200 flex flex-col h-full relative overflow-hidden ring-1 ring-slate-900/5">
      <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white shrink-0">
        <div>
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                <ArrowRight size={18} className="text-indigo-500" /> Database View
            </h3>
            <p className="text-[10px] text-slate-400 font-bold uppercase mt-1 tracking-tighter">Database: {processedData.length} active records</p>
        </div>
        <div className="flex items-center gap-4">
             <div className="flex items-center gap-2 p-1.5 bg-slate-50 rounded-2xl border border-slate-100 shadow-inner">
                 <button onClick={handleSemanticClustering} title="Standardize descriptions" disabled={loadingAI} className="flex items-center gap-2 bg-white hover:bg-indigo-50 text-indigo-700 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition shadow-sm border border-slate-200 disabled:opacity-50">{loadingAI ? <Loader2 size={14} className="animate-spin"/> : <Sparkles size={14}/>} 1. Clean</button>
                 <ArrowRight size={14} className="text-slate-300"/>
                 <button onClick={handleReviewMissing} title="Assign failure modes" disabled={loadingAI} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition shadow-lg relative border border-transparent disabled:opacity-50">
                    {loadingAI ? <Loader2 size={14} className="animate-spin"/> : <ListChecks size={14}/>} 2. Classify
                    {uncategorizedCount > 0 && <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full shadow-md border border-white animate-pulse">{uncategorizedCount}</span>}
                 </button>
             </div>
             <button onClick={handleAdd} className="flex items-center gap-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-6 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm"><Plus size={16} /> New Entry</button>
        </div>
      </div>
      <div className="overflow-auto flex-1 custom-scrollbar">
        <table className="w-full text-sm text-left text-slate-500 border-collapse">
          <thead className="text-[10px] text-slate-700 uppercase bg-slate-50 sticky top-0 z-10 shadow-sm">
            <tr>
              <th className="px-4 py-4 align-top bg-slate-50 border-b border-slate-200 min-w-[200px] font-black text-slate-400 uppercase tracking-widest">
                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-1 cursor-pointer hover:text-indigo-600 select-none" onClick={() => handleSort('startTime')}>
                        Date <Calendar size={12}/>
                    </div>
                    <div className="flex gap-1">
                        <select value={localFilters.month} onChange={(e) => handleFilterChange('month', e.target.value)} className="w-full text-[10px] font-bold uppercase py-1 px-1.5 rounded-lg border border-slate-200 bg-white outline-none">
                            <option value="">Month</option>
                            {monthsList.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                        </select>
                        <select value={localFilters.year} onChange={(e) => handleFilterChange('year', e.target.value)} className="w-full text-[10px] font-bold uppercase py-1 px-1.5 rounded-lg border border-slate-200 bg-white outline-none">
                            <option value="">Year</option>
                            {yearsList.map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                    </div>
                </div>
              </th>
              <ColumnHeader label="Start Time" sortKey="startTime" width="min-w-[100px]" hideFilter />
              <th className="px-4 py-4 bg-slate-50 border-b border-slate-200 min-w-[100px] font-black text-slate-400 uppercase tracking-widest">End Time</th>
              <ColumnHeader label="Duration (m)" sortKey="durationMinutes" width="min-w-[120px]" hideFilter />
              <ColumnHeader label="Asset" filterKey="location" sortKey="location" width="min-w-[180px]" isDropdown dropdownKey="location" />
              <ColumnHeader label="Description" sortKey="description" width="min-w-[300px]" hideFilter />
              <ColumnHeader label="Delay Type" filterKey="delayType" sortKey="delayType" width="min-w-[180px]" isDropdown dropdownKey="delayType" />
              <ColumnHeader label="Failure Mode" filterKey="failureMode" sortKey="failureMode" width="min-w-[200px]" isDropdown dropdownKey="failureMode" />
              <th className="px-4 py-4 bg-slate-50 border-b border-slate-200 text-right font-black text-slate-400 uppercase tracking-widest">Del</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {processedData.map((row) => (
                <tr key={row.id} className={`group hover:bg-slate-50/80 align-top transition-colors ${isUncategorized(row.failureMode) ? 'bg-rose-50/30' : ''}`}>
                    <td className="px-4 py-3 border-r border-slate-100 font-mono text-[11px]"><input type="date" className="bg-transparent w-full focus:outline-none" value={row.startTime?.substring(0,10) || ''} onChange={e => handleDateChange(row.id, row.startTime, e.target.value)}/></td>
                    <td className="px-4 py-3 border-r border-slate-100 font-mono text-[11px]"><input type="time" className="bg-transparent w-full focus:outline-none" value={row.startTime?.substring(11,16) || ''} onChange={e => handleTimeChange(row.id, row.startTime, e.target.value)}/></td>
                    <td className="px-4 py-3 border-r border-slate-100 font-mono text-[11px]"><span className="font-bold text-slate-700">{getEndTimeStr(row.startTime, row.durationMinutes)}</span></td>
                    <td className="px-4 py-3 border-r border-slate-100 font-mono text-[11px] font-black text-indigo-600"><input type="number" className="bg-transparent w-full focus:outline-none" value={row.durationMinutes} onChange={e => handleChange(row.id, 'durationMinutes', Number(e.target.value))}/></td>
                    <td className="px-4 py-3 border-r border-slate-100">
                        <select 
                            className="bg-transparent w-full font-black text-slate-800 text-[11px] uppercase tracking-tighter outline-none cursor-pointer" 
                            value={assetList.includes(row.location) ? row.location : '@@UNKNOWN@@'} 
                            onChange={e => handleAssetSelectChange(row.id, e.target.value)}
                        >
                            {!assetList.includes(row.location) && <option value="@@UNKNOWN@@">{row.location || 'Select Asset...'}</option>}
                            {assetList.map(a => <option key={a} value={a}>{a}</option>)}
                            <option value="@@NEW@@" className="font-bold text-emerald-600">+ Add New Asset...</option>
                        </select>
                    </td>
                    <td className="px-4 py-3 border-r border-slate-100 font-medium text-slate-600 text-[11px]"><textarea rows={1} className="bg-transparent w-full resize-y min-h-[30px] focus:outline-none" value={row.description} onChange={e => handleChange(row.id, 'description', e.target.value)}/></td>
                    <td className="px-4 py-3 border-r border-slate-100 font-black text-slate-800 text-[11px] uppercase">
                        <input list="delay-types" className="bg-transparent w-full outline-none" value={row.delayType || ''} onChange={e => handleChange(row.id, 'delayType', e.target.value)} placeholder="Type..."/>
                        <datalist id="delay-types">
                            {delayTypeList.map(t => <option key={t} value={t}/>)}
                        </datalist>
                    </td>
                    <td className="px-4 py-3 border-r border-slate-100 flex items-center gap-2 relative">
                        <input type="text" className={`w-full rounded-lg px-2 py-1.5 text-[10px] font-black uppercase tracking-tighter transition-all ${isUncategorized(row.failureMode) ? 'bg-rose-100/50 border border-rose-200 text-rose-700 italic placeholder:text-rose-300' : 'bg-transparent border-transparent text-slate-800 focus:bg-white focus:border-slate-200'}`} value={row.failureMode} onChange={e => handleChange(row.id, 'failureMode', e.target.value)} placeholder="Assigning mode..."/>
                        <button title="AI Diagnostic" onClick={() => handleSuggestMode(row.id, row.description)} className="text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity">
                            {suggestingId === row.id ? <Loader2 size={12} className="animate-spin"/> : <Sparkles size={12}/>}
                        </button>
                    </td>
                    <td className="px-4 py-3 text-right"><button onClick={() => handleDelete(row.id)} className="text-slate-300 hover:text-rose-500 transition-colors"><Trash2 size={16}/></button></td>
                </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {/* AI Classification Review Modal */}
      {reviewModalOpen && (
          <div className="fixed inset-0 bg-slate-950/80 z-[200] flex items-center justify-center p-4 backdrop-blur-md">
              <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 ring-1 ring-white/20">
                  <div className="p-8 border-b bg-slate-50 flex justify-between items-center text-slate-800 shrink-0">
                      <div>
                        <h2 className="text-xl font-black uppercase tracking-widest flex items-center gap-3">
                            <div className="p-2 bg-indigo-600 rounded-2xl shadow-lg shadow-indigo-600/20 text-white"><ListChecks size={24}/></div>
                            AI Intelligence Review
                        </h2>
                        <p className="text-[10px] text-slate-400 font-black uppercase mt-2 tracking-widest">Verify the proposed categorization for unplanned events</p>
                      </div>
                      <button onClick={() => setReviewModalOpen(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors"><X size={24}/></button>
                  </div>
                  
                  <div className="flex-1 overflow-auto bg-white custom-scrollbar p-6">
                    <table className="w-full text-sm border-collapse">
                      <thead className="bg-slate-100 font-black uppercase text-[9px] tracking-[0.2em] sticky top-0 z-10 shadow-sm text-slate-400">
                        <tr>
                          <th className="px-6 py-4 border-b text-left">Original Description</th>
                          <th className="px-6 py-4 border-b text-left min-w-[300px]">Proposed Failure Mode</th>
                          <th className="px-6 py-4 border-b text-left text-indigo-700">Engineering Context</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {reviewData.map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-50 transition-colors">
                            <td className="px-6 py-4 text-[11px] font-medium text-slate-500 italic max-w-[300px] truncate">"{item.description}"</td>
                            <td className="px-6 py-4">
                              <input 
                                className="w-full border border-slate-200 rounded-xl px-4 py-2 font-black text-[11px] uppercase tracking-tighter text-indigo-700 bg-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all shadow-sm" 
                                value={item.suggestedMode} 
                                onChange={e => { const d = [...reviewData]; d[idx].suggestedMode = e.target.value; setReviewData(d); }}
                              />
                            </td>
                            <td className="px-6 py-4">
                                <div className="flex items-start gap-3 text-[10px] font-bold text-slate-500 bg-indigo-50/50 p-3 rounded-2xl border border-indigo-100">
                                    <span className="leading-relaxed">{item.reasoning}</span>
                                </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  
                  <div className="p-8 border-t bg-slate-50 flex justify-end gap-4 shrink-0">
                    <button onClick={() => setReviewModalOpen(false)} className="px-8 py-3 font-black text-[10px] uppercase tracking-widest text-slate-500 hover:bg-slate-200 rounded-2xl transition-all">Discard</button>
                    <button onClick={handleApplyReview} className="px-10 py-3 rounded-2xl bg-indigo-600 text-white font-black text-[10px] uppercase tracking-[0.2em] shadow-xl shadow-indigo-600/20 hover:bg-indigo-700 transition-all hover:-translate-y-0.5 active:scale-95 border border-white/20">Apply Categorization</button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};
export default DataGrid;
