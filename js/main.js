// Точка входа: собирает модель, сцену и панель вместе.
// Связь односторонняя: панель меняет модель, модель уведомляет сцену. Сцена модель не трогает.

import { state, onChange, computeLayout } from './model.js';
import { initScene, drawEnclosure, drawParts, frameEnclosure } from './scene.js';
import { bindPanel } from './ui.js';

// Разложение цепочки в координаты делает модель — сцена получает готовое.
function draw() {
  drawEnclosure(state.enclosure);
  drawParts(computeLayout(), state.enclosure);
}

initScene(document.getElementById('viewport'));
draw();
frameEnclosure(state.enclosure);

bindPanel();

onChange(draw);
