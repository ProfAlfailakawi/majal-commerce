import React from 'react';
import { Shield, FileText, Lock, Globe, Scale, Crown } from 'lucide-react';
import { SurfaceType } from '../types/majal';
import { store } from '../lib/store';
import { canAccessSurface } from '../lib/permissions';

interface FooterProps {
  onSurfaceChange: (surface: SurfaceType) => void;
}

export const Footer: React.FC<FooterProps> = ({ onSurfaceChange }) => {
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
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#c7a55b] to-[#ecd28c] text-slate-950 flex items-center justify-center font-black text-sm">
                م
              </div>
              <span className="text-lg font-black text-slate-100 tracking-wide">مجال</span>
            </div>
            <p className="text-slate-400 text-xs leading-relaxed">
              من الابتكار إلى منتج قابل للإطلاق، عبر رحلة مرئية وصلاحيات واضحة لكل طرف.
            </p>
            <div className="flex items-center gap-2 text-[11px] text-[#e8c880] font-medium pt-1">
              <Shield className="w-4 h-4" />
              <span>بيئة كويتية — تشغيل آمن افتراضيًا</span>
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="font-bold text-slate-200 text-sm mb-3 border-b border-slate-800 pb-1">أسطح النظام</h4>
            <ul className="space-y-2">
              {visibleSurfaces.map(surface => (
                <li key={surface.id}><button onClick={() => onSurfaceChange(surface.id)} className="hover:text-[#e8c880] transition-colors">{surface.label}</button></li>
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
            <div className="flex items-center gap-2 text-[#e8c880] font-bold text-xs">
              <Globe className="w-4 h-4" />
              <span>نطاق العمل — دولة الكويت</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-normal">
              البيع التجاري والإنتاج يتمان عبر المنشآت المرخّصة، بينما تدير مجال دورة الاكتشاف، المطابقة، الحوكمة، العقود، والتسويات ضمن تجربة موحدة.
            </p>
          </div>
        </div>

        <div className="pt-6 border-t border-slate-800/80 flex flex-col md:flex-row items-center justify-between gap-4 text-[11px] text-slate-500">
          <div>© {new Date().getFullYear()} منصة مجال (MAJAL Platform) — جميع الحقوق محفوظة.</div>
          <div className="flex gap-4 flex-wrap justify-center">
            <span>الشروط والأحكام</span>
            <span>سياسة الخصوصية</span>
            <span>سجل الامتثال والتتبع</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
