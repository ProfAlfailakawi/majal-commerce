import type { BusinessSector, SupplierCategory } from '../../types/majal';

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

/** Palette per supplier category; the icon lives in SupplierArt. */
export const SUPPLIER_CATEGORIES: Record<SupplierCategory, { label: string; from: string; to: string; glow: string }> = {
  INGREDIENTS: { label: 'مواد غذائية خام', from: '#4a3716', to: '#c8923a', glow: '#ffe3a8' },
  PRODUCE: { label: 'خضار وفواكه', from: '#1d3d22', to: '#4fa05a', glow: '#c6f0c0' },
  MEAT: { label: 'لحوم ودواجن', from: '#4a1d1d', to: '#b5483a', glow: '#ffb59c' },
  SPICES: { label: 'بهارات وتوابل', from: '#4a2a12', to: '#c26a2a', glow: '#ffd0a0' },
  PACKAGING: { label: 'تغليف وعلب', from: '#12303f', to: '#2f8aa6', glow: '#a7e6f5' },
  PRINTING: { label: 'طباعة وملصقات', from: '#2b2a4a', to: '#6c63c9', glow: '#cfc9ff' },
  EQUIPMENT: { label: 'معدات المطابخ', from: '#2a2f3a', to: '#6b7a93', glow: '#d3dcea' },
  DELIVERY: { label: 'توصيل ولوجستيات', from: '#0f3a34', to: '#25a58a', glow: '#a5f0dc' },
  OTHER: { label: 'خدمات أخرى', from: '#3a2a46', to: '#8c64b0', glow: '#e6cffa' },
};
export const SUPPLIER_CATEGORY_KEYS = Object.keys(SUPPLIER_CATEGORIES) as SupplierCategory[];

/** Best-effort bucket for the free-text category on verified supplier accounts. */
export const categoryFromText = (text: string): SupplierCategory => {
  const t = text || '';
  if (/تغليف|علب|كرتون/.test(t)) return 'PACKAGING';
  if (/بهار|توابل|هيل|زعفران/.test(t)) return 'SPICES';
  if (/طباع|ملصق/.test(t)) return 'PRINTING';
  if (/لحم|دجاج|سمك|أسماك/.test(t)) return 'MEAT';
  if (/خضار|فواكه|ورقي|أعشاب/.test(t)) return 'PRODUCE';
  if (/معدات|أفران|أدوات/.test(t)) return 'EQUIPMENT';
  if (/توصيل|نقل|لوجست/.test(t)) return 'DELIVERY';
  if (/طحين|سكر|سمن|زيت|مواد|غذائ/.test(t)) return 'INGREDIENTS';
  return 'OTHER';
};
