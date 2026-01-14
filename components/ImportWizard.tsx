
import React, { useState, useEffect } from 'react';
import { ImportMode, FieldMapping } from '../types';
import { X, Check, FileSpreadsheet, ArrowRight, AlertTriangle } from 'lucide-react';

interface ImportWizardProps {
    rawHeaders: string[];
    rawRows: any[];
    mode: ImportMode;
    onConfirm: (mapping: FieldMapping[], dateFormat: any) => void;
    onCancel: () => void;
}

const ImportWizard: React.FC<ImportWizardProps> = ({ rawHeaders, rawRows, mode, onConfirm, onCancel }) => {
    const [mapping, setMapping] = useState<FieldMapping[]>([]);

    useEffect(() => {
        let fields: FieldMapping[] = [];
        if (mode === 'box1') {
            fields = [
                { appField: 'date', label: 'Date Column', required: true, mappedColumn: null },
                { appField: 'startTime24', label: 'Start Time (24h)', required: true, mappedColumn: null },
                { appField: 'endTime24', label: 'End Time (24h)', required: true, mappedColumn: null },
                { appField: 'durationMinutes', label: 'Duration (Min)', required: true, mappedColumn: null },
                { appField: 'location', label: 'Asset Name', required: true, mappedColumn: null },
                { appField: 'description', label: 'Description', required: true, mappedColumn: null },
                { appField: 'delayType', label: 'Delay Type', required: false, mappedColumn: null },
                { appField: 'failureMode', label: 'Failure Mode (Optional)', required: false, mappedColumn: null },
            ];
        } else {
            fields = [
                { appField: 'asset', label: 'Asset Name', required: true, mappedColumn: null },
                { appField: 'taskDescription', label: 'Task Description', required: true, mappedColumn: null },
                { appField: 'frequency', label: 'Frequency', required: true, mappedColumn: null },
                { appField: 'trade', label: 'Trade', required: false, mappedColumn: null },
                { appField: 'estimatedDuration', label: 'Duration (Hrs)', required: false, mappedColumn: null },
                { appField: 'numberOfExecutors', label: 'Executors (Qty)', required: false, mappedColumn: null },
                { appField: 'taskType', label: 'Strategy (Strat)', required: false, mappedColumn: null },
                { appField: 'shutdownRequired', label: 'Required State (Shutdown/Running)', required: false, mappedColumn: null },
            ];
        }

        // Fuzzy Auto-Map
        const newMapping = fields.map(field => {
            const match = rawHeaders.find(h => {
                const hL = h.toLowerCase();
                const fL = field.label.toLowerCase();
                const kL = field.appField.toLowerCase();
                
                if (kL === 'date' && (hL === 'date' || hL.includes('day'))) return true;
                if (kL === 'startTime24' && (hL.includes('start') && hL.includes('time'))) return true;
                if (kL === 'endTime24' && (hL.includes('end') && hL.includes('time'))) return true;
                if (kL === 'durationMinutes' && (hL.includes('durat') || hL.includes('minut') || hL.includes('length'))) return true;
                if (kL === 'failureMode' && (hL.includes('cat') || hL.includes('mode') || hL.includes('failure'))) return true;
                if (kL === 'delayType' && (hL.includes('delay') && hL.includes('type'))) return true;
                if (kL === 'numberOfExecutors' && (hL.includes('exec') || hL.includes('staff') || hL.includes('peop') || hL.includes('qty'))) return true;
                if (kL === 'taskType' && (hL.includes('strat') || hL.includes('type'))) return true;
                if (kL === 'shutdownRequired' && (hL.includes('state') || hL.includes('shut'))) return true;
                if (kL === 'trade' && (hL === 'trade' || hL.includes('discipline') || hL.includes('craft') || hL.includes('dept'))) return true;
                
                return hL.includes(kL) || kL.includes(hL) || hL.includes(fL);
            });
            return { ...field, mappedColumn: match || null };
        });

        setMapping(newMapping);
    }, [mode, rawHeaders]);

    const handleMapChange = (idx: number, col: string) => {
        const updated = [...mapping];
        updated[idx].mappedColumn = col === 'none' ? null : col;
        setMapping(updated);
    };

    const isValid = mapping.every(m => !m.required || m.mappedColumn !== null);

    return (
        <div className="fixed inset-0 bg-black/70 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl flex flex-col max-h-[90vh] overflow-hidden">
                <div className="bg-slate-900 p-6 flex justify-between items-center text-white shrink-0">
                    <div>
                        <h2 className="text-xl font-bold flex items-center gap-2">
                            <FileSpreadsheet size={24} className="text-indigo-400"/> 
                            Column Mapping Configuration
                        </h2>
                        <p className="text-slate-400 text-sm mt-1">Assign your Excel headers to the required reliability fields. Duration is mandatory for calculations.</p>
                    </div>
                    <button onClick={onCancel} className="text-slate-400 hover:text-white transition"><X size={24}/></button>
                </div>

                <div className="flex-1 overflow-auto bg-slate-50 flex flex-col md:flex-row min-h-0">
                    <div className="w-full md:w-80 p-6 border-r border-slate-200 bg-white overflow-y-auto shrink-0">
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                            <ArrowRight size={14}/> Mapping Rules
                        </h3>
                        <div className="space-y-5">
                            {mapping.map((m, i) => (
                                <div key={m.appField}>
                                    <label className="block text-[10px] font-black text-slate-500 mb-1.5 uppercase tracking-wider">
                                        {m.label} {m.required && <span className="text-rose-500">*</span>}
                                    </label>
                                    <select 
                                        className={`w-full text-sm border rounded-xl py-2.5 px-3 focus:ring-2 transition ${!m.mappedColumn && m.required ? 'border-rose-200 bg-rose-50' : 'border-slate-200 focus:ring-indigo-500'}`}
                                        value={m.mappedColumn || 'none'}
                                        onChange={(e) => handleMapChange(i, e.target.value)}
                                    >
                                        <option value="none">-- Skip Column --</option>
                                        {rawHeaders.map(h => (
                                            <option key={h} value={h}>{h}</option>
                                        ))}
                                    </select>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="flex-1 p-6 flex flex-col min-w-0">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Excel Data Preview</h3>
                            <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded">Showing first 10 rows</span>
                        </div>
                        <div className="flex-1 overflow-auto border border-slate-200 rounded-2xl shadow-inner bg-white custom-scrollbar">
                            <table className="w-full text-xs text-left border-collapse">
                                <thead className="bg-slate-50 text-slate-500 font-bold sticky top-0 z-10 border-b border-slate-200">
                                    <tr>
                                        {rawHeaders.map(h => {
                                            const isMapped = mapping.some(m => m.mappedColumn === h);
                                            return (
                                                <th key={h} className={`p-4 border-r border-slate-100 last:border-r-0 whitespace-nowrap ${isMapped ? 'bg-indigo-50/50 text-indigo-700 font-black' : ''}`}>
                                                    {h}
                                                </th>
                                            );
                                        })}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {rawRows.slice(0, 10).map((row, rIdx) => (
                                        <tr key={rIdx} className="hover:bg-slate-50 transition-colors">
                                            {rawHeaders.map(h => (
                                                <td key={h} className="p-4 border-r border-slate-100 last:border-r-0 text-slate-600 whitespace-nowrap truncate max-w-[180px]">
                                                    {String(row[h] || '')}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {!isValid && (
                            <div className="mt-4 bg-rose-50 text-rose-700 p-4 rounded-xl text-xs font-bold flex items-center gap-3 border border-rose-100">
                                <AlertTriangle size={18} className="shrink-0"/>
                                Please map all required fields (marked with *) to proceed.
                            </div>
                        )}
                    </div>
                </div>

                <div className="p-6 bg-white border-t border-slate-100 flex justify-end gap-3 shrink-0">
                    <button onClick={onCancel} className="px-6 py-2.5 rounded-xl text-slate-500 font-bold hover:bg-slate-50 transition text-sm">Cancel</button>
                    <button 
                        onClick={() => onConfirm(mapping, 'yyyy/mm/dd')} 
                        disabled={!isValid}
                        className="px-8 py-2.5 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 disabled:opacity-50 shadow-xl shadow-indigo-200 transition text-sm flex items-center gap-2"
                    >
                        <Check size={18}/> Process Data
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ImportWizard;
