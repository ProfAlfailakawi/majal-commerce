import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FileText, Scale, ShieldCheck, RotateCcw, Mail, ChevronLeft } from 'lucide-react';

export type LegalDocumentId = 'TERMS' | 'PRIVACY' | 'REFUND' | 'COMPLIANCE';

interface LegalSection {
  heading: string;
  body: string[];
}

interface LegalDocument {
  id: LegalDocumentId;
  label: string;
  title: string;
  summary: string;
  icon: React.ReactNode;
  sections: LegalSection[];
}

/**
 * Public legal surface.
 *
 * These documents are a reviewable operating baseline, not counsel sign-off: the
 * gates in LEGAL_GATES_KUWAIT.md still have to be closed before commercial launch,
 * and every page says so in its own words rather than implying an approval that
 * does not exist. They exist as real, linkable pages because payment providers
 * (Lemon Squeezy among them) require reachable Terms, Privacy and Refund URLs
 * before a store is approved.
 */
const SUPPORT_EMAIL = 'support@majal.app';

const documents: LegalDocument[] = [
  {
    id: 'TERMS',
    label: 'الشروط والأحكام',
    title: 'الشروط والأحكام',
    summary: 'يوضح هذا المستند دور مجال كمنصة تشغيل، وحدود مسؤولية كل طرف: المبدع، المنشأة المرخّصة، والعميل.',
    icon: <Scale className="w-4 h-4" />,
    sections: [
      {
        heading: '١. طبيعة الخدمة',
        body: [
          'مجال منصة تشغيل تربط المبدعين بالمنشآت التجارية المرخّصة، وتدير دورة الاكتشاف والمطابقة والحماية والتفاوض والتعاقد وبوابة الإطلاق والقياس والمستحقات.',
          'مجال ليست منشأة إنتاج غذائي ولا جهة بيع مباشرة للمنتج النهائي. الإنتاج والبيع التجاري يتمان عبر المنشأة المرخّصة المذكورة في كل إطلاق.'
        ]
      },
      {
        heading: '٢. الحسابات والصلاحيات',
        body: [
          'يلتزم المستخدم بصحة بياناته وبالحفاظ على سرية بيانات الدخول، وبتفعيل المصادقة الثنائية عند توفرها للأدوار الحساسة.',
          'الوصول إلى الأسرار التجارية والوصفات محكوم بمصفوفة صلاحيات ومستويات إفصاح ومنح زمنية. أي محاولة لتجاوزها تُسجَّل في سجل التدقيق وقد تؤدي إلى إيقاف الحساب.'
        ]
      },
      {
        heading: '٣. الملكية الفكرية',
        body: [
          'يحتفظ المبدع بملكية وصفته وأصوله الأصلية. لا ينتقل أي حق استغلال تجاري إلا بموجب عقد موقّع داخل المنصة يحدد النموذج والمدة والحصرية.',
          'لا يمنح إنشاء حساب أو رفع منتج أي ترخيص ضمني للمنصة أو للمنشآت باستخدام الوصفة خارج نطاق العقد.'
        ]
      },
      {
        heading: '٤. الطلبات والمدفوعات',
        body: [
          'تُعرض الأسعار بالدينار الكويتي. لا يُعتبر أي طلب مدفوعًا إلا بعد تأكيد موثّق من مزوّد الدفع يصل إلى خوادم مجال.',
          'إذا كان مزوّد الدفع يسوّي بعملة غير الدينار الكويتي، يُعرض سعر التحويل المعتمد قبل إتمام الدفع، وقد يفرض البنك المُصدِر رسوم تحويل إضافية خارج سيطرة مجال.'
        ]
      },
      {
        heading: '٥. حدود المسؤولية',
        body: [
          'تتحمل المنشأة المرخّصة المسؤولية عن سلامة الغذاء والجودة والتخزين والاستدعاء وفق الاشتراطات الصحية المعمول بها في دولة الكويت.',
          'لا تتحمل مجال مسؤولية الأضرار غير المباشرة أو الأرباح الفائتة، ولا تقدّم أي ضمان ضمني يتجاوز ما ورد صراحةً في العقود الموقّعة داخل المنصة.'
        ]
      },
      {
        heading: '٦. القانون الواجب التطبيق',
        body: [
          'تخضع هذه الشروط لقوانين دولة الكويت، وتختص محاكمها بالنظر في أي نزاع لا يُحسم وديًا عبر آلية النزاعات داخل المنصة.',
          'هذه الوثيقة إطار تشغيلي قابل للمراجعة، ولا تُغني عن اعتماد مستشار قانوني كويتي قبل أي أثر ملزم على معاملة حقيقية.'
        ]
      }
    ]
  },
  {
    id: 'PRIVACY',
    label: 'سياسة الخصوصية',
    title: 'سياسة الخصوصية',
    summary: 'ما الذي نجمعه، لماذا نجمعه، أين يبقى، ومتى يُحذف — مكتوبة بلغة قابلة للتدقيق لا بلغة تسويقية.',
    icon: <ShieldCheck className="w-4 h-4" />,
    sections: [
      {
        heading: '١. البيانات التي نجمعها',
        body: [
          'بيانات الحساب: الاسم، البريد الإلكتروني، رقم الهاتف، الدور، وحالة المصادقة الثنائية.',
          'بيانات التشغيل: المنتجات، إصدارات الوصفات، منح الوصول، التعاونات، العروض، العقود، الإطلاقات، الطلبات، والمستحقات.',
          'بيانات تقنية محدودة: سجلات الطلبات، معرّف الجلسة المُجزّأ، وحدود المعدل. لا نبيع أي بيانات ولا نستخدمها لإعلانات طرف ثالث.'
        ]
      },
      {
        heading: '٢. الأسس والأغراض',
        body: [
          'نعالج البيانات لتنفيذ العقد بينك وبين المنصة، وللالتزام النظامي، ولحماية الأصول التجارية من الوصول غير المصرّح به.',
          'الوصفات والأسرار التجارية تُصنَّف Restricted، ولا تُكشف إلا بمنح صريح من المبدع وبمستوى إفصاح محدد ومدة انتهاء.'
        ]
      },
      {
        heading: '٣. المشاركة مع أطراف ثالثة',
        body: [
          'تتم مشاركة الحد الأدنى الضروري فقط: مزوّد الدفع لإتمام العملية، ومزوّد الهوية عند التحقق، ومزوّد البريد/الإشعارات عند التفعيل.',
          'لا تُرسل الوصفات أو الأسرار التجارية إلى أي مزوّد خارجي، بما في ذلك خدمات الذكاء الاصطناعي؛ طبقة الذكاء تستقبل سياقًا مُرشَّحًا بالصلاحية فقط.'
        ]
      },
      {
        heading: '٤. الاحتفاظ والحذف',
        body: [
          'تُحفظ سجلات التدقيق والمعاملات المالية للمدة النظامية اللازمة. تُحذف البيانات التي لم تعد لها ضرورة تشغيلية أو نظامية.',
          'يمكنك طلب الوصول إلى بياناتك أو تصحيحها أو حذفها عبر ' + SUPPORT_EMAIL + '، ونرد خلال مدة معقولة مع توثيق الطلب في سجل التدقيق.'
        ]
      },
      {
        heading: '٥. الأمان',
        body: [
          'كلمات المرور مُخزّنة بـ scrypt بملح مستقل، ورموز المصادقة الثنائية مشفّرة بـ AES-256-GCM، والجلسات لا تُخزَّن إلا كبصمة.',
          'ملفات تعريف الارتباط المستخدمة ضرورية للجلسة وحماية CSRF فقط، وهي HttpOnly وSameSite، وSecure في بيئة الإنتاج. لا نستخدم كوكيز تتبّع إعلاني.'
        ]
      }
    ]
  },
  {
    id: 'REFUND',
    label: 'سياسة الاسترجاع',
    title: 'سياسة الاسترجاع والإلغاء',
    summary: 'متى يمكن الإلغاء، متى يُسترد المبلغ، وكيف تُعالج حالات المنتجات الغذائية القابلة للتلف.',
    icon: <RotateCcw className="w-4 h-4" />,
    sections: [
      {
        heading: '١. قبل التجهيز',
        body: [
          'يمكن إلغاء الطلب واسترداد كامل المبلغ ما دام الطلب لم يدخل مرحلة التجهيز لدى المنشأة المرخّصة.',
          'يُنفَّذ الاسترداد عبر نفس وسيلة الدفع الأصلية، ولا يُصرف نقدًا أو إلى وسيلة أخرى.'
        ]
      },
      {
        heading: '٢. بعد التجهيز',
        body: [
          'المنتجات الغذائية الطازجة قابلة للتلف، ولذلك لا تُقبل طلبات الإلغاء بعد بدء التجهيز إلا في حالات الخلل الموضّحة أدناه.',
          'حالات الخلل تشمل: منتجًا مختلفًا عن الوصف، أو تالفًا عند الاستلام، أو غير مطابق لبيانات المكوّنات ومسببات الحساسية المعلنة.'
        ]
      },
      {
        heading: '٣. كيفية تقديم الطلب',
        body: [
          'أرسل رقم الطلب ووصف المشكلة وصورًا إن أمكن إلى ' + SUPPORT_EMAIL + ' خلال ٢٤ ساعة من الاستلام.',
          'تُراجع الحالة مع المنشأة المرخّصة، ويصلك القرار مع سببه. إذا لم تُحسم وديًا تُحوَّل إلى آلية النزاعات الرسمية داخل المنصة.'
        ]
      },
      {
        heading: '٤. مدة المعالجة',
        body: [
          'يُصدر الاسترداد المعتمد خلال مدة أقصاها خمسة أيام عمل من تاريخ الاعتماد، وقد يستغرق وصوله إلى حسابك مدة إضافية يحددها البنك أو مزوّد الدفع.',
          'رسوم تحويل العملة التي يفرضها البنك المُصدِر عند الشراء بعملة غير الدينار الكويتي لا تخضع لسيطرة مجال وقد لا تُسترد.'
        ]
      },
      {
        heading: '٥. مسببات الحساسية والسلامة',
        body: [
          'إذا كنت تعاني حساسية غذائية، راجع قائمة المكوّنات ومسببات الحساسية المعلنة قبل الطلب.',
          'أي بلاغ يتعلق بسلامة الغذاء يُعامل كأولوية قصوى ويُصعَّد فورًا إلى المنشأة المرخّصة وإلى فريق الامتثال في مجال.'
        ]
      }
    ]
  },
  {
    id: 'COMPLIANCE',
    label: 'سجل الامتثال والتتبع',
    title: 'الامتثال وقابلية التتبع',
    summary: 'كيف تجعل مجال كل قرار حسّاس قابلًا للتفسير والمراجعة لاحقًا بدلًا من الثقة الضمنية.',
    icon: <FileText className="w-4 h-4" />,
    sections: [
      {
        heading: '١. مبدأ انعدام الثقة الضمنية',
        body: [
          'كل عملية حسّاسة تتطلب هوية وصلاحية وسياقًا وحالة صحيحة معًا. لا يكفي أي عنصر منها منفردًا.',
          'إخفاء زر في الواجهة ليس ضابطًا أمنيًا؛ المنع يقع في طبقة المجال على الخادم أيضًا.'
        ]
      },
      {
        heading: '٢. سجل التدقيق',
        body: [
          'تُسجَّل عمليات العرض والتصدير والمنح والسحب لأي وصفة، مع صاحب القرار ودوره ووقته والتعاون المرتبط به.',
          'إصدارات الوصفات غير قابلة للتعديل بعد إنشائها، ما يجعل المقارنة التاريخية مبنية على سجلات حقيقية لا على إعادة كتابة.'
        ]
      },
      {
        heading: '٣. بوابة الإطلاق',
        body: [
          'لا يتحول أي منتج إلى حالة LIVE بضغطة زر: الشروط مشتقة من التحقق والمستندات والعقد ومستوى الحساسية وجاهزية الفروع.',
          'الشروط التشغيلية اليدوية منفصلة عن الشروط المشتقة من النظام، وتظل مراقبة ومسجّلة.'
        ]
      },
      {
        heading: '٤. سلامة الحالة المالية',
        body: [
          'المبالغ تُحفظ بوحدات الفلس الصحيحة، ولا تُستخدم أرقام عشرية عائمة في أي حساب مالي.',
          'الحجز لا يُنشئ بيعًا أو مستحقًا، واعتماد التسوية لا يساوي الدفع؛ التحويل إلى مدفوع مقفول حتى وصول مرجع موثّق من مزوّد الدفع.'
        ]
      }
    ]
  }
];

interface LegalCenterProps {
  initialDocument?: LegalDocumentId;
  onBack: () => void;
}

export const LegalCenter: React.FC<LegalCenterProps> = ({ initialDocument = 'TERMS', onBack }) => {
  const [active, setActive] = useState<LegalDocumentId>(initialDocument);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const isFirstRender = useRef(true);

  useEffect(() => setActive(initialDocument), [initialDocument]);

  // Move focus to the new document title on switch so keyboard and screen-reader
  // users land on the content instead of staying on the tab they just left.
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    headingRef.current?.focus();
  }, [active]);

  const doc = useMemo(() => documents.find(item => item.id === active) ?? documents[0], [active]);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-2">
          <span className="text-[10px] font-black tracking-[0.2em] text-[#e8c880] uppercase">MAJAL LEGAL</span>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-100">المركز القانوني والامتثال</h1>
        </div>
        <button onClick={onBack} className="px-4 py-2.5 rounded-xl glass-card border border-white/10 text-xs font-bold text-slate-200 hover:bg-white/5 flex items-center gap-2">
          <span>رجوع</span>
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      <div className="rounded-2xl border border-[#e8c880]/20 bg-[#c7a55b]/[0.06] p-4 text-[11px] leading-6 text-slate-300">
        هذه المستندات إطار تشغيلي معلن وقابل للمراجعة. اكتمال الاعتماد القانوني والتنظيمي في دولة الكويت شرط مسبق لأي معاملة تجارية حقيقية، ولا تُغني هذه الصفحات عن اعتماد مستشار مختص.
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1" role="tablist" aria-label="المستندات القانونية">
        {documents.map(item => (
          <button
            key={item.id}
            role="tab"
            aria-selected={active === item.id}
            onClick={() => setActive(item.id)}
            className={`shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-colors ${
              active === item.id ? 'bg-[#c7a55b] text-slate-950' : 'glass-card border border-white/10 text-slate-300 hover:bg-white/5'
            }`}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </div>

      <article className="glass-panel rounded-[28px] border border-white/10 p-6 sm:p-9 space-y-7">
        <header className="space-y-3 pb-5 border-b border-white/10">
          <h2 ref={headingRef} tabIndex={-1} className="text-xl sm:text-2xl font-black text-slate-100 outline-none">{doc.title}</h2>
          <p className="text-xs sm:text-sm text-slate-400 leading-7">{doc.summary}</p>
        </header>

        {doc.sections.map(section => (
          <section key={section.heading} className="space-y-3">
            <h3 className="text-sm font-black text-[#e8c880]">{section.heading}</h3>
            {section.body.map((paragraph, index) => (
              <p key={index} className="text-xs sm:text-[13px] text-slate-300 leading-8">{paragraph}</p>
            ))}
          </section>
        ))}

        <footer className="pt-5 border-t border-white/10 flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
          <Mail className="w-4 h-4 text-[#e8c880]" />
          <span>للاستفسارات القانونية أو طلبات البيانات:</span>
          <a href={`mailto:${SUPPORT_EMAIL}`} dir="ltr" className="text-[#e8c880] font-bold hover:underline">{SUPPORT_EMAIL}</a>
        </footer>
      </article>
    </div>
  );
};
