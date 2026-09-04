import React, { useState } from 'react';
import { X, Bot, Sparkles, Send, Lightbulb, RefreshCw, Check } from 'lucide-react';
import { store } from '../../lib/store';
import { useDialogBehavior } from '../../hooks/useDialogBehavior';

interface AiAssistantDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AiAssistantDrawer: React.FC<AiAssistantDrawerProps> = ({ isOpen, onClose }) => {
  const dialogRef = useDialogBehavior<HTMLDivElement>(isOpen, onClose);
  const [promptInput, setPromptInput] = useState('');
  const [aiOutput, setAiOutput] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'POLISH' | 'EXPLAIN_MATCH'>('POLISH');

  if (!isOpen) return null;

  const handleRunAi = async () => {
    if (!promptInput.trim()) return;
    setLoading(true);
    setAiOutput(null);

    try {
      if (mode === 'POLISH') {
        const res = await fetch('/api/ai/polish-description', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            description: promptInput,
            category: 'حلويات كويتية',
            story: 'وصفة مبتكرة'
          })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'تعذرت المعالجة');
        setAiOutput(data.polishedText);
      } else {
        const res = await fetch('/api/ai/match-explainer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            productName: promptInput,
            category: 'حلويات',
            hostName: 'دار المذاق',
            equipment: ['فرن دوار', 'عجانة 50L'],
            marginScore: 90
          })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'تعذر التحليل');
        setAiOutput(data.explanation);
      }
    } catch {
      setAiOutput('حدث خطأ أثناء التواصل مع مساعد مجال الذكي. يرجى المحاولة لاحقاً.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-950/70 backdrop-blur-sm animate-in fade-in">
      <div className="absolute inset-y-0 left-0 max-w-full flex pl-0 sm:pl-10">
        <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="ai-drawer-title" className="w-full max-w-md max-h-dvh bg-slate-900 border-r border-slate-800 shadow-2xl flex flex-col text-slate-100">
          
          {/* Header */}
          <div className="p-5 bg-slate-800/90 border-b border-slate-700 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-500/30">
                <Bot className="w-5 h-5" />
              </div>
              <div>
                <h3 id="ai-drawer-title" className="font-bold text-sm text-slate-100">
                  مساعد مجال الذكي (Gemini AI)
                </h3>
                <p className="text-[11px] text-slate-400">
                  تحسين وصف المنتجات، صياغة القصة، وتحليل ملاءمة المطابقة
                </p>
              </div>
            </div>
            <button onClick={onClose} aria-label="إغلاق مساعد مجال" className="p-1.5 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-700">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Mode Switcher */}
          <div className="p-3 bg-slate-950 border-b border-slate-800 flex gap-2 text-xs">
            <button
              onClick={() => setMode('POLISH')}
              className={`flex-1 py-2 px-3 rounded-lg font-bold flex items-center justify-center gap-1.5 transition-colors ${
                mode === 'POLISH' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>تحسين وصف المنتج</span>
            </button>
            <button
              onClick={() => setMode('EXPLAIN_MATCH')}
              className={`flex-1 py-2 px-3 rounded-lg font-bold flex items-center justify-center gap-1.5 transition-colors ${
                mode === 'EXPLAIN_MATCH' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <Lightbulb className="w-3.5 h-3.5" />
              <span>تحليل المطابقة التشغيلية</span>
            </button>
          </div>

          {/* Content */}
          <div className="p-5 flex-1 overflow-y-auto space-y-4 text-xs">
            <div>
              <label className="block text-slate-300 font-bold mb-1.5">
                {mode === 'POLISH' ? 'ادخل النص أو الفكرة العفوية لمنتجك:' : 'اسم المنتج والملاحظات المراد تحليلها:'}
              </label>
              <textarea
                rows={4}
                value={promptInput}
                onChange={(e) => setPromptInput(e.target.value)}
                maxLength={1500}
                placeholder={
                  mode === 'POLISH'
                    ? 'مثال: كيكة قرص عقيلي فيها هيل وزعفران مع كريمة هشة خفيفة طعمها نفس مال الأول..'
                    : 'مثال: قرص عقيلي فاخر بكريمة الهيل والزعفران'
                }
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-slate-200 focus:outline-none focus:border-amber-500 resize-none"
              />
            </div>

            <button
              onClick={handleRunAi}
              disabled={loading || !promptInput.trim()}
              className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 disabled:bg-slate-800 text-slate-950 font-bold rounded-xl transition-colors flex items-center justify-center gap-2 shadow-md"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>جاري المعالجة بواسطة Gemini...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>معالجة بواسطة الذكاء الاصطناعي</span>
                </>
              )}
            </button>

            {aiOutput && (
              <div role="status" className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-2 animate-in fade-in">
                <div className="flex items-center justify-between text-amber-400 font-bold">
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4" />
                    <span>النتيجة المقترحة:</span>
                  </span>
                  <button
                    onClick={() => { try { navigator.clipboard?.writeText(aiOutput); } catch { /* clipboard unavailable in insecure contexts */ } }}
                    className="text-[10px] text-amber-300 underline"
                  >
                    نسخ النص
                  </button>
                </div>
                <p className="text-slate-200 text-xs leading-relaxed whitespace-pre-wrap">
                  {aiOutput}
                </p>
              </div>
            )}
          </div>

          {/* Footer note */}
          <div className="p-4 bg-slate-950 border-t border-slate-800 text-[10px] text-slate-500 text-center">
            لا تدخل وصفة سرية أو بيانات شخصية. الإرسال الخارجي لا يُفعّل إلا بعد إعداد الخدمة وسياسة الخصوصية.
          </div>

        </div>
      </div>
    </div>
  );
};
