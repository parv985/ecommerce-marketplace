/**
 * Display-only casing fix for admin-typed category names. Category names are
 * dynamic and may arrive lowercase ("electronics", "t-shirts"); this only
 * ever uppercases a lowercase letter at the start of a word, so acronyms
 * ("LED TV"), brands ("iPhone") and punctuation are left untouched. The raw
 * name still drives icons and product-filter links.
 */
export function formatCategoryLabel(name: string): string {
  return name.replace(
    /(^|[^A-Za-z])([a-z])/g,
    (_match: string, before: string, letter: string) => `${before}${letter.toUpperCase()}`,
  )
}
