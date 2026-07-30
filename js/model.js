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

/**
 * Виды деталей из палитры. По ТЗ 3.2 толщина и ориентация — это не свойства детали,
 * а признаки вида: в палитре отдельные строки «16 мм», «32 мм», как в КД.
 */
export const PART_KINDS = {
  vertical16: { axis: 'x', thickness: 16, label: 'Стойка 16' },
  vertical32: { axis: 'x', thickness: 32, label: 'Стойка 32' },
};

export const state = {
  /** Застройка — объём, в котором строим. Пока одна; по ТЗ их может быть несколько. */
  enclosure: { width: 3000, height: 2500, depth: 600 },

  /**
   * Детали — плоский список, слева направо по оси X. Секций в данных нет (ТЗ 3.1).
   * Координаты здесь НЕ хранятся: они считаются из цепочки просветов (см. computeLayout).
   */
  parts: [],

  /**
   * Просветы — чистые расстояния между деталями (ТЗ 3.3). Самостоятельные объекты,
   * а не подписи на экране. Их всегда на один больше, чем деталей: крайние упираются
   * в границы застройки.
   */
  gaps: [{ id: 'g1', value: 3000, locked: false, visible: true }],
};

let nextId = 2;
const makeId = prefix => `${prefix}${nextId++}`;

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
  if (!Number.isFinite(num)) return state.enclosure[key];

  // Уже, чем сумма толщин стоек, застройка быть не может: деталям некуда деться.
  const floor = key === 'width' ? Math.max(limit.min, totalThickness()) : limit.min;
  const clamped = Math.min(limit.max, Math.max(floor, num));

  if (clamped !== state.enclosure[key]) {
    state.enclosure[key] = clamped;
    if (key === 'width') refitGaps();
    emit();
  }
  return clamped;
}

// ── Детали и просветы ───────────────────────────────────────────────────────
//
// Инвариант, на котором держится всё: сумма просветов и толщин деталей строго равна
// ширине застройки. Любая операция обязана его сохранить — координаты вычисляются
// из этой цепочки, и разъехавшийся инвариант означает изделие, которое не соберётся.

const totalThickness = () => state.parts.reduce((s, p) => s + PART_KINDS[p.kind].thickness, 0);
const totalGaps = () => state.gaps.reduce((s, g) => s + g.value, 0);

/**
 * Разложить цепочку в координаты: слева направо, от левой границы застройки.
 * Единственное место, где появляются координаты, — наружу модель их только вычисляет.
 */
export function computeLayout() {
  const items = [];
  let x = 0;

  for (let i = 0; i < state.gaps.length; i++) {
    const g = state.gaps[i];
    items.push({ type: 'gap', id: g.id, x, size: g.value, locked: g.locked, visible: g.visible });
    x += g.value;

    const p = state.parts[i];
    if (p) {
      const thickness = PART_KINDS[p.kind].thickness;
      items.push({ type: 'part', id: p.id, x, size: thickness, kind: p.kind });
      x += thickness;
    }
  }
  return items;
}

const gapIndex = id => state.gaps.findIndex(g => g.id === id);

/** Индексы остальных просветов в порядке удалённости от заданного: сначала ближние справа. */
function neighbours(from) {
  const order = [];
  for (let d = 1; d < state.gaps.length; d++) {
    if (from + d < state.gaps.length) order.push(from + d);
    if (from - d >= 0) order.push(from - d);
  }
  return order.filter(i => !state.gaps[i].locked);
}

/**
 * Поставить деталь в просвет. Просвет делится надвое (ТЗ 4.1 п.6).
 * Деталь кладётся посередине — по ТЗ положение сначала произвольное, точное задаётся числом.
 */
export function addPart(gapId, kind) {
  const spec = PART_KINDS[kind];
  if (!spec) throw new Error(`Неизвестный вид детали: ${kind}`);

  const i = gapIndex(gapId);
  if (i < 0) throw new Error(`Нет просвета ${gapId}`);

  const free = state.gaps[i].value - spec.thickness;
  if (free < 0) return null;              // деталь не влезает — молча ничего не делаем

  const before = Math.round(free / 2);
  const part = { id: makeId('p'), kind };
  const { visible } = state.gaps[i];

  state.gaps.splice(i, 1,
    { id: makeId('g'), value: before,        locked: false, visible },
    { id: makeId('g'), value: free - before, locked: false, visible });
  state.parts.splice(i, 0, part);

  emit();
  return part;
}

/**
 * Удалить деталь. Два её просвета сливаются в один — вместе с толщиной самой детали,
 * иначе изделие «похудеет» и инвариант разъедется.
 */
export function removePart(partId) {
  const i = state.parts.findIndex(p => p.id === partId);
  if (i < 0) return false;

  const merged = state.gaps[i].value + PART_KINDS[state.parts[i].kind].thickness + state.gaps[i + 1].value;
  // Слитый просвет наследует блокировку, только если были заблокированы оба:
  // иначе удаление детали молча заперло бы то, что пользователь запирать не просил.
  const locked = state.gaps[i].locked && state.gaps[i + 1].locked;
  const visible = state.gaps[i].visible || state.gaps[i + 1].visible;

  state.gaps.splice(i, 2, { id: makeId('g'), value: merged, locked, visible });
  state.parts.splice(i, 1);

  emit();
  return true;
}

/**
 * Задать просвет числом. Разница уходит в соседние просветы — ближние первыми,
 * заблокированные не трогаем (ТЗ 3.5, 4.2). Возвращает то, что реально получилось:
 * если забрать нужное не у кого, просвет вырастет меньше, чем просили.
 */
export function setGapValue(gapId, value) {
  const i = gapIndex(gapId);
  if (i < 0) throw new Error(`Нет просвета ${gapId}`);

  const gap = state.gaps[i];
  const num = Math.round(Number(value));
  if (!Number.isFinite(num)) return gap.value;

  const others = neighbours(i);
  if (!others.length) return gap.value;   // всё остальное заперто — двигать нечего

  const want = Math.max(0, num);
  let delta = want - gap.value;
  if (delta === 0) return gap.value;

  if (delta > 0) {
    // Растём — забираем у соседей, начиная с ближнего, но не загоняя их в минус.
    for (const j of others) {
      if (delta === 0) break;
      const take = Math.min(delta, state.gaps[j].value);
      state.gaps[j].value -= take;
      delta -= take;
    }
    gap.value = want - delta;             // delta — то, чего не хватило
  } else {
    // Уменьшаемся — отдаём всё ближайшему незапертому: раздавать поровну незачем,
    // пользователь двигает конкретную деталь и ждёт, что поедет она, а не всё изделие.
    state.gaps[others[0]].value += -delta;
    gap.value = want;
  }

  emit();
  return gap.value;
}

/** «Прижать» (ТЗ 4.2): деталь долетает до ближайшей преграды, просвет становится нулём. */
export const pressGap = gapId => setGapValue(gapId, 0);

export function setGapLocked(gapId, locked) {
  const gap = state.gaps[gapIndex(gapId)];
  if (!gap || gap.locked === locked) return;
  gap.locked = locked;
  emit();
}

export function setGapVisible(gapId, visible) {
  const gap = state.gaps[gapIndex(gapId)];
  if (!gap || gap.visible === visible) return;
  gap.visible = visible;
  emit();
}

/**
 * Пересчёт под новую ширину застройки: всё масштабируется пропорционально,
 * кроме заблокированных просветов — изменение расходится по остальным (ТЗ 3.5).
 */
function refitGaps() {
  const free = state.enclosure.width - totalThickness();
  let delta = free - totalGaps();
  if (delta === 0) return;

  // Сначала раздаём по незаблокированным. Если они упёрлись в ноль и остаток не разошёлся,
  // идём по всем: габарит главнее блокировок — пользователь задал ширину, и она должна
  // примениться, а не молча разъехаться с инвариантом.
  delta = spread(state.gaps.filter(g => !g.locked), delta);
  if (delta !== 0) spread(state.gaps, delta);
}

/** Раздать delta по просветам пропорционально их величине. Возвращает неразошедшийся остаток. */
function spread(gaps, delta) {
  if (!gaps.length || delta === 0) return delta;

  const base = gaps.reduce((s, g) => s + g.value, 0);

  for (let k = 0; k < gaps.length; k++) {
    if (delta === 0) break;
    const g = gaps[k];
    // Последнему отдаём весь остаток: так копейки округления не теряются и сумма сходится точно.
    const share = k === gaps.length - 1
      ? delta
      : Math.round(base > 0 ? delta * (g.value / base) : delta / gaps.length);
    const applied = Math.max(share, -g.value);   // просвет не уходит в минус
    g.value += applied;
    delta -= applied;
  }
  return delta;
}
