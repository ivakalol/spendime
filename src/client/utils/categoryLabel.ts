const defaults = new Set(['Food', 'Medicine', 'Household', 'Transport', 'Subscriptions', 'Salary', 'Investment income', 'Other']);

export function categoryLabel(category: {name: string; isSystem?: boolean}, t: (key: string) => string): string {
  return category.isSystem && defaults.has(category.name) ? t(category.name) : category.name;
}
