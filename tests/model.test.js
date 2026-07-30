// Тесты модели: считают ли просветы то, что должны. Без фреймворков и сборки —
// открыл страницу и видишь результат, как и весь остальной проект.
//
// Проверяется только model.js: арифметика цепочки. Картинку тесты не смотрят —
// для неё нужен глаз.

import {
  state, computeLayout, setEnclosureSize, LIMITS,
  PART_KINDS, addPart, removePart, setGapValue, setGapLocked, pressGap,
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
 * После каждого теста автоматически проверяется главный инвариант модели:
 * сумма просветов и толщин равна ширине застройки. Разъехался — изделие не соберётся.
 */
function test(name, fn) {
  try {
    fn();
    checkInvariant();
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

const gaps = () => state.gaps.map(g => g.value);
const gapIds = () => state.gaps.map(g => g.id);
const thickness = () => state.parts.reduce((s, p) => s + PART_KINDS[p.kind].thickness, 0);

function checkInvariant() {
  const sum = gaps().reduce((s, v) => s + v, 0) + thickness();
  if (sum !== state.enclosure.width) {
    throw new Error(`инвариант нарушен: просветы+толщины = ${sum}, ширина = ${state.enclosure.width}`);
  }
  if (state.gaps.length !== state.parts.length + 1) {
    throw new Error(`просветов ${state.gaps.length} при ${state.parts.length} деталях — должно быть на один больше`);
  }
  if (gaps().some(v => v < 0)) throw new Error(`просвет ушёл в минус: ${JSON.stringify(gaps())}`);
}

/** Пустая застройка заданной ширины. Отдельной функции сброса в модели пока нет — */
/** новый проект появится позже, тогда это переедет туда. */
function empty(width = 3000) {
  state.enclosure.width = width;
  state.enclosure.height = 2500;
  state.enclosure.depth = 600;
  state.parts.length = 0;
  state.gaps.length = 0;
  state.gaps.push({ id: 'g0', value: width, locked: false, visible: true });
}

// ── Установка деталей ───────────────────────────────────────────────────────

group('Установка и удаление');

test('деталь делит просвет надвое', () => {
  empty(3000);
  const p = addPart('g0', 'vertical16');
  ok(p, 'деталь не поставилась');
  eq(state.gaps.length, 2, 'просветов должно стать два');
  eq(gaps(), [1492, 1492], 'свободное место делится поровну');
});

test('деталь ложится посередине, точное место задаётся потом числом', () => {
  empty(3000);
  addPart('g0', 'vertical16');
  const part = computeLayout().find(i => i.type === 'part');
  eq([part.x, part.size], [1492, 16], 'координата и толщина детали');
});

test('координаты в модели не хранятся — только считаются', () => {
  empty(3000);
  addPart('g0', 'vertical16');
  eq(Object.keys(state.parts[0]), ['id', 'kind'], 'у детали не должно быть координаты');
});

test('деталь толще просвета не встаёт', () => {
  empty(3000);
  state.enclosure.width = 10;
  state.gaps[0].value = 10;
  eq(addPart('g0', 'vertical16'), null, 'в просвет 10 мм стойка 16 мм влезть не может');
  eq(state.parts.length, 0, 'деталей не прибавилось');
});

test('удаление сливает просветы вместе с толщиной детали', () => {
  empty(3000);
  const p = addPart('g0', 'vertical16');
  removePart(p.id);
  eq(state.gaps.length, 1, 'просвет должен остаться один');
  eq(gaps(), [3000], 'ширина возвращается целиком, толщина не теряется');
});

test('слитый просвет заперт, только если были заперты оба', () => {
  empty(3000);
  const p = addPart('g0', 'vertical16');
  setGapLocked(gapIds()[0], true);
  removePart(p.id);
  eq(state.gaps[0].locked, false, 'один запертый из двух не должен запирать результат');
});

test('цепочка из трёх деталей', () => {
  empty(3000);
  addPart(gapIds()[0], 'vertical16');
  addPart(gapIds()[0], 'vertical16');
  addPart(gapIds()[2], 'vertical32');
  eq([state.parts.length, state.gaps.length], [3, 4], 'три детали и четыре просвета');
  const seq = computeLayout().map(i => i.type).join(' ');
  eq(seq, 'gap part gap part gap part gap', 'просветы и детали обязаны чередоваться');
});

// ── Правка числом ───────────────────────────────────────────────────────────

group('Правка просвета числом');

test('заданный просвет встаёт точно, соседний пересчитывается сам', () => {
  empty(3000);
  addPart('g0', 'vertical16');
  setGapValue(gapIds()[0], 500);
  eq(gaps(), [500, 2484], 'второй просвет добирает остаток');
});

test('«прижать» ставит просвет в ноль', () => {
  empty(3000);
  addPart('g0', 'vertical16');
  pressGap(gapIds()[0]);
  eq(gaps(), [0, 2984], 'деталь упирается в стену');
});

test('запертый сосед не отдаёт своё место', () => {
  empty(3000);
  addPart('g0', 'vertical16');
  setGapLocked(gapIds()[1], true);
  const got = setGapValue(gapIds()[0], 2000);
  eq(got, 1492, 'просвет не может вырасти — брать не у кого');
  eq(gaps(), [1492, 1492], 'ничего не сдвинулось');
});

test('просвет не уходит в минус и не берёт больше, чем есть', () => {
  empty(3000);
  addPart('g0', 'vertical16');
  setGapValue(gapIds()[0], 99999);
  eq(gaps(), [2984, 0], 'сосед отдал всё, что мог, но не больше');
});

test('дробное округляется, мусор игнорируется', () => {
  empty(3000);
  addPart('g0', 'vertical16');
  setGapValue(gapIds()[0], 500.6);
  eq(state.gaps[0].value, 501, 'миллиметры целые');
  setGapValue(gapIds()[0], 'абв');
  eq(state.gaps[0].value, 501, 'мусор не должен менять модель');
});

// ── Смена габарита ──────────────────────────────────────────────────────────

group('Смена габарита застройки');

test('всё масштабируется пропорционально', () => {
  empty(3000);
  addPart('g0', 'vertical16');
  setGapValue(gapIds()[0], 1000);          // 1000 | 16 | 1984

  const before = gaps();
  const freeBefore = before[0] + before[1];
  setEnclosureSize('width', 6000);

  // Ожидание считаем формулой, а не числом из головы — иначе тест проверяет память автора.
  const freeAfter = 6000 - 16;
  const first = Math.round(before[0] / freeBefore * freeAfter);
  eq(gaps(), [first, freeAfter - first], 'доли просветов сохраняются');
});

test('заблокированный просвет при смене габарита не меняется', () => {
  empty(3000);
  addPart('g0', 'vertical16');
  setGapValue(gapIds()[0], 1000);
  setGapLocked(gapIds()[0], true);
  setEnclosureSize('width', 4000);
  eq(state.gaps[0].value, 1000, 'запертый обязан остаться прежним');
  eq(state.gaps[1].value, 2984, 'вся разница ушла в свободный');
});

test('габарит главнее блокировок, если запертые держат больше новой ширины', () => {
  empty(3000);
  addPart('g0', 'vertical16');
  setGapValue(gapIds()[0], 2000);
  setGapLocked(gapIds()[0], true);
  setEnclosureSize('width', 1000);
  eq(state.enclosure.width, 1000, 'заданная ширина должна примениться');
  // Инвариант и «не в минус» проверит checkInvariant после теста.
});

test('застройка не может стать уже суммы толщин', () => {
  empty(3000);
  addPart('g0', 'vertical32');
  const w = setEnclosureSize('width', 5);
  eq(w, LIMITS.width.min, 'ширина зажимается снизу');
});

test('размеры зажимаются в пределы, мусор не проходит', () => {
  empty(3000);
  eq(setEnclosureSize('width', 99999), LIMITS.width.max, 'сверху');
  eq(setEnclosureSize('height', 1), LIMITS.height.min, 'снизу');
  eq(setEnclosureSize('depth', 617.4), 617, 'округление');
  eq(setEnclosureSize('depth', 'абв'), 617, 'мусор не меняет модель');
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
