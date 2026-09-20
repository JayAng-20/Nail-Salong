// 即時層：先用 gallery.json 立刻渲染，再向 Apps Script 取即時清單比對；前景每 45～60 秒重取，背景暫停
import { CONFIG, siteBase } from './config.js';
import { normalizeTree, mergeTrees } from './tree.js';

export class GalleryData extends EventTarget {
  constructor() {
    super();
    this.built = null; this.live = null; this.tree = null;
    this.builtStatus = { state: 'pending', ms: null, error: null, at: null };
    this.liveStatus = { state: 'pending', ms: null, error: null, at: null, generatedAt: null };
    this._timer = null; this._lastLiveAt = 0; this._busy = false;
  }

  get liveEnabled() { return isLiveUrl(CONFIG.appsScriptUrl); }

  async init() {
    const builtP = this.loadBuilt();
    const liveP = this.liveEnabled ? this.fetchLive() : Promise.resolve(null);
    this.built = await builtP;
    this._emit(); // 先用建置資料畫（若沒有就是空的，等即時）
    this.live = await liveP;
    this._emit();
    this.startPolling();
    return this.tree;
  }

  async loadBuilt() {
    const t0 = performance.now();
    try {
      const res = await fetch(siteBase() + 'data/gallery.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const tree = normalizeTree(await res.json(), 'build');
      if (!tree) throw new Error('格式不符');
      this.builtStatus = { state: 'ok', ms: Math.round(performance.now() - t0), error: null, at: new Date().toISOString() };
      return tree;
    } catch (err) {
      this.builtStatus = { state: 'missing', ms: Math.round(performance.now() - t0), error: String(err.message || err), at: new Date().toISOString() };
      return null;
    }
  }

  async fetchLive() {
    if (!this.liveEnabled) return null;
    const t0 = performance.now();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), CONFIG.liveTimeoutMs);
    try {
      const url = CONFIG.appsScriptUrl + '?action=list&_=' + Date.now();
      const res = await fetch(url, { signal: ctrl.signal, redirect: 'follow', cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const raw = await res.json();
      const tree = normalizeTree(raw, 'live');
      if (!tree) throw new Error(raw && raw.error ? String(raw.error) : '格式不符');
      this.liveStatus = { state: 'ok', ms: Math.round(performance.now() - t0), error: null, at: new Date().toISOString(), generatedAt: tree.generatedAt, cached: !!raw.cached };
      this._lastLiveAt = Date.now();
      return tree;
    } catch (err) {
      const aborted = err && err.name === 'AbortError';
      this.liveStatus = { state: aborted ? 'timeout' : 'error', ms: Math.round(performance.now() - t0), error: aborted ? `逾時（${CONFIG.liveTimeoutMs} ms）` : String(err.message || err), at: new Date().toISOString(), generatedAt: null };
      return null; // 安靜降級：只用 gallery.json
    } finally { clearTimeout(timer); }
  }

  async refresh() {
    if (this._busy || !this.liveEnabled) return;
    this._busy = true;
    try {
      const live = await this.fetchLive();
      if (live) { this.live = live; this._emit(); }
      else this.dispatchEvent(new CustomEvent('status'));
    } finally { this._busy = false; }
  }

  startPolling() {
    if (!this.liveEnabled) return;
    const interval = CONFIG.liveRefreshSeconds * 1000;
    const tick = () => { if (document.visibilityState === 'visible') this.refresh(); };
    clearInterval(this._timer);
    this._timer = setInterval(tick, interval);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && Date.now() - this._lastLiveAt > interval) this.refresh();
    });
  }

  _emit() {
    const prev = this.tree;
    const { tree, added, removed } = mergeTrees(this.built, this.live);
    this.tree = tree;
    const prevIds = prev ? new Set(allPhotoIds(prev)) : null;
    const nowIds = new Set(allPhotoIds(tree));
    const appeared = prevIds ? [...nowIds].filter((id) => !prevIds.has(id)) : [];
    const vanished = prevIds ? [...prevIds].filter((id) => !nowIds.has(id)) : [];
    this.dispatchEvent(new CustomEvent('update', { detail: { tree, added, removed, appeared, vanished, first: !prev } }));
  }
}

/** 正式：Apps Script 網頁應用程式網址；本機開發：localhost 的假 API */
export function isLiveUrl(url) {
  const u = String(url || '');
  return /^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(u) || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(u);
}

export function allPhotoIds(tree) {
  const ids = [];
  for (const c of tree.categories) for (const a of c.albums) for (const p of a.photos) ids.push(p.id);
  return ids;
}
