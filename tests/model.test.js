// Тесты модели: считает ли дерево областей то, что должно. Без фреймворков и сборки —
// открыл страницу и видишь результат, как и весь остальной проект.
//
// Проверяется только model.js: арифметика просветов. Картинку тесты не смотрят —
// для неё нужен глаз.

import {
  state, computeLayout, allParts, resetProject, setEnclosureSize, LIMITS,
  PART_KINDS, addPart, removePart, setRegionSize, setRegionLocked, pressRegion,
  computeEstimate, setProjectMaterial, setPartMaterial,
} from '../js/model.js';

// ── Мелкий каркас ───────────────────────────────────────────────────────────

const groups = [];
let passed = 0, failed = 0;

const group = name => groups.push({ name, cases: [] });
const last = () => groups[groups.length - 1];

/**
 * Один тест. Внутри — сколько угодно проверок; первая же провалившаяся
 * прекращает тест, дальше проверять бессмысленно.
 *
 * После каждого теста автоматически проверяется главное правило модели: детали и просветы
 * обязаны заполнять застройку без щелей и нахлёстов. Разъехалось — изделие не соберётся.
 */
function test(name, fn) {
  try {
    fn();
    checkGeometry();
    last().cases.push({ name, ok: true });
    passed++;
  } catch (e) {
    last().cases.push({ name, ok: false, why: e.message });
    failed++;
  }
}

function eq(actual, expected, what) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${what}\n  ожидалось: ${b}\n  получилось: ${a}`);
}

function ok(cond, what) {
  if (!cond) throw new Error(what);
}

// ── Помощники ───────────────────────────────────────────────────────────────

const layout = () => computeLayout();
const regions = () => layout().filter(i => i.type === 'region');
const parts = () => layout().filter(i => i.type === 'part');
const leaf = n => regions().filter(r => !r.divided)[n];
const rootRegion = () => regions()[0];

/**
 * Каждая поделённая область обязана быть точно заполнена своим содержимым вдоль своей оси,
 * а поперёк — содержимое обязано совпадать с ней целиком. Ничего не торчит и не проваливается.
 */
function checkGeometry() {
  const all = layout();
  const byId = new Map(all.filter(i => i.type === 'region').map(r => [r.id, r]));

  for (const r of byId.values()) {
    if (r.w < 0 || r.h < 0) throw new Error(`область ${r.id} ушла в минус: ${r.w}×${r.h}`);
  }

  // Дети идут в списке подряд после родителя, уровнем глубже — этого хватает, чтобы
  // собрать их по каждому родителю без хранения ссылок.
  for (let i = 0; i < all.length; i++) {
    const parent = all[i];
    if (parent.type !== 'region' || !parent.divided) continue;

    const kids = [];
    for (let j = i + 1; j < all.length && all[j].level > parent.level; j++) {
      if (all[j].level === parent.level + 1) kids.push(all[j]);
    }

    const along = kids.reduce((s, k) => s + (parent.axis === 'x' ? k.w : k.h), 0);
    const need = parent.axis === 'x' ? parent.w : parent.h;
    if (along !== need) {
      throw new Error(`область ${parent.id}: содержимое вдоль ${parent.axis} даёт ${along}, а места ${need}`);
    }

    for (const k of kids) {
      const across = parent.axis === 'x' ? k.h : k.w;
      const full = parent.axis === 'x' ? parent.h : parent.w;
      if (across !== full) throw new Error(`${k.id} поперёк ${across}, а область ${full}`);
    }
  }
}

const empty = (w = 3000, h = 2500) => resetProject(w, h, 600);

// ── Стойки ──────────────────────────────────────────────────────────────────

group('Стойки: деление по ширине');

test('стойка делит застройку надвое', () => {
  empty();
  ok(addPart(rootRegion().id, 'stand16'), 'стойка не поставилась');
  eq(parts().length, 1, 'деталь должна быть одна');
  eq([leaf(0).w, leaf(1).w], [1492, 1492], 'свободное место делится поровну');
});

test('стойка стоит во всю высоту застройки', () => {
  empty();
  addPart(rootRegion().id, 'stand16');
  eq([parts()[0].y, parts()[0].h], [0, 2500], 'от пола до потолка');
});

test('координаты в модели не хранятся — только считаются', () => {
  empty();
  addPart(rootRegion().id, 'stand16');
  eq(Object.keys(allParts()[0]), ['id', 'kind'], 'у детали не должно быть координаты');
});

test('три стойки подряд', () => {
  empty();
  addPart(rootRegion().id, 'stand16');
  addPart(leaf(0).id, 'stand16');
  addPart(leaf(2).id, 'stand32');
  eq(parts().length, 3, 'три детали');
  eq(regions().filter(r => !r.divided).length, 4, 'и четыре просвета');
});

// ── Полки ───────────────────────────────────────────────────────────────────

group('Полки: второе измерение');

test('полка делит просвет по высоте', () => {
  empty();
  addPart(rootRegion().id, 'shelf16');
  eq([parts()[0].x, parts()[0].w], [0, 3000], 'полка во всю ширину');
  eq([leaf(0).h, leaf(1).h], [1242, 1242], 'высота делится поровну');
});

test('полка внутри отсека между стойками', () => {
  empty();
  addPart(rootRegion().id, 'stand16');          // две колонки
  const column = leaf(0);
  addPart(column.id, 'shelf16');                // полка в левой колонке
  const shelf = parts().find(p => p.kind === 'shelf16');
  eq([shelf.x, shelf.w], [0, 1492], 'полка занимает ширину только своей колонки');
  ok(parts().find(p => p.kind === 'stand16').h === 2500, 'стойка осталась во всю высоту');
});

test('сквозная полка поверх готовых стоек — дерево надстраивается сверху', () => {
  empty();
  addPart(rootRegion().id, 'stand16');
  addPart(rootRegion().id, 'shelf16');          // поперёк уже поделённой области
  const shelf = parts().find(p => p.kind === 'shelf16');
  eq([shelf.x, shelf.w], [0, 3000], 'полка прошла через всю ширину');
  const stand = parts().find(p => p.kind === 'stand16');
  ok(stand.h < 2500, `стойка укоротилась под полку, а осталась ${stand.h}`);
});

test('стойка под полкой не во всю высоту застройки', () => {
  empty();
  addPart(rootRegion().id, 'shelf16');          // полка посередине
  const below = regions().filter(r => !r.divided)[0];
  addPart(below.id, 'stand16');                 // стойка только под полкой
  const stand = parts().find(p => p.kind === 'stand16');
  eq(stand.h, 1242, 'высота стойки — по своему отсеку');
  eq(stand.y, 0, 'и стоит она от пола');
});

// ── Правка числом ───────────────────────────────────────────────────────────

group('Правка просвета числом');

test('заданный просвет встаёт точно, соседний пересчитывается сам', () => {
  empty();
  addPart(rootRegion().id, 'stand16');
  setRegionSize(leaf(0).id, 500);
  eq([leaf(0).w, leaf(1).w], [500, 2484], 'второй просвет добирает остаток');
});

test('«прижать» ставит просвет в ноль', () => {
  empty();
  addPart(rootRegion().id, 'stand16');
  pressRegion(leaf(0).id);
  eq([leaf(0).w, leaf(1).w], [0, 2984], 'деталь упирается в стену');
});

test('запертый сосед не отдаёт своё место', () => {
  empty();
  addPart(rootRegion().id, 'stand16');
  setRegionLocked(leaf(1).id, true);
  setRegionSize(leaf(0).id, 2000);
  eq([leaf(0).w, leaf(1).w], [1492, 1492], 'ничего не сдвинулось');
});

test('просвет не берёт больше, чем у соседа есть', () => {
  empty();
  addPart(rootRegion().id, 'stand16');
  setRegionSize(leaf(0).id, 99999);
  eq([leaf(0).w, leaf(1).w], [2984, 0], 'сосед отдал всё, что мог, но не больше');
});

test('сдвиг стойки удлиняет полки в соседнем отсеке', () => {
  empty();
  addPart(rootRegion().id, 'stand16');
  addPart(leaf(1).id, 'shelf16');               // полка в правой колонке
  const before = parts().find(p => p.kind === 'shelf16').w;
  setRegionSize(leaf(0).id, 500);               // двигаем стойку влево
  const after = parts().find(p => p.kind === 'shelf16').w;
  ok(after > before, `полка должна была удлиниться: было ${before}, стало ${after}`);
  eq(after, 3000 - 500 - 16, 'полка занимает весь новый отсек');
});

// ── Удаление ────────────────────────────────────────────────────────────────

group('Удаление');

test('удаление сливает просветы вместе с толщиной детали', () => {
  empty();
  const p = addPart(rootRegion().id, 'stand16');
  eq(removePart(p.id).ok, true, 'деталь должна удалиться');
  eq(parts().length, 0, 'деталей не осталось');
  eq(rootRegion().w, 3000, 'ширина вернулась целиком');
});

test('деталь с зависимыми не удаляется (ТЗ 4.3)', () => {
  empty();
  const stand = addPart(rootRegion().id, 'stand16');
  addPart(leaf(0).id, 'shelf16');               // внутри левого отсека появилась полка
  const res = removePart(stand.id);
  eq(res.ok, false, 'стойку с полкой внутри удалять нельзя');
  ok(res.reason.includes('удали'), `должно быть понятное объяснение, а не «${res.reason}»`);
  eq(parts().length, 2, 'ничего не удалилось');
});

// ── Габарит ─────────────────────────────────────────────────────────────────

group('Смена габарита застройки');

test('ширина масштабирует просветы пропорционально', () => {
  empty();
  addPart(rootRegion().id, 'stand16');
  setRegionSize(leaf(0).id, 1000);              // 1000 | 16 | 1984

  const before = [leaf(0).w, leaf(1).w];
  const freeBefore = before[0] + before[1];
  setEnclosureSize('width', 6000);

  // Ожидание считаем формулой, а не числом из головы — иначе тест проверяет память автора.
  const freeAfter = 6000 - 16;
  const first = Math.round(before[0] / freeBefore * freeAfter);
  eq([leaf(0).w, leaf(1).w], [first, freeAfter - first], 'доли просветов сохраняются');
});

test('высота пересчитывает полки, а не только стены', () => {
  empty();
  addPart(rootRegion().id, 'shelf16');
  setEnclosureSize('height', 2000);
  const shelf = parts()[0];
  eq(shelf.y, Math.round((2000 - 16) / 2), 'полка осталась посередине новой высоты');
});

test('заблокированный просвет при смене габарита не меняется', () => {
  empty();
  addPart(rootRegion().id, 'stand16');
  setRegionSize(leaf(0).id, 1000);
  setRegionLocked(leaf(0).id, true);
  setEnclosureSize('width', 4000);
  eq(leaf(0).w, 1000, 'запертый обязан остаться прежним');
  eq(leaf(1).w, 2984, 'вся разница ушла в свободный');
});

test('габарит главнее блокировок, если запертые держат больше новой ширины', () => {
  empty();
  addPart(rootRegion().id, 'stand16');
  setRegionSize(leaf(0).id, 2000);
  setRegionLocked(leaf(0).id, true);
  setEnclosureSize('width', 1000);
  eq(state.enclosure.width, 1000, 'заданная ширина должна примениться');
  // Геометрию и «не в минус» проверит checkGeometry после теста.
});

test('застройка не может стать уже суммы толщин', () => {
  empty();
  addPart(rootRegion().id, 'stand32');
  addPart(leaf(0).id, 'stand32');
  eq(setEnclosureSize('width', 5), LIMITS.width.min, 'ширина зажимается снизу');
});

test('размеры зажимаются в пределы, мусор не проходит', () => {
  empty();
  eq(setEnclosureSize('width', 99999), LIMITS.width.max, 'сверху');
  eq(setEnclosureSize('height', 1), LIMITS.height.min, 'снизу');
  eq(setEnclosureSize('depth', 617.4), 617, 'округление');
  eq(setEnclosureSize('depth', 'абв'), 617, 'мусор не меняет модель');
});

// ── Настоящее изделие ───────────────────────────────────────────────────────

group('Сборка целиком');

test('шкаф: две стойки, полки в отсеках, смена габарита — всё сходится', () => {
  empty(2400, 2400);

  addPart(rootRegion().id, 'stand16');
  addPart(leaf(0).id, 'stand16');               // три колонки
  eq(parts().length, 2, 'две стойки');

  const columns = regions().filter(r => !r.divided);
  addPart(columns[0].id, 'shelf16');
  addPart(columns[1].id, 'shelf16');
  addPart(columns[2].id, 'shelf32');
  eq(parts().length, 5, 'пять деталей');

  // Каждая полка обязана лежать внутри своей колонки, а не торчать наружу.
  for (const shelf of parts().filter(p => p.kind.startsWith('shelf'))) {
    ok(shelf.w > 0 && shelf.w < 2400, `полка шириной ${shelf.w} вылезла за колонку`);
  }

  setEnclosureSize('width', 3600);
  setEnclosureSize('height', 2000);
  eq(parts().length, 5, 'детали не потерялись при пересчёте');
  for (const p of parts()) {
    ok(p.x >= 0 && p.x + p.w <= 3600, `деталь ${p.id} вылезла по ширине`);
    ok(p.y >= 0 && p.y + p.h <= 2000, `деталь ${p.id} вылезла по высоте`);
  }
});

// ── Цена ────────────────────────────────────────────────────────────────────

group('Цена (ТЗ 7)');

// Каталог-пустышка: цены круглые, чтобы арифметика проверялась в уме, а не подгонкой.
const PRICES = { plita: { name: 'Плита', price: 1000 }, steklo: { name: 'Стекло', price: 3000 } };
const priceOf = id => PRICES[id] || null;
const EDGE = 100;                            // ₽ за погонный метр

test('площадь считается как длина × глубина, а не по толщине', () => {
  empty(2000, 2000);
  resetProject(2000, 2000, 500);
  setProjectMaterial('plita');
  addPart(rootRegion().id, 'shelf16');       // полка 2000 мм в застройке глубиной 500

  const est = computeEstimate(priceOf, EDGE);
  eq(est.rows.length, 1, 'одна деталь');
  eq(est.areaM2, 1, '2000 мм × 500 мм = 1 м²');
  eq(est.edgeM, 2, 'кромка по передней грани — 2 погонных метра');
});

test('итог складывается из плиты и кромки', () => {
  resetProject(2000, 2000, 500);
  setProjectMaterial('plita');
  addPart(rootRegion().id, 'shelf16');

  const est = computeEstimate(priceOf, EDGE);
  eq(est.panels, 1000, '1 м² по 1000 ₽');
  eq(est.edges, 200, '2 пог. м по 100 ₽');
  eq(est.total, 1200, 'итого');
});

test('у стойки длина — это высота', () => {
  resetProject(2000, 2000, 500);
  setProjectMaterial('plita');
  addPart(rootRegion().id, 'stand16');       // стойка высотой 2000 в глубине 500

  const est = computeEstimate(priceOf, EDGE);
  eq(est.areaM2, 1, '2000 мм высоты × 500 мм глубины');
});

test('материал детали перебивает материал проекта', () => {
  resetProject(2000, 2000, 500);
  setProjectMaterial('plita');
  const shelf = addPart(rootRegion().id, 'shelf16');

  const before = computeEstimate(priceOf, EDGE).total;
  setPartMaterial(shelf.id, 'steklo');
  const after = computeEstimate(priceOf, EDGE);

  eq(after.rows[0].material, 'Стекло', 'в смете виден свой материал детали');
  eq(after.total, 3200, '1 м² стекла по 3000 плюс кромка 200');
  ok(after.total > before, 'дороже, чем на плите');

  setPartMaterial(shelf.id, null);
  eq(computeEstimate(priceOf, EDGE).total, before, 'снятие своего материала возвращает проектный');
});

test('цена пересчитывается при смене габарита', () => {
  resetProject(2000, 2000, 500);
  setProjectMaterial('plita');
  addPart(rootRegion().id, 'shelf16');

  const before = computeEstimate(priceOf, EDGE).total;
  setEnclosureSize('width', 4000);           // полка стала вдвое длиннее
  const after = computeEstimate(priceOf, EDGE);

  eq(after.areaM2, 2, 'площадь удвоилась');
  eq(after.total, before * 2, 'и цена тоже');
});

test('пустая застройка стоит ноль, а не ломается', () => {
  resetProject(2000, 2000, 500);
  const est = computeEstimate(priceOf, EDGE);
  eq([est.total, est.rows.length], [0, 0], 'ни деталей, ни цены');
});

test('деталь без материала не роняет смету', () => {
  resetProject(2000, 2000, 500);
  setProjectMaterial(null);
  addPart(rootRegion().id, 'shelf16');
  const est = computeEstimate(priceOf, EDGE);
  eq(est.panels, 0, 'плита не посчитана');
  eq(est.edges, 200, 'а кромка всё равно есть');
  ok(est.rows[0].material.includes('не задан'), 'и это видно в смете');
});

// ── Вывод ───────────────────────────────────────────────────────────────────

const out = document.getElementById('out');

for (const g of groups) {
  const h = document.createElement('h2');
  h.textContent = g.name;
  out.appendChild(h);

  for (const c of g.cases) {
    const row = document.createElement('div');
    row.className = 'case ' + (c.ok ? 'ok' : 'bad');
    row.textContent = c.name;
    out.appendChild(row);

    if (!c.ok) {
      const why = document.createElement('div');
      why.className = 'why';
      why.textContent = c.why;
      out.appendChild(why);
    }
  }
}

const total = document.getElementById('total');
total.className = failed ? 'fail' : 'pass';
total.textContent = failed
  ? `Провалено ${failed} из ${passed + failed}. Смотри красное ниже.`
  : `Всё сошлось: ${passed} проверок.`;
