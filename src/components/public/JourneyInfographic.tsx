import React from 'react';
import { journeyStages } from '../../data/journey';

/**
 * The six-stage MAJAL journey.
 *
 * This is the one place on the public site where the whole operating model has to be
 * legible at a glance, so it is drawn as a connected path rather than a row of cards:
 * the value of the model is the ORDER and the gate between stages, and disconnected
 * cards communicate neither. The connector is decorative and `aria-hidden`; the list
 * underneath is an ordered list, so assistive tech reads the same sequence a sighted
 * user sees, and print/no-CSS fallbacks stay coherent.
 *
 * Copy comes from src/data/journey.tsx, shared with the first-run onboarding.
 */
export const JourneyInfographic: React.FC = () => (
  <section aria-labelledby="journey-heading" className="space-y-10">
    <div className="text-center space-y-3">
      <span className="inline-block text-[10px] font-black tracking-[0.25em] text-[#e8c880] uppercase">MAJAL JOURNEY</span>
      <h2 id="journey-heading" className="text-2xl sm:text-3xl font-black text-slate-100">كيف تعمل رحلة «مجال»؟</h2>
      <p className="text-xs sm:text-sm text-slate-400 max-w-2xl mx-auto leading-7">
        ست محطات مرتبطة بالترتيب. لا تُفتح محطة قبل اكتمال ما قبلها، ولذلك لا يوجد «إطلاق سريع» يتجاوز الحماية أو العقد.
      </p>
    </div>

    <ol className="relative grid gap-5 sm:gap-6 md:grid-cols-2 lg:grid-cols-3">
      {/* Decorative rail: it repeats the order the list already encodes, so it is hidden
          from assistive tech instead of announced as content. */}
      <div
        aria-hidden="true"
        className="hidden lg:block absolute inset-x-8 top-[3.25rem] h-px bg-gradient-to-l from-emerald-400/30 via-sky-400/25 to-[#c7a55b]/30 pointer-events-none"
      />

      {journeyStages.map(stage => (
        <li
          key={stage.index}
          className={`relative glass-card glass-card-hover rounded-3xl border ${stage.accent.ring} p-6 space-y-4`}
        >
          <div className="flex items-center justify-between gap-3">
            <span className={`w-12 h-12 rounded-2xl ${stage.accent.fill} border ${stage.accent.ring} grid place-items-center ${stage.accent.text}`}>
              {stage.icon}
            </span>
            <span className="flex items-center gap-2">
              <span className={`w-1.5 h-1.5 rounded-full ${stage.accent.dot}`} aria-hidden="true" />
              <span className="text-[11px] font-bold text-slate-500">{stage.actor}</span>
            </span>
          </div>

          <div className="flex items-baseline gap-2">
            <span className={`text-lg font-black ${stage.accent.text}`} aria-hidden="true">{stage.index}.</span>
            <h3 className="text-base font-black text-slate-100">{stage.title}</h3>
          </div>

          <p className="text-xs text-slate-300 leading-7">{stage.body}</p>
        </li>
      ))}
    </ol>
  </section>
);
