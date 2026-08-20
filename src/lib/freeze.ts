/**
 * Замораживает значение вместе со вложенными объектами и массивами.
 *
 * Нужно там, где модульная константа расходится по всему приложению: без
 * заморозки случайная запись в неё портит состояние на всю сессию и молча —
 * с заморозкой это TypeError в первой же строке, которая так делает.
 *
 * Функции и React-компоненты не трогаем: в тех же конфигурациях лежат иконки,
 * а `forwardRef` возвращает объект, которому React вправе дописать поля.
 */
export function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Object.isFrozen(value)) return value;
  if ('$$typeof' in value) return value;

  Object.freeze(value);
  for (const nested of Object.values(value)) deepFreeze(nested);
  return value;
}
