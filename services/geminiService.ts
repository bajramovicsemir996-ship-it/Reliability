
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

/**
 * 1:1 Technical Translation Service
 */
export const translateTechnicalTerms = async (
    terms: string[],
    fromLang: string,
    toLang: string = "English"
): Promise<Record<string, string>> => {
    if (terms.length === 0) return {};
    
    const prompt = `
        You are a highly precise technical translator specializing in industrial maintenance and reliability engineering.
        Task: Translate the following list of terms from ${fromLang} to ${toLang}.
        
        Rules:
        1. Maintain 1:1 mapping.
        2. Use standard engineering jargon (e.g., 'rodamiento' -> 'bearing', 'stoppage' -> 'downtime').
        3. No conversational filler or explanations.
        4. If a term is already in ${toLang}, keep it as is.
        
        Terms: ${JSON.stringify(terms)}
    `;

    const schema = {
        type: Type.ARRAY,
        items: {
            type: Type.OBJECT,
            properties: {
                original: { type: Type.STRING },
                translated: { type: Type.STRING }
            },
            required: ["original", "translated"]
        }
    };

    try {
        const text = await callGeminiWithRetry(prompt, schema, "gemini-3-flash-preview");
        const result = JSON.parse(text || "[]");
        const map: Record<string, string> = {};
        result.forEach((item: any) => {
            map[item.original] = item.translated;
        });
        return map;
    } catch (error) {
        console.error("Translation Error:", error);
        throw error;
    }
};

export const getRcaNarrative = async (target: string, failures: any[], language: AppLanguage = 'English'): Promise<{ narrative: string, fmea: any[] }> => {
  const prompt = `Analyze the reliability data for ${target}. 
  1. Provide a "Physics of Failure" narrative explaining the likely root causes.
  2. Perform a structured FMEA (Failure Mode and Effects Analysis) based on the observed descriptions.
  
  IMPORTANT: Provide the entire response in ${language}.
  
  Failures: ${JSON.stringify(failures.slice(0, 15))}`;

  const schema = {
    type: Type.OBJECT,
    properties: {
      narrative: { type: Type.STRING, description: "Detailed physics-based explanation of failures" },
      fmea: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            failureMode: { type: Type.STRING },
            failureMechanism: { type: Type.STRING },
            localEffect: { type: Type.STRING },
            mitigation: { type: Type.STRING }
          },
          required: ["failureMode", "failureMechanism", "localEffect", "mitigation"]
        }
      }
    },
    required: ["narrative", "fmea"]
  };

  try {
    const text = await callGeminiWithRetry(prompt, schema, "gemini-3-pro-preview");
    return JSON.parse(text || '{"narrative": "Error parsing response", "fmea": []}');
  } catch (error) { 
    return { narrative: "Unable to synthesize RCA logic.", fmea: [] }; 
  }
};

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

// Fix for line 260: Added missing implementations for maintenance advice, audit, gap analysis, and wizard chat.

export const getMaintenanceAdvice = async (weibull: WeibullParams, cp: number, cc: number, optimal: number | null, language: AppLanguage = 'English'): Promise<string> => {
  const prompt = `As a Reliability Engineer, provide advice based on:
  Beta: ${weibull.beta.toFixed(2)}, Eta: ${weibull.eta.toFixed(2)}, R^2: ${weibull.rSquared.toFixed(2)}.
  Cost Preventive: ${cp}, Cost Corrective: ${cc}, Calculated Optimal: ${optimal || 'N/A'}.
  Explain the strategy and risk profile in ${language}.`;
  
  return await callGeminiWithRetry(prompt, undefined, "gemini-3-flash-preview");
};

export const auditPMPlan = async (tasks: PMRecord[], language: AppLanguage = 'English'): Promise<PMTaskAudit[]> => {
  const prompt = `Audit the following maintenance tasks for quality, technical depth, and potential duplicates in ${language}.
  Tasks: ${JSON.stringify(tasks.map(t => ({ id: t.id, desc: t.taskDescription, asset: t.asset })))}`;

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

  const text = await callGeminiWithRetry(prompt, schema, "gemini-3-flash-preview");
  return JSON.parse(text || "[]");
};

export const performGapAnalysis = async (history: any[], plan: PMRecord[], language: AppLanguage = 'English'): Promise<GapAnalysisResult[]> => {
  const prompt = `Perform a gap analysis between historical failure data and the current maintenance plan in ${language}.
  History: ${JSON.stringify(history)}
  Plan: ${JSON.stringify(plan.map(p => ({ asset: p.asset, desc: p.taskDescription, type: p.taskType })))}`;

  const schema = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        asset: { type: Type.STRING },
        failureMode: { type: Type.STRING },
        currentTasks: { type: Type.STRING },
        coverageScore: { type: Type.STRING },
        criticality: { type: Type.STRING },
        missingTasks: { type: Type.BOOLEAN },
        recommendation: { type: Type.STRING }
      },
      required: ["asset", "failureMode", "currentTasks", "coverageScore", "criticality", "missingTasks", "recommendation"]
    }
  };

  const text = await callGeminiWithRetry(prompt, schema, "gemini-3-pro-preview");
  return JSON.parse(text || "[]");
};

export const analyzeResourceGap = async (resources: ResourceConfig[], demand: { trade: string, annualHours: number }[]): Promise<ResourceOptimizationResult[]> => {
  const prompt = `Analyze capacity vs demand.
  Supply: ${JSON.stringify(resources)}
  Demand: ${JSON.stringify(demand)}`;

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

  const text = await callGeminiWithRetry(prompt, schema, "gemini-3-flash-preview");
  return JSON.parse(text || "[]");
};

export const sendChatToWizard = async (messages: ChatMessage[], input: string, context: string, summary: string, language: AppLanguage = 'English'): Promise<string> => {
  const prompt = `Context: ${context}. Data Summary: ${summary}. Language: ${language}.
  History: ${JSON.stringify(messages.slice(-5))}
  User: ${input}`;
  
  return await callGeminiWithRetry(prompt, undefined, "gemini-3-flash-preview");
};
