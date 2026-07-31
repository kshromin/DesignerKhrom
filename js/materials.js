// Каталог материалов: загрузка и поиск. Данные лежат в data/, а не в коде —
// каталог у каждого дилера свой и обновляется отдельно от программы (ТЗ, раздел 6).

/** Каталог дилера кладётся рядом и подменяет стартовый. Он в .gitignore: цены — не наше дело. */
const SOURCES = ['data/materials.local.json', 'data/materials.json'];

let catalog = null;
const byId = new Map();

/** Загрузить каталог. Пока не загружен, спрашивать материалы бессмысленно. */
export async function loadMaterials() {
  let lastError = null;

  for (const url of SOURCES) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) continue;               // локального файла обычно нет — это норма
      catalog = await res.json();
      break;
    } catch (e) {
      lastError = e;                       // сеть или битый JSON — пробуем следующий
    }
  }

  if (!catalog) throw new Error(`Каталог материалов не загрузился: ${lastError || 'файлы не найдены'}`);

  byId.clear();
  for (const group of catalog.groups) {
    for (const item of group.items) byId.set(item.id, { ...item, group: group.name, unit: group.unit });
  }
  return catalog;
}

export const groups = () => catalog.groups;
export const edge = () => catalog.edge;
export const material = id => byId.get(id) || null;

/** Материал по умолчанию — первый в каталоге. Осмысленнее, чем пусто на старте. */
export const firstMaterialId = () => catalog.groups[0].items[0].id;
