import React, { useState } from 'react';
import { MajalMark } from '../brand/MajalMark';

interface ProductImageProps {
  src?: string;
  alt: string;
  className?: string;
  loading?: 'lazy' | 'eager';
  fetchPriority?: 'high' | 'low' | 'auto';
  markSize?: number;
}

/**
 * Product photo with a branded fallback. A missing or broken image used to leave a dark
 * hole (or the browser's broken-image glyph) inside a warm cream page; the plate below is
 * a soft gold gradient with the mark as a watermark, so an unphotographed product still
 * reads as a deliberate surface in light, dark and contrast themes alike.
 */
export const ProductImage: React.FC<ProductImageProps> = ({ src, alt, className = '', loading, fetchPriority, markSize = 56 }) => {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div role="img" aria-label={alt} className={`majal-plate grid place-items-center overflow-hidden ${className}`}>
        <span aria-hidden="true" className="opacity-45"><MajalMark size={markSize} tone="ink" /></span>
      </div>
    );
  }
  return <img src={src} alt={alt} loading={loading} decoding="async" fetchPriority={fetchPriority} onError={() => setFailed(true)} className={className} />;
};
