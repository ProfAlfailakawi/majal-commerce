import React from 'react';
import { ChevronDown } from 'lucide-react';
import { DnaStepper } from '../dna/DnaKit';
import { journeyStages } from '../../data/journey';

/**
 * The six MAJAL stations as one connected stepper in the single accent. The order is
 * the message; each station's explanation stays available as the node's tooltip and in
 * the «تفاصيل المحطات» disclosure, so no copy from src/data/journey.tsx is lost.
 */
export const JourneyStepper: React.FC<{ detail?: 'body' | 'brief'; className?: string }> = ({ detail = 'body', className }) => (
  <div className={`journey-dna space-y-5 ${className ?? ''}`}>
    <DnaStepper
      size="lg"
      ariaLabel="محطات رحلة مجال"
      stateText={{ done: '' }}
      steps={journeyStages.map(stage => ({
        key: stage.index,
        state: 'done' as const,
        icon: stage.icon,
        title: stage[detail],
        label: (
          <>
            <span className="journey-dna-title">{stage.title}</span>
            <span className="journey-dna-actor">{stage.actor}</span>
          </>
        )
      }))}
    />
    <details className="journey-dna-more group max-w-2xl mx-auto">
      <summary className="list-none mx-auto w-fit flex min-h-11 items-center gap-1.5 px-3 text-xs font-bold text-slate-400 hover:text-gold-300 cursor-pointer rounded-xl">
        تفاصيل المحطات
        <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <ol className="mt-3 divide-y divide-dashed divide-slate-700/60 text-start">
        {journeyStages.map(stage => (
          <li key={stage.index} className="flex gap-3 py-3">
            <span className="text-xs font-black text-gold-300 shrink-0 w-4" aria-hidden="true">{stage.index}</span>
            <p className="text-xs text-slate-400 leading-7">
              <span className="font-black text-slate-200">{stage.title}</span> · {stage[detail]}
            </p>
          </li>
        ))}
      </ol>
    </details>
  </div>
);
