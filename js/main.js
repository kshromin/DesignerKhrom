// Точка входа: собирает модель, сцену и панель вместе.
// Связь односторонняя: панель меняет модель, модель уведомляет сцену. Сцена модель не трогает.

import { state, onChange } from './model.js';
import { initScene, drawEnclosure, frameEnclosure } from './scene.js';
import { bindPanel } from './ui.js';

initScene(document.getElementById('viewport'));
drawEnclosure(state.enclosure);
frameEnclosure(state.enclosure);

bindPanel();

onChange(s => drawEnclosure(s.enclosure));
