// Состояние установки детали: что выбрано в палитре и какая зона под курсором.
//
// Это не данные изделия, а состояние работы — поэтому живёт отдельно от model.js.
// Читают его и панель (подсветить строку палитры), и сцена (подсветить зоны),
// а меняют — оба. Модель об этом не знает вовсе.
//
// Порядок по ТЗ 4.1: выбрал вид в палитре → программа подсветила допустимые места →
// первый клик выбирает вариант → второй устанавливает.

let kind = 'stand16';
let hovered = null;
let chosen = null;

const listeners = [];

export function onChange(fn) {
  listeners.push(fn);
  return () => {
    const i = listeners.indexOf(fn);
    if (i >= 0) listeners.splice(i, 1);
  };
}

const emit = () => listeners.forEach(fn => fn());

export const activeKind = () => kind;
export const hoveredId = () => hovered;
export const chosenId = () => chosen;

/** Смена вида детали сбрасывает выбранное место: зоны стали другими. */
export function setKind(next) {
  if (kind === next) return;
  kind = next;
  chosen = null;
  hovered = null;
  emit();
}

export function setHovered(id) {
  if (hovered === id) return;
  hovered = id;
  emit();
}

export function setChosen(id) {
  if (chosen === id) return;
  chosen = id;
  emit();
}

/** После установки выбор снимается, а вид остаётся — ставить подряд удобнее. */
export function done() {
  chosen = null;
  hovered = null;
  emit();
}
