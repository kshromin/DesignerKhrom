// Точка входа: собирает модель, сцену и панель вместе.
//
// Связь односторонняя: панель и мышь меняют модель, модель уведомляет сцену.
// Сцена модель не трогает — она только сообщает, куда ткнули.

import { state, onChange, computeLayout, addPart, PART_KINDS } from './model.js';
import { initScene, drawEnclosure, drawParts, drawZones, initPicking, frameEnclosure } from './scene.js';
import { loadMaterials, firstMaterialId, material } from './materials.js';
import { setProjectMaterial } from './model.js';
import * as placement from './placement.js';
import { bindPanel } from './ui.js';

/**
 * Куда выбранная деталь может встать: свободные просветы, в которые она влезает по толщине.
 * Поделённые области в список не идут — они перекрывали бы свои же просветы, и клик
 * стал бы неоднозначным.
 */
function zones() {
  const spec = PART_KINDS[placement.activeKind()];
  return computeLayout().filter(item =>
    item.type === 'region' && !item.divided &&
    (spec.axis === 'x' ? item.w : item.h) >= spec.thickness);
}

// Разложение дерева в координаты делает модель — сцена получает готовое.
function draw() {
  drawEnclosure(state.enclosure);
  drawParts(computeLayout(), state.enclosure, material);
  drawZones(zones(), state.enclosure, placement.hoveredId(), placement.chosenId());
}

// Каталог нужен раньше первой отрисовки: без него нечем красить детали и нечего считать.
await loadMaterials();
setProjectMaterial(firstMaterialId());

initScene(document.getElementById('viewport'));

// ТЗ 4.1: первый клик выбирает вариант, второй устанавливает.
initPicking({
  onHover: id => placement.setHovered(id),
  onPick: id => {
    if (!id) return placement.setChosen(null);          // мимо зон — снять выбор

    if (placement.chosenId() !== id) return placement.setChosen(id);

    addPart(id, placement.activeKind());
    placement.done();
  },
});

draw();
frameEnclosure(state.enclosure);

bindPanel();

onChange(draw);
placement.onChange(draw);
