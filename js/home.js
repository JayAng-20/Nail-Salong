// 首頁：主視覺、類別入口、風格分類、最新作品、服務價目、店家資訊、頁尾
import { $, el, prefersReducedMotion } from './util.js';
import { CONFIG } from './config.js';
import { initCommon, galleryLink } from './common.js';
import { initHero, observeReveal } from './animations.js';
import { GalleryData } from './data.js';
import { latestPhotos, findPhoto } from './tree.js';
import { renderCategoryCard, renderAlbumCard, renderPill, renderServices, renderSocialPills } from './render.js';
import { loadInto, retryFailed } from './image-source.js';
import { Wall } from './wall.js';
import { Lightbox } from './lightbox.js';
import { ICONS } from './icons.js';

initCommon();
initHero();
renderHeroText();
renderServices($('#service-grid'), $('#service-note'));
renderInfo();

const data = new GalleryData();
window.__galleryData = data; // 除錯用：__galleryData.refresh() 可立即重取即時清單
const lightbox = new Lightbox({ linkFor: (p) => galleryLink(p) });
let tree = null;
let albumTab = null;   // 風格分類目前的類別
let latestTab = null;  // 最新作品目前的篩選（null = 全部）
let heroTimer = null;

const wall = new Wall($('#latest-wall'), {
  onOpen: (photos, index, originEl) => lightbox.open(photos, index, originEl),
  trailing: moreTile(),
});

data.addEventListener('update', (e) => {
  tree = e.detail.tree;
  renderHeroImages(tree);
  renderCategories(tree);
  renderAlbums(tree);
  renderLatest(tree, e.detail.appeared);
  if (lightbox.isOpen) lightbox.updatePhotos(wall.photos);
  updateLiveHint();
  if (!e.detail.first) retryFailed(); // 每次即時更新順便重試載入失敗的圖（例如剛上傳、縮圖還沒好的 HEIC）
});
data.addEventListener('status', () => { updateLiveHint(); retryFailed(); });
data.init();

/* ---------- 主視覺 ---------- */
function renderHeroText() {
  const h = CONFIG.hero;
  const title = $('#hero-title'); title.innerHTML = '';
  (Array.isArray(h.titleLines) ? h.titleLines : [String(h.titleLines)]).forEach((line) => title.append(el('span', { class: 'line', text: line })));
  const scriptText = $('#hero-script-text');
  scriptText.textContent = h.scriptText || '';
  fitScriptText(scriptText);
  const badge = $('#hero-badge'); badge.innerHTML = '';
  (h.badgeLines || []).forEach((line) => badge.append(el('span', { text: line })));
  badge.append(el('span', { class: 'heart', text: '♡', 'aria-hidden': 'true' }));
}

/** 手寫字：字型載好後量測實際寬度，調整 viewBox 讓整句都在框內 */
function fitScriptText(text) {
  const svg = text.closest('svg');
  const fit = () => {
    try {
      const len = text.getComputedTextLength();
      const w = Math.max(200, Math.ceil(len) + 30);
      svg.setAttribute('viewBox', `0 0 ${w} 110`);
      text.setAttribute('x', String(w / 2));
      text.style.strokeDasharray = String(Math.ceil(len * 3));
      text.style.strokeDashoffset = String(Math.ceil(len * 3));
    } catch { /* 忽略 */ }
  };
  fit();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
  if (document.fonts && document.fonts.load) document.fonts.load('40px "Great Vibes"').then(fit).catch(() => {});
}

function renderHeroImages(t) {
  const frame = $('#hero-frame');
  const photos = t.hero.length ? t.hero : latestPhotos(t, 1);
  const ids = photos.map((p) => p.id).join(',');
  if (frame.dataset.ids === ids) return;
  frame.dataset.ids = ids;
  clearInterval(heroTimer);
  frame.querySelectorAll('img').forEach((i) => i.remove());
  if (!photos.length) return;
  const imgs = photos.slice(0, 6).map((p, i) => {
    const img = el('img', { alt: i === 0 ? `${CONFIG.shopName} 作品主圖` : '', 'aria-hidden': i === 0 ? null : 'true', fetchpriority: i === 0 ? 'high' : null, decoding: 'async' });
    frame.append(img);
    return { img, p };
  });
  loadInto(imgs[0].img, imgs[0].p, 'large').then((ok) => { if (ok) imgs[0].img.classList.add('is-active', 'is-first'); else { imgs[0].img.remove(); delete frame.dataset.ids; } });
  if (imgs.length > 1) {
    let cur = 0;
    imgs.slice(1).forEach(({ img, p }) => loadInto(img, p, 'large').then((ok) => { if (!ok) img.remove(); }));
    heroTimer = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      const next = (cur + 1) % imgs.length;
      if (!imgs[next].img.classList.contains('is-loaded')) return;
      imgs[cur].img.classList.remove('is-active', 'is-first');
      imgs[next].img.classList.add('is-active');
      cur = next;
    }, 6000);
  }
  // 桌機：主視覺隨滑鼠輕微位移（選配）
  if (window.matchMedia('(hover: hover) and (min-width: 901px)').matches && !prefersReducedMotion()) {
    const media = $('#hero-media');
    media.addEventListener('mousemove', (e) => {
      const r = media.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width - 0.5) * 10, y = ((e.clientY - r.top) / r.height - 0.5) * 10;
      frame.style.transform = `translate(${x}px, ${y}px)`;
    });
    media.addEventListener('mouseleave', () => { frame.style.transform = ''; });
    frame.style.transition = 'transform 0.8s cubic-bezier(0.22,0.61,0.36,1)';
  }
}

/* ---------- 類別入口 ---------- */
function renderCategories(t) {
  const section = $('#categories'), grid = $('#cat-grid');
  if (t.categories.length < 2) { section.hidden = true; return; }
  section.hidden = false;
  const key = t.categories.map((c) => c.id + ':' + c.coverPhotoId + ':' + countPhotos(c)).join('|');
  if (grid.dataset.key === key) return;
  grid.dataset.key = key; grid.innerHTML = '';
  for (const c of t.categories) grid.append(renderCategoryCard(c, findPhoto(t, c.coverPhotoId), countPhotos(c)));
  observeReveal(grid);
}
function countPhotos(c) { return c.albums.reduce((n, a) => n + a.photos.length, 0); }

/* ---------- 風格分類（相簿卡） ---------- */
function renderAlbums(t) {
  const section = $('#albums'), tabs = $('#album-tabs'), grid = $('#album-grid');
  if (!t.categories.length) { section.hidden = true; return; }
  section.hidden = false;
  if (!albumTab || !t.categories.some((c) => c.id === albumTab)) albumTab = t.categories[0].id;
  tabs.innerHTML = '';
  tabs.hidden = t.categories.length < 2;
  for (const c of t.categories) tabs.append(renderPill(c.name, { active: c.id === albumTab, onClick: () => { albumTab = c.id; renderAlbums(tree); } }));
  const cat = t.categories.find((c) => c.id === albumTab);
  const key = albumTab + '|' + cat.albums.map((a) => a.id + ':' + a.name + ':' + a.coverPhotoId + ':' + a.photos.length).join(',');
  if (grid.dataset.key === key) return;
  grid.dataset.key = key;
  grid.classList.remove('is-visible'); grid.innerHTML = '';
  for (const a of cat.albums) grid.append(renderAlbumCard(cat, a, findPhoto(t, a.coverPhotoId)));
  observeReveal(grid);
}

/* ---------- 最新作品 ---------- */
function renderLatest(t, appeared = []) {
  const pills = $('#latest-pills');
  pills.innerHTML = '';
  if (latestTab && !t.categories.some((c) => c.id === latestTab)) latestTab = null;
  pills.append(renderPill('全部', { active: latestTab === null, onClick: () => { latestTab = null; renderLatest(tree); } }));
  for (const c of t.categories) pills.append(renderPill(c.name, { active: latestTab === c.id, onClick: () => { latestTab = c.id; renderLatest(tree); } }));
  const photos = latestPhotos(t, CONFIG.latestCount, latestTab);
  $('#latest-empty').hidden = photos.length > 0;
  wall.setPhotos(photos, { appeared });
}

function moreTile() {
  const a = el('a', { class: 'work-more', href: 'gallery.html', 'aria-label': '探索更多作品' });
  a.innerHTML = `<h3>探索更多作品</h3><span class="en">See more</span><span class="arrow" aria-hidden="true">→</span>${ICONS.flower.replace('<svg ', '<svg class="deco" ')}`;
  return { el: a, ratio: 1 };
}

/* ---------- 店家資訊 ---------- */
function renderInfo() {
  const info = CONFIG.info;
  const addr = $('#info-address'); addr.textContent = info.address || '—';
  if (info.mapLink) addr.href = info.mapLink; else addr.removeAttribute('href');
  const phone = $('#info-phone'); phone.textContent = info.phoneDisplay || info.phone || '—';
  if (info.phone) phone.href = 'tel:' + String(info.phone).replace(/[^\d+]/g, ''); else phone.removeAttribute('href');
  const hours = $('#info-hours'); hours.innerHTML = '';
  (Array.isArray(info.hours) ? info.hours : [String(info.hours || '')]).filter(Boolean).forEach((h) => hours.append(el('li', { text: h })));
  if (info.hoursNote) hours.append(el('li', { class: 'muted', text: info.hoursNote }));
  renderSocialPills($('#info-social'));
  // 地圖：捲到附近才載入
  const wrap = $('#map-wrap');
  if (!info.mapEmbedUrl) { wrap.hidden = true; return; }
  const load = () => {
    if (wrap.dataset.loaded) return; wrap.dataset.loaded = '1';
    const iframe = el('iframe', { src: info.mapEmbedUrl, title: `${CONFIG.shopName} 的 Google 地圖位置`, loading: 'lazy', allowfullscreen: '', referrerpolicy: 'no-referrer-when-downgrade' });
    iframe.addEventListener('load', () => { iframe.classList.add('is-loaded'); wrap.querySelector('.map-hint')?.remove(); });
    wrap.append(iframe);
  };
  if ('IntersectionObserver' in window) { const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); load(); } }, { rootMargin: '500px 0px' }); io.observe(wrap); }
  else load();
}

function updateLiveHint() {
  const dot = $('#live-dot'); if (!dot) return;
  const on = data.liveStatus.state === 'ok';
  dot.classList.toggle('is-on', on);
  dot.title = on ? '即時清單連線正常' : (data.liveEnabled ? '目前只顯示已建置的作品' : '尚未設定即時清單');
}
