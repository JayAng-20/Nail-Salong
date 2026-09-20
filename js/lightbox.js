// 燈箱：<dialog> 正確語意、焦點留在內部、Esc 關閉、鍵盤左右、手機滑動跟手、
//       由縮圖位置放大展開／縮回、預先載入前後各一張、只有「分享」按鈕
import { el, prefersReducedMotion, nextFrame } from './util.js';
import { ICONS } from './icons.js';
import { candidates, prefetch, isLocal } from './image-source.js';
import { photoAlt, photoCaption } from './tree.js';

export class Lightbox {
  constructor({ linkFor } = {}) {
    this.linkFor = linkFor || ((p) => location.href);
    this.photos = []; this.index = -1; this.isOpen = false; this.originEl = null; this.onChange = null;
    this._build();
  }

  _build() {
    const d = this.dialog = el('dialog', { class: 'lightbox', 'aria-label': '作品大圖' });
    d.innerHTML = `
      <div class="lb-backdrop"></div>
      <div class="lb-top">
        <div class="lb-title"><span class="lb-cap"></span><span class="lb-counter"></span></div>
        <button type="button" class="lb-btn lb-close" aria-label="關閉">${ICONS.close}</button>
      </div>
      <div class="lb-stage"><div class="lb-track"></div></div>
      <button type="button" class="lb-btn lb-nav prev" aria-label="上一張">${ICONS.chevronLeft}</button>
      <button type="button" class="lb-btn lb-nav next" aria-label="下一張">${ICONS.chevronRight}</button>
      <div class="lb-loading" aria-hidden="true"></div>
      <div class="lb-bottom"><button type="button" class="lb-share">${ICONS.share}<span>分享</span></button></div>
      <div class="lb-toast" role="status" aria-live="polite"></div>`;
    document.body.append(d);
    this.track = d.querySelector('.lb-track'); this.stage = d.querySelector('.lb-stage');
    this.cap = d.querySelector('.lb-cap'); this.counter = d.querySelector('.lb-counter');
    this.loading = d.querySelector('.lb-loading'); this.toast = d.querySelector('.lb-toast');
    this.btnPrev = d.querySelector('.lb-nav.prev'); this.btnNext = d.querySelector('.lb-nav.next');
    d.querySelector('.lb-close').addEventListener('click', () => this.close());
    d.querySelector('.lb-share').addEventListener('click', () => this.share());
    this.btnPrev.addEventListener('click', () => this.go(-1));
    this.btnNext.addEventListener('click', () => this.go(1));
    d.addEventListener('cancel', (e) => { e.preventDefault(); this.close(); });
    d.addEventListener('click', (e) => { if (e.target === d || e.target.classList.contains('lb-backdrop') || e.target.classList.contains('lb-slide')) this.close(); });
    d.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); this.go(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); this.go(1); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.close(); }
    });
    // 瀏覽器自行關閉（例如連按兩次 Esc 的原生行為）時同步狀態
    d.addEventListener('close', () => { if (this.isOpen) { this.isOpen = false; document.body.classList.remove('is-locked'); this.track.innerHTML = ''; this.onChange && this.onChange(null, 'close'); } });
    this._initSwipe();
  }

  /** 開啟：photos 為目前篩選範圍的照片陣列 */
  open(photos, index, originEl = null) {
    this.photos = photos; this.index = index; this.originEl = originEl;
    this.isOpen = true;
    document.body.classList.add('is-locked');
    this.dialog.classList.remove('is-shown');
    if (!this.dialog.open) this.dialog.showModal();
    this._renderSlides({ animateFrom: originEl });
    requestAnimationFrame(() => this.dialog.classList.add('is-shown'));
    this.dialog.querySelector('.lb-close').focus({ preventScroll: true });
    this.onChange && this.onChange(this.current, 'open');
  }

  get current() { return this.photos[this.index]; }

  async close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    const photo = this.current;
    const img = this.track.querySelector('.lb-slide.cur .lb-img');
    const target = photo && document.querySelector(`.work[data-id="${CSS.escape(photo.id)}"]`);
    this.dialog.classList.remove('is-shown');
    if (img && target && !prefersReducedMotion() && inViewport(target)) {
      img.style.transition = 'transform 0.45s cubic-bezier(0.22,0.61,0.36,1), opacity 0.4s';
      img.style.transform = flipTransform(target.getBoundingClientRect(), img.getBoundingClientRect());
      img.style.opacity = '0';
      await new Promise((r) => setTimeout(r, 420));
    } else {
      await new Promise((r) => setTimeout(r, prefersReducedMotion() ? 0 : 300));
    }
    this.dialog.close();
    document.body.classList.remove('is-locked');
    this.track.innerHTML = '';
    const back = this.originEl || target; this.originEl = null;
    if (back && back.isConnected) back.focus({ preventScroll: true });
    this.onChange && this.onChange(null, 'close');
  }

  go(dir) {
    if (!this.isOpen || this.photos.length < 2) return;
    const next = (this.index + dir + this.photos.length) % this.photos.length;
    this._slideTo(next, dir);
  }

  /** 外部更新照片列表（即時層刪除／新增時），保持目前照片 */
  updatePhotos(photos) {
    if (!this.isOpen) { this.photos = photos; return; }
    const cur = this.current;
    const i = photos.findIndex((p) => p.id === cur?.id);
    this.photos = photos;
    if (i < 0) { this.close(); return; }
    this.index = i; this._renderSlides({});
  }

  _renderSlides({ animateFrom = null }) {
    this.track.classList.add('is-dragging'); // 無轉場重置位置
    this.track.style.transform = 'translateX(0)';
    this.track.innerHTML = '';
    const n = this.photos.length;
    const idx = [this.index - 1, this.index, this.index + 1];
    idx.forEach((i, k) => {
      const pos = ['prev', 'cur', 'next'][k];
      if (n < 2 && k !== 1) return;
      const photo = this.photos[(i + n) % n];
      this.track.append(this._slide(photo, pos, pos === 'cur' ? animateFrom : null));
    });
    void this.track.offsetWidth;
    this.track.classList.remove('is-dragging');
    this._updateChrome();
    // 預先載入前後各一張
    if (n > 1) { prefetch(this.photos[(this.index + 1) % n]); prefetch(this.photos[(this.index - 1 + n) % n]); }
  }

  _slide(photo, pos, animateFrom) {
    const slide = el('div', { class: 'lb-slide ' + pos, style: { position: 'absolute', inset: '0', display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `translateX(${pos === 'prev' ? '-100%' : pos === 'next' ? '100%' : '0'})` } });
    const img = el('img', { class: 'lb-img', alt: photoAlt(photo), draggable: 'false', referrerpolicy: 'no-referrer' });
    slide.append(img);
    const ratio = photo.width && photo.height ? photo.width / photo.height : null;
    if (ratio) { const r = fitRect(ratio); img.style.width = r.w + 'px'; img.style.height = r.h + 'px'; }
    // 先放縮圖（多半已在快取，立即可見），再換成大圖
    const thumbUrl = candidates(photo, 'thumb')[0];
    const thumbEl = animateFrom && animateFrom.querySelector('img');
    const startSrc = (thumbEl && thumbEl.currentSrc && thumbEl.classList.contains('is-loaded')) ? thumbEl.currentSrc : thumbUrl;
    img.src = startSrc; img.classList.add('is-loaded');
    if (pos === 'cur') this.loading.classList.add('is-shown');
    prefetch(photo, 'large').then((url) => {
      if (!url || !img.isConnected) return;
      const tmp = new Image(); tmp.referrerPolicy = 'no-referrer'; tmp.onload = () => { img.src = url; if (pos === 'cur') this.loading.classList.remove('is-shown'); img.style.width = ''; img.style.height = ''; }; tmp.src = url;
    }).catch(() => {});
    if (animateFrom && !prefersReducedMotion()) {
      const from = animateFrom.getBoundingClientRect();
      const r = fitRect(ratio || (thumbEl && thumbEl.naturalWidth ? thumbEl.naturalWidth / thumbEl.naturalHeight : 0.75));
      const stage = this.stage.getBoundingClientRect();
      const to = { left: stage.left + (stage.width - r.w) / 2, top: stage.top + (stage.height - r.h) / 2, width: r.w, height: r.h };
      img.style.transition = 'none';
      img.style.transform = flipTransform(from, to);
      nextFrame().then(() => { img.style.transition = ''; img.style.transform = ''; });
    }
    return slide;
  }

  _slideTo(nextIndex, dir) {
    if (this._animating) return;
    this._animating = true;
    const done = () => {
      this.index = nextIndex;
      this._renderSlides({});
      this._animating = false;
      this.onChange && this.onChange(this.current, 'change');
    };
    if (prefersReducedMotion()) return done();
    this.track.classList.remove('is-dragging');
    this.track.style.transform = `translateX(${dir > 0 ? '-100%' : '100%'})`;
    const onEnd = () => { this.track.removeEventListener('transitionend', onEnd); clearTimeout(t); done(); };
    this.track.addEventListener('transitionend', onEnd);
    const t = setTimeout(onEnd, 520);
  }

  _updateChrome() {
    const p = this.current; if (!p) return;
    this.cap.textContent = photoCaption(p);
    this.counter.textContent = `${this.index + 1} / ${this.photos.length}`;
    const multi = this.photos.length > 1;
    this.btnPrev.hidden = !multi; this.btnNext.hidden = !multi;
  }

  _initSwipe() {
    let startX = 0, startY = 0, dx = 0, active = false, horizontal = null, startT = 0;
    const stage = this.stage;
    stage.addEventListener('pointerdown', (e) => {
      if (this._animating || this.photos.length < 2) return;
      active = true; horizontal = null; startX = e.clientX; startY = e.clientY; dx = 0; startT = Date.now();
      stage.setPointerCapture(e.pointerId);
    });
    stage.addEventListener('pointermove', (e) => {
      if (!active) return;
      const mx = e.clientX - startX, my = e.clientY - startY;
      if (horizontal === null && (Math.abs(mx) > 6 || Math.abs(my) > 6)) horizontal = Math.abs(mx) > Math.abs(my);
      if (!horizontal) return;
      dx = mx;
      this.track.classList.add('is-dragging');
      this.track.style.transform = `translateX(${dx}px)`;
    });
    const end = (e) => {
      if (!active) return; active = false;
      if (!horizontal) return;
      this.track.classList.remove('is-dragging');
      const w = stage.clientWidth || 1;
      const velocity = Math.abs(dx) / Math.max(1, Date.now() - startT);
      if (Math.abs(dx) > w * 0.2 || velocity > 0.5) this.go(dx < 0 ? 1 : -1);
      else this.track.style.transform = 'translateX(0)';
      e.preventDefault?.();
    };
    stage.addEventListener('pointerup', end);
    stage.addEventListener('pointercancel', end);
    // 拖曳後不要觸發「點背景關閉」
    stage.addEventListener('click', (e) => { if (Math.abs(dx) > 8) { e.stopPropagation(); dx = 0; } }, true);
  }

  async share() {
    const p = this.current; if (!p) return;
    const url = this.linkFor(p);
    const title = `${photoCaption(p)}｜${document.title}`;
    if (navigator.share) {
      try { await navigator.share({ title, url }); return; } catch (err) { if (err && err.name === 'AbortError') return; }
    }
    try { await navigator.clipboard.writeText(url); this._toast('已複製連結'); }
    catch { this._toast(url); }
  }

  _toast(msg) {
    this.toast.textContent = msg; this.toast.classList.add('is-shown');
    clearTimeout(this._toastT); this._toastT = setTimeout(() => this.toast.classList.remove('is-shown'), 1800);
  }
}

function fitRect(ratio) {
  const mobile = window.innerWidth < 768;
  const maxW = mobile ? window.innerWidth : Math.min(window.innerWidth * 0.92, 1400);
  const maxH = window.innerHeight * (mobile ? 0.78 : 0.82);
  let w = maxW, h = w / ratio;
  if (h > maxH) { h = maxH; w = h * ratio; }
  return { w: Math.round(w), h: Math.round(h) };
}

function flipTransform(from, to) {
  const sx = from.width / Math.max(1, to.width);
  const dx = (from.left + from.width / 2) - (to.left + to.width / 2);
  const dy = (from.top + from.height / 2) - (to.top + to.height / 2);
  return `translate(${dx}px, ${dy}px) scale(${sx})`;
}

function inViewport(node) {
  const r = node.getBoundingClientRect();
  return r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth;
}
