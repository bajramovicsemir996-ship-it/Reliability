
export enum StoppageType {
  Unplanned = 'Unplanned',
  Planned = 'Planned',
  External = 'External'
}

export type InputMode = 'timestamp' | 'manual_ttf';

export type AppLanguage = 'English' | 'French' | 'Spanish' | 'German' | 'Polish';

// Box 1: Failure Records
export interface RawRecord {
  id: string;
  startTime?: string; // ISO string
  ttbf?: number;      // Operating Hours
  durationMinutes: number;
  type: StoppageType;
  description: string;
  location: string;
  failureMode?: string;
  delayType?: string; // Added field
}

// Box 2: PM Plan Records
export interface PMRecord {
    id: string;
    asset: string;
    taskDescription: string;
    frequency: string; 
    trade: string; 
    estimatedDuration: number; // HOURS
    shutdownRequired: boolean;
    numberOfExecutors: number;
    executorType: 'Internal' | 'External' | 'Both'; 
    origin?: 'Current' | 'New'; 
    
    // MTA Upgrades
    taskType?: 'Time Based' | 'Condition Based' | 'Scheduled Restoration' | 'Scheduled Replacement' | 'Failure Finding';
    criticality?: 'High' | 'Medium' | 'Low';
}

export interface MaintenanceRoute {
    id: string;
    name: string;
    trade: string;
    taskIds: string[];
    totalDuration: number;
    travelSavingMinutes: number;
}

export interface ResourceConfig {
    trade: string;
    headcount: number;
    weeklyHours: number; 
    utilizationRate: number; 
}

export interface ResourceOptimizationResult {
    trade: string;
    gapHours: number;
    status: 'Overloaded' | 'Balanced' | 'Spare Capacity';
    recommendation: string;
}

export interface ReliabilityMetrics {
  mtbf: number; 
  mttr: number;
  availability: number;
  totalUptime: number;
  totalDowntime: number;
  failureCount: number;
  mtbfCoV: number; 
}

export interface WeibullParams {
  beta: number;
  eta: number;
  rSquared: number;
  points?: { x: number; y: number }[];
}

export interface CrowAMSAA {
    beta: number; 
    lambda: number; 
    points: CrowAMSAAPoint[];
}

export interface CrowAMSAAPoint {
    cumulativeTime: number;
    cumulativeFailures: number;
    date: string;
}

export interface RollingMetric {
    date: string;
    mtbf: number;
    mttr: number;
}

export interface CostBreakdown {
    material: number;
    labor: number;
    productionLoss: number;
}

export interface MaintenanceCost {
  preventive: CostBreakdown;
  corrective: CostBreakdown;
}

export interface PMTaskAudit {
    taskId: string;
    score: number; 
    critique: string;
    recommendation: string;
    isDuplicate: boolean;
}

export interface GapAnalysisResult {
    asset: string;
    failureMode: string;
    currentTasks: string; 
    coverageScore: string; 
    strategyMatch?: string; 
    criticality?: string; 
    missingTasks: boolean;
    recommendation: string;
    currentTasksDetail?: string; 
}

export interface ChatMessage {
    id: string;
    sender: 'user' | 'ai';
    text: string;
    timestamp: Date;
}

export interface SavedDataset {
    id: string;
    name: string;
    date: string;
    records: RawRecord[];
}

export interface SavedPMPlan {
    id: string;
    name: string;
    date: string;
    records: PMRecord[];
}

export type ImportMode = 'box1' | 'box2';

export interface FieldMapping {
    appField: string; 
    label: string;    
    required: boolean;
    mappedColumn: string | null; 
}
