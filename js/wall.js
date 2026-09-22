// 作品牆控制器：差異更新（舊圖淡出、重排、新圖淡入）、齊行排版、載入後補排、開燈箱
import { debounce, prefersReducedMotion, nextFrame } from './util.js';
import { CONFIG } from './config.js';
import { renderWorkTile, startTileLoad } from './render.js';
import { applyLayout, isMobileGrid } from './justified.js';
import { isNewPhoto } from './tree.js';

/**
 * 這面牆哪些照片要標 NEW：
 *   1. 上傳未滿 newBadgeDays（預設 3）天
 *   2. newBadgeMajorityLimit > 0 且符合條件者超過半數時，只標最新的 N 張（預設 0＝關閉）
 *   3. 本次瀏覽期間由即時層滑入的新作品一律標示
 */
export function pickNewIds(photos, appeared = []) {
  const fresh = photos.filter((p) => isNewPhoto(p, CONFIG.newBadgeDays));
  let ids = fresh.map((p) => p.id);
  const limit = CONFIG.newBadgeMajorityLimit;
  if (limit > 0 && photos.length && fresh.length > photos.length / 2) {
    ids = fresh.slice().sort((a, b) => String(b.createdTime || '').localeCompare(String(a.createdTime || ''))).slice(0, limit).map((p) => p.id);
  }
  return new Set(ids.concat(appeared));
}

export class Wall {
  constructor(container, { onOpen, targetHeight = null, trailing = null, eager = true } = {}) {
    this.container = container; this.onOpen = onOpen; this.targetHeight = targetHeight;
    this.eager = eager;
    this.trailing = trailing; // { el, ratio } 例如「探索更多作品」
    this.items = []; this._first = true; this._appeared = new Set(); // 本次瀏覽期間滑入的新作品（永遠標 NEW）
    this._relayout = debounce(() => this.relayout(), 120);
    window.addEventListener('resize', this._relayout);
    if ('ResizeObserver' in window) { this._ro = new ResizeObserver(() => this._relayout()); this._ro.observe(container); }
  }

  get photos() { return this.items.filter((i) => !i.el.classList.contains('is-failed') && !i.el.classList.contains('is-overflow')).map((i) => i.photo); }

  /** 設定照片列表；appeared 為這次「即時新出現」的 id（滑入＋NEW） */
  async setPhotos(photos, { appeared = [] } = {}) {
    const version = this._version = (this._version || 0) + 1;
    const reduce = prefersReducedMotion();
    const nextIds = photos.map((p) => p.id);
    const curMap = new Map(this.items.map((i) => [i.photo.id, i]));
    const nextSet = new Set(nextIds);

    // 1) 舊圖淡出
    const leaving = this.items.filter((i) => !nextSet.has(i.photo.id));
    if (leaving.length) {
      leaving.forEach((i) => i.el.classList.add('is-leaving'));
      // 固定格線立即移除舊格，手機篩選時不留下整片淡出的空洞。
      if (!reduce && !this.container.classList.contains('wall-editorial')) await new Promise((r) => setTimeout(r, 320));
      if (version !== this._version) return;
      leaving.forEach((i) => { i.loadObserver?.disconnect(); i.el.remove(); });
    }

    // 2) 依新順序重排，新圖插入；NEW 依牆面規則決定
    appeared.forEach((id) => this._appeared.add(id));
    const appearedSet = new Set(appeared);
    const newIds = pickNewIds(photos, [...this._appeared]);
    const items = [];
    for (const p of photos) {
      let it = curMap.get(p.id);
      if (it) {
        it.el.classList.remove('is-leaving');
        // 圖片來源從即時換成本站（重建完成）時，換掉 img 的來源
        if (it.photo.local !== p.local && p.local) { it.photo = p; startTileLoad(it, (kind) => this._onTile(kind, it)); }
        else it.photo = p;
        const badge = it.el.querySelector('.badge-new');
        if (newIds.has(p.id) && !badge) it.el.insertBefore(Object.assign(document.createElement('span'), { className: 'badge-new', textContent: 'NEW' }), it.el.querySelector('figcaption'));
        if (!newIds.has(p.id) && badge) badge.remove();
      } else {
        it = renderWorkTile(p, { onOpen: (item) => this._open(item), showNew: newIds.has(p.id), priority: this.eager && this._first && items.length < 4 });
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
    if (version !== this._version) return;
    items.forEach((i) => { if (i.fresh) { i.el.classList.remove('is-entering'); i.fresh = false; startTileLoad(i, (kind) => this._onTile(kind, i)); } });
    this._first = false;
  }

  _onTile(kind, item) { if (kind === 'ratio' || kind === 'failed' || kind === 'loaded') this._relayout(); }

  relayout() {
    const list = this.items.filter((i) => !i.el.classList.contains('is-failed') && !i.el.classList.contains('is-leaving'));
    list.forEach((i) => i.el.classList.remove('is-overflow'));
    // 第二版採原生響應式格線，完整保留每張精選，不為尾格隱藏照片。
    if (this.container.classList.contains('wall-editorial')) {
      list.forEach(({ el }) => { el.style.width = ''; el.style.height = ''; });
      return;
    }
    if (this.trailing && isMobileGrid(this.container)) {
      // 手機兩欄格線：照片＋尾格湊成偶數，尾格才不會落單
      if ((list.length + 1) % 2 === 1 && list.length > 1) list[list.length - 1].el.classList.add('is-overflow');
      applyLayout(this.container, list, this.trailing, { targetHeight: this.targetHeight || undefined });
      return;
    }
    applyLayout(this.container, list, this.trailing, { targetHeight: this.targetHeight || undefined });
  }

  _open(item) {
    const photos = this.photos;
    const index = photos.findIndex((p) => p.id === item.photo.id);
    if (index >= 0 && this.onOpen) this.onOpen(photos, index, item.el);
  }

  destroy() { window.removeEventListener('resize', this._relayout); this._ro?.disconnect(); }
}
