import type { BusinessSector } from '../../types/majal';

/** Display data per sector: label, artwork palette. Icons are resolved in SectorArt. */
export const SECTORS: Record<BusinessSector, { label: string; from: string; to: string; glow: string }> = {
  CAFE: { label: 'مقهى وكافيه', from: '#3b2a1e', to: '#a8742f', glow: '#f0c987' },
  RESTAURANT: { label: 'مطعم', from: '#4a1d1d', to: '#b5483a', glow: '#ffb59c' },
  BAKERY: { label: 'مخبز وحلويات', from: '#4a3216', to: '#d09a3f', glow: '#ffe2a6' },
  CLOUD_KITCHEN: { label: 'مطبخ سحابي', from: '#12303f', to: '#2f8aa6', glow: '#a7e6f5' },
  RETAIL: { label: 'محل تجزئة', from: '#2b2a4a', to: '#6c63c9', glow: '#cfc9ff' },
  ONLINE_STORE: { label: 'متجر إلكتروني', from: '#0f3a34', to: '#25a58a', glow: '#a5f0dc' },
  SALON: { label: 'صالون وعناية', from: '#4a1f3a', to: '#c25a95', glow: '#ffc2e3' },
  SERVICES: { label: 'خدمات', from: '#1f3350', to: '#4f7fc4', glow: '#bdd6ff' },
  PRODUCTION: { label: 'إنتاج وتصنيع', from: '#2f3a22', to: '#7da040', glow: '#d8f0a8' },
  OTHER: { label: 'نشاط آخر', from: '#2a2f3a', to: '#6b7a93', glow: '#d3dcea' },
};
export const SECTOR_KEYS = Object.keys(SECTORS) as BusinessSector[];
