// Панель управления. Связывает поля ввода с моделью — и ничего не знает о 3D.

import { state, setEnclosureSize } from './model.js';

const FIELDS = {
  width:  'encWidth',
  height: 'encHeight',
  depth:  'encDepth',
};

export function bindPanel() {
  for (const [key, id] of Object.entries(FIELDS)) {
    const el = document.getElementById(id);
    el.value = state.enclosure[key];

    // Правка по уходу с поля и по Enter: пока печатают, перестраивать сцену незачем.
    const apply = () => { el.value = setEnclosureSize(key, el.value); };
    el.addEventListener('change', apply);
    el.addEventListener('keydown', e => { if (e.key === 'Enter') el.blur(); });
  }
}
