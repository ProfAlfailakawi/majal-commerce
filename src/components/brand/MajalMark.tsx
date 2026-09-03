import React, { useId } from 'react';

/**
 * MAJAL — the brand mark.
 *
 * Geometry, not a typed letter. The previous mark set the character «م» in whatever
 * sans-serif the host machine happened to have, so the logo rendered differently on
 * every OS and could not be animated, inverted, or reduced below ~24px without turning
 * to mush. This is a single drawn glyph instead:
 *
 *   - the ARCH  — «مجال» as a licensed gateway: the governed environment a product has
 *                 to pass through. Symmetric, on a ground line, deliberately architectural.
 *   - the RING  — the creator's idea held inside that gateway, protected but visible.
 *                 It also carries the loop of «م», so the mark stays an Arabic monogram.
 *
 * The gold runs right-to-left (deep → light) because that is the reading direction of
 * the product, so the mark itself points the way the journey moves.
 *
 * Everything is stroked on a 64×64 grid with `pathLength="1"`, which lets the splash and
 * onboarding draw the mark with a plain dashoffset tween without hardcoding arc lengths.
 */

export type MarkTone = 'gold' | 'ink' | 'current';

interface MajalMarkProps {
  /** Rendered box in px. The glyph scales cleanly from 16 to 512. */
  size?: number;
  tone?: MarkTone;
  /** Draws the ground line under the gate. Reserved for large/ceremonial placements. */
  withGround?: boolean;
  /** Plays the draw-on animation once. Suppressed under prefers-reduced-motion via CSS. */
  animated?: boolean;
  className?: string;
  title?: string;
}

export const MajalMark: React.FC<MajalMarkProps> = ({
  size = 40,
  tone = 'gold',
  withGround = false,
  animated = false,
  className = '',
  title
}) => {
  // Gradient ids must be unique per instance: two marks on one page with a shared id
  // make the second one inherit the first one's (possibly removed) gradient.
  const gradientId = `majal-mark-${useId().replace(/:/g, '')}`;
  const stroke = tone === 'gold' ? `url(#${gradientId})` : tone === 'ink' ? '#0b1220' : 'currentColor';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={`${animated ? 'majal-mark-draw' : ''} ${className}`}
      role={title ? 'img' : 'presentation'}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {tone === 'gold' && (
        <defs>
          <linearGradient id={gradientId} x1="1" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#a8843c" />
            <stop offset="45%" stopColor="#c7a55b" />
            <stop offset="100%" stopColor="#f4e1b0" />
          </linearGradient>
        </defs>
      )}

      {withGround && (
        <path
          d="M7 57.5 H57"
          stroke={stroke}
          strokeWidth={4.5}
          strokeLinecap="round"
          opacity={0.32}
          pathLength={1}
          className="majal-mark-ground"
        />
      )}

      <path
        d="M11 53 V33 A21 21 0 0 1 53 33 V53"
        stroke={stroke}
        strokeWidth={6.5}
        strokeLinecap="round"
        pathLength={1}
        className="majal-mark-gate"
      />

      <circle
        cx="32"
        cy="34"
        r="9"
        stroke={stroke}
        strokeWidth={6}
        pathLength={1}
        className="majal-mark-core"
      />
    </svg>
  );
};

interface MajalLockupProps {
  size?: 'sm' | 'md' | 'lg';
  /** The line under «مجال». Pass null to render the wordmark on its own. */
  tagline?: string | null;
  /** Latin support line, letterspaced. Off in dense chrome like the navbar. */
  showLatin?: boolean;
  animated?: boolean;
  className?: string;
}

const lockupScale = {
  sm: { mark: 32, word: 'text-lg', tagline: 'text-[10px]', gap: 'gap-2.5' },
  md: { mark: 42, word: 'text-2xl', tagline: 'text-[11px]', gap: 'gap-3' },
  lg: { mark: 64, word: 'text-4xl', tagline: 'text-xs', gap: 'gap-4' }
} as const;

/**
 * Mark + wordmark. The Arabic wordmark never receives letter-spacing — Arabic is a
 * connected script and tracking it apart breaks the joins — so the optical adjustment
 * lives in the Latin support line instead, which is what tracking is actually for.
 */
export const MajalLockup: React.FC<MajalLockupProps> = ({
  size = 'md',
  tagline = 'منصة الحاضن التجاري المرخّص',
  showLatin = false,
  animated = false,
  className = ''
}) => {
  const scale = lockupScale[size];
  return (
    <span className={`flex items-center ${scale.gap} ${className}`}>
      <MajalMark size={scale.mark} animated={animated} withGround={size === 'lg'} />
      <span className="min-w-0 text-right">
        <span className={`block ${scale.word} font-black leading-tight majal-wordmark truncate`}>مجال</span>
        {showLatin && (
          <span className="block text-[9px] font-semibold tracking-[0.42em] text-gold-500/70 leading-none mt-1" dir="ltr">
            MAJAL
          </span>
        )}
        {tagline && <span className={`block ${scale.tagline} text-slate-400 font-medium truncate mt-0.5`}>{tagline}</span>}
      </span>
    </span>
  );
};
