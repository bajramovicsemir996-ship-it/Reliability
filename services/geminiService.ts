import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { RawRecord, WeibullParams, MaintenanceCost, PMRecord, PMTaskAudit, GapAnalysisResult, ChatMessage, RCMFunction, AssetStrategyInput, RCMContext, RCMFunctionalFailure, RCMFailureMode, RCMTask, AttachedFile, InspectionPoint } from "../types";

const getAIClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API Key not found in environment");
  }
  return new GoogleGenAI({ apiKey });
};

// --- RETRY LOGIC HELPER ---
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function callGeminiWithRetry<T>(
  apiCall: () => Promise<T>,
  retries: number = 3,
  initialDelay: number = 2000
): Promise<T> {
  let lastError: any;
  
  for (let i = 0; i <= retries; i++) {
    try {
      return await apiCall();
    } catch (error: any) {
      lastError = error;
      
      // Extract status code if available (GoogleGenAI errors structure varies)
      const status = error.status || error.response?.status || error.code;
      const msg = error.message || JSON.stringify(error);

      // Check for 429 or quota related errors
      const isQuotaError = 
        status === 429 || 
        msg.includes('429') || 
        msg.toLowerCase().includes('quota') || 
        msg.toLowerCase().includes('resource_exhausted');

      if (isQuotaError && i < retries) {
        const waitTime = initialDelay * Math.pow(2, i); // Exponential backoff: 2s, 4s, 8s
        console.warn(`Gemini API Quota Hit (429). Retrying in ${waitTime}ms... (Attempt ${i + 1}/${retries})`);
        await delay(waitTime);
        continue;
      }
      
      // If not a quota error or out of retries, throw immediate
      throw error;
    }
  }
  throw lastError;
}

// --- SERVICES ---

export const classifyFailureModes = async (records: RawRecord[]): Promise<Map<string, string>> => {
  const ai = getAIClient();
  const uniqueDescriptions = Array.from(new Set(records.map(r => r.description?.trim()).filter(d => !!d && d !== 'No description')));
  
  // Limit input size to prevent token limits
  const inputs = uniqueDescriptions.slice(0, 500);

  const prompt = `
    You are an expert Reliability Engineer tasked with standardizing maintenance data.
    **Goal:** Map "Original Description" to a standardized "Failure Mode".
    
    **Rules:**
    1. Unify variations: "Motor burnt", "Motor noise", "Motor vibration" -> "Motor Failure".
    2. Limit to 15-20 high-level standardized categories (e.g. "Bearing Failure", "Electrical Fault", "Hydraulic Leak").
    3. If description is vague, use "General Mechanical" or "General Electrical".
    
    **Input Descriptions:**
    ${JSON.stringify(inputs)}
  `;

  try {
    const response = await callGeminiWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              original: { type: Type.STRING },
              standardized: { type: Type.STRING }
            },
            required: ["original", "standardized"]
          }
        }
      }
    }));

    const result = JSON.parse(response.text || "[]");
    const map = new Map<string, string>();
    
    if (Array.isArray(result)) {
        result.forEach((item: any) => {
            if (item.original && item.standardized) {
                map.set(item.original, item.standardized);
            }
        });
    }
    
    return map;
  } catch (error: any) {
    console.error("Gemini classification failed:", error);
    throw new Error(error.message || "Failed to call Gemini API");
  }
};

export const suggestFailureMode = async (description: string): Promise<string> => {
    const ai = getAIClient();
    const prompt = `
        Act as a Reliability Engineer.
        Based on this maintenance log description: "${description}"
        Classify it into a standardized Failure Mode (e.g., "Bearing Failure", "Electrical Fault", "Misalignment").
        Return ONLY the Failure Mode name as a string. No explanation.
    `;

    try {
        const response = await callGeminiWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt
        }));
        return response.text?.trim() || "";
    } catch (error) {
        console.error("Single classification failed:", error);
        return "";
    }
};

export const getMaintenanceAdvice = async (
  weibull: WeibullParams,
  cp: number, 
  cc: number,
  calculatedOptimalT: number | null
): Promise<string> => {
  const ai = getAIClient();
  const prompt = `
    Analyze asset: Beta=${weibull.beta.toFixed(2)}, Eta=${weibull.eta.toFixed(2)}h.
    Costs: PM=$${cp.toFixed(2)}, CM=$${cc.toFixed(2)}.
    Optimal Interval: ${calculatedOptimalT ? calculatedOptimalT.toFixed(0) + ' hrs' : 'None'}.
    Provide concise advice (max 3 sentences) on if PM is worth it based on Beta and Cp/Cc ratio.
  `;
  try {
    const response = await callGeminiWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    }));
    return response.text || "No advice available.";
  } catch (error) {
    return "Could not retrieve AI advice.";
  }
};

export const auditPMPlan = async (tasks: PMRecord[]): Promise<PMTaskAudit[]> => {
    const ai = getAIClient();
    
    const inputs = tasks.slice(0, 50).map(t => ({ 
        id: t.id, 
        desc: t.taskDescription, 
        freq: t.frequency,
        trade: t.trade,
        durationHours: t.estimatedDuration
    }));

    const prompt = `
        You are a Senior Maintenance Supervisor auditing a PM Plan.
        Review these tasks for quality, clarity, and efficiency.
        
        **Your Goal:**
        1. Score each task (1=Vague/Bad, 3=Average, 5=Excellent/Specific).
        2. Identify Duplicates.
        3. Critique: Provide a specific "Rewrite Suggestion".
        4. Strategy: Classify as TBM (Time-Based) or CBM (Condition-Based).
        
        **Input Tasks:** ${JSON.stringify(inputs)}
        
        **Output Schema (JSON Array):**
        [{ "taskId": "string", "score": number, "critique": "string", "isDuplicate": boolean }]
    `;

    try {
        const response = await callGeminiWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: { responseMimeType: "application/json" }
        }));
        const result = JSON.parse(response.text || "[]");
        return result;
    } catch (error) {
        console.error("PM Audit failed:", error);
        return [];
    }
};

export const performGapAnalysis = async (failureData: RawRecord[], pmData: PMRecord[], targetAsset?: string): Promise<GapAnalysisResult[]> => {
    const ai = getAIClient();
    
    const assetFailures: Record<string, Set<string>> = {};
    failureData.forEach(r => {
        if (!r.location || r.location === 'Unknown Asset' || r.location === 'Unknown') return;
        if (targetAsset && targetAsset !== 'All' && r.location !== targetAsset) return;

        if (!assetFailures[r.location]) assetFailures[r.location] = new Set();
        if (r.failureMode && r.failureMode !== 'Uncategorized') {
            assetFailures[r.location].add(r.failureMode);
        }
    });

    const assetPMs: Record<string, string[]> = {};
    pmData.forEach(t => {
        if (!t.asset || t.asset === 'Unknown') return;
        if (targetAsset && targetAsset !== 'All' && t.asset !== targetAsset) return;

        if (!assetPMs[t.asset]) assetPMs[t.asset] = [];
        assetPMs[t.asset].push(`${t.taskDescription} (Freq: ${t.frequency}M)`);
    });

    const assetsToProcess = Object.keys(assetFailures);
    const topAssets = targetAsset && targetAsset !== 'All' 
        ? assetsToProcess 
        : assetsToProcess.sort((a,b) => assetFailures[b].size - assetFailures[a].size).slice(0, 20);

    if (topAssets.length === 0) return [];

    const payload = topAssets.map(asset => ({
        assetName: asset,
        knownFailures: Array.from(assetFailures[asset]),
        currentTasks: assetPMs[asset] || []
    }));

    const prompt = `
        **Reliability Gap Analysis (Asset-Centric)**
        
        For each Asset provided:
        1. Compare "Known Failures" vs "Current Tasks".
        2. Identify if any *Current Task* effectively prevents the failure.
        3. List which tasks are relevant.
        4. If no task matches, provide a Recommendation.
        
        **Input Data:**
        ${JSON.stringify(payload)}
        
        **Output Schema:**
        [
          {
            "asset": "string",
            "failureMode": "string",
            "currentTasks": "string", 
            "coverageScore": "string",
            "missingTasks": boolean,
            "recommendation": "string"
          }
        ]
    `;

    try {
        const response = await callGeminiWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: { responseMimeType: "application/json" }
        }));
        return JSON.parse(response.text || "[]");
    } catch (error) {
        console.error("Gap Analysis failed:", error);
        return [];
    }
};

export const predictTaskMetadata = async (tasks: PMRecord[]): Promise<Record<string, { trade: string, taskType: string }>> => {
    const ai = getAIClient();
    const simpleList = tasks.map(t => ({ id: t.id, desc: t.taskDescription, asset: t.asset }));
    const inputs = simpleList.slice(0, 100);

    const prompt = `
        You are a Maintenance Planner.
        Analyze each task description and assign:
        1. **Trade**: "Mechanical", "Electrical", "Instrumentation", "Production", "Lubrication", "General".
        2. **Strategy** (MTA Classification):
           - "CBM" (Condition-Based)
           - "TBM" (Time-Based)
           - "FF" (Failure-Finding)
        
        **Input:** ${JSON.stringify(inputs)}
        
        **Output Schema (JSON Object):**
        {
           "taskId1": { "trade": "Mechanical", "taskType": "CBM" },
           "taskId2": { "trade": "Electrical", "taskType": "TBM" }
        }
    `;

    try {
        const response = await callGeminiWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                responseMimeType: "application/json"
            }
        }));
        return JSON.parse(response.text || "{}");
    } catch (error) {
        console.error("Task enrichment failed:", error);
        return {};
    }
};

export const sendChatToWizard = async (
    history: ChatMessage[], 
    newMessage: string, 
    contextBox: 'box1' | 'box2',
    dataSummary: string
): Promise<string> => {
    const ai = getAIClient();
    const conversation = [
        `System: You are the "Reliability Wizard". Context: ${contextBox}. Data Summary: ${dataSummary}`,
        ...history.map(m => `${m.sender === 'user' ? 'User' : 'Assistant'}: ${m.text}`),
        `User: ${newMessage}`
    ].join('\n\n');

    try {
        const response = await callGeminiWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: conversation
        }));
        return response.text || "I couldn't generate a response.";
    } catch (error) {
        return "Sorry, I encountered an error connecting to the brain.";
    }
};

// --- RCM GENERATOR SERVICES (Box 3) ---

// Helper to build parts for multimodal
const buildParts = (text: string, files: AttachedFile[]) => {
    const parts: any[] = [{ text }];
    files.forEach(file => {
        parts.push({
            inlineData: {
                mimeType: file.type,
                data: file.data
            }
        });
    });
    return parts;
};

// 1. Full Generation (Top-Down) - Deprecated for new granular flow but kept for compatibility
export const generateRCMFromText = async (description: string, files: AttachedFile[] = []): Promise<RCMFunction[]> => {
    return rcmSuggestFunctions(description, files); // Redirect to step 1
};

// 1. Generate Functions (Step 1)
export const rcmSuggestFunctions = async (context: string, files: AttachedFile[] = []): Promise<RCMFunction[]> => {
    const ai = getAIClient();
    const prompt = `
        You are an Reliability Specialist (RCM). 
        Based on the provided operational context and files, identify the **Primary** and **Secondary** functions of the asset/system.
        
        **Operational Context:** ${context}
        
        **Goal:** List the functions with clear descriptions and types.
        **Types:** Primary, Environmental Integrity, Security, Containment, Appearance, Protection, Economy, Superfluous.
        
        **Output Schema (JSON Array):**
        [{ "code": "1.0", "description": "Function Desc", "type": "Primary" }]
    `;
    
    try {
        const response = await callGeminiWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: { parts: buildParts(prompt, files) },
            config: { responseMimeType: "application/json" }
        }));
        const raw = JSON.parse(response.text || "[]");
        return raw.map((f: any, i: number) => ({
            id: `func-${i}-${Date.now()}`,
            code: f.code || `${i+1}.0`,
            description: f.description,
            type: f.type || 'Primary',
            functionalFailures: []
        }));
    } catch (e) {
        console.error("RCM Func Gen Error", e);
        throw new Error("Failed to generate functions (Quota exceeded?)");
    }
};

// 2. Generate Functional Failures (Step 2)
export const rcmGenFailures = async (funcDesc: string, context: string, files: AttachedFile[] = []): Promise<RCMFunctionalFailure[]> => {
    const ai = getAIClient();
    const prompt = `
        **RCM Specialist Task:** Identify Functional Failures.
        **Context:** ${context}
        **Function:** ${funcDesc}
        **Output Schema:**
        [{ "code": "A", "description": "Failure Desc", "type": "Total" | "Partial" }]
    `;
    try {
        const response = await callGeminiWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: { parts: buildParts(prompt, files) },
            config: { responseMimeType: "application/json" }
        }));
        const raw = JSON.parse(response.text || "[]");
        return raw.map((ff: any, i: number) => ({
            id: `ff-gen-${Date.now()}-${i}`,
            code: ff.code || String.fromCharCode(65+i),
            description: ff.description,
            type: ff.type || 'Total',
            failureModes: []
        }));
    } catch(e) { throw new Error("Failed to generate failures"); }
};

// 3. Generate Failure Modes (Step 3)
export const rcmGenModes = async (failDesc: string, funcDesc: string, context: string, files: AttachedFile[] = []): Promise<RCMFailureMode[]> => {
    const ai = getAIClient();
    const prompt = `
        **RCM Specialist Task:** Identify Failure Modes (Root Causes).
        **Context:** ${context}
        **Function:** ${funcDesc}
        **Functional Failure:** ${failDesc}
        **Output Schema:**
        [{ "code": "1", "description": "Mode Desc", "effect": "Effect Desc", "isHumanError": boolean }]
    `;
    try {
        const response = await callGeminiWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: { parts: buildParts(prompt, files) },
            config: { responseMimeType: "application/json" }
        }));
        const raw = JSON.parse(response.text || "[]");
        return raw.map((fm: any, i: number) => ({
            id: `fm-gen-${Date.now()}-${i}`,
            code: fm.code || `${i+1}`,
            description: fm.description,
            effect: fm.effect || '',
            isHumanError: fm.isHumanError || false,
            task: undefined // Start without task
        }));
    } catch(e) { throw new Error("Failed to generate modes"); }
};

// 4. Generate Task (Step 4)
export const rcmGenTask = async (modeDesc: string, failDesc: string, context: string, files: AttachedFile[] = []): Promise<RCMTask> => {
    const ai = getAIClient();
    const prompt = `
        **RCM Specialist Task:** Recommend Maintenance Task.
        **Context:** ${context}
        **Failure Mode:** ${modeDesc}
        **Functional Failure:** ${failDesc}
        
        Apply RCM Logic (Safe/Hidden/Operational) to select the best task.
        Types: Condition-Based Maintenance (CBM), Scheduled (Time-Based) Preventive Maintenance, Failure-Finding Tasks, Run-to-Failure, etc.
        
        **Output Schema:**
        { 
           "code": "T1", "description": "Task Desc", "type": "Type",
           "frequency": "Monthly", "duration": 2, "executor": "Mechanic", "executorCount": 1
        }
    `;
    try {
        const response = await callGeminiWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: { parts: buildParts(prompt, files) },
            config: { responseMimeType: "application/json" }
        }));
        const t = JSON.parse(response.text || "{}");
        return {
            id: `task-gen-${Date.now()}`,
            code: t.code || 'T1',
            description: t.description || 'No task recommended',
            type: t.type || 'Run-to-Failure',
            frequency: t.frequency || 'N/A',
            duration: t.duration || 0,
            executor: t.executor || 'General',
            executorCount: t.executorCount || 1
        };
    } catch(e) { throw new Error("Failed to generate task"); }
};

// 5. Generate Inspection Sheet (On Demand)
export const generateInspectionSheet = async (taskDesc: string, context: string, files: AttachedFile[] = []): Promise<InspectionPoint[]> => {
    const ai = getAIClient();
    const prompt = `
        **Goal:** Create a detailed Maintenance Inspection Sheet (Checklist) for a technician.
        
        **Task:** ${taskDesc}
        **Operational Context:** ${context}
        
        **Instructions:**
        Break down the task into specific measurement points.
        1. **Qualitative:** Visual checks, noise, smell, conditions (Pass/Fail criteria).
        2. **Quantitative:** Measured values (Pressure, Temp, Vibration, Clearance) with realistic limits.
        3. **Time Estimate:** Estimate the minutes required for each point.
        
        **Output Schema (JSON Array):**
        [{ 
           "description": "Check oil level", 
           "type": "Qualitative", 
           "nominal": "Between Min/Max lines",
           "timeMinutes": 2
        }, 
        { 
           "description": "Measure bearing temp", 
           "type": "Quantitative", 
           "unit": "°C", 
           "min": 0, 
           "max": 80, 
           "nominal": "< 70",
           "timeMinutes": 5
        }]
    `;
    try {
        const response = await callGeminiWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: { parts: buildParts(prompt, files) },
            config: { responseMimeType: "application/json" }
        }));
        return JSON.parse(response.text || "[]");
    } catch(e) { 
        console.error("Inspection Sheet Gen Error", e);
        throw new Error("Failed to generate inspection sheet"); 
    }
};

// Legacy placeholders to prevent breakages in other files if any
export const rcmAnalyzeFMEA = async (d: string, a: string): Promise<RCMFunctionalFailure[]> => [];
export const rcmDetermineTask = async (m: string, e: string, c: string): Promise<RCMTask | undefined> => undefined;
export const generateCorePlan = async (s: AssetStrategyInput, f: RawRecord[], c: PMRecord[]): Promise<PMRecord[]> => [];
export const balanceWorkload = async (t: PMRecord[], r: number): Promise<Record<string, number>> => ({});
export const generateRCMPlan = async (c: RCMContext): Promise<PMRecord[]> => [];
