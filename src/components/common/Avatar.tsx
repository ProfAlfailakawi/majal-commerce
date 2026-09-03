import React, { useState } from 'react';

interface AvatarProps {
  name: string;
  /** Optional. Without one — or if it fails to load — the initial tile is used. */
  src?: string;
  size?: number;
  /** `circle` for people, `squircle` for organisations. */
  shape?: 'circle' | 'squircle';
  className?: string;
}

/**
 * Identity tile for a person or a business.
 *
 * The seeded accounts used to point at stock photographs of strangers, which put pictures
 * of people who have nothing to do with Kuwait — or with the persona they were labelling —
 * on a Kuwaiti platform. Anything without a real uploaded picture now renders as its
 * initial in the brand's own palette, which reads as deliberate rather than as a
 * placeholder, and never misrepresents who is behind an account.
 *
 * A remote image that 404s falls back to the same tile instead of a broken-image glyph.
 */
export const Avatar: React.FC<AvatarProps> = ({ name, src, size = 40, shape = 'circle', className = '' }) => {
  const [failed, setFailed] = useState(false);
  const radius = shape === 'circle' ? '9999px' : `${Math.round(size * 0.3)}px`;
  const initial = name?.trim().charAt(0) || '؟';

  if (src && !failed) {
    return (
      <img
        src={src}
        alt={name}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        style={{ width: size, height: size, borderRadius: radius }}
        className={`object-cover ring-1 ring-gold-300/25 shrink-0 ${className}`}
      />
    );
  }

  return (
    <span
      role="img"
      aria-label={name}
      style={{ width: size, height: size, borderRadius: radius, fontSize: Math.max(11, size * 0.38) }}
      className={`shrink-0 grid place-items-center font-black bg-gold-500/12 text-gold-200 border border-gold-300/20 ${className}`}
    >
      <span aria-hidden="true">{initial}</span>
    </span>
  );
};
