/**
 * Catalog vocabulary — categories and geography.
 *
 * Both lists were previously inlined per component, which let them drift: the host's
 * discovery filter offered three categories while the creator's submission form offered
 * four, so every product a creator filed under «وجبات» was invisible to the side of the
 * market meant to find it. And there was no drinks category at all, so a slush drink sat
 * under «صلصات».
 *
 * MAJAL operates inside Kuwait, so geography is the six governorates rather than a free
 * text field.
 */

export interface ProductCategory {
  /** Stored on the product. Kept short because it is also a filter value. */
  id: string;
  /** What the user reads in a select. */
  label: string;
}

export const PRODUCT_CATEGORIES: ProductCategory[] = [
  { id: 'حلويات', label: 'حلويات وكيك' },
  { id: 'مخبوزات', label: 'مخبوزات وفطائر' },
  { id: 'وجبات', label: 'وجبات ومأكولات رئيسية' },
  { id: 'مقبلات', label: 'مقبلات ومازة' },
  { id: 'صلصات', label: 'صلصات ومخللات' },
  { id: 'مشروبات', label: 'مشروبات' }
];

/** The six governorates of the State of Kuwait. */
export const KUWAIT_GOVERNORATES = [
  'العاصمة',
  'حولي',
  'الفروانية',
  'الأحمدي',
  'الجهراء',
  'مبارك الكبير'
] as const;

export type KuwaitGovernorate = typeof KUWAIT_GOVERNORATES[number];

/** Region string as stored on profiles, e.g. «حولي، الكويت». */
export const regionLabel = (governorate: KuwaitGovernorate): string => `${governorate}، الكويت`;
