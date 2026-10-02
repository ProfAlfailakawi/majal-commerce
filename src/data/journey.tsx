import React from 'react';
import { Lightbulb, ShieldCheck, GitCompareArrows, FlaskConical, FileSignature, Rocket } from 'lucide-react';

export interface JourneyStage {
  index: string;
  title: string;
  /** Who acts at this station. */
  actor: string;
  /** Full explanation, for the public infographic. */
  body: string;
  /** One clause, for the onboarding rail and any dense placement. */
  brief: string;
  icon: React.ReactNode;
}

/**
 * The six-stage MAJAL journey — the canonical copy.
 *
 * It lives here rather than inside a component because it is now told in two places
 * (the public infographic and the first-run onboarding) and a journey that describes
 * itself differently depending on where you meet it is worse than no journey at all.
 */
export const journeyStages: JourneyStage[] = [
  {
    index: '1',
    title: 'ابتكار',
    actor: 'المبدع',
    body: 'يسجّل المبدع منتجه وقصته ووصفته داخل إصدار محفوظ لا يقبل التعديل بعد إنشائه.',
    brief: 'إصدار محفوظ للفكرة، بتاريخ ومالك واضحين.',
    icon: <Lightbulb className="w-5 h-5" />
  },
  {
    index: '2',
    title: 'حماية',
    actor: 'خزنة الوصفات',
    body: 'تُقفل الأسرار خلف ثلاثة مستويات إفصاح ومنح زمنية، وكل عملية عرض أو تصدير تدخل سجل التدقيق.',
    brief: 'ثلاثة مستويات إفصاح ومنح زمنية، وكل فتح مسجّل.',
    icon: <ShieldCheck className="w-5 h-5" />
  },
  {
    index: '3',
    title: 'مطابقة',
    actor: 'مجال',
    body: 'تُرتَّب المنشآت حسب القدرة التشغيلية والهامش والامتثال، لا حسب الأقرب أو الأعلى صوتًا.',
    brief: 'ترتيب بالقدرة والهامش والامتثال، لا بالصوت الأعلى.',
    icon: <GitCompareArrows className="w-5 h-5" />
  },
  {
    index: '4',
    title: 'مختبر',
    actor: 'المنشأة المرخّصة',
    body: 'دفعات اختبار حقيقية بالكمية والتكلفة والوقت والهدر، ومقارنة مباشرة بين آخر دفعتين.',
    brief: 'دفعات اختبار حقيقية بالتكلفة والوقت والهدر.',
    icon: <FlaskConical className="w-5 h-5" />
  },
  {
    index: '5',
    title: 'اتفاق',
    actor: 'الطرفان',
    body: 'تفاوض موثّق وعرض مقابل وعقد موقّع يحدد النموذج والمدة والحصرية قبل أي إنتاج تجاري.',
    brief: 'عقد موقّع يحدد النموذج والمدة والحصرية.',
    icon: <FileSignature className="w-5 h-5" />
  },
  {
    index: '6',
    title: 'إطلاق',
    actor: 'السوق',
    body: 'بوابة الإطلاق مشتقة من السجلات لا من زر: تحقّق ومستندات وعقد وفروع، ثم مبيعات ومستحقات.',
    brief: 'بوابة إطلاق مشتقة من السجلات، ثم مبيعات ومستحقات.',
    icon: <Rocket className="w-5 h-5" />
  }
];
