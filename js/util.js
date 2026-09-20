// 小工具：DOM 建立、防抖、時間格式、減少動態效果偵測
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** 建立元素：el('div', { class: 'x', 'data-id': 1, onclick: fn }, [child, 'text']) */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') { for (const [sk, sv] of Object.entries(v)) { if (sk.startsWith('--')) node.style.setProperty(sk, sv); else node.style[sk] = sv; } }
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of [].concat(children)) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

export function debounce(fn, ms = 150) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export const prefersReducedMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export const canHover = () => window.matchMedia && window.matchMedia('(hover: hover)').matches;

export function daysSince(iso) {
  const t = Date.parse(iso || ''); if (!t) return Infinity;
  return (Date.now() - t) / 86400000;
}

export function formatTime(iso) {
  const t = Date.parse(iso || ''); if (!t) return '—';
  return new Date(t).toLocaleString('zh-TW', { hour12: false, timeZone: 'Asia/Taipei' });
}

export function formatRelative(iso) {
  const t = Date.parse(iso || ''); if (!t) return '—';
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return `${s} 秒前`;
  if (s < 3600) return `${Math.round(s / 60)} 分鐘前`;
  if (s < 86400) return `${Math.round(s / 3600)} 小時前`;
  return `${Math.round(s / 86400)} 天前`;
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** 等兩個畫格（讓瀏覽器先套用初始樣式再轉場）；分頁在背景時 rAF 會暫停，所以加 setTimeout 保底 */
export function nextFrame() {
  return new Promise((resolve) => {
    let done = false; const finish = () => { if (!done) { done = true; resolve(); } };
    requestAnimationFrame(() => requestAnimationFrame(finish));
    setTimeout(finish, 150);
  });
}
export function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

/** 讀取／寫入網址查詢參數（作品集頁深層連結用） */
export function getParams() { return new URLSearchParams(location.search); }
export function setParams(obj, { replace = true } = {}) {
  const p = new URLSearchParams(location.search);
  for (const [k, v] of Object.entries(obj)) { if (v === null || v === undefined || v === '') p.delete(k); else p.set(k, v); }
  const qs = p.toString();
  const url = location.pathname + (qs ? '?' + qs : '') + location.hash;
  if (replace) history.replaceState(null, '', url); else history.pushState(null, '', url);
}
