
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { RawRecord, WeibullParams, PMRecord, PMTaskAudit, GapAnalysisResult, ChatMessage, ResourceConfig, ResourceOptimizationResult, AppLanguage } from "../types";

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function callGeminiWithRetry(
  prompt: string,
  schema?: any,
  model: string = "gemini-3-flash-preview",
  retries: number = 3
): Promise<string> {
  let lastError: any;
  for (let i = 0; i <= retries; i++) {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: model,
        contents: prompt,
        config: schema ? {
          responseMimeType: "application/json",
          responseSchema: schema
        } : undefined
      });
      return response.text || "";
    } catch (error: any) {
      lastError = error;
      if (error.status === 429 && i < retries) {
        await delay(Math.pow(2, i) * 1000);
        continue;
      }
      throw error;
    }
  }
  return "";
}

export const predictSpecificAttribute = async (
    tasks: PMRecord[], 
    attribute: 'trade' | 'frequency' | 'taskType' | 'shutdownRequired',
    language: AppLanguage = 'English'
): Promise<Record<string, any>> => {
    const inputs = tasks.map(t => ({ id: t.id, asset: t.asset, desc: t.taskDescription }));
    
    const configMap = {
        trade: {
            label: 'Trade',
            options: "'Mechanical', 'Electrical', 'Hydraulic', 'Automation', 'Production'",
            type: Type.STRING
        },
        frequency: {
            label: 'Frequency',
            options: "'Daily', 'Weekly', 'Fortnightly', 'Monthly', 'Quarterly', '6 Monthly', 'Yearly'",
            type: Type.STRING
        },
        taskType: {
            label: 'Strategy',
            options: "'Time Based', 'Condition Based', 'Scheduled Restoration', 'Scheduled Replacement', 'Failure Finding'",
            type: Type.STRING
        },
        shutdownRequired: {
            label: 'Operational State',
            options: "true (for Shutdown Required) or false (for Running Maintenance)",
            type: Type.BOOLEAN
        }
    };

    const cfg = configMap[attribute];
    const prompt = `
        You are an expert Reliability Engineer. 
        For the following maintenance tasks, predict the most logical ${cfg.label}.
        Choose ONLY from these options: [${cfg.options}].
        
        IMPORTANT: Provide the resulting values in ${language}.
        
        Input Data: ${JSON.stringify(inputs)}
    `;

    const schema = {
        type: Type.ARRAY,
        items: {
            type: Type.OBJECT,
            properties: {
                id: { type: Type.STRING },
                value: { type: cfg.type }
            },
            required: ["id", "value"]
        }
    };

    try {
        const text = await callGeminiWithRetry(prompt, schema);
        const list = JSON.parse(text || "[]");
        const map: any = {};
        list.forEach((item: any) => map[item.id] = item.value);
        return map;
    } catch (error) { return {}; }
};

export const classifyFailureModes = async (records: RawRecord[], language: AppLanguage = 'English'): Promise<Map<string, { mode: string, reasoning: string }>> => {
  const uniqueDescriptions = Array.from(new Set(records.map(r => r.description?.trim()).filter(d => !!d && d !== 'No description')));
  const map = new Map<string, { mode: string, reasoning: string }>();
  if (uniqueDescriptions.length === 0) return map;
  const prompt = `Analyze these maintenance logs and assign a failure mode per RCM (Reliability Centered Maintenance) methodology. 
  Extract the failure mechanism and root cause from the description and context.
  Naming Convention: "[Mechanism]: [Root Cause]" (e.g. "Fatigue: Vibration induced bearing failure").
  
  IMPORTANT: Provide all text (standardized names, mechanism, and reasoning) in ${language}.
  
  Logs: ${JSON.stringify(uniqueDescriptions)}`;
  
  const schema = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        original: { type: Type.STRING },
        standardized: { type: Type.STRING },
        reasoning: { type: Type.STRING }
      },
      required: ["original", "standardized", "reasoning"]
    }
  };
  try {
    const text = await callGeminiWithRetry(prompt, schema);
    const result = JSON.parse(text || "[]");
    result.forEach((item: any) => map.set(item.original, { mode: item.standardized, reasoning: item.reasoning }));
  } catch (error) {}
  return map;
};

export const performSemanticClustering = async (records: RawRecord[], language: AppLanguage = 'English'): Promise<Map<string, string>> => {
  const uniqueDescriptions = Array.from(new Set(records.map(r => r.description?.trim()).filter(d => !!d)));
  const map = new Map<string, string>();
  if (uniqueDescriptions.length === 0) return map;
  const prompt = `Group semantically identical descriptions together. Output a standardized description.
  IMPORTANT: Provide the standardized text in ${language}.
  Input: ${JSON.stringify(uniqueDescriptions)}`;
  const schema = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        original: { type: Type.STRING },
        standardized: { type: Type.STRING }
      },
      required: ["original", "standardized"]
    }
  };
  try {
    const text = await callGeminiWithRetry(prompt, schema);
    const result = JSON.parse(text || "[]");
    result.forEach((item: any) => map.set(item.original, item.standardized));
  } catch (error) {}
  return map;
};

export const suggestFailureMode = async (description: string, language: AppLanguage = 'English'): Promise<{ mode: string, reasoning: string }> => {
    const prompt = `Assign a failure mode for: "${description}" per RCM methodology. 
    Use format "[Mechanism]: [Root Cause]". Be technically specific.
    IMPORTANT: Provide the mode and reasoning in ${language}.`;
    const schema = {
        type: Type.OBJECT,
        properties: { mode: { type: Type.STRING }, reasoning: { type: Type.STRING } },
        required: ["mode", "reasoning"]
    };
    try {
        const text = await callGeminiWithRetry(prompt, schema);
        return JSON.parse(text || "{}");
    } catch (error) { return { mode: "General failure", reasoning: "Error" }; }
};

export const getMaintenanceAdvice = async (weibull: WeibullParams, cp: number, cc: number, calculatedOptimalT: number | null, language: AppLanguage = 'English'): Promise<string> => {
  const prompt = `Provide concise reliability strategy advice. Beta: ${weibull.beta.toFixed(2)}, Eta: ${weibull.eta.toFixed(0)}. Optimal PM Interval: ${calculatedOptimalT ? calculatedOptimalT.toFixed(0) : 'None'}. CP: ${cp}, CC: ${cc}.
  IMPORTANT: Provide the advice exclusively in ${language}.`;
  try {
    return await callGeminiWithRetry(prompt);
  } catch (error) { return "Error fetching advice."; }
};

export const getRcaNarrative = async (target: string, failures: any[], language: AppLanguage = 'English'): Promise<string> => {
  const prompt = `Provide a "Physics of Failure" analysis for ${target}. Failures: ${JSON.stringify(failures.slice(0, 10))}.
  IMPORTANT: Provide the entire response in ${language}.`;
  try {
    return await callGeminiWithRetry(prompt, null, "gemini-3-pro-preview");
  } catch (error) { return "Unable to synthesize RCA logic."; }
};

export const auditPMPlan = async (tasks: PMRecord[], language: AppLanguage = 'English'): Promise<PMTaskAudit[]> => {
    const inputs = tasks.slice(0, 100).map(t => ({ id: t.id, asset: t.asset, task: t.taskDescription, type: t.taskType }));
    const prompt = `Audit these PM tasks for quality, clarity and technical specificity per asset and task name. Score 1-5. Provide a specific rewritten recommendation to improve the task description for better technical precision.
    IMPORTANT: Provide all written feedback (critique and recommendation) in ${language}.
    Input: ${JSON.stringify(inputs)}`;
    const schema = {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: { 
          taskId: { type: Type.STRING }, 
          score: { type: Type.NUMBER }, 
          critique: { type: Type.STRING }, 
          recommendation: { type: Type.STRING },
          isDuplicate: { type: Type.BOOLEAN } 
        },
        required: ["taskId", "score", "critique", "recommendation", "isDuplicate"]
      }
    };
    try {
        const text = await callGeminiWithRetry(prompt, schema);
        return JSON.parse(text || "[]");
    } catch (error) { return []; }
};

export const performGapAnalysis = async (failureHistory: any[], pmData: PMRecord[], language: AppLanguage = 'English'): Promise<GapAnalysisResult[]> => {
    const prompt = `
      You are a World-Class Reliability Engineer performing a Strategy Gap Analysis.
      
      CONTEXT (Historical Failure Modes & Downtime Intensity):
      ${JSON.stringify(failureHistory)}
      
      DEFENSE (Current Preventive Strategy Stack):
      ${JSON.stringify(pmData.map(t => ({ asset: t.asset, task: t.taskDescription, strategy: t.taskType })))}

      TASK:
      1. For EACH failure mode in the context, analyze if the current defense tasks are technically capable of mitigating that specific failure root cause.
      2. Rate "Coverage Score" as Good, Weak, or None.
      3. Rate "Strategy Match" as Optimal, Mismatch (wrong task for failure mode), or Wasteful (too much PM for minor risk).
      4. Suggest a specific RCM improvement (e.g., "Implement vibration analysis", "Change frequency to monthly based on wear pattern").

      IMPORTANT: Provide all text (asset, failureMode, currentTasks, recommendation) in ${language}.

      RETURN JSON ARRAY:
      [{ 
        "asset": "string",
        "failureMode": "string",
        "currentTasks": "string",
        "coverageScore": "Good" | "Weak" | "None",
        "strategyMatch": "Optimal" | "Mismatch" | "Wasteful",
        "criticality": "High" | "Medium" | "Low",
        "recommendation": "string",
        "missingTasks": boolean
      }]
    `;
    
    const schema = {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          asset: { type: Type.STRING },
          failureMode: { type: Type.STRING },
          currentTasks: { type: Type.STRING },
          coverageScore: { type: Type.STRING },
          strategyMatch: { type: Type.STRING },
          criticality: { type: Type.STRING },
          recommendation: { type: Type.STRING },
          missingTasks: { type: Type.BOOLEAN }
        },
        required: ["asset", "failureMode", "currentTasks", "coverageScore", "strategyMatch", "criticality", "recommendation", "missingTasks"]
      }
    };

    try {
        const text = await callGeminiWithRetry(prompt, schema, "gemini-3-pro-preview");
        return JSON.parse(text || "[]");
    } catch (error) { return []; }
};

export const predictTaskMetadata = async (tasks: PMRecord[], language: AppLanguage = 'English'): Promise<Record<string, { trade: string, taskType: string, executorType: string, shutdownRequired: boolean, frequency: string }>> => {
    const inputs = tasks.slice(0, 100).map(t => ({ id: t.id, desc: t.taskDescription, currentFreq: t.frequency, currentTrade: t.trade, currentType: t.taskType }));
    const prompt = `
        Standardize and audit the following PM task list. 
        Your goal is to normalize metadata across the entire plan.
        
        Rules:
        - Trade MUST be one of: 'Mechanical', 'Electrical', 'Hydraulic', 'Automation', 'Production'.
        - Strategy (taskType) MUST be one of: 'Time Based', 'Condition Based', 'Scheduled Restoration', 'Scheduled Replacement', 'Failure Finding'.
        - Frequency SHOULD be standardized to: 'Daily', 'Weekly', 'Fortnightly', 'Monthly', 'Quarterly', '6 Monthly', 'Yearly'.
        - ShutdownRequired is true if the task REQUIRES the asset to be stopped.
        
        IMPORTANT: Provide the predicted string values (trade, taskType, frequency) in ${language}.
        
        Input Data: ${JSON.stringify(inputs)}
    `;
    const schema = {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          trade: { type: Type.STRING },
          taskType: { type: Type.STRING },
          executorType: { type: Type.STRING },
          shutdownRequired: { type: Type.BOOLEAN },
          frequency: { type: Type.STRING }
        },
        required: ["id", "trade", "taskType", "executorType", "shutdownRequired", "frequency"]
      }
    };
    try {
        const text = await callGeminiWithRetry(prompt, schema);
        const list = JSON.parse(text || "[]");
        const map: any = {};
        list.forEach((item: any) => map[item.id] = item);
        return map;
    } catch (error) { return {}; }
};

export const analyzeResourceGap = async (resources: ResourceConfig[], workload: {trade: string, annualHours: number}[], language: AppLanguage = 'English'): Promise<ResourceOptimizationResult[]> => {
    const prompt = `Analyze capacity vs demand for maintenance resources. Capacity: ${JSON.stringify(resources)}. Demand: ${JSON.stringify(workload)}.
    IMPORTANT: Provide all textual fields (trade, status, recommendation) in ${language}.`;
    const schema = {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: { 
          trade: { type: Type.STRING }, 
          gapHours: { type: Type.NUMBER }, 
          status: { type: Type.STRING }, 
          recommendation: { type: Type.STRING } 
        },
        required: ["trade", "gapHours", "status", "recommendation"]
      }
    };
    try {
        const text = await callGeminiWithRetry(prompt, schema);
        return JSON.parse(text || "[]");
    } catch (error) { return []; }
};

export const sendChatToWizard = async (history: ChatMessage[], newMessage: string, contextBox: 'box1' | 'box2', dataSummary: string, language: AppLanguage = 'English'): Promise<string> => {
    const conversation = `System: You are a Reliability Engineering Wizard. Context: ${contextBox}. Data Summary: ${dataSummary}.
    IMPORTANT: Respond exclusively in ${language}.
    User: ${newMessage}`;
    try {
        return await callGeminiWithRetry(conversation);
    } catch (error) { return "Wizard offline."; }
};
