// 3D-сцена: камера, вращение, отрисовка застройки. Читает модель, но не меняет её.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

let renderer, scene, camera, controls;
let enclosureGroup;          // всё, что рисует границы застройки — сносится и строится заново
let container;

/** Полупрозрачные границы: пол, потолок, боковые и задняя стена. Без текстур (см. ТЗ, раздел 8). */
const WALL_COLOR = 0xb9c0c8;
const WALL_OPACITY = 0.3;
const EDGE_COLOR = 0x51606e;

export function initScene(el) {
  container = el;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf2f4f6);

  camera = new THREE.PerspectiveCamera(45, 1, 10, 50000);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  scene.add(new THREE.AmbientLight(0xffffff, 0.75));
  const sun = new THREE.DirectionalLight(0xffffff, 0.6);
  sun.position.set(1, 2, 3);
  scene.add(sun);

  window.addEventListener('resize', resize);
  resize();
  animate();
}

/** Перестроить границы застройки под текущие размеры. */
export function drawEnclosure(enclosure) {
  const { width, height, depth } = enclosure;

  if (enclosureGroup) {
    scene.remove(enclosureGroup);
    enclosureGroup.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
  }

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
  renderer.setSize(w, h);
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
