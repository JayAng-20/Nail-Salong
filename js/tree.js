// 資料樹：驗證、攤平、合併（建置清單 + 即時清單 → 同一套渲染邏輯）
import { daysSince } from './util.js';

export const SCHEMA_VERSION = 1;

export function emptyTree(source = 'none') {
  return { schemaVersion: SCHEMA_VERSION, source, generatedAt: null, categories: [], hero: [], warnings: [], stats: { categories: 0, albums: 0, photos: 0 } };
}

/** 檢查資料形狀；不合格回傳 null（呼叫端安靜降級） */
export function normalizeTree(raw, source, { uncategorizedName = null } = {}) {
  if (!raw || typeof raw !== 'object' || raw.ok === false) return null;
  if (raw.schemaVersion !== SCHEMA_VERSION || !Array.isArray(raw.categories)) return null;
  const tree = {
    schemaVersion: SCHEMA_VERSION,
    source: source || raw.source || 'unknown',
    generatedAt: raw.generatedAt || null,
    builtAt: raw.builtAt || null,
    categories: [],
    hero: Array.isArray(raw.hero) ? raw.hero.filter(validPhoto).map((p) => ({ ...p })) : [],
    warnings: Array.isArray(raw.warnings) ? raw.warnings : [],
    stats: { categories: 0, albums: 0, photos: 0 },
  };
  for (const c of raw.categories) {
    if (!c || typeof c.id !== 'string' || !Array.isArray(c.albums)) continue;
    const cat = { id: c.id, name: String(c.name || ''), subtitle: String(c.subtitle || ''), order: c.order ?? null, coverPhotoId: c.coverPhotoId || null, albums: [] };
    for (const a of c.albums) {
      if (!a || typeof a.id !== 'string' || !Array.isArray(a.photos)) continue;
      const photos = a.photos.filter(validPhoto).map((p) => ({ ...p }));
      if (!photos.length) continue;
      let name = String(a.name || '');
      if (a.implicit && uncategorizedName && name === '未分類') name = uncategorizedName; // 程式自動產生的隱含相簿，只改顯示名稱
      cat.albums.push({ id: a.id, name, subtitle: String(a.subtitle || ''), order: a.order ?? null, implicit: !!a.implicit, coverPhotoId: a.coverPhotoId || photos[0].id, photos });
    }
    if (!cat.albums.length) continue;
    if (!cat.coverPhotoId) cat.coverPhotoId = cat.albums[0].coverPhotoId;
    tree.categories.push(cat);
  }
  tree.stats = countTree(tree);
  return tree;
}

function validPhoto(p) { return p && typeof p.id === 'string' && p.id.length > 5; }

export function countTree(tree) {
  const s = { categories: tree.categories.length, albums: 0, photos: 0 };
  for (const c of tree.categories) { s.albums += c.albums.length; for (const a of c.albums) s.photos += a.photos.length; }
  return s;
}

/** 攤平成照片列表，每張帶上類別／相簿資訊 */
export function flattenPhotos(tree, { catId = null, albumId = null } = {}) {
  const out = [];
  for (const c of tree.categories) {
    if (catId && c.id !== catId) continue;
    for (const a of c.albums) {
      if (albumId && a.id !== albumId) continue;
      for (const p of a.photos) out.push(decorate(p, c, a));
    }
  }
  return out;
}

export function decorate(p, c, a) {
  return { ...p, catId: c.id, catName: c.name, albumId: a.id, albumName: a.name, albumSubtitle: a.subtitle, albumImplicit: a.implicit };
}

export function photoAlt(p) { return `${p.catName || ''}・${p.albumName || ''} 作品`.trim(); }
export function photoCaption(p) { return `${p.catName || ''}・${p.albumName || ''}`; }
export function isNewPhoto(p, days) { return days > 0 && daysSince(p.createdTime) <= days; }

export function latestPhotos(tree, n, catId = null) {
  return flattenPhotos(tree, { catId }).sort((a, b) => String(b.createdTime || '').localeCompare(String(a.createdTime || ''))).slice(0, n);
}

export function findPhoto(tree, id) {
  for (const c of tree.categories) for (const a of c.albums) for (const p of a.photos) if (p.id === id) return decorate(p, c, a);
  for (const p of tree.hero) if (p.id === id) return { ...p, catName: '', albumName: '首頁主圖' };
  return null;
}

export function photoIndex(tree) {
  const map = new Map();
  for (const c of tree.categories) for (const a of c.albums) for (const p of a.photos) map.set(p.id, { p, c, a });
  for (const p of tree.hero) map.set(p.id, { p, c: null, a: null });
  return map;
}

/**
 * 合併：結構（類別／相簿／名稱／排序）以即時清單為準；圖片來源優先用已建置的本站路徑。
 * 回傳 { tree, added, removed }：added＝即時有而建置沒有；removed＝建置有而即時沒有。
 */
export function mergeTrees(built, live) {
  if (!built && !live) return { tree: emptyTree('none'), added: [], removed: [] };
  if (!live) return { tree: markSource(built, 'build'), added: [], removed: [] };
  if (!built) return { tree: markSource(live, 'live', true), added: allIds(live), removed: [] };

  const builtIdx = photoIndex(built);
  const liveIdx = photoIndex(live);
  const added = [], removed = [];
  const merged = {
    ...live, source: 'merged', builtAt: built.builtAt || null,
    categories: live.categories.map((c) => ({ ...c, albums: c.albums.map((a) => ({ ...a, photos: a.photos.map((p) => pick(p)) })) })),
    hero: live.hero.map((p) => pick(p)),
  };
  function pick(lp) {
    const hit = builtIdx.get(lp.id);
    if (hit && hit.p.local && (!lp.rev || !hit.p.rev || hit.p.rev === lp.rev)) {
      return { ...lp, local: hit.p.local, width: hit.p.width || lp.width, height: hit.p.height || lp.height, color: hit.p.color || null, live: false };
    }
    if (!hit) added.push(lp.id);
    return { ...lp, local: null, live: true };
  }
  for (const id of builtIdx.keys()) if (!liveIdx.has(id)) removed.push(id);
  merged.stats = countTree(merged);
  return { tree: merged, added, removed };
}

function markSource(tree, source, live = false) {
  const t = { ...tree, source, categories: tree.categories.map((c) => ({ ...c, albums: c.albums.map((a) => ({ ...a, photos: a.photos.map((p) => ({ ...p, live: live || !p.local })) })) })), hero: tree.hero.map((p) => ({ ...p, live: live || !p.local })) };
  t.stats = countTree(t);
  return t;
}

function allIds(tree) { return [...photoIndex(tree).keys()]; }
