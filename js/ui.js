// Панель управления. Связывает поля ввода с моделью — и ничего не знает о 3D.

import {
  state, onChange, computeLayout, setEnclosureSize,
  PART_KINDS, addPart, removePart, setGapValue, setGapLocked, pressGap,
} from './model.js';

const FIELDS = {
  width:  'encWidth',
  height: 'encHeight',
  depth:  'encDepth',
};

/** Выбранный в палитре вид детали. По ТЗ 4.1 сначала выбирают вид, потом место. */
let activeKind = 'vertical16';

export function bindPanel() {
  bindEnclosureFields();
  buildPalette();
  renderChain();

  // Панель перерисовывается по уведомлению модели, а не сразу после нажатия:
  // так один источник правды и никакой рассинхронизации со сценой.
  onChange(renderChain);
}

function bindEnclosureFields() {
  for (const [key, id] of Object.entries(FIELDS)) {
    const el = document.getElementById(id);
    el.value = state.enclosure[key];

    // Правка по уходу с поля и по Enter: пока печатают, перестраивать сцену незачем.
    const apply = () => { el.value = setEnclosureSize(key, el.value); };
    el.addEventListener('change', apply);
    el.addEventListener('keydown', e => { if (e.key === 'Enter') el.blur(); });
  }
}

function buildPalette() {
  const box = document.getElementById('palette');

  for (const [kind, spec] of Object.entries(PART_KINDS)) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'kind';
    btn.dataset.kind = kind;
    btn.textContent = spec.label;
    btn.addEventListener('click', () => {
      activeKind = kind;
      box.querySelectorAll('.kind').forEach(b => b.classList.toggle('on', b.dataset.kind === kind));
    });
    box.appendChild(btn);
  }
  box.querySelector(`[data-kind="${activeKind}"]`).classList.add('on');
}

/**
 * Список цепочки: просветы и детали вперемежку, слева направо.
 * Пока это замена подсветке зон в 3D — место установки выбирается строкой, а не кликом.
 */
function renderChain() {
  syncEnclosureFields();

  const box = document.getElementById('chain');
  box.textContent = '';

  for (const item of computeLayout()) {
    box.appendChild(item.type === 'gap' ? gapRow(item) : partRow(item));
  }
}

/** Габарит мог поправиться сам (зажатие в пределы) — поля обязаны показывать правду. */
function syncEnclosureFields() {
  for (const [key, id] of Object.entries(FIELDS)) {
    const el = document.getElementById(id);
    if (document.activeElement !== el) el.value = state.enclosure[key];
  }
}

function gapRow(gap) {
  const row = document.createElement('div');
  row.className = 'row gap' + (gap.locked ? ' locked' : '');

  const input = document.createElement('input');
  input.type = 'number';
  input.step = '10';
  input.value = gap.size;
  input.disabled = gap.locked;
  input.title = 'Просвет, мм';
  input.addEventListener('change', () => setGapValue(gap.id, input.value));
  input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); });
  row.appendChild(input);

  row.appendChild(button('⟵', 'Прижать: просвет в ноль', () => pressGap(gap.id)));
  row.appendChild(button(gap.locked ? '🔒' : '🔓', 'Блокировка: запертый просвет не меняется',
    () => setGapLocked(gap.id, !gap.locked)));
  row.appendChild(button('+', 'Поставить сюда выбранную деталь', () => addPart(gap.id, activeKind)));

  return row;
}

function partRow(part) {
  const row = document.createElement('div');
  row.className = 'row part';

  const label = document.createElement('span');
  label.textContent = `${PART_KINDS[part.kind].label} · ${part.x} мм`;
  row.appendChild(label);

  row.appendChild(button('×', 'Удалить деталь', () => removePart(part.id)));
  return row;
}

function button(text, title, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = text;
  b.title = title;
  b.addEventListener('click', onClick);
  return b;
}
