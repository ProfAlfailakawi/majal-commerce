import React, { useEffect, useMemo, useState } from 'react';
import {
  Radar,
  Building2,
  Target,
  TrendingUp,
  Zap,
  ChevronLeft,
  ShieldCheck,
  Sparkles,
  Globe,
  ExternalLink
} from 'lucide-react';
import { store } from '../../lib/store';
import { marketQueryForProduct } from '../../lib/intelligence';
import { intelligenceClient, type GroundedMarketSignal } from '../../lib/intelligenceClient';

interface OpportunityRadarProps {
  creatorId: string;
  onOpenProduct?: (productId: string) => void;
}

export const OpportunityRadar: React.FC<OpportunityRadarProps> = ({ creatorId }) => {
  const opportunities = useMemo(() => {
    const products = store.products.filter(p => p.creatorId === creatorId);
    const rows = products.flatMap(product =>
      store.matches
        .filter(m => m.productId === product.id)
        .map(match => {
          const host = store.hosts.find(h => h.id === match.hostBusinessId);
          return { product, match, host };
        })
    );
    return rows.sort((a, b) => b.match.matchScore.overallScore - a.match.matchScore.overallScore).slice(0, 6);
  }, [creatorId]);

  // Grounded market signals: optional Google-Search-backed enrichment. Absent
  // (never fabricated) when AI is disabled or no citation-backed source exists.
  const [signals, setSignals] = useState<GroundedMarketSignal[]>([]);
  const [signalNote, setSignalNote] = useState<string | null>(null);
  const topProduct = opportunities[0]?.product;

  useEffect(() => {
    let active = true;
    setSignals([]);
    setSignalNote(null);
    if (!topProduct) return;
    intelligenceClient.opportunityRadar(marketQueryForProduct(topProduct)).then(result => {
      if (!active || !result) return;
      setSignals(result.groundedSignals);
      if (!result.groundedSignals.length && result.note) setSignalNote(result.note);
    });
    return () => { active = false; };
  }, [topProduct?.id]);

  return (
    <section className="glass-panel rounded-3xl border border-white/10 p-5 md:p-6 space-y-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-400/20 flex items-center justify-center text-emerald-300"><Radar className="w-6 h-6" /></div>
          <div>
            <h3 className="text-lg font-black text-stone-100">Opportunity Radar — رادار الفرص</h3>
            <p className="text-xs text-stone-400 mt-1">أفضل فرص التعاون الآن بناءً على المعدات، الهامش، الفئة، السعر والقدرة التشغيلية.</p>
          </div>
        </div>
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-400/20 text-xs font-bold">
          <Zap className="w-4 h-4" /> تحديث حي للفرص
        </div>
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {opportunities.map(({ product, match, host }) => (
          <div key={match.id} className="rounded-2xl p-5 bg-white/5 border border-white/10 hover:border-[#e8c880]/25 transition-colors space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] text-stone-500">{product.publicName}</div>
                <h4 className="font-black text-stone-100 mt-1">{host?.commercialName || 'منشأة مرخّصة'}</h4>
              </div>
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-400/20 flex flex-col items-center justify-center">
                <span className="text-xl font-black text-emerald-300">{match.matchScore.overallScore}</span>
                <span className="text-[9px] text-emerald-400">MATCH</span>
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between"><span className="text-stone-400 flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5" /> توافق التشغيل</span><strong className="text-stone-100">{match.matchScore.equipmentFit}%</strong></div>
              <div className="flex items-center justify-between"><span className="text-stone-400 flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5" /> توافق الهامش</span><strong className="text-stone-100">{match.matchScore.marginFit}%</strong></div>
              <div className="flex items-center justify-between"><span className="text-stone-400 flex items-center gap-1.5"><Target className="w-3.5 h-3.5" /> توافق العلامة</span><strong className="text-stone-100">{match.matchScore.brandFit}%</strong></div>
            </div>

            <div className="rounded-xl p-3 bg-slate-950/45 border border-white/10 text-[11px] leading-6 text-stone-400">
              {match.matchScore.explanationAr}
            </div>

            <button className="w-full py-2.5 rounded-xl bg-[#c7a55b] hover:bg-[#d9b86b] text-stone-950 text-xs font-black flex items-center justify-center gap-2">
              <Sparkles className="w-4 h-4" /> ابدأ فرصة التعاون <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {(signals.length > 0 || signalNote) && (
        <div className="rounded-2xl p-4 bg-emerald-500/5 border border-emerald-400/15 space-y-3">
          <div className="flex items-center gap-2 text-xs font-black text-emerald-300"><Globe className="w-4 h-4" /> إشارات سوق مرتبطة بمصدر (Google Search)</div>
          {signalNote && <div className="text-[11px] text-stone-400 leading-6">{signalNote}</div>}
          {signals.map((signal, idx) => (
            <div key={idx} className="rounded-xl p-3 bg-slate-950/45 border border-white/10 text-[11px] leading-6 text-stone-300 space-y-2">
              <div>{signal.summary}</div>
              {signal.citations.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1 border-t border-white/5">
                  {signal.citations.map((cite, ci) => (
                    <a key={ci} href={cite.uri} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-emerald-300/90 hover:text-emerald-200 text-[10px]">
                      <ExternalLink className="w-3 h-3" /> {cite.title.slice(0, 48)}
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="rounded-2xl p-4 bg-sky-500/5 border border-sky-400/15 text-xs text-stone-300 leading-6 flex gap-2">
        <ShieldCheck className="w-4 h-4 shrink-0 mt-1 text-sky-300" />
        رادار الفرص لا يكشف الوصفة السرية. المطابقة تعتمد على البيانات التجارية والتشغيلية المتاحة فقط، ويظل كشف التفاصيل الحساسة خاضعًا لأذونات Recipe Vault.
      </div>
    </section>
  );
};
