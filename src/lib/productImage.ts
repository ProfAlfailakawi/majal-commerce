/**
 * Platform-owned product imagery.
 *
 * What the public (and a host weighing a launch) sees is always MAJAL's own house
 * illustration for the dish, chosen by what the product is — never whatever a creator
 * happened to upload. A creator's own `mediaUrls` stay inside the creator portal, where
 * they belong to the recipe workspace; they are not an input to anything public. This keeps
 * the storefront consistent, avoids unvetted or misleading photographs, and means a
 * product never ships with a stranger's stock photo.
 */
type ProductLike = { publicName?: string; internalName?: string; category?: string };

const DISH_BY_CATEGORY: Record<string, string> = {
  'حلويات': '/dishes/qurs-ageili.svg', 'مخبوزات': '/dishes/bakery.svg', 'مشروبات': '/dishes/sobia.svg',
  'وجبات': '/dishes/meal.svg', 'صلصات': '/dishes/sauce.svg', 'مقبلات': '/dishes/starter.svg',
};

/** Keyword → dish illustration slug. Longer / more specific keywords come first. */
const DISH_KEYWORDS: [string, string][] = [
  ['عقيلي', 'qurs'], ['قرص', 'qurs'], ['سوبيا', 'sobia'], ['معمول', 'maamoul'], ['دقّوس', 'dakoos'], ['دقوس', 'dakoos'],
  ['تنور', 'tannour'], ['لقيمات', 'lugaimat'], ['حلا', 'hala'], ['مخلل', 'pickles'], ['قهوة', 'coffee'],
  ['بلاليط', 'balaleet'], ['غريبة', 'ghraiba'], ['رقاق', 'ragag'], ['ليمون', 'lemon'], ['كبة', 'kibba'],
  ['عصيدة', 'asida'], ['شطة', 'shatta'], ['برجر', 'burger'], ['أرز', 'rice'],
];

/** Stable 0..3 palette variant so two products of the same dish never look identical. */
const variantOf = (key: string) => {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return h % 4;
};

export const houseDishImage = (name: string, category = '', variant = 0): string => {
  if (name.includes('مجبوس')) return name.includes('بالبهارات') ? '/dishes/machboos.svg' : `/dishes/d-rice-${((variant % 4) + 4) % 4}.svg`;
  const hit = DISH_KEYWORDS.find(([keyword]) => name.includes(keyword));
  if (hit) return `/dishes/d-${hit[1]}-${((variant % 4) + 4) % 4}.svg`;
  return DISH_BY_CATEGORY[category] || '/dishes/placeholder.svg';
};

/** The image the public sees for a product. */
export const publicProductImage = (product?: ProductLike | null): string => {
  if (!product) return '/dishes/placeholder.svg';
  const name = product.publicName || product.internalName || '';
  return houseDishImage(name, product.category, variantOf(name));
};
