import { AD_AUDIENCE_LABEL, type AdAudience } from '../../lib/adAudience';

export const SURFACE_LABEL: Record<string, string> = {
  PUBLIC: 'عن مجال', SHOWCASE: 'مشاريع للبيع', DIRECTORY: 'دليل الموردين', CONSUMER: 'السوق', CREATOR: 'المبدعون', HOST: 'المنشآت', SUPPLIER: 'الموردون',
};
export const AUDIENCE_TONE: Record<string, string> = {
  VISITOR: 'bg-slate-400', CONSUMER: 'bg-gold-400', CREATOR: 'bg-fuchsia-400', HOST: 'bg-sky-400', SUPPLIER: 'bg-emerald-400',
};
export const audienceLabel = (key: string) => AD_AUDIENCE_LABEL[key as AdAudience] ?? key;
export const SLOT_LABEL: Record<string, string> = { SPONSOR: 'شريط الراعي (حصري)', MARKET: 'السوق', PORTAL: 'بوابات الشركاء' };
export const num = (n: number) => n.toLocaleString('ar-KW-u-nu-latn');
