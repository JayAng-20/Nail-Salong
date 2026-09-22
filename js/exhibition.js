import { el } from './util.js';
import { loadInto, registerFailed, clearFailed, HERO_SIZES } from './image-source.js';
import { photoAlt } from './tree.js';
import { wrapDistance } from './curation.js';
import { motionEnabled } from './motion.js';

/** CSS 立體場景：實際透視、Z 軸深度、拖曳、鍵盤與按鈕共用同一個照片索引。 */
export class Exhibition {
  constructor(container, { onOpen, labels = {} } = {}) {
    this.container = container;
    this.onOpen = onOpen;
    this.labels = labels;
    this.photos = []; this.index = 0; this.cards = [];
    this.stage = container.querySelector('.scene-stage');
    this.deck = container.querySelector('.scene-deck');
    this.rail = container.querySelector('.scene-thumbs');
    this.caption = container.querySelector('[data-scene-caption]');
    this.counter = container.querySelector('[data-scene-counter]');
    this.prev = container.querySelector('[data-scene-prev]');
    this.next = container.querySelector('[data-scene-next]');
    this.prev.addEventListener('click', () => this.go(-1));
    this.next.addEventListener('click', () => this.go(1));
    this.stage.addEventListener('keydown', event => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault(); this.go(event.key === 'ArrowRight' ? 1 : -1);
      }
      if ((event.key === 'Enter' || event.key === ' ') && event.target === this.stage && this.photos.length) {
        event.preventDefault(); this.open();
      }
    });
    this._bindPointers();
    this.resize = new ResizeObserver(() => { this.position(); this.scrollThumb(false); });
    this.resize.observe(this.stage);
    document.addEventListener('motionchange', () => this.resetTilt());
    const visible = new IntersectionObserver(entries => {
      container.classList.toggle('is-in-view', entries.some(e => e.isIntersecting));
    });
    visible.observe(container);
    this.rail.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      if (event.key === 'Home') this.select(0);
      else if (event.key === 'End') this.select(this.photos.length - 1);
      else this.go(event.key === 'ArrowRight' ? 1 : -1);
      this.thumbs[this.index]?.focus({ preventScroll: true });
    });
  }

  setPhotos(photos) {
    const previous = this.photos[this.index]?.id;
    const signature = photos.map(p => `${p.id}:${p.rev}:${p.local?.thumb || ''}`).join('|');
    this.photos = photos;
    if (signature === this.signature) {
      this.cards.forEach((entry, i) => {
        entry.photo = photos[i];
        entry.img.alt = photoAlt(photos[i]);
        entry.card.setAttribute('aria-label', `${this.title(photos[i])}，查看作品`);
        entry.card.querySelector('.scene-card-foot span').textContent = this.title(photos[i]);
        this.thumbs[i]?.setAttribute('aria-label', `第 ${i + 1} 件：${this.title(photos[i])}`);
      });
      this.updateText(); return;
    }
    this.signature = signature;
    this.index = Math.max(0, photos.findIndex(p => p.id === previous));
    this.deck.replaceChildren();
    this.cards = photos.map((photo, index) => {
      const card = el('button', { class: 'scene-card', type: 'button', 'data-photo-id': photo.id, 'aria-label': `${this.title(photo)}，查看作品` });
      const art = el('span', { class: 'scene-art', style: { '--ph-color': photo.color || '#e8d9d2' } });
      if (photo.lqip) art.style.backgroundImage = `url("${photo.lqip}")`;
      const img = el('img', { alt: photoAlt(photo), draggable: 'false', decoding: 'async', sizes: HERO_SIZES });
      if (index === this.index) img.setAttribute('fetchpriority', 'high');
      art.append(img);
      card.append(art, el('span', { class: 'scene-card-foot' }, [el('span', { text: this.title(photo) }), el('span', { text: '↗', 'aria-hidden': 'true' })]));
      card.addEventListener('click', event => {
        if (performance.now() < (this.suppressClickUntil || 0)) { event.preventDefault(); return; }
        if (index === this.index) this.open();
        else this.select(index);
      });
      this.deck.append(card);
      return { card, img, photo, loaded: false };
    });
    this.container.classList.toggle('is-empty', !photos.length);
    this.prev.disabled = this.next.disabled = photos.length < 2;
    this.createThumbs();
    this.position(); this.updateText();
  }

  createThumbs() {
    this.thumbObserver?.disconnect();
    this.rail.replaceChildren();
    this.thumbObserver = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) {
        this.thumbObserver.unobserve(entry.target);
        const photo = this.photos[Number(entry.target.dataset.index)];
        if (photo) loadInto(entry.target.querySelector('img'), photo, 'thumb');
      }
    }, { root: this.rail, rootMargin: '0px 50px' });
    this.thumbs = this.photos.map((photo, index) => {
      const button = el('button', { class: 'scene-thumb', type: 'button', 'data-index': index, 'aria-label': `第 ${index + 1} 件：${this.title(photo)}` });
      const img = el('img', { alt: '', 'aria-hidden': 'true', sizes: '36px', width: 34, height: 46, decoding: 'async', draggable: 'false' });
      if (photo.lqip) img.src = photo.lqip;
      button.append(img);
      button.addEventListener('click', () => this.select(index));
      this.rail.append(button);
      this.thumbObserver.observe(button);
      return button;
    });
    this.rail.hidden = !this.photos.length;
  }

  scrollThumb(smooth = true) {
    const thumb = this.thumbs?.[this.index];
    if (!thumb || !this.rail.clientWidth) return;
    const left = thumb.offsetLeft - this.rail.clientWidth / 2 + thumb.offsetWidth / 2;
    this.rail.scrollTo({ left, behavior: smooth && motionEnabled() ? 'smooth' : 'auto' });
  }

  title(photo) { return this.labels[photo.id] || [photo.catName, photo.albumImplicit ? '' : photo.albumName].filter(Boolean).join('・') || '作品欣賞'; }

  position(offset = 0) {
    const width = this.stage.clientWidth;
    const step = Math.min(227, width * .32);
    this.cards.forEach(({ card, img, photo }, i) => {
      const distance = wrapDistance(i, this.index, this.cards.length) + offset;
      const depth = Math.abs(distance);
      const visible = depth < 1.65;
      const current = i === this.index;
      card.style.transform = `translate(-50%, -50%) translate3d(${distance * step}px, ${depth * 15 - 4}px, ${32 - depth * 160}px) rotateY(${-distance * 30 - 3}deg) rotateZ(${distance * 5 - 2}deg)`;
      card.style.opacity = visible ? (depth > 1.5 ? '.32' : '1') : '0';
      card.style.zIndex = String(10 - Math.round(depth * 2));
      card.style.visibility = visible ? 'visible' : 'hidden';
      card.style.pointerEvents = visible ? 'auto' : 'none';
      card.tabIndex = current ? 0 : -1;
      card.setAttribute('aria-current', String(current));
      card.setAttribute('aria-hidden', String(!visible));
      if (width && visible && !this.cards[i].loaded) {
        this.cards[i].loaded = true;
        const load = async () => {
          const ok = await loadInto(img, photo, 'hero');
          if (ok) { card.classList.remove('image-unavailable'); clearFailed(card); }
          else { card.classList.add('image-unavailable'); registerFailed(card, load); }
          return ok;
        };
        load();
      }
    });
  }

  updateText() {
    const photo = this.photos[this.index];
    this.caption.textContent = photo ? this.title(photo) : '作品準備中';
    this.counter.textContent = photo ? `${String(this.index + 1).padStart(2, '0')} / ${String(this.photos.length).padStart(2, '0')}` : '00 / 00';
    const progress = this.container.querySelector('.scene-progress span');
    if (progress) progress.style.transform = `scaleX(${this.photos.length ? (this.index + 1) / this.photos.length : 0})`;
    this.thumbs?.forEach((thumb, index) => {
      thumb.setAttribute('aria-current', String(index === this.index));
      thumb.tabIndex = index === this.index ? 0 : -1;
    });
    this.scrollThumb();
  }

  go(direction) {
    if (!this.photos.length) return;
    const focusWasCard = this.cards.some(({ card }) => card === document.activeElement);
    this.select(this.index + direction);
    if (focusWasCard) this.cards[this.index].card.focus({ preventScroll: true });
  }

  select(index) {
    if (!this.photos.length) return;
    this.index = (index % this.photos.length + this.photos.length) % this.photos.length;
    this.position(); this.updateText();
  }

  open() { if (this.photos.length) this.onOpen?.(this.photos, this.index, this.cards[this.index].card); }
  resetTilt() { this.deck.style.removeProperty('--view-x'); this.deck.style.removeProperty('--view-y'); }

  _bindPointers() {
    let gesture = null, frame = 0;
    this.stage.addEventListener('pointerdown', event => {
      if (!event.isPrimary || event.button !== 0 || !this.photos.length) return;
      gesture = { x: event.clientX, y: event.clientY, dx: 0, id: event.pointerId, started: performance.now(), dragging: false, vertical: false };
    });
    this.stage.addEventListener('pointermove', event => {
      if (gesture) {
        if (event.pointerId !== gesture.id) return;
        const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
        if (!gesture.dragging && !gesture.vertical && Math.max(Math.abs(dx), Math.abs(dy)) > 8) {
          gesture.vertical = Math.abs(dy) > Math.abs(dx);
          if (!gesture.vertical) { gesture.dragging = true; this.stage.setPointerCapture(event.pointerId); this.container.classList.add('is-dragging'); }
        }
        if (gesture.dragging) {
          gesture.dx = dx;
          this.position(Math.max(-1.2, Math.min(1.2, dx / Math.max(160, this.stage.clientWidth * .55))));
        }
        return;
      }
      if (event.pointerType !== 'mouse' || !motionEnabled()) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const r = this.stage.getBoundingClientRect();
        this.deck.style.setProperty('--view-x', `${-(event.clientY - r.top - r.height / 2) / r.height * 7}deg`);
        this.deck.style.setProperty('--view-y', `${(event.clientX - r.left - r.width / 2) / r.width * 9}deg`);
      });
    }, { passive: true });
    const finish = event => {
      if (!gesture || event.pointerId !== gesture.id) return;
      const g = gesture; gesture = null;
      this.container.classList.remove('is-dragging');
      if (g.dragging) {
        this.suppressClickUntil = performance.now() + 400;
        if (this.stage.hasPointerCapture(g.id)) this.stage.releasePointerCapture(g.id);
        const velocity = Math.abs(g.dx) / Math.max(1, performance.now() - g.started);
        if (event.type !== 'pointercancel' && (Math.abs(g.dx) > 40 || (Math.abs(g.dx) > 14 && velocity > .45))) this.go(g.dx < 0 ? 1 : -1);
        else this.position();
      }
    };
    this.stage.addEventListener('pointerup', finish);
    this.stage.addEventListener('pointercancel', finish);
    this.stage.addEventListener('pointerleave', event => {
      cancelAnimationFrame(frame); this.resetTilt();
      if (gesture && !gesture.dragging) gesture = null;
    });
    this.stage.addEventListener('dragstart', event => event.preventDefault());
  }
}
