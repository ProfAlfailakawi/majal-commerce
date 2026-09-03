import React from 'react';
import { Shield, FileText, Lock, Globe, Scale, Crown, Mail, PlayCircle } from 'lucide-react';
import { MajalMark } from './brand/MajalMark';
import { SurfaceType } from '../types/majal';
import { store } from '../lib/store';
import { canAccessSurface } from '../lib/permissions';
import type { LegalDocumentId } from './legal/LegalCenter';

interface FooterProps {
  onSurfaceChange: (surface: SurfaceType) => void;
  onOpenLegal: (document: LegalDocumentId) => void;
  /** Re-opens the first-run introduction. */
  onReplayOnboarding: () => void;
}

const SUPPORT_EMAIL = 'support@majal.app';

const legalLinks: { id: LegalDocumentId; label: string }[] = [
  { id: 'TERMS', label: 'الشروط والأحكام' },
  { id: 'PRIVACY', label: 'سياسة الخصوصية' },
  { id: 'REFUND', label: 'سياسة الاسترجاع' },
  { id: 'COMPLIANCE', label: 'سجل الامتثال والتتبع' }
];

export const Footer: React.FC<FooterProps> = ({ onSurfaceChange, onOpenLegal, onReplayOnboarding }) => {
  const surfaces: { id: SurfaceType; label: string }[] = [
    { id: 'CONSUMER', label: 'السوق والإطلاقات' },
    { id: 'CREATOR', label: 'بوابة المبدعين' },
    { id: 'HOST', label: 'بوابة المنشآت' },
    { id: 'ADMIN', label: 'لوحة الأدمن' },
    { id: 'SUPER_ADMIN', label: 'لوحة السوبر أدمن' }
  ];
  const visibleSurfaces = surfaces.filter(surface => canAccessSurface(store.activeUser, surface.id));

  return (
    <footer className="glass-panel text-slate-400 text-xs border-t border-white/10 mt-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          <div className="space-y-3">
            <div className="flex items-center gap-2.5">
              <MajalMark size={34} />
              <span className="min-w-0">
                <span className="block text-lg font-black majal-wordmark leading-none">مجال</span>
                <span className="block text-[9px] font-semibold tracking-[0.42em] text-gold-500/60 leading-none mt-1.5" dir="ltr">MAJAL</span>
              </span>
            </div>
            <p className="text-slate-400 text-xs leading-relaxed">
              من الابتكار إلى منتج قابل للإطلاق، عبر رحلة مرئية وصلاحيات واضحة لكل طرف.
            </p>
            <div className="flex items-center gap-2 text-[11px] text-gold-300 font-medium pt-1">
              <Shield className="w-4 h-4" />
              <span>بيئة كويتية — تشغيل آمن افتراضيًا</span>
            </div>

            <button
              onClick={onReplayOnboarding}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl glass-card border border-white/10 text-[11px] font-bold text-slate-300 hover:text-gold-300 hover:border-gold-300/25 transition-colors"
            >
              <PlayCircle className="w-3.5 h-3.5" />
              <span>أعد جولة التعريف</span>
            </button>
          </div>

          <div className="space-y-2">
            <h4 className="font-bold text-slate-200 text-sm mb-3 border-b border-slate-800 pb-1">أسطح النظام</h4>
            <ul className="space-y-2">
              {visibleSurfaces.map(surface => (
                <li key={surface.id}><button onClick={() => onSurfaceChange(surface.id)} className="py-1.5 -my-1.5 inline-flex items-center hover:text-gold-300 transition-colors">{surface.label}</button></li>
              ))}
            </ul>
          </div>

          <div className="space-y-2">
            <h4 className="font-bold text-slate-200 text-sm mb-3 border-b border-slate-800 pb-1">الأمان والامتثال</h4>
            <ul className="space-y-2 text-slate-400">
              <li className="flex items-center gap-1.5"><Lock className="w-3.5 h-3.5 text-slate-500" /><span>خزنة الوصفات مقفلة حتى المصادقة</span></li>
              <li className="flex items-center gap-1.5"><FileText className="w-3.5 h-3.5 text-slate-500" /><span>التوقيع يُفعّل بعد ربط الهوية</span></li>
              <li className="flex items-center gap-1.5"><Scale className="w-3.5 h-3.5 text-slate-500" /><span>فصل واضح للصلاحيات والتسويات</span></li>
              <li className="flex items-center gap-1.5"><Crown className="w-3.5 h-3.5 text-slate-500" /><span>طبقة حوكمة عليا للسوبر أدمن</span></li>
            </ul>
          </div>

          <div className="space-y-3 glass-card p-4 rounded-xl border border-white/10">
            <div className="flex items-center gap-2 text-gold-300 font-bold text-xs">
              <Globe className="w-4 h-4" />
              <span>نطاق العمل — دولة الكويت</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-normal">
              البيع التجاري والإنتاج يتمان عبر المنشآت المرخّصة، بينما تدير مجال دورة الاكتشاف، المطابقة، الحوكمة، العقود، والتسويات ضمن تجربة موحدة.
            </p>
          </div>
        </div>

        <div className="pt-6 border-t border-slate-800/80 flex flex-col md:flex-row items-center justify-between gap-4 text-[11px] text-slate-500">
          <div className="text-center md:text-right">© {new Date().getFullYear()} منصة مجال (MAJAL Platform) — جميع الحقوق محفوظة.</div>
          <nav aria-label="روابط قانونية" className="flex gap-x-5 gap-y-2 flex-wrap justify-center">
            {legalLinks.map(link => (
              <button
                key={link.id}
                onClick={() => onOpenLegal(link.id)}
                className="py-1.5 -my-1.5 inline-flex items-center hover:text-gold-300 transition-colors"
              >
                {link.label}
              </button>
            ))}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="py-1.5 -my-1.5 inline-flex items-center gap-1.5 hover:text-gold-300 transition-colors">
              <Mail className="w-3.5 h-3.5" />
              <span dir="ltr">{SUPPORT_EMAIL}</span>
            </a>
          </nav>
        </div>
      </div>
    </footer>
  );
};
