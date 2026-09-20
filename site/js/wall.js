// 作品牆控制器：差異更新（舊圖淡出、重排、新圖淡入）、齊行排版、載入後補排、開燈箱
import { debounce, prefersReducedMotion, nextFrame } from './util.js';
import { renderWorkTile, startTileLoad } from './render.js';
import { layoutJustified, isMobileGrid } from './justified.js';

export class Wall {
  constructor(container, { onOpen, targetHeight = null, trailing = null } = {}) {
    this.container = container; this.onOpen = onOpen; this.targetHeight = targetHeight;
    this.trailing = trailing; // { el, ratio } 例如「探索更多作品」
    this.items = []; this._first = true;
    this._relayout = debounce(() => this.relayout(), 120);
    window.addEventListener('resize', this._relayout);
    if ('ResizeObserver' in window) { this._ro = new ResizeObserver(() => this._relayout()); this._ro.observe(container); }
  }

  get photos() { return this.items.filter((i) => !i.el.classList.contains('is-failed') && !i.el.classList.contains('is-overflow')).map((i) => i.photo); }

  /** 設定照片列表；appeared 為這次「即時新出現」的 id（滑入＋NEW） */
  async setPhotos(photos, { appeared = [] } = {}) {
    const reduce = prefersReducedMotion();
    const nextIds = photos.map((p) => p.id);
    const curMap = new Map(this.items.map((i) => [i.photo.id, i]));
    const nextSet = new Set(nextIds);

    // 1) 舊圖淡出
    const leaving = this.items.filter((i) => !nextSet.has(i.photo.id));
    if (leaving.length) {
      leaving.forEach((i) => i.el.classList.add('is-leaving'));
      if (!reduce) await new Promise((r) => setTimeout(r, 320));
      leaving.forEach((i) => i.el.remove());
    }

    // 2) 依新順序重排，新圖插入
    const appearedSet = new Set(appeared);
    const items = [];
    for (const p of photos) {
      let it = curMap.get(p.id);
      if (it) {
        // 圖片來源從即時換成本站（重建完成）時，換掉 img 的來源
        if (it.photo.local !== p.local && p.local) { it.photo = p; startTileLoad(it, (kind) => this._onTile(kind, it)); }
        else it.photo = p;
      } else {
        it = renderWorkTile(p, { onOpen: (item) => this._open(item) });
        it.el.classList.add(appearedSet.has(p.id) ? 'is-new' : 'is-entering');
        it.fresh = true;
      }
      items.push(it);
    }
    this.items = items;
    const frag = document.createDocumentFragment();
    items.forEach((i) => frag.append(i.el));
    if (this.trailing) frag.append(this.trailing.el);
    this.container.append(frag);
    this.container.classList.toggle('is-empty', items.length === 0);
    this.relayout();
    await nextFrame();
    items.forEach((i) => { if (i.fresh) { i.el.classList.remove('is-entering'); i.fresh = false; startTileLoad(i, (kind) => this._onTile(kind, i)); } });
    this._first = false;
  }

  _onTile(kind, item) { if (kind === 'ratio' || kind === 'failed') this._relayout(); }

  relayout() {
    const list = this.items.filter((i) => !i.el.classList.contains('is-failed') && !i.el.classList.contains('is-leaving'));
    list.forEach((i) => i.el.classList.remove('is-overflow'));
    if (!this.trailing) { layoutJustified(this.container, list, { targetHeight: this.targetHeight || undefined }); return; }
    // 有「探索更多」尾格時：不讓它自己孤零零佔一列（最多藏起最後幾張照片來湊齊一列）
    let visible = list.slice();
    for (let guard = 0; guard < 8; guard++) {
      if (isMobileGrid(this.container)) {
        if ((visible.length + 1) % 2 === 1 && visible.length > 1) { visible.pop().el.classList.add('is-overflow'); }
        layoutJustified(this.container, [...visible, this.trailing]);
        break;
      }
      const rows = layoutJustified(this.container, [...visible, this.trailing], { targetHeight: this.targetHeight || undefined });
      const last = rows[rows.length - 1] || [];
      if (rows.length > 1 && last.length === 1 && last[0] === this.trailing && visible.length > 1) { visible.pop().el.classList.add('is-overflow'); continue; }
      break;
    }
  }

  _open(item) {
    const photos = this.photos;
    const index = photos.findIndex((p) => p.id === item.photo.id);
    if (index >= 0 && this.onOpen) this.onOpen(photos, index, item.el);
  }

  destroy() { window.removeEventListener('resize', this._relayout); this._ro?.disconnect(); }
}
