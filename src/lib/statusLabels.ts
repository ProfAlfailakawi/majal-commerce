/**
 * The status vocabulary.
 *
 * Two problems this solves at once:
 *
 *  1. Nine surfaces rendered the raw union member straight into the page, so an Arabic
 *     user reading a product card saw «APPROVED_FOR_MARKETPLACE». Enum identifiers are
 *     for the code; they are not copy.
 *  2. Every component invented its own badge colours, so the same state could be amber
 *     on one screen and grey on the next. Tone is now a property of the STATE, decided
 *     once, which is what makes a status readable at a glance across the product.
 *
 * Tones map to the design system's meanings: `progress` = sky (operational), `success` =
 * emerald (ready/quality), `warn` = amber (needs attention), `danger` = rose (risk only),
 * `gold` = a MAJAL decision point, `neutral` = inert or historical.
 */

export type StatusTone = 'neutral' | 'progress' | 'success' | 'warn' | 'danger' | 'gold';

interface StatusMeta {
  label: string;
  tone: StatusTone;
}

const STATUS: Record<string, StatusMeta> = {
  // Product lifecycle
  DRAFT: { label: 'مسودة', tone: 'neutral' },
  SUBMITTED: { label: 'مُقدَّم', tone: 'progress' },
  SCREENING: { label: 'قيد الفحص', tone: 'progress' },
  APPROVED_FOR_MARKETPLACE: { label: 'معتمد للسوق', tone: 'success' },
  AVAILABLE_FOR_MATCHING: { label: 'متاح للمطابقة', tone: 'gold' },
  IN_DISCUSSION: { label: 'قيد التفاوض', tone: 'progress' },
  TESTING: { label: 'قيد الاختبار', tone: 'progress' },
  COMMERCIAL_NEGOTIATION: { label: 'تفاوض تجاري', tone: 'gold' },
  CONTRACTING: { label: 'تعاقد', tone: 'gold' },
  LAUNCH_GATE: { label: 'بوابة الإطلاق', tone: 'warn' },
  READY_TO_LAUNCH: { label: 'جاهز للإطلاق', tone: 'success' },
  LIVE_DROP: { label: 'إطلاق محدود', tone: 'success' },
  LIVE_TRIAL: { label: 'إطلاق تجريبي', tone: 'success' },
  LIVE_PERMANENT: { label: 'إطلاق دائم', tone: 'success' },
  PAUSED: { label: 'موقوف مؤقتًا', tone: 'warn' },
  COMPLETED: { label: 'منتهٍ', tone: 'neutral' },

  // Collaboration stages
  INTEREST: { label: 'اهتمام', tone: 'neutral' },
  ACCESS_REQUESTED: { label: 'طلب وصول', tone: 'warn' },
  ACCESS_GRANTED: { label: 'وصول ممنوح', tone: 'success' },
  TASTING_PLANNED: { label: 'تذوّق مجدول', tone: 'progress' },
  TASTING_COMPLETED: { label: 'تذوّق منتهٍ', tone: 'progress' },
  LAB_ACTIVE: { label: 'المختبر نشط', tone: 'progress' },
  OFFER_SENT: { label: 'عرض مُرسل', tone: 'gold' },
  COUNTERED: { label: 'عرض مقابل', tone: 'gold' },
  COMMERCIAL_AGREED: { label: 'اتفاق تجاري', tone: 'success' },
  CONTRACT_DRAFTED: { label: 'مسودة عقد', tone: 'progress' },
  SIGNED: { label: 'موقّع', tone: 'success' },
  PRE_LAUNCH: { label: 'ما قبل الإطلاق', tone: 'warn' },
  LIVE: { label: 'حيّ', tone: 'success' },
  REVIEW: { label: 'مراجعة', tone: 'progress' },
  RENEWED: { label: 'مُجدَّد', tone: 'success' },
  ENDED: { label: 'منتهٍ', tone: 'neutral' },
  DISPUTED: { label: 'متنازع عليه', tone: 'danger' },

  // Grants, offers, contracts
  REQUESTED: { label: 'مطلوب', tone: 'warn' },
  APPROVED: { label: 'معتمد', tone: 'success' },
  REVOKED: { label: 'ملغى', tone: 'danger' },
  EXPIRED: { label: 'منتهي الصلاحية', tone: 'danger' },
  PENDING: { label: 'بانتظار الرد', tone: 'warn' },
  ACCEPTED: { label: 'مقبول', tone: 'success' },
  REJECTED: { label: 'مرفوض', tone: 'danger' },
  WITHDRAWN: { label: 'مسحوب', tone: 'neutral' },
  PENDING_CREATOR_SIGNATURE: { label: 'بانتظار توقيع المبدع', tone: 'warn' },
  PENDING_HOST_SIGNATURE: { label: 'بانتظار توقيع المنشأة', tone: 'warn' },
  FULLY_SIGNED: { label: 'موقّع بالكامل', tone: 'success' },

  // Launch, compliance, disputes, payments
  SCHEDULED: { label: 'مجدول', tone: 'progress' },
  PERMANENT: { label: 'دائم', tone: 'success' },
  VALID: { label: 'ساري', tone: 'success' },
  EXPIRING_SOON: { label: 'قارب على الانتهاء', tone: 'warn' },
  OPEN: { label: 'مفتوح', tone: 'warn' },
  UNDER_INVESTIGATION: { label: 'قيد التحقيق', tone: 'danger' },
  RESOLVED: { label: 'محسوم', tone: 'success' },
  CLOSED: { label: 'مغلق', tone: 'neutral' },
  IN_REVIEW: { label: 'قيد المراجعة', tone: 'progress' },
  SHORTLISTED: { label: 'ضمن القائمة القصيرة', tone: 'gold' },
  PLANNED: { label: 'مخطط', tone: 'progress' },
  CANCELLED: { label: 'ملغى', tone: 'neutral' },
  CALCULATED: { label: 'محتسب', tone: 'progress' },
  PAID: { label: 'مدفوع', tone: 'success' },
  PENDING_PAYMENT: { label: 'بانتظار الدفع', tone: 'warn' },
  REFUNDED: { label: 'مسترد', tone: 'neutral' },
  INITIATED: { label: 'بدأت', tone: 'progress' },
  SUCCESS: { label: 'ناجحة', tone: 'success' },
  FAILED: { label: 'فاشلة', tone: 'danger' },
  CONNECTED: { label: 'متصل', tone: 'success' },
  DISCONNECTED: { label: 'غير متصل', tone: 'neutral' },
  SYNC_ERROR: { label: 'خطأ مزامنة', tone: 'danger' },
  VERIFIED: { label: 'موثّق', tone: 'success' },
  UNVERIFIED: { label: 'غير موثّق', tone: 'neutral' },
  NEEDS_ACTION: { label: 'يحتاج إجراء', tone: 'warn' },
  EXPIRED_DOCS: { label: 'مستندات منتهية', tone: 'danger' },
  PENDING_AUTHENTICATION: { label: 'بانتظار المصادقة', tone: 'warn' },
  ACTIVE: { label: 'نشط', tone: 'success' },
  SUSPENDED: { label: 'موقوف', tone: 'danger' },
  INVITED: { label: 'مدعو', tone: 'progress' },
  DISCOVERED: { label: 'مكتشف', tone: 'neutral' },
  INTEREST_EXPRESSED: { label: 'أبدى اهتمامًا', tone: 'progress' },
  DECLINED: { label: 'مرفوض', tone: 'neutral' },
  SETTLEMENT_ELIGIBLE: { label: 'مؤهل للتسوية', tone: 'gold' }
};

/** Arabic copy for a status. Falls back to the raw key so a new union member is
 *  visible in review rather than silently rendering as an empty badge. */
export const statusLabel = (status: string): string => STATUS[status]?.label ?? status;

export const statusTone = (status: string): StatusTone => STATUS[status]?.tone ?? 'neutral';

/** Tailwind classes per tone. Colour never carries the meaning alone — the label is
 *  always present next to it, per the design system's contrast rule. */
export const toneClasses: Record<StatusTone, string> = {
  neutral: 'bg-white/5 text-slate-300 border-white/10',
  progress: 'bg-sky-500/10 text-sky-300 border-sky-400/25',
  success: 'bg-emerald-500/10 text-emerald-300 border-emerald-400/25',
  warn: 'bg-amber-500/10 text-amber-300 border-amber-400/25',
  danger: 'bg-rose-500/10 text-rose-300 border-rose-400/25',
  gold: 'bg-gold-500/10 text-gold-300 border-gold-300/25'
};
