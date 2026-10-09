import React from 'react';
import { JourneyStepper } from './JourneyStepper';

/**
 * The six-stage MAJAL journey.
 *
 * This is the one place on the public site where the whole operating model has to be
 * legible at a glance, so it is drawn as one connected stepper in the single accent: the
 * value of the model is the ORDER and the gate between stages. The stepper is an ordered
 * list; each station's full text is its tooltip and sits in the «تفاصيل المحطات» disclosure.
 *
 * Copy comes from src/data/journey.tsx, shared with the first-run onboarding.
 */
export const JourneyInfographic: React.FC<{ hold?: boolean }> = ({ hold = false }) => (
  <section aria-labelledby="journey-heading" className="space-y-10">
    <div className="text-center space-y-3">
      <span className="inline-block text-xs font-black text-gold-300">رحلة مجال</span>
      <h2 id="journey-heading" className="text-2xl sm:text-3xl font-black text-slate-100">كيف تعمل رحلة «مجال»؟</h2>
      <p className="text-xs sm:text-sm text-slate-400 max-w-2xl mx-auto leading-7">
        ست محطات مرتبطة بالترتيب. لا تُفتح محطة قبل اكتمال ما قبلها، ولذلك لا يوجد «إطلاق سريع» يتجاوز الحماية أو العقد.
      </p>
    </div>

    <div className="glass-card rounded-3xl p-5 sm:p-8">
      <JourneyStepper detail="body" animate hold={hold} />
    </div>
  </section>
);
