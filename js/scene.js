// 3D-сцена: камера, вращение, отрисовка застройки. Читает модель, но не меняет её.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

let renderer, scene, camera, controls;
let enclosureGroup;          // всё, что рисует границы застройки — сносится и строится заново
let partsGroup;              // детали — тоже перестраиваются целиком
let zonesGroup;              // подсвеченные места установки
let container;

/** Полупрозрачные границы: пол, потолок, боковые и задняя стена. Без текстур (см. ТЗ, раздел 8). */
const WALL_COLOR = 0xb9c0c8;
const WALL_OPACITY = 0.3;
const EDGE_COLOR = 0x51606e;

/** Цвет ЛДСП «по умолчанию» — когда у детали нет материала с цветом. */
const PART_COLOR = 0xd8c9a8;
const PART_EDGE_COLOR = 0x8a7a58;

/** Места установки. Оранжевые, как в КД (ТЗ 4.1). */
const ZONE_COLOR = 0xff9a3c;
const ZONE_OPACITY = 0.14;
const ZONE_HOVER_OPACITY = 0.32;
const ZONE_CHOSEN_COLOR = 0xff6a00;
const ZONE_CHOSEN_OPACITY = 0.45;

/** Снести группу вместе с геометрией и материалами: перестраиваем часто, мусор копить нельзя. */
function disposeGroup(group) {
  if (!group) return;
  scene.remove(group);
  group.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) o.material.dispose();
  });
}

export function initScene(el) {
  container = el;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf2f4f6);

  camera = new THREE.PerspectiveCamera(45, 1, 10, 50000);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  container.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  scene.add(new THREE.AmbientLight(0xffffff, 0.75));
  const sun = new THREE.DirectionalLight(0xffffff, 0.6);
  sun.position.set(1, 2, 3);
  scene.add(sun);

  // Размер берём сразу — если контейнер уже разложен, ждать нечего.
  resize();

  // Дальше слушаем сам контейнер, а не окно: он меняется не только вместе с окном
  // (панель, будущий сплиттер), и на старте может быть ещё нулевым. Синхронный вызов
  // выше нужен потому, что ResizeObserver в скрытой вкладке не срабатывает вовсе.
  new ResizeObserver(resize).observe(container);

  animate();
}

/** Перестроить границы застройки под текущие размеры. */
export function drawEnclosure(enclosure) {
  const { width, height, depth } = enclosure;

  disposeGroup(enclosureGroup);
  enclosureGroup = new THREE.Group();

  // Коробка рисуется изнутри (BackSide): передняя стенка не мешает смотреть,
  // а пол, потолок, бока и задняя стена видны полупрозрачными.
  const box = new THREE.BoxGeometry(width, height, depth);
  const walls = new THREE.Mesh(box, new THREE.MeshBasicMaterial({
    color: WALL_COLOR,
    transparent: true,
    opacity: WALL_OPACITY,
    side: THREE.BackSide,
    depthWrite: false,
  }));
  enclosureGroup.add(walls);

  // Рёбра габарита — чтобы объём читался даже при взгляде сбоку.
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(box),
    new THREE.LineBasicMaterial({ color: EDGE_COLOR })
  );
  enclosureGroup.add(edges);

  // Модель считает от левого нижнего заднего угла, а BoxGeometry строится от центра —
  // сдвигаем группу, чтобы координаты деталей потом ложились без пересчёта.
  enclosureGroup.position.set(width / 2, height / 2, depth / 2);

  scene.add(enclosureGroup);
}

/**
 * Нарисовать детали по разложенному дереву. Координаты и размеры приходят готовыми
 * из модели — сцена ничего не вычисляет сама, иначе расчёт расползётся по двум местам.
 *
 * Глубина пока общая на всё изделие: по ТЗ 3.2 у внешних деталей она на 90 мм больше,
 * но внешние детали появятся вместе с дверями.
 */
export function drawParts(items, enclosure, lookupMaterial) {
  disposeGroup(partsGroup);
  partsGroup = new THREE.Group();

  const { depth } = enclosure;

  for (const item of items) {
    if (item.type !== 'part') continue;

    // Цвет берём из каталога; нет материала или цвета — красим нейтральной ЛДСП.
    const mat = lookupMaterial ? lookupMaterial(item.material) : null;
    const color = mat && mat.rgb ? new THREE.Color(mat.rgb) : new THREE.Color(PART_COLOR);

    const geometry = new THREE.BoxGeometry(item.w, item.h, depth);
    const surface = new THREE.MeshLambertMaterial({ color });
    if (mat && mat.transparent) {
      surface.transparent = true;
      surface.opacity = 0.45;
    }
    const mesh = new THREE.Mesh(geometry, surface);
    mesh.add(new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry),
      new THREE.LineBasicMaterial({ color: PART_EDGE_COLOR })
    ));


    // Модель даёт левый нижний угол детали, BoxGeometry строится от центра.
    mesh.position.set(item.x + item.w / 2, item.y + item.h / 2, depth / 2);
    mesh.userData.partId = item.id;      // пригодится для выделения мышью
    partsGroup.add(mesh);
  }

  scene.add(partsGroup);
}

/**
 * Подсветить места, куда выбранная деталь может встать (ТЗ 4.1 п.2).
 * Зоны не перекрываются — это свободные просветы, поэтому клик по ним однозначен.
 */
export function drawZones(zones, enclosure, hoveredId, chosenId) {
  disposeGroup(zonesGroup);
  zonesGroup = new THREE.Group();

  const { depth } = enclosure;

  for (const zone of zones) {
    const chosen = zone.id === chosenId;
    const hovered = zone.id === hoveredId;

    const geometry = new THREE.BoxGeometry(zone.w, zone.h, depth);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
      color: chosen ? ZONE_CHOSEN_COLOR : ZONE_COLOR,
      transparent: true,
      opacity: chosen ? ZONE_CHOSEN_OPACITY : hovered ? ZONE_HOVER_OPACITY : ZONE_OPACITY,
      // Без записи в буфер глубины: зоны полупрозрачные и не должны заслонять детали.
      depthWrite: false,
    }));

    if (chosen || hovered) {
      mesh.add(new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry),
        new THREE.LineBasicMaterial({ color: ZONE_CHOSEN_COLOR })
      ));
    }

    mesh.position.set(zone.x + zone.w / 2, zone.y + zone.h / 2, depth / 2);
    mesh.userData.regionId = zone.id;
    zonesGroup.add(mesh);
  }

  scene.add(zonesGroup);
}

// ── Выбор мышью ─────────────────────────────────────────────────────────────

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let picking = null;
let pressedAt = null;

/**
 * Клики по зонам. Вращение сцены тоже начинается с нажатия, поэтому кликом считаем
 * только то нажатие, после которого мышь почти не сдвинулась — иначе поворот камеры
 * каждый раз что-нибудь ставил бы.
 */
export function initPicking(handlers) {
  picking = handlers;
  const el = renderer.domElement;

  el.addEventListener('pointermove', e => picking.onHover(regionAt(e)));
  el.addEventListener('pointerleave', () => picking.onHover(null));
  el.addEventListener('pointerdown', e => { pressedAt = { x: e.clientX, y: e.clientY }; });

  el.addEventListener('pointerup', e => {
    if (!pressedAt) return;
    const moved = Math.hypot(e.clientX - pressedAt.x, e.clientY - pressedAt.y);
    pressedAt = null;
    if (moved < 5) picking.onPick(regionAt(e));
  });
}

function regionAt(event) {
  if (!zonesGroup || !zonesGroup.children.length) return null;

  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  // Матрицы обычно обновляет отрисовка, но клик может случиться и до первого кадра —
  // тогда луч считался бы по устаревшим матрицам и промахивался.
  camera.updateMatrixWorld();
  zonesGroup.updateMatrixWorld(true);

  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(zonesGroup.children, false);
  return hits.length ? hits[0].object.userData.regionId : null;
}

/** Поставить камеру так, чтобы застройка целиком попала в кадр. */
export function frameEnclosure(enclosure) {
  const { width, height, depth } = enclosure;
  const center = new THREE.Vector3(width / 2, height / 2, depth / 2);
  const distance = Math.max(width, height) * 1.4 + depth;

  camera.position.set(center.x, center.y, center.z + distance);
  controls.target.copy(center);
  controls.update();
}

function resize() {
  const w = container.clientWidth;
  const h = container.clientHeight;
  if (!w || !h) return;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  // Плотность пикселей задаём здесь, а не при создании: она меняется при переносе окна
  // на монитор с другим масштабом, и тогда приходит как раз изменение размера.
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(w, h);
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
