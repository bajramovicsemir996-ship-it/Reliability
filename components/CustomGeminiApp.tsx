
import React, { useState } from 'react';
import { GoogleGenAI } from "@google/genai";
import { Loader2, Sparkles, Send } from 'lucide-react';

/**
 * ------------------------------------------------------------------
 * INSTRUCTIONS FOR INTEGRATION:
 * ------------------------------------------------------------------
 * 1. Paste your existing component code (State, Effects, UI) inside this component.
 * 2. Ensure you use the 'process.env.API_KEY' for the GoogleGenAI client.
 * 3. If your app uses custom CSS classes, ensure they are Tailwind compatible
 *    or add your styles to index.html.
 * ------------------------------------------------------------------
 */

const CustomGeminiApp: React.FC = () => {
  // --- PASTE YOUR STATE & LOGIC HERE ---
  const [input, setInput] = useState('');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);

  // Example Gemini Call (Replace with your own logic)
  const handleRunMyCode = async () => {
    if (!process.env.API_KEY) {
        alert("API Key is missing!");
        return;
    }

    setLoading(true);
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        
        // Fixed: Use 'gemini-3-flash-preview' for basic text tasks per guidelines.
        const result = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: input || "Hello from my custom integrated app!",
        });
        
        // Fixed: Use the .text property (not a method) as per @google/genai guidelines.
        setResponse(result.text || "No response");
    } catch (e: any) {
        setResponse(`Error: ${e.message}`);
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 p-6 gap-6">
        
        {/* Header Area */}
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                <Sparkles className="text-purple-600" /> 
                My Custom Integrated App
            </h1>
            <p className="text-gray-500 mt-2">
                This is the container for your external application. 
                Edit <code>components/CustomGeminiApp.tsx</code> and paste your code to replace this view.
            </p>
        </div>

        {/* Your App UI Area */}
        <div className="flex-1 bg-white rounded-xl border border-gray-200 shadow-sm p-8 flex flex-col items-center justify-center">
            
            <div className="w-full max-w-2xl space-y-4">
                <label className="block text-sm font-semibold text-gray-700">Test Your Integration</label>
                <div className="flex gap-2">
                    <input 
                        type="text" 
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Enter a prompt for Gemini 3 Flash..."
                        className="flex-1 border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
                    />
                    <button 
                        onClick={handleRunMyCode}
                        disabled={loading}
                        className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-lg font-medium transition flex items-center gap-2 disabled:opacity-50"
                    >
                        {loading ? <Loader2 className="animate-spin" /> : <Send size={18} />}
                        Run
                    </button>
                </div>

                {/* Output Area */}
                {response && (
                    <div className="mt-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
                        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Model Output</h3>
                        <p className="text-gray-800 whitespace-pre-wrap leading-relaxed">
                            {response}
                        </p>
                    </div>
                )}
            </div>

        </div>
    </div>
  );
};

export default CustomGeminiApp;
