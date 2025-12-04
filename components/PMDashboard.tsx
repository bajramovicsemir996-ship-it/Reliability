import React, { useMemo } from 'react';
import { PMRecord } from '../types';
import { normalizeFrequency } from '../utils/reliabilityMath';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { Briefcase, Clock, Zap, AlertTriangle, Users, Filter, RefreshCcw, Presentation, Activity, AlertOctagon } from 'lucide-react';

interface PMDashboardProps {
  data: PMRecord[];
  selectedAsset: string;
  onAssetChange: (val: string) => void;
  selectedTrade: string;
  onTradeChange: (val: string) => void;
  selectedFreq: string;
  onFreqChange: (val: string) => void;
  selectedType: string;
  onTypeChange: (val: string) => void;
  selectedCriticality: string;
  onCriticalityChange: (val: string) => void;
}

const PMDashboard: React.FC<PMDashboardProps> = ({ 
    data, 
    selectedAsset, onAssetChange,
    selectedTrade, onTradeChange,
    selectedFreq, onFreqChange,
    selectedType, onTypeChange,
    selectedCriticality, onCriticalityChange
}) => {
  
  // Filter Data based on Global Selections
  const filteredData = useMemo(() => {
      return data.filter(r => {
          const matchAsset = selectedAsset === 'All' || r.asset === selectedAsset;
          const matchTrade = selectedTrade === 'All' || r.trade === selectedTrade;
          const matchFreq = selectedFreq === 'All' || r.frequency === selectedFreq;
          const matchType = selectedType === 'All' || r.executorType === selectedType;
          const matchCrit = selectedCriticality === 'All' || (r.criticality || 'Medium') === selectedCriticality;
          return matchAsset && matchTrade && matchFreq && matchType && matchCrit;
      });
  }, [data, selectedAsset, selectedTrade, selectedFreq, selectedType, selectedCriticality]);

  // Unique Lists for Dropdowns
  const uniqueAssets = useMemo(() => Array.from(new Set(data.map(r => r.asset || 'Unknown'))).sort(), [data]);
  const uniqueTrades = useMemo(() => Array.from(new Set(data.map(r => r.trade || 'General'))).sort(), [data]);
  const uniqueFreqs = useMemo(() => Array.from(new Set(data.map(r => r.frequency || '1'))).sort((a: string, b: string) => parseFloat(a) - parseFloat(b)), [data]);
  const uniqueTypes = useMemo(() => Array.from(new Set(data.map(r => r.executorType || 'Internal'))).sort(), [data]);
  const uniqueCrits = useMemo(() => ['High', 'Medium', 'Low'], []);

  // 1. Calculate Annual Workload (Hours) per Trade
  const workloadData = useMemo(() => {
    const tradeHours: Record<string, number> = {};
    // Iterate over filtered data so charts reflect current view
    filteredData.forEach(task => {
        const freqPerYear = normalizeFrequency(task.frequency);
        const hoursPerEvent = task.estimatedDuration;
        const people = task.numberOfExecutors || 1;
        const annualManHours = freqPerYear * hoursPerEvent * people;
        
        const trade = task.trade || 'Other';
        tradeHours[trade] = (tradeHours[trade] || 0) + annualManHours;
    });
    return Object.entries(tradeHours)
        .map(([name, value]) => ({ name, value }))
        .sort((a,b) => b.value - a.value);
  }, [filteredData]);

  const totalAnnualHours = workloadData.reduce((acc, curr) => acc + curr.value, 0);

  // 2. Shutdown vs Running
  const shutdownData = useMemo(() => {
      let shut = 0;
      let run = 0;
      filteredData.forEach(t => t.shutdownRequired ? shut++ : run++);
      return [
          { name: 'Running', value: run },
          { name: 'Shutdown', value: shut }
      ];
  }, [filteredData]);

  // 3. Internal vs Contractor vs Mixed
  const executorData = useMemo(() => {
      let internalHours = 0;
      let contractorHours = 0;
      let mixedHours = 0;
      
      filteredData.forEach(task => {
        const freqPerYear = normalizeFrequency(task.frequency);
        const hoursPerEvent = task.estimatedDuration;
        const people = task.numberOfExecutors || 1;
        const annualManHours = freqPerYear * hoursPerEvent * people;

        if (task.executorType === 'Contractor') {
            contractorHours += annualManHours;
        } else if (task.executorType === 'Internal + Contractor') {
            mixedHours += annualManHours;
        } else {
            internalHours += annualManHours;
        }
      });
      return [
          { name: 'Internal', value: internalHours },
          { name: 'Contractor', value: contractorHours },
          { name: 'Mixed', value: mixedHours } // Ensure case matches data
      ].filter(d => d.value > 0);
  }, [filteredData]);

  // 4. MTA Strategy Mix (Task Count)
  const strategyData = useMemo(() => {
      const counts = { 'TBM': 0, 'CBM': 0, 'FF': 0, 'Unknown': 0 };
      filteredData.forEach(t => {
          const type = t.taskType || 'Unknown';
          if (counts[type] !== undefined) counts[type]++;
          else counts['Unknown']++;
      });
      return [
          { name: 'CBM (Condition)', value: counts['CBM'] },
          { name: 'TBM (Time-Based)', value: counts['TBM'] },
          { name: 'FF (Failure Finding)', value: counts['FF'] },
      ].filter(d => d.value > 0);
  }, [filteredData]);

  // 5. Criticality Distribution
  const criticalityData = useMemo(() => {
      const counts = { 'High': 0, 'Medium': 0, 'Low': 0 };
      filteredData.forEach(t => {
          const c = t.criticality || 'Medium';
          if (counts[c] !== undefined) counts[c]++;
          else counts['Medium']++;
      });
      return [
          { name: 'High', value: counts['High'] },
          { name: 'Medium', value: counts['Medium'] },
          { name: 'Low', value: counts['Low'] }
      ].filter(d => d.value > 0);
  }, [filteredData]);

  const COLORS_EXECUTOR = {
      'Internal': '#3b82f6',
      'Contractor': '#f97316',
      'Mixed': '#a855f7'
  };

  const COLORS_CRIT = {
      'High': '#dc2626',
      'Medium': '#f59e0b',
      'Low': '#10b981'
  };

  const handleReset = () => {
      onAssetChange('All');
      onTradeChange('All');
      onFreqChange('All');
      onTypeChange('All');
      onCriticalityChange('All');
  };

  const handleChartClick = (data: any, type: 'trade' | 'executor' | 'criticality') => {
      if (data && data.activePayload && data.activePayload.length > 0) {
          const clickedName = data.activePayload[0].payload.name;
          if (type === 'trade') {
              onTradeChange(clickedName === selectedTrade ? 'All' : clickedName);
          } else if (type === 'executor') {
              onTypeChange(clickedName === selectedType ? 'All' : clickedName);
          } else if (type === 'criticality') {
              onCriticalityChange(clickedName === selectedCriticality ? 'All' : clickedName);
          }
      }
  };

  const getOpacity = (entryName: string, type: 'trade' | 'executor' | 'criticality') => {
       if (type === 'trade') {
           return (selectedTrade === 'All' || selectedTrade === entryName) ? 1 : 0.3;
       }
       if (type === 'executor') {
           return (selectedType === 'All' || selectedType === entryName) ? 1 : 0.3;
       }
       if (type === 'criticality') {
           return (selectedCriticality === 'All' || selectedCriticality === entryName) ? 1 : 0.3;
       }
       return 1;
  };

  const handleExportPPT = () => {
      const pptx = new (window as any).PptxGenJS();
      pptx.layout = 'LAYOUT_16x9';
      
      const slide = pptx.addSlide();
      slide.addText("Preventive Maintenance Analytics", { x: 0.5, y: 0.5, fontSize: 24, bold: true, color: '363636' });
      slide.addText(`Asset: ${selectedAsset}, Trade: ${selectedTrade}, Criticality: ${selectedCriticality}`, { x: 0.5, y: 1.0, fontSize: 14, color: '666666' });

      // KPI Boxes
      slide.addText(`Total Tasks: ${filteredData.length}`, { x: 0.5, y: 1.5, w: 3, h: 1, fill: 'EEF2FF', align: 'center', valign:'middle', fontSize:18 });
      slide.addText(`Annual Man-Hours: ${totalAnnualHours.toFixed(0)}`, { x: 3.7, y: 1.5, w: 3, h: 1, fill: 'ECFDF5', align: 'center', valign:'middle', fontSize:18 });
      slide.addText(`Avg Criticality: ${criticalityData.length > 0 ? 'Analyzed' : 'N/A'}`, { x: 6.9, y: 1.5, w: 3, h: 1, fill: 'FEF2F2', align: 'center', valign:'middle', fontSize:18 });

      // Charts
      if (workloadData.length > 0) {
          slide.addText("Workload by Trade", { x: 0.5, y: 3.0, fontSize: 14 });
          slide.addChart(pptx.ChartType.bar, 
            [{
                name: "Man-Hours",
                labels: workloadData.map(d => d.name),
                values: workloadData.map(d => d.value)
            }],
            { x: 0.5, y: 3.5, w: 5, h: 3.5, barDir: 'col', chartColors: ['10b981'] }
          );
      }

      if (executorData.length > 0) {
          slide.addText("Internal vs Contractor", { x: 6, y: 3.0, fontSize: 14 });
          slide.addChart(pptx.ChartType.pie, 
            [{
                name: "Hours",
                labels: executorData.map(d => d.name),
                values: executorData.map(d => d.value)
            }],
            { x: 6, y: 3.5, w: 4, h: 3.5 }
          );
      }

      pptx.writeFile({ fileName: `PM_Analytics_${selectedAsset}.pptx` });
  };

  return (
    <div className="space-y-6">
        {/* --- Filters Toolbar --- */}
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 flex flex-wrap items-center gap-4 sticky top-0 z-20">
            <div className="flex items-center gap-2 text-gray-700 font-medium">
                <Filter size={20} className="text-emerald-600"/>
                <span>Filters:</span>
            </div>
            
            {/* Asset Filter */}
            <div className="flex flex-col gap-1">
                <label className="text-[10px] text-gray-400 uppercase font-bold">Asset</label>
                <select 
                    value={selectedAsset}
                    onChange={(e) => onAssetChange(e.target.value)}
                    className={`bg-gray-50 border text-gray-900 text-xs rounded-lg focus:ring-emerald-500 focus:border-emerald-500 block w-40 p-2 ${selectedAsset !== 'All' ? 'border-emerald-500 bg-emerald-50 font-bold' : 'border-gray-300'}`}
                >
                    <option value="All">All Assets</option>
                    {uniqueAssets.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
            </div>

            {/* Trade Filter */}
            <div className="flex flex-col gap-1">
                <label className="text-[10px] text-gray-400 uppercase font-bold">Trade</label>
                <select 
                    value={selectedTrade}
                    onChange={(e) => onTradeChange(e.target.value)}
                    className={`bg-gray-50 border text-gray-900 text-xs rounded-lg focus:ring-emerald-500 focus:border-emerald-500 block w-28 p-2 ${selectedTrade !== 'All' ? 'border-emerald-500 bg-emerald-50 font-bold' : 'border-gray-300'}`}
                >
                    <option value="All">All Trades</option>
                    {uniqueTrades.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
            </div>

            {/* Criticality Filter */}
             <div className="flex flex-col gap-1">
                <label className="text-[10px] text-gray-400 uppercase font-bold">Criticality</label>
                <select 
                    value={selectedCriticality}
                    onChange={(e) => onCriticalityChange(e.target.value)}
                    className={`bg-gray-50 border text-gray-900 text-xs rounded-lg focus:ring-emerald-500 focus:border-emerald-500 block w-24 p-2 ${selectedCriticality !== 'All' ? 'border-emerald-500 bg-emerald-50 font-bold' : 'border-gray-300'}`}
                >
                    <option value="All">All</option>
                    {uniqueCrits.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
            </div>

             {/* Interval Filter */}
             <div className="flex flex-col gap-1">
                <label className="text-[10px] text-gray-400 uppercase font-bold">Interval (M)</label>
                <select 
                    value={selectedFreq}
                    onChange={(e) => onFreqChange(e.target.value)}
                    className={`bg-gray-50 border text-gray-900 text-xs rounded-lg focus:ring-emerald-500 focus:border-emerald-500 block w-20 p-2 ${selectedFreq !== 'All' ? 'border-emerald-500 bg-emerald-50 font-bold' : 'border-gray-300'}`}
                >
                    <option value="All">All</option>
                    {uniqueFreqs.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
            </div>

             {/* Type Filter */}
             <div className="flex flex-col gap-1">
                <label className="text-[10px] text-gray-400 uppercase font-bold">Executor</label>
                <select 
                    value={selectedType}
                    onChange={(e) => onTypeChange(e.target.value)}
                    className={`bg-gray-50 border text-gray-900 text-xs rounded-lg focus:ring-emerald-500 focus:border-emerald-500 block w-24 p-2 ${selectedType !== 'All' ? 'border-emerald-500 bg-emerald-50 font-bold' : 'border-gray-300'}`}
                >
                    <option value="All">All</option>
                    {uniqueTypes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
            </div>

            <div className="ml-auto flex items-center gap-2">
                <button 
                    onClick={handleExportPPT}
                    className="flex items-center gap-2 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 px-3 py-1.5 rounded-lg text-sm font-medium transition border border-emerald-200"
                    title="Export Dashboard to PowerPoint"
                >
                    <Presentation size={16} /> PPT
                </button>
                <button 
                    onClick={handleReset}
                    className="flex items-center gap-1 text-sm text-gray-500 hover:text-emerald-600 transition"
                >
                    <RefreshCcw size={14} /> Reset
                </button>
            </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 relative overflow-hidden">
                <p className="text-xs text-gray-500 font-bold uppercase">Filtered Tasks</p>
                <div className="flex items-center gap-2 mt-2">
                    <p className="text-3xl font-bold text-gray-800">{filteredData.length}</p>
                    <Briefcase className="text-gray-300" />
                </div>
                {selectedAsset !== 'All' && <p className="text-xs text-emerald-600 mt-1 font-semibold">Asset: {selectedAsset}</p>}
                {selectedCriticality !== 'All' && <p className="text-xs text-red-600 mt-0.5 font-semibold">Criticality: {selectedCriticality}</p>}
            </div>
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <p className="text-xs text-gray-500 font-bold uppercase">Annual Man-Hours</p>
                <div className="flex items-center gap-2 mt-2">
                    <p className="text-3xl font-bold text-emerald-600">{totalAnnualHours.toFixed(0)}</p>
                    <span className="text-sm text-gray-400">hrs/year</span>
                </div>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                <p className="text-xs text-gray-500 font-bold uppercase">High Criticality Load</p>
                <div className="flex items-center gap-2 mt-2">
                    <p className="text-3xl font-bold text-red-600">
                        {filteredData.length > 0 
                            ? (filteredData.filter(t => t.criticality === 'High').length / filteredData.length * 100).toFixed(0)
                            : 0}%
                    </p>
                    <AlertTriangle className="text-red-200" />
                </div>
                <p className="text-xs text-gray-400 mt-1">% of Tasks on High Crit Assets</p>
            </div>
        </div>

        {/* Charts Row 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Workload Chart */}
            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 h-96">
                <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                    <Clock size={18} className="text-emerald-500"/> Annual Workload by Trade
                </h3>
                <ResponsiveContainer width="100%" height="90%">
                    <BarChart 
                        data={workloadData} 
                        layout="vertical" 
                        margin={{ left: 20 }}
                        onClick={(data) => handleChartClick(data, 'trade')}
                    >
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" />
                        <YAxis dataKey="name" type="category" width={100} tick={{fontSize: 12}} />
                        <Tooltip 
                            cursor={{fill: '#ecfdf5', opacity: 0.5}}
                            formatter={(val: number) => [val.toFixed(1) + ' hrs', 'Annual Man-Hours']} 
                        />
                        <Bar 
                            dataKey="value" 
                            radius={[0, 4, 4, 0]} 
                            barSize={30}
                            className="cursor-pointer"
                        >
                            {workloadData.map((entry, index) => (
                                <Cell 
                                    key={`cell-${index}`} 
                                    fill="#10b981" 
                                    fillOpacity={getOpacity(entry.name, 'trade')}
                                />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>

            {/* Criticality Split */}
            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 h-96">
                <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                    <AlertOctagon size={18} className="text-red-500"/> Task Criticality Distribution
                </h3>
                <ResponsiveContainer width="100%" height="90%">
                    <PieChart onClick={(data) => handleChartClick(data, 'criticality')}>
                        <Pie 
                            data={criticalityData} 
                            cx="50%" cy="50%" 
                            innerRadius={60} outerRadius={100} 
                            paddingAngle={5} 
                            dataKey="value"
                            className="cursor-pointer"
                        >
                             {criticalityData.map((entry, index) => (
                                <Cell 
                                    key={`cell-${index}`} 
                                    fill={COLORS_CRIT[entry.name as keyof typeof COLORS_CRIT] || '#9ca3af'} 
                                    fillOpacity={getOpacity(entry.name, 'criticality')}
                                />
                            ))}
                        </Pie>
                        <Tooltip formatter={(val: number) => [val, 'Tasks']} />
                        <Legend />
                    </PieChart>
                </ResponsiveContainer>
            </div>
        </div>

        {/* Charts Row 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
             {/* Strategy Mix */}
             <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 h-96">
                <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                    <Activity size={18} className="text-purple-600"/> MTA Strategy Mix (Task Count)
                </h3>
                <ResponsiveContainer width="100%" height="90%">
                    <PieChart>
                        <Pie 
                            data={strategyData} 
                            cx="50%" cy="50%" 
                            outerRadius={100} 
                            dataKey="value"
                            label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}
                        >
                            {strategyData.map((entry, index) => (
                                <Cell 
                                    key={`cell-${index}`} 
                                    fill={entry.name.includes('CBM') ? '#22c55e' : entry.name.includes('TBM') ? '#3b82f6' : '#f59e0b'} 
                                />
                            ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                    </PieChart>
                </ResponsiveContainer>
            </div>

             {/* Executor Split */}
             <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 h-96">
                <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                    <Users size={18} className="text-blue-500"/> Internal vs Contractor (Man-Hours)
                </h3>
                <ResponsiveContainer width="100%" height="90%">
                    <PieChart onClick={(data) => handleChartClick(data, 'executor')}>
                        <Pie 
                            data={executorData} 
                            cx="50%" cy="50%" 
                            innerRadius={0} outerRadius={80} 
                            dataKey="value"
                            className="cursor-pointer"
                        >
                             {executorData.map((entry, index) => (
                                <Cell 
                                    key={`cell-${index}`} 
                                    fill={COLORS_EXECUTOR[entry.name as keyof typeof COLORS_EXECUTOR] || '#9ca3af'} 
                                    fillOpacity={getOpacity(entry.name, 'executor')}
                                />
                            ))}
                        </Pie>
                        <Tooltip formatter={(val: number) => [val.toFixed(0) + ' hrs', 'Load']} />
                        <Legend />
                    </PieChart>
                </ResponsiveContainer>
            </div>
        </div>
    </div>
  );
};
export default PMDashboard;