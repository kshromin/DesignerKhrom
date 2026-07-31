// Панель управления. Связывает поля ввода с моделью — и ничего не знает о 3D.

import {
  state, onChange, computeLayout, setEnclosureSize, resetProject,
  PART_KINDS, addPart, removePart,
  setRegionSize, setRegionLocked, pressRegion,
} from './model.js';

const FIELDS = {
  width:  'encWidth',
  height: 'encHeight',
  depth:  'encDepth',
};

/** Выбранный в палитре вид детали. По ТЗ 4.1 сначала выбирают вид, потом место. */
let activeKind = 'stand16';

/** Последнее сообщение об отказе — например, попытка удалить деталь с зависимыми. */
let notice = '';

export function bindPanel() {
  bindEnclosureFields();
  buildPalette();
  document.getElementById('reset').addEventListener('click', () => {
    notice = '';
    resetProject(state.enclosure.width, state.enclosure.height, state.enclosure.depth);
  });
  render();

  // Панель перерисовывается по уведомлению модели, а не сразу после нажатия:
  // так один источник правды и никакой рассинхронизации со сценой.
  onChange(render);
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
 * Дерево изделия отступами: область, внутри неё детали и вложенные области.
 * Пока это замена подсветке зон в 3D — место установки выбирается строкой, а не кликом.
 */
function render() {
  syncEnclosureFields();

  const box = document.getElementById('chain');
  box.textContent = '';

  for (const item of computeLayout()) {
    box.appendChild(item.type === 'region' ? regionRow(item) : partRow(item));
  }

  const note = document.getElementById('notice');
  note.textContent = notice;
  note.hidden = !notice;
}

/** Габарит мог поправиться сам (зажатие в пределы) — поля обязаны показывать правду. */
function syncEnclosureFields() {
  for (const [key, id] of Object.entries(FIELDS)) {
    const el = document.getElementById(id);
    if (document.activeElement !== el) el.value = state.enclosure[key];
  }
}

function regionRow(region) {
  const row = document.createElement('div');
  row.className = 'row region' + (region.locked ? ' locked' : '') + (region.divided ? ' divided' : '');
  row.style.marginLeft = `${region.level * 12}px`;

  const size = document.createElement('input');
  size.type = 'number';
  size.step = '10';
  // У корня размер задаётся габаритом застройки, у остальных — тем, чем он является
  // в родительской цепочке: по X это ширина, по Y — высота.
  const isRoot = region.level === 0;
  size.value = region.parentAxis === 'y' ? region.h : region.w;
  size.disabled = region.locked || isRoot;
  size.title = isRoot ? 'Габарит задаётся выше' : 'Просвет, мм';
  size.addEventListener('change', () => setRegionSize(region.id, size.value));
  size.addEventListener('keydown', e => { if (e.key === 'Enter') size.blur(); });
  row.appendChild(size);

  const info = document.createElement('span');
  info.className = 'dims';
  info.textContent = `${region.w}×${region.h}`;
  row.appendChild(info);

  if (!isRoot) {
    row.appendChild(button('⟵', 'Прижать: просвет в ноль', () => { notice = ''; pressRegion(region.id); }));
    row.appendChild(button(region.locked ? '🔒' : '🔓', 'Блокировка: запертый просвет не меняется',
      () => { notice = ''; setRegionLocked(region.id, !region.locked); }));
  }

  // Ставить можно только в пустую область: в поделённую деталь идёт через её просветы.
  if (!region.divided) {
    row.appendChild(button('+', 'Поставить сюда выбранную деталь', () => {
      notice = '';
      if (!addPart(region.id, activeKind)) notice = 'Деталь не влезает в этот просвет.';
      else render();
    }));
  }

  return row;
}

function partRow(part) {
  const row = document.createElement('div');
  row.className = 'row part';
  row.style.marginLeft = `${part.level * 12}px`;

  const label = document.createElement('span');
  const along = PART_KINDS[part.kind].axis === 'x' ? `на ${part.x} мм` : `на высоте ${part.y} мм`;
  label.textContent = `${PART_KINDS[part.kind].label} · ${along}`;
  row.appendChild(label);

  row.appendChild(button('×', 'Удалить деталь', () => {
    const res = removePart(part.id);
    notice = res.ok ? '' : res.reason;
    render();
  }));
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
