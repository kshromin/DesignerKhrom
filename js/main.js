// Точка входа: собирает модель, сцену и панель вместе.
// Связь односторонняя: панель меняет модель, модель уведомляет сцену. Сцена модель не трогает.

import { state, onChange, computeLayout, setProjectMaterial } from './model.js';
import { initScene, drawEnclosure, drawParts, frameEnclosure } from './scene.js';
import { loadMaterials, firstMaterialId, material } from './materials.js';
import { bindPanel } from './ui.js';

// Разложение дерева в координаты делает модель — сцена получает готовое.
function draw() {
  drawEnclosure(state.enclosure);
  drawParts(computeLayout(), state.enclosure, material);
}

// Каталог нужен раньше первой отрисовки: без него нечем красить детали и нечего считать.
await loadMaterials();
setProjectMaterial(firstMaterialId());

initScene(document.getElementById('viewport'));
draw();
frameEnclosure(state.enclosure);

bindPanel();

onChange(draw);
