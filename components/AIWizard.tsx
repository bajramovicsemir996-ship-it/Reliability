
import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, X, Send, Bot, User, Loader2, Sparkles } from 'lucide-react';
import { ChatMessage } from '../types';
import { sendChatToWizard } from '../services/geminiService';
import { useAppStore } from '../store';

interface AIWizardProps {
  contextBox: 'box1' | 'box2';
  dataSummary: string;
}

const AIWizard: React.FC<AIWizardProps> = ({ contextBox, dataSummary }) => {
  const { language } = useAppStore();
  const [isOpen, setIsOpen] = useState(false);
  
  const getContextName = (box: string) => {
    switch(box) {
        case 'box1': return 'Delay Analysis';
        case 'box2': return 'PM Planning';
        default: return 'Maintenance';
    }
  };

  const getWelcomeMessage = () => {
      switch(language) {
          case 'French': return `Bonjour ! Je suis votre Magicien de la Fiabilité. Je vois que vous travaillez sur ${getContextName(contextBox)}. Comment puis-je vous aider ?`;
          case 'Spanish': return `¡Hola! Soy tu Mago de la Confiabilidad. Veo que estás trabajando en ${getContextName(contextBox)}. ¿En qué puedo ayudarte?`;
          case 'German': return `Hallo! Ich bin Ihr Zuverlässigkeits-Assistent. Ich sehe, dass Sie an ${getContextName(contextBox)} arbeiten. Wie kann ich Ihnen helfen?`;
          case 'Polish': return `Cześć! Jestem Twoim Kreatorem Niezawodności. Widzę, że pracujesz nad ${getContextName(contextBox)}. Jak mogę Ci pomóc?`;
          default: return `Hello! I'm your Reliability Wizard. I see you're working on ${getContextName(contextBox)}. How can I help?`;
      }
  };

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages([{
        id: `welcome-${Date.now()}`,
        sender: 'ai',
        text: getWelcomeMessage(),
        timestamp: new Date()
    }]);
  }, [contextBox, language]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isOpen) scrollToBottom();
  }, [messages, isOpen]);

  const handleSend = async () => {
      if (!input.trim()) return;
      
      const userMsg: ChatMessage = {
          id: Date.now().toString(),
          sender: 'user',
          text: input,
          timestamp: new Date()
      };
      
      setMessages(prev => [...prev, userMsg]);
      setInput('');
      setIsLoading(true);

      const responseText = await sendChatToWizard(messages, input, contextBox, dataSummary, language);
      
      const aiMsg: ChatMessage = {
          id: (Date.now() + 1).toString(),
          sender: 'ai',
          text: responseText,
          timestamp: new Date()
      };
      
      setMessages(prev => [...prev, aiMsg]);
      setIsLoading(false);
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
        {isOpen && (
            <div className="bg-white w-80 md:w-96 h-[500px] rounded-2xl shadow-2xl border border-gray-200 flex flex-col mb-4 overflow-hidden animate-in slide-in-from-bottom-5 fade-in duration-200">
                <div className="bg-indigo-600 p-4 flex justify-between items-center text-white">
                    <div className="flex items-center gap-2">
                        <div className="bg-white/20 p-1.5 rounded-full">
                            <Sparkles size={16} className="text-yellow-300" />
                        </div>
                        <div>
                            <h3 className="font-bold text-sm">AI Wizard</h3>
                            <p className="text-xs text-indigo-200">Always here to help</p>
                        </div>
                    </div>
                    <button onClick={() => setIsOpen(false)} className="text-indigo-200 hover:text-white transition">
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 bg-gray-50 custom-scrollbar space-y-4">
                    {messages.map((msg) => (
                        <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`flex max-w-[80%] gap-2 ${msg.sender === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${msg.sender === 'user' ? 'bg-indigo-100' : 'bg-emerald-100'}`}>
                                    {msg.sender === 'user' ? <User size={14} className="text-indigo-700"/> : <Bot size={14} className="text-emerald-700"/>}
                                </div>
                                <div className={`p-3 rounded-2xl text-sm shadow-sm ${
                                    msg.sender === 'user' 
                                    ? 'bg-indigo-600 text-white rounded-tr-none' 
                                    : 'bg-white text-gray-700 border border-gray-100 rounded-tl-none'
                                }`}>
                                    {msg.text}
                                </div>
                            </div>
                        </div>
                    ))}
                    {isLoading && (
                        <div className="flex justify-start">
                             <div className="flex max-w-[80%] gap-2">
                                <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                                    <Bot size={14} className="text-emerald-700"/>
                                </div>
                                <div className="bg-white p-3 rounded-2xl rounded-tl-none border border-gray-100 shadow-sm flex items-center gap-2">
                                    <Loader2 size={14} className="animate-spin text-gray-400" />
                                    <span className="text-xs text-gray-400">Thinking...</span>
                                </div>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                <div className="p-3 bg-white border-t border-gray-100">
                    <form 
                        onSubmit={(e) => { e.preventDefault(); handleSend(); }}
                        className="flex items-center gap-2 bg-gray-100 rounded-full px-4 py-2 border border-transparent focus-within:border-indigo-300 focus-within:bg-white transition"
                    >
                        <input 
                            type="text" 
                            className="flex-1 bg-transparent border-none focus:ring-0 text-sm placeholder-gray-400"
                            placeholder="Ask a question..."
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                        />
                        <button 
                            type="submit" 
                            disabled={!input.trim() || isLoading}
                            className="text-indigo-600 hover:text-indigo-700 disabled:opacity-50 transition"
                        >
                            <Send size={18} />
                        </button>
                    </form>
                </div>
            </div>
        )}

        <button 
            onClick={() => setIsOpen(!isOpen)}
            className="group flex items-center justify-center w-14 h-14 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105"
        >
            {isOpen ? <X size={24} /> : <MessageSquare size={24} className="group-hover:animate-pulse"/>}
        </button>
    </div>
  );
};

export default AIWizard;
