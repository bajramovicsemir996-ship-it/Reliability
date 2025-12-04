

export enum StoppageType {
  Unplanned = 'Unplanned',
  Planned = 'Planned',
  External = 'External'
}

export type InputMode = 'timestamp' | 'manual_ttf';

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
}

// Box 2: PM Plan Records
export interface PMRecord {
    id: string;
    asset: string;
    taskDescription: string;
    frequency: string; // Interval in Months (e.g. "1", "3") or text
    trade: string; 
    estimatedDuration: number; // HOURS
    shutdownRequired: boolean;
    numberOfExecutors: number;
    executorType: 'Internal' | 'Contractor' | 'Internal + Contractor';
    initialStartWeek?: number; // 1-52, The week offset for the first occurrence
    origin?: 'Current' | 'New'; // Track if task is from existing plan or AI recommendation
    
    // MTA Upgrades
    taskType?: 'TBM' | 'CBM' | 'FF' | 'DOM'; // Time-Based, Condition-Based, Failure-Finding, Design-Out
    criticality?: 'High' | 'Medium' | 'Low';
}

export interface ReliabilityMetrics {
  mtbf: number; 
  mttr: number;
  availability: number;
  totalUptime: number;
  totalDowntime: number;
  failureCount: number;
}

export interface WeibullParams {
  beta: number;
  eta: number;
  rSquared: number;
  points?: { x: number; y: number }[];
}

// New Types for Trend Analysis
export interface CrowAMSAAPoint {
    cumulativeTime: number;
    cumulativeFailures: number;
    date: string;
}

export interface CrowAMSAA {
    beta: number; // Slope
    lambda: number; // Intercept related
    points: CrowAMSAAPoint[];
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

// AI Results for PM Audit
export interface PMTaskAudit {
    taskId: string;
    score: number; // 1-5
    critique: string;
    isDuplicate: boolean;
}

export interface GapAnalysisResult {
    asset: string;
    failureMode: string;
    currentTasks: string; // Tasks found addressing this failure
    coverageScore: string; // "Good", "Weak", "None"
    missingTasks: boolean;
    recommendation: string;
    currentTasksDetail?: string; // Added for compatibility
}

// AI Wizard Chat
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

// --- RCM HIERARCHY TYPES ---

export interface InspectionPoint {
    description: string;
    type: 'Qualitative' | 'Quantitative';
    unit?: string;
    min?: number;
    max?: number;
    nominal?: string; // For qualitative pass/fail criteria or quantitative target
    timeMinutes?: number; // Estimated time for this specific point
}

export interface RCMTask {
    id?: string;
    code?: string;
    description: string;
    type?: string; // 'Condition-Based Maintenance', 'Scheduled Preventive Maintenance', etc.
    frequency?: string;
    duration?: number;
    executor?: string;
    executorCount?: number;
    inspectionSheet?: InspectionPoint[];
    
    // Legacy fields mapping
    interval?: string;
    trade?: string;
    strategy?: string; 
}

export interface RCMFailureMode {
    id: string;
    code?: string;
    description: string;
    effect?: string; 
    isHumanError?: boolean;
    task?: RCMTask;
    
    // Legacy fields mapping
    consequence?: string; 
}

export interface RCMFunctionalFailure {
    id: string;
    code?: string;
    description: string;
    type?: string; // 'Total' | 'Partial'
    failureModes: RCMFailureMode[];
}

export interface RCMFunction {
    id: string;
    code?: string;
    description: string;
    type?: string; // 'Primary', 'Environmental Integrity', etc.
    functionalFailures: RCMFunctionalFailure[];
}

export interface RCMAnalysis {
    id: string;
    assetName: string;
    operationalContext: string;
    functions: RCMFunction[];
    lastModified: string;
}

export interface AttachedFile {
    id: string;
    name: string;
    type: string;
    data: string; // Base64 encoded content
}

// Legacy / Helper types
export interface AssetStrategyInput {
    assetName: string;
    criticality: 'High' | 'Medium' | 'Low';
    operationalContext: string;
    oemRecommendations: string;
    resourceCount: number;
    includeFailures: boolean;
    includeCurrentPMs: boolean;
}

export interface SavedPlan {
    id: string;
    lastModified: string;
    strategy: AssetStrategyInput;
    tasks: PMRecord[];
}

export interface RCMContext {
    assetName: string;
    operationalContext: string;
    failureModes: string;
    criticality: 'High' | 'Medium' | 'Low';
}

export interface SavedRCMPlan {
    id: string;
    name: string;
    updatedAt: string;
    context: RCMContext;
    tasks: PMRecord[];
}