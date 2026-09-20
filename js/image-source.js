// 圖片來源轉接：所有「給我某張照片某種尺寸的網址」都經過這裡
//   已建置 → 本站路徑（images/…webp）
//   即時   → 依 T1 實測排定的候選網址：lh3 直連（最快、無轉址）→ drive thumbnail（轉址到 lh3，換個入口再試一次）
//   剛上傳、縮圖還沒產生 → 有限次數的延遲重試；全部失敗 → 隱藏那一格，等穩定層重建後自然出現
//   即時圖片同時載入數量上限 4（降低被限流的機率）；單張逾時 12 秒就換下一個候選
//   T1 實測：lh3 的 429 是「依 Referer 來源」計算的配額（localhost 來源約半數被拒；無 Referer 時 100 張並行全部 200），
//   所以即時圖片一律 referrerpolicy="no-referrer"。
import { siteBase } from './config.js';

const SIZES = { thumb: { lh3: 'w640', drive: 'w640' }, large: { lh3: 's1920', drive: 'w1920' } };
const LIVE_CONCURRENCY = 4;
const LOAD_TIMEOUT_MS = 12000;
const FRESH_MINUTES = 15;                 // 上傳 15 分鐘內視為「剛上傳」，縮圖可能還沒好
const FRESH_RETRY_DELAYS = [4000, 10000, 25000];

const stats = { liveLoaded: 0, liveFailed: 0, fallbackUsed: 0, timeouts: 0, retried: 0 };
export function imageStats() { return { ...stats, pendingRetry: failed.size }; }
if (typeof window !== 'undefined') window.__imageStats = imageStats; // 除錯用：在主控台打 __imageStats()

// ---- 失敗登記簿：載入失敗的格子先藏起來，每次即時清單更新時再試一次（最多 MAX_RETRY 輪）----
//      典型情況：HEIC 剛上傳，Google 要幾分鐘才生成縮圖；等它好了格子就自己出現，不必重新整理
const MAX_RETRY = 12;
const failed = new Map(); // el → { retry: () => Promise<boolean>, count }
export function registerFailed(el, retry) {
  const prev = failed.get(el);
  failed.set(el, { retry, count: prev ? prev.count : 0 });
}
export function clearFailed(el) { failed.delete(el); }
/** 重新嘗試所有失敗的格子；回傳這一輪嘗試的數量 */
export async function retryFailed() {
  for (const el of [...failed.keys()]) if (!el.isConnected) failed.delete(el); // 已從畫面移除的不用管
  const entries = [...failed.entries()];
  let n = 0;
  for (const [el, rec] of entries) {
    if (rec.count >= MAX_RETRY) continue;
    rec.count++; n++; stats.retried++;
    el.classList.remove('is-failed');
    rec.retry().then((ok) => { if (ok) failed.delete(el); else el.classList.add('is-failed'); });
  }
  return n;
}

/** 即時來源候選網址（依序嘗試） */
export function liveCandidates(id, size = 'thumb') {
  const s = SIZES[size] || SIZES.thumb;
  return [
    `https://lh3.googleusercontent.com/d/${encodeURIComponent(id)}=${s.lh3}`,
    `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=${s.drive}`,
  ];
}

/** 某張照片某種尺寸的候選網址列表 */
export function candidates(photo, size = 'thumb') {
  if (photo && photo.local && photo.local[size]) return [siteBase() + photo.local[size]];
  return liveCandidates(photo.id, size);
}

export function isLocal(photo, size = 'thumb') { return !!(photo && photo.local && photo.local[size]); }

// ---- 即時圖片的併發限制 ----
let inFlight = 0; const queue = [];
function acquire() { return new Promise((resolve) => { if (inFlight < LIVE_CONCURRENCY) { inFlight++; resolve(); } else queue.push(resolve); }); }
function release() { inFlight = Math.max(0, inFlight - 1); const next = queue.shift(); if (next) { inFlight++; next(); } }

function isFresh(photo) {
  const t = Date.parse(photo?.createdTime || ''); if (!t) return false;
  return Date.now() - t < FRESH_MINUTES * 60000;
}

/** 試載一個網址，成功回傳 true、失敗／逾時回傳 false */
function tryUrl(img, url, timeoutMs) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok) => { if (done) return; done = true; clearTimeout(timer); img.removeEventListener('load', onLoad); img.removeEventListener('error', onError); resolve(ok); };
    const onLoad = () => finish(img.naturalWidth > 0);
    const onError = () => finish(false);
    const timer = setTimeout(() => { stats.timeouts++; finish(false); }, timeoutMs);
    img.addEventListener('load', onLoad); img.addEventListener('error', onError);
    img.src = url;
  });
}

/**
 * 把照片載進 <img>。已建置的直接設 src（交給瀏覽器 lazy loading）；即時的走候選＋重試＋併發限制。
 * 回傳 Promise<boolean>。
 */
export async function loadInto(img, photo, size = 'thumb') {
  const token = Symbol('load'); img.__loadToken = token;
  const list = candidates(photo, size);
  if (isLocal(photo, size)) {
    return new Promise((resolve) => {
      const ok = () => { img.classList.add('is-loaded'); resolve(true); };
      if (img.complete && img.naturalWidth > 0 && img.src.endsWith(list[0])) return ok();
      img.addEventListener('load', ok, { once: true });
      img.addEventListener('error', () => resolve(false), { once: true });
      img.src = list[0];
    });
  }
  img.removeAttribute('loading'); // 即時圖片由我們自己排程，不交給瀏覽器 lazy
  img.referrerPolicy = 'no-referrer'; // 不帶 Referer：避開 Google 依來源計算的配額（T1）
  const delays = isFresh(photo) ? FRESH_RETRY_DELAYS : [0];
  for (let attempt = 0; attempt < delays.length; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, delays[attempt]));
    if (img.__loadToken !== token || !img.isConnected) return false;
    for (let i = 0; i < list.length; i++) {
      await acquire();
      if (img.__loadToken !== token || !img.isConnected) { release(); return false; }
      const ok = await tryUrl(img, list[i], LOAD_TIMEOUT_MS);
      release();
      if (ok) { if (i > 0) stats.fallbackUsed++; stats.liveLoaded++; img.classList.add('is-loaded'); return true; }
    }
  }
  stats.liveFailed++;
  return false;
}

/** 預先載入（燈箱前後各一張用） */
export function prefetch(photo, size = 'large') {
  const list = candidates(photo, size);
  return new Promise((resolve) => {
    let i = 0; const img = new Image(); img.referrerPolicy = 'no-referrer';
    const next = () => { if (i >= list.length) return resolve(null); const url = list[i++]; img.onload = () => resolve(url); img.onerror = next; img.src = url; };
    next();
  });
}

/** 對每個候選網址做一次連線測試（狀態頁用） */
export async function probe(url, timeoutMs = 8000) {
  const t0 = performance.now();
  const ok = await new Promise((resolve) => { const img = new Image(); img.referrerPolicy = 'no-referrer'; const timer = setTimeout(() => resolve(false), timeoutMs); img.onload = () => { clearTimeout(timer); resolve(true); }; img.onerror = () => { clearTimeout(timer); resolve(false); }; img.src = url + (url.includes('?') ? '&' : '?') + '_probe=' + Date.now(); });
  return { url, ok, ms: Math.round(performance.now() - t0) };
}
