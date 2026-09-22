// 展示順序只影響版位；原始相簿、照片 ID 與雲端資料不變。
export function featuredPhotos(photos, ids = [], limit = 12) {
  const byId = new Map(photos.map(p => [p.id, p]));
  const selected = [...new Set(ids)].map(id => byId.get(id)).filter(Boolean);
  return (selected.length ? selected : photos).slice(0, limit);
}

export function exhibitionOrder(photos, ids = []) {
  const selected = featuredPhotos(photos, ids, photos.length);
  const seen = new Set(selected.map(p => p.id));
  return [...selected, ...photos.filter(p => !seen.has(p.id))];
}

export function wrapDistance(index, active, length) {
  if (length < 2) return 0;
  return ((index - active + length / 2) % length + length) % length - length / 2;
}
