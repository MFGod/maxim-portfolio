/** Замораживает значение вместе со вложенными объектами и массивами. */
export function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Object.isFrozen(value)) return value;
  if ('$$typeof' in value) return value;

  Object.freeze(value);
  for (const nested of Object.values(value)) deepFreeze(nested);
  return value;
}
