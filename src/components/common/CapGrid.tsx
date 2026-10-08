import React, { useId } from 'react';

/**
 * Long card grids show their first `limit` children and keep the rest one click away.
 * Pure CSS (a hidden checkbox), so nothing is removed from the DOM and no state is added.
 */
export const CapGrid: React.FC<{ className: string; limit?: number; children: React.ReactNode }> = ({ className, limit = 6, children }) => {
  const id = useId();
  const count = React.Children.toArray(children).filter(Boolean).length;
  if (count <= limit) return <div className={className}>{children}</div>;
  return (
    <div className="cap-wrap">
      <input id={id} type="checkbox" className="cap-toggle sr-only" />
      <div className={`cap-grid ${className}`} style={{ '--cap': limit } as React.CSSProperties}>{children}</div>
      <label htmlFor={id} className="cap-btn mt-4 mx-auto flex w-fit min-h-[44px] cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold text-gold-300 hover:bg-white/10">
        <span className="cap-more">عرض الكل ({count})</span>
        <span className="cap-less">عرض أقل</span>
      </label>
    </div>
  );
};
