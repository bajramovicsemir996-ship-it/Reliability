
import { create } from 'zustand';
import { RawRecord, PMRecord, MaintenanceCost, ResourceConfig, AppLanguage } from './types';

interface AppState {
    // --- History Tracking ---
    history: {
        past: { box1Data: RawRecord[], pmPlanData: PMRecord[] }[];
        future: { box1Data: RawRecord[], pmPlanData: PMRecord[] }[];
    };
    undo: () => void;
    redo: () => void;
    saveHistory: () => void;

    // --- Box 1: Reliability ---
    box1Data: RawRecord[];
    setBox1Data: (data: RawRecord[]) => void;
    
    box1Filters: { asset: string; failureMode: string; delayType: string; hour: string; dayOfWeek: string };
    setBox1Filter: (key: string, value: string) => void;
    
    box1Costs: MaintenanceCost;
    updateCost: (type: 'preventive' | 'corrective', field: keyof MaintenanceCost['preventive'], value: number) => void;
    
    box1PmDuration: number;
    setBox1PmDuration: (v: number) => void;
    
    // --- Box 2: PM Plan ---
    pmPlanData: PMRecord[];
    setPmPlanData: (data: PMRecord[]) => void;
    
    box2Filters: { asset: string; trade: string; frequency: string; executorType: string; criticality: string; strategy: string; state: string };
    setBox2Filter: (key: string, value: string) => void;

    // --- Resources ---
    resources: ResourceConfig[];
    updateResource: (trade: string, field: keyof ResourceConfig, value: number) => void;

    // --- Global UI ---
    loadingAI: boolean;
    setLoadingAI: (loading: boolean) => void;
    language: AppLanguage;
    setLanguage: (lang: AppLanguage) => void;
}

const defaultResources: ResourceConfig[] = [
    { trade: 'Mechanical', headcount: 0, weeklyHours: 40, utilizationRate: 0.8 },
    { trade: 'Electrical', headcount: 0, weeklyHours: 40, utilizationRate: 0.8 },
    { trade: 'Hydraulic', headcount: 0, weeklyHours: 40, utilizationRate: 0.8 },
    { trade: 'Automation', headcount: 0, weeklyHours: 40, utilizationRate: 0.75 },
    { trade: 'Production', headcount: 0, weeklyHours: 40, utilizationRate: 0.5 },
];

export const useAppStore = create<AppState>((set, get) => ({
    // History
    history: { past: [], future: [] },
    saveHistory: () => {
        const { box1Data, pmPlanData, history } = get();
        set({
            history: {
                past: [...history.past.slice(-49), { box1Data, pmPlanData }], 
                future: []
            }
        });
    },
    undo: () => {
        const { history, box1Data, pmPlanData } = get();
        if (history.past.length === 0) return;
        const previous = history.past[history.past.length - 1];
        const newPast = history.past.slice(0, history.past.length - 1);
        set({
            box1Data: previous.box1Data,
            pmPlanData: previous.pmPlanData,
            history: {
                past: newPast,
                future: [{ box1Data, pmPlanData }, ...history.future]
            }
        });
    },
    redo: () => {
        const { history, box1Data, pmPlanData } = get();
        if (history.future.length === 0) return;
        const next = history.future[0];
        const newFuture = history.future.slice(1);
        set({
            box1Data: next.box1Data,
            pmPlanData: next.pmPlanData,
            history: {
                past: [...history.past, { box1Data, pmPlanData }],
                future: newFuture
            }
        });
    },

    // Box 1 - EXPLICIT EMPTY STATE
    box1Data: [],
    setBox1Data: (data) => {
        get().saveHistory();
        set({ box1Data: data });
    },
    
    box1Filters: { asset: 'All', failureMode: 'All', delayType: 'All', hour: 'All', dayOfWeek: 'All' },
    setBox1Filter: (key, value) => set((state) => ({
        box1Filters: { ...state.box1Filters, [key]: value }
    })),

    box1Costs: { 
        preventive: { material: 0, labor: 0, productionLoss: 0 }, 
        corrective: { material: 0, labor: 0, productionLoss: 0 } 
    },
    updateCost: (type, field, value) => set((state) => ({
        box1Costs: {
            ...state.box1Costs,
            [type]: { ...state.box1Costs[type], [field]: value }
        }
    })),

    box1PmDuration: 0,
    setBox1PmDuration: (v) => set({ box1PmDuration: v }),

    // Box 2 - EXPLICIT EMPTY STATE
    pmPlanData: [],
    setPmPlanData: (data) => {
        get().saveHistory();
        set({ pmPlanData: data });
    },

    box2Filters: { asset: 'All', trade: 'All', frequency: 'All', executorType: 'All', criticality: 'All', strategy: 'All', state: 'All' },
    setBox2Filter: (key, value) => set((state) => ({
        box2Filters: { ...state.box2Filters, [key]: value }
    })),

    // Resources
    resources: defaultResources,
    updateResource: (trade, field, value) => set((state) => ({
        resources: state.resources.map(r => 
            r.trade === trade ? { ...r, [field]: value } : r
        )
    })),

    // Global
    loadingAI: false,
    setLoadingAI: (loading) => set({ loadingAI: loading }),
    language: 'English',
    setLanguage: (lang) => set({ language: lang }),
}));
