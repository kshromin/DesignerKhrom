// Модель изделия. Ничего не знает ни о Three.js, ни о DOM — только данные и расчёт.
// Это сознательное разделение: модель должна проверяться и меняться отдельно от отрисовки
// (см. STRUCTURE.md и ТЗ.md, раздел 3).
//
// Все размеры — в миллиметрах, целые.
//
// Система координат застройки: начало в левом нижнем заднем углу.
//   X — вправо  (0 … width)
//   Y — вверх   (0 … height)
//   Z — на зрителя (0 … depth)
// Выбрана так, чтобы координаты деталей читались напрямую как расстояния от границ,
// без пересчёта знаков.

/** Разумные пределы габарита. В ТЗ не оговорены — взяты, чтобы не получить вырожденную сцену. */
export const LIMITS = {
  width:  { min: 300, max: 6000 },
  height: { min: 300, max: 3500 },
  depth:  { min: 100, max: 1200 },
};

export const state = {
  /** Застройка — объём, в котором строим. Пока одна; по ТЗ их может быть несколько. */
  enclosure: { width: 3000, height: 2500, depth: 600 },

  /** Детали. Пусто — появятся на следующем шаге. */
  parts: [],
};

const listeners = [];

/** Подписаться на изменения модели. Возвращает функцию отписки. */
export function onChange(fn) {
  listeners.push(fn);
  return () => {
    const i = listeners.indexOf(fn);
    if (i >= 0) listeners.splice(i, 1);
  };
}

function emit() {
  listeners.forEach(fn => fn(state));
}

/**
 * Задать размер застройки. Значение зажимается в пределы и округляется до целых мм.
 * Возвращает то, что реально записано, — чтобы поле ввода могло показать поправленное число.
 */
export function setEnclosureSize(key, value) {
  const limit = LIMITS[key];
  if (!limit) throw new Error(`Неизвестный размер застройки: ${key}`);

  const num = Math.round(Number(value));
  const clamped = Number.isFinite(num)
    ? Math.min(limit.max, Math.max(limit.min, num))
    : state.enclosure[key];

  if (clamped !== state.enclosure[key]) {
    state.enclosure[key] = clamped;
    emit();
  }
  return clamped;
}
