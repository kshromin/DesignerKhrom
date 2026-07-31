// Панель управления. Связывает поля ввода с моделью — и ничего не знает о 3D.

import {
  state, onChange, computeLayout, computeEstimate, setEnclosureSize, resetProject,
  PART_KINDS, removePart, setProjectMaterial, setPartMaterial,
  setRegionSize, setRegionLocked, pressRegion,
} from './model.js';
import { groups, edge, material } from './materials.js';
import * as placement from './placement.js';

const FIELDS = {
  width:  'encWidth',
  height: 'encHeight',
  depth:  'encDepth',
};

/** Последнее сообщение об отказе — например, попытка удалить деталь с зависимыми. */
let notice = '';

export function bindPanel() {
  bindEnclosureFields();
  bindProjectMaterial();
  buildPalette();
  document.getElementById('reset').addEventListener('click', () => {
    notice = '';
    resetProject(state.enclosure.width, state.enclosure.height, state.enclosure.depth);
  });
  render();

  // Панель перерисовывается по уведомлению модели, а не сразу после нажатия:
  // так один источник правды и никакой рассинхронизации со сценой.
  onChange(render);
  placement.onChange(renderPaletteState);
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

/** Выпадающий список материалов, разбитый на группы каталога. */
function materialSelect(selected, { withInherit = false } = {}) {
  const sel = document.createElement('select');

  if (withInherit) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'как у проекта';
    sel.appendChild(opt);
  }

  for (const group of groups()) {
    const box = document.createElement('optgroup');
    box.label = group.name;
    for (const item of group.items) {
      const opt = document.createElement('option');
      opt.value = item.id;
      opt.textContent = `${item.name} · ${item.price} ₽/${group.unit}`;
      box.appendChild(opt);
    }
    sel.appendChild(box);
  }

  sel.value = selected || '';
  return sel;
}

function bindProjectMaterial() {
  const holder = document.getElementById('projectMaterial');
  const sel = materialSelect(state.material);
  sel.id = 'projectMaterial';
  sel.addEventListener('change', () => setProjectMaterial(sel.value));
  holder.replaceWith(sel);
}

/** Палитра разбита на разделы по этапам работы, как в КД (ТЗ 8). */
function buildPalette() {
  const box = document.getElementById('palette');
  const sections = new Map();

  for (const [kind, spec] of Object.entries(PART_KINDS)) {
    if (!sections.has(spec.section)) sections.set(spec.section, []);
    sections.get(spec.section).push([kind, spec]);
  }

  for (const [name, kinds] of sections) {
    const title = document.createElement('div');
    title.className = 'section';
    title.textContent = name;
    box.appendChild(title);

    const row = document.createElement('div');
    row.className = 'kinds';
    for (const [kind, spec] of kinds) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'kind';
      btn.dataset.kind = kind;
      btn.textContent = spec.label;
      btn.addEventListener('click', () => placement.setKind(kind));
      row.appendChild(btn);
    }
    box.appendChild(row);
  }

  renderPaletteState();
}

/** Подсветка выбранного вида и подсказка о том, какой сейчас шаг установки. */
function renderPaletteState() {
  const kind = placement.activeKind();
  document.querySelectorAll('#palette .kind')
    .forEach(b => b.classList.toggle('on', b.dataset.kind === kind));

  document.getElementById('placeHint').textContent = placement.chosenId()
    ? 'Место выбрано. Кликни ещё раз, чтобы поставить.'
    : `Кликни по оранжевой зоне в сцене — выбрать место для «${PART_KINDS[kind].label}».`;
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

  renderPaletteState();
  renderPrice();
}

/** Цена видна постоянно и пересчитывается на каждое действие (ТЗ 7). */
function renderPrice() {
  const est = computeEstimate(material, edge().price);
  const box = document.getElementById('price');

  box.querySelector('.sum').textContent = `${est.total.toLocaleString('ru-RU')} ₽`;
  box.querySelector('.breakdown').textContent = est.rows.length
    ? `${est.areaM2.toFixed(2)} м² · ${est.panels.toLocaleString('ru-RU')} ₽ ` +
      `+ кромка ${est.edgeM.toFixed(1)} пог. м · ${est.edges.toLocaleString('ru-RU')} ₽`
    : 'деталей пока нет';
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

  // Свой материал детали (ТЗ 3.2). Пусто — значит наследует проектный.
  const sel = materialSelect(part.ownMaterial || '', { withInherit: true });
  sel.className = 'mat';
  sel.title = 'Материал этой детали';
  sel.addEventListener('change', () => setPartMaterial(part.id, sel.value || null));
  row.appendChild(sel);

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
