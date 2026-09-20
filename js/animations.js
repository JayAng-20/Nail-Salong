// 動畫：捲動進場（IntersectionObserver）、導覽列縮小、首屏進場；只動 transform／opacity；尊重減少動態效果
import { prefersReducedMotion } from './util.js';

export function initReveal(root = document) {
  const targets = root.querySelectorAll('.reveal, .reveal-stagger, .section-head');
  if (prefersReducedMotion() || !('IntersectionObserver' in window)) { targets.forEach((t) => t.classList.add('is-visible')); return; }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-visible'); io.unobserve(e.target); }
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  targets.forEach((t) => io.observe(t));
  return io;
}

export function observeReveal(node) {
  if (prefersReducedMotion() || !('IntersectionObserver' in window)) { node.classList.add('is-visible'); return; }
  const io = new IntersectionObserver((entries) => { for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-visible'); io.disconnect(); } }, { threshold: 0.1 });
  io.observe(node);
}

export function initHeader() {
  const header = document.querySelector('.site-header'); if (!header) return;
  let ticking = false;
  const update = () => { header.classList.toggle('is-scrolled', window.scrollY > 40); ticking = false; };
  window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
  update();
}

export function initHero() {
  const hero = document.querySelector('.hero'); if (!hero) return;
  const ready = () => hero.classList.add('is-ready');
  if (document.fonts && document.fonts.ready) Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 900))]).then(ready);
  else ready();
}
