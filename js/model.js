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
//
// ── Как устроено ────────────────────────────────────────────────────────────
//
// Изделие — дерево ОБЛАСТЕЙ. Область это либо пустой просвет, либо цепочка вдоль
// одной оси: просвет, деталь, просвет, деталь, просвет… Просветы такой цепочки —
// сами области и могут делиться дальше, но уже поперёк.
//
// Координаты НЕ хранятся. Хранятся размеры просветов и толщины деталей, координаты
// разворачивает computeLayout(). Отсюда главное свойство из ТЗ 3.3: поменял толщину
// материала — всё село на место само, просветы остались прежними.
//
// Почему дерево, а не плоский список с привязками: ТЗ 4.1 описывает установку как
// «просвет разделяется надвое», а это ровно операция над областью. Сквозная полка над
// несколькими отсеками получается тем, что делится область побольше — поэтому порядок
// установки имеет значение, как и в жизни: сначала полка через весь шкаф, потом стойки
// под ней. Если полка ставится во всю ширину поверх уже готовой цепочки стоек, дерево
// надстраивается сверху (см. addPart) — переставлять ничего не нужно.

/** Разумные пределы габарита. В ТЗ не оговорены — взяты, чтобы не получить вырожденную сцену. */
export const LIMITS = {
  width:  { min: 300, max: 6000 },
  height: { min: 300, max: 3500 },
  depth:  { min: 100, max: 1200 },
};

/**
 * Виды деталей из палитры. По ТЗ 3.2 толщина и ориентация — это не свойства детали,
 * а признаки вида: в палитре отдельные строки «16 мм», «32 мм», как в КД.
 * axis — вдоль какой оси деталь делит область: 'x' режет по ширине, 'y' — по высоте.
 */
export const PART_KINDS = {
  stand16: { axis: 'x', thickness: 16, label: 'Стойка 16' },
  stand32: { axis: 'x', thickness: 32, label: 'Стойка 32' },
  shelf16: { axis: 'y', thickness: 16, label: 'Полка 16' },
  shelf32: { axis: 'y', thickness: 32, label: 'Полка 32' },
};

let nextId = 1;
const makeId = prefix => `${prefix}${nextId++}`;

/** Пустая область. size — её размер вдоль оси родительской цепочки. */
function emptyRegion(size = 0) {
  return { id: makeId('g'), size, locked: false, visible: true, axis: null, items: [] };
}

export const state = {
  /** Застройка — объём, в котором строим. Пока одна; по ТЗ их может быть несколько. */
  enclosure: { width: 3000, height: 2500, depth: 600 },

  /** Корень дерева. Его размеры — размеры застройки, поэтому size у него не используется. */
  root: emptyRegion(),
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

// ── Обход дерева ────────────────────────────────────────────────────────────
//
// В цепочке items чётные места — области, нечётные — детали. Инвариант структуры:
// областей всегда на одну больше, чем деталей.

const isSplit = node => node.axis !== null;
const regionsOf = node => node.items.filter((_, i) => i % 2 === 0);
const partsOf = node => node.items.filter((_, i) => i % 2 === 1);
const thicknessOf = part => PART_KINDS[part.kind].thickness;

/** Найти область по id. */
export function findRegion(id, node = state.root) {
  if (node.id === id) return node;
  for (const r of regionsOf(node)) {
    const hit = findRegion(id, r);
    if (hit) return hit;
  }
  return null;
}

/** Найти деталь и цепочку, в которой она стоит. */
function findPart(id, node = state.root) {
  for (let i = 1; i < node.items.length; i += 2) {
    if (node.items[i].id === id) return { chain: node, index: i };
  }
  for (const r of regionsOf(node)) {
    const hit = findPart(id, r);
    if (hit) return hit;
  }
  return null;
}

/** Найти цепочку, в которой лежит область, и её место в цепочке. */
function findChainOf(regionId, node = state.root) {
  for (let i = 0; i < node.items.length; i += 2) {
    if (node.items[i].id === regionId) return { chain: node, index: i };
  }
  for (const r of regionsOf(node)) {
    const hit = findChainOf(regionId, r);
    if (hit) return hit;
  }
  return null;
}

// ── Координаты ──────────────────────────────────────────────────────────────

/**
 * Развернуть дерево в плоский список с координатами — в порядке обхода,
 * чтобы панель могла рисовать его отступами, а сцена просто отфильтровать детали.
 * Единственное место, где появляются координаты: наружу модель их только вычисляет.
 */
export function computeLayout() {
  const out = [];
  walk(state.root, 0, 0, state.enclosure.width, state.enclosure.height, 0, null);
  return out;

  function walk(node, x, y, w, h, level, parentAxis) {
    out.push({
      type: 'region', id: node.id, x, y, w, h, level,
      locked: node.locked, visible: node.visible,
      divided: isSplit(node), axis: node.axis, parentAxis,
    });
    if (!isSplit(node)) return;

    // Цепочка раскладывается вдоль своей оси: по X — слева направо, по Y — снизу вверх.
    let along = node.axis === 'x' ? x : y;

    for (let i = 0; i < node.items.length; i++) {
      const item = node.items[i];

      if (i % 2 === 0) {
        const [cx, cy, cw, ch] = node.axis === 'x'
          ? [along, y, item.size, h]
          : [x, along, w, item.size];
        walk(item, cx, cy, cw, ch, level + 1, node.axis);
        along += item.size;
      } else {
        const t = thicknessOf(item);
        out.push({
          type: 'part', id: item.id, kind: item.kind, level: level + 1,
          ...(node.axis === 'x'
            ? { x: along, y, w: t, h }
            : { x, y: along, w, h: t }),
        });
        along += t;
      }
    }
  }
}

/** Все детали изделия — для сметы и подсчётов. */
export function allParts(node = state.root, out = []) {
  for (const p of partsOf(node)) out.push(p);
  for (const r of regionsOf(node)) allParts(r, out);
  return out;
}

// ── Установка и удаление ────────────────────────────────────────────────────

/**
 * Поставить деталь в область. Область делится надвое (ТЗ 4.1 п.6).
 * Деталь кладётся посередине — по ТЗ положение сначала произвольное, точное задаётся числом.
 *
 * Три случая:
 *  - область пуста → она становится цепочкой из двух просветов;
 *  - область уже цепочка вдоль ТОЙ ЖЕ оси → деталь встраивается в цепочку, а не вкладывается
 *    внутрь: так дерево остаётся неглубоким, а соседние просветы — настоящими соседями;
 *  - область уже цепочка поперёк → делим её поперёк, старая цепочка целиком уезжает
 *    в один из новых просветов. Это и есть сквозная полка над готовыми стойками.
 */
export function addPart(regionId, kind) {
  const spec = PART_KINDS[kind];
  if (!spec) throw new Error(`Неизвестный вид детали: ${kind}`);

  const region = findRegion(regionId);
  if (!region) throw new Error(`Нет области ${regionId}`);

  const room = sizeAlong(region, spec.axis);
  const free = room - spec.thickness;
  if (free < 0) return null;               // деталь не влезает — молча ничего не делаем

  const part = { id: makeId('p'), kind };
  const before = Math.round(free / 2);
  const after = free - before;

  if (isSplit(region) && region.axis === spec.axis) {
    // Встраивать в чужую цепочку по её же оси нельзя без выбора места — такое приходит
    // только из UI, где место уже выбрано просветом. Считаем это ошибкой вызова.
    throw new Error('Область уже поделена вдоль этой оси — ставь деталь в конкретный просвет');
  }

  if (isSplit(region)) {
    // Поперечное деление: всё, что было, уезжает в нижний (левый) просвет.
    const inner = { ...region, id: makeId('g'), size: before, locked: false, visible: true };
    region.axis = spec.axis;
    region.items = [inner, part, emptyRegion(after)];
  } else {
    region.axis = spec.axis;
    region.items = [emptyRegion(before), part, emptyRegion(after)];
  }

  refit();
  emit();
  return part;
}

/** Размер области вдоль оси — считается разворотом, потому что координат мы не храним. */
function sizeAlong(region, axis) {
  const item = computeLayout().find(i => i.type === 'region' && i.id === region.id);
  return axis === 'x' ? item.w : item.h;
}

/**
 * Удалить деталь. Соседние просветы сливаются в один — вместе с толщиной самой детали,
 * иначе изделие «похудеет».
 *
 * ТЗ 4.3: деталь с зависимыми не удаляется. Здесь это выходит само: если соседний просвет
 * уже поделён, сливать нечего — в нём стоят другие детали, они и есть зависимые.
 */
export function removePart(partId) {
  const hit = findPart(partId);
  if (!hit) return { ok: false, reason: 'деталь не найдена' };

  const { chain, index } = hit;
  const left = chain.items[index - 1];
  const right = chain.items[index + 1];

  if (isSplit(left) || isSplit(right)) {
    return { ok: false, reason: 'сначала удали то, что стоит внутри соседних просветов' };
  }

  const merged = emptyRegion(left.size + thicknessOf(chain.items[index]) + right.size);
  // Слитый просвет заперт, только если были заперты оба: иначе удаление детали
  // молча заперло бы то, что пользователь запирать не просил.
  merged.locked = left.locked && right.locked;
  merged.visible = left.visible || right.visible;

  chain.items.splice(index - 1, 3, merged);

  // Цепочка из одного просвета — уже не цепочка: схлопываем, чтобы дерево не пухло.
  if (chain.items.length === 1) {
    const only = chain.items[0];
    chain.axis = only.axis;
    chain.items = only.items;
  }

  refit();
  emit();
  return { ok: true };
}

// ── Правка просветов ────────────────────────────────────────────────────────

/**
 * Задать размер области числом. Разница уходит в соседей по цепочке — ближние первыми,
 * заблокированные не трогаем (ТЗ 3.5, 4.2). Возвращает то, что реально получилось.
 *
 * Работает и для поделённых областей: сдвинул стойку — полки внутри соседнего отсека
 * удлинились сами, потому что дальше всё пересчитывает refit().
 */
export function setRegionSize(regionId, value) {
  const hit = findChainOf(regionId);
  if (!hit) return null;                    // корень руками не двигают, у него габарит

  const { chain, index } = hit;
  const target = chain.items[index];
  const num = Math.round(Number(value));
  if (!Number.isFinite(num)) return target.size;

  const others = siblingOrder(chain, index).filter(i => !chain.items[i].locked);
  if (!others.length) return target.size;   // всё остальное заперто — двигать нечего

  const want = Math.max(0, num);
  let delta = want - target.size;
  if (delta === 0) return target.size;

  if (delta > 0) {
    // Растём — забираем у соседей, начиная с ближнего, но не загоняя их в минус.
    for (const j of others) {
      if (delta === 0) break;
      const take = Math.min(delta, chain.items[j].size);
      chain.items[j].size -= take;
      delta -= take;
    }
    target.size = want - delta;             // delta — то, чего не хватило
  } else {
    // Уменьшаемся — отдаём всё ближайшему незапертому: раздавать поровну незачем,
    // пользователь двигает конкретную деталь и ждёт, что поедет она, а не всё изделие.
    chain.items[others[0]].size += -delta;
    target.size = want;
  }

  refit();
  emit();
  return target.size;
}

/** Места соседних областей в цепочке по удалённости: сначала ближние справа. */
function siblingOrder(chain, index) {
  const order = [];
  const count = chain.items.length;
  for (let d = 2; d < count; d += 2) {
    if (index + d < count) order.push(index + d);
    if (index - d >= 0) order.push(index - d);
  }
  return order;
}

/** «Прижать» (ТЗ 4.2): деталь долетает до ближайшей преграды, просвет становится нулём. */
export const pressRegion = regionId => setRegionSize(regionId, 0);

export function setRegionLocked(regionId, locked) {
  const r = findRegion(regionId);
  if (!r || r.locked === locked) return;
  r.locked = locked;
  emit();
}

export function setRegionVisible(regionId, visible) {
  const r = findRegion(regionId);
  if (!r || r.visible === visible) return;
  r.visible = visible;
  emit();
}

// ── Габарит застройки ───────────────────────────────────────────────────────

export function setEnclosureSize(key, value) {
  const limit = LIMITS[key];
  if (!limit) throw new Error(`Неизвестный размер застройки: ${key}`);

  const num = Math.round(Number(value));
  if (!Number.isFinite(num)) return state.enclosure[key];

  // Уже, чем суммарная толщина деталей поперёк, застройка быть не может: им некуда деться.
  const floor = key === 'depth' ? limit.min : Math.max(limit.min, minExtent(key === 'width' ? 'x' : 'y'));
  const clamped = Math.min(limit.max, Math.max(floor, num));

  if (clamped !== state.enclosure[key]) {
    state.enclosure[key] = clamped;
    refit();
    emit();
  }
  return clamped;
}

/** Сколько места минимально нужно вдоль оси: самая толстая ветка дерева. */
function minExtent(axis, node = state.root) {
  if (!isSplit(node)) return 0;

  if (node.axis === axis) {
    // Вдоль своей оси толщины складываются, и к ним прибавляется минимум вложенных.
    return partsOf(node).reduce((s, p) => s + thicknessOf(p), 0)
      + regionsOf(node).reduce((s, r) => s + minExtent(axis, r), 0);
  }
  // Поперёк — ветки стоят рядом, нужна самая требовательная.
  return Math.max(0, ...regionsOf(node).map(r => minExtent(axis, r)));
}

/**
 * Пересчёт всего дерева под текущий габарит: всё масштабируется пропорционально,
 * кроме заблокированных просветов — изменение расходится по остальным (ТЗ 3.5).
 */
function refit(node = state.root, extX = state.enclosure.width, extY = state.enclosure.height) {
  if (!isSplit(node)) return;

  const along = node.axis === 'x' ? extX : extY;
  const parts = partsOf(node).reduce((s, p) => s + thicknessOf(p), 0);
  const regions = regionsOf(node);

  let delta = (along - parts) - regions.reduce((s, r) => s + r.size, 0);

  // Сначала раздаём по незаблокированным. Если они упёрлись в ноль и остаток не разошёлся,
  // идём по всем: габарит главнее блокировок — пользователь задал размер, и он должен
  // примениться, а не молча разъехаться с деревом.
  if (delta !== 0) {
    delta = spread(regions.filter(r => !r.locked), delta);
    if (delta !== 0) spread(regions, delta);
  }

  for (const r of regions) {
    refit(r,
      node.axis === 'x' ? r.size : extX,
      node.axis === 'x' ? extY : r.size);
  }
}

/** Раздать delta по областям пропорционально их величине. Возвращает неразошедшийся остаток. */
function spread(regions, delta) {
  if (!regions.length || delta === 0) return delta;

  const base = regions.reduce((s, r) => s + r.size, 0);

  for (let k = 0; k < regions.length; k++) {
    if (delta === 0) break;
    const r = regions[k];
    // Последней отдаём весь остаток: так копейки округления не теряются и сумма сходится точно.
    const share = k === regions.length - 1
      ? delta
      : Math.round(base > 0 ? delta * (r.size / base) : delta / regions.length);
    const applied = Math.max(share, -r.size);   // область не уходит в минус
    r.size += applied;
    delta -= applied;
  }
  return delta;
}

/** Пустая застройка — «новый проект». Пригодится и тестам, и кнопке «начать заново». */
export function resetProject(width = 3000, height = 2500, depth = 600) {
  state.enclosure = { width, height, depth };
  state.root = emptyRegion();
  emit();
}
