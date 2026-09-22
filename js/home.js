// 首頁：立體精選、類別、作品選輯與原有店家資訊。
import { $, el } from './util.js';
import { CONFIG } from './config.js';
import { initCommon, galleryLink } from './common.js';
import { observeReveal } from './animations.js';
import { GalleryData } from './data.js';
import { latestPhotos, findPhoto } from './tree.js';
import { renderCategoryCard, renderAlbumCard, renderPill, renderServices, renderSocialPills } from './render.js';
import { retryFailed } from './image-source.js';
import { Wall } from './wall.js';
import { Lightbox } from './lightbox.js';
import { Exhibition } from './exhibition.js';
import { featuredPhotos } from './curation.js';
import { ICONS } from './icons.js';

initCommon();
const title = $('#hero-title'); title.replaceChildren();
CONFIG.hero.titleLines.forEach(line => title.append(el('span', { class: 'line', text: line })));
renderServices($('#service-panel'), $('#service-note'), $('#service-tabs'));
renderInfo();

const data = new GalleryData();
window.__galleryData = data;
const lightbox = new Lightbox({ linkFor: p => galleryLink(p) });
let tree = null, albumTab = null, latestTab = null, lightboxSource = 'wall';
const exhibition = new Exhibition($('#hero-exhibition'), {
  labels: CONFIG.exhibition.labels,
  onOpen: (photos, index, origin) => { lightboxSource = 'hero'; lightbox.open(photos, index, origin); },
});
const wall = new Wall($('#latest-wall'), {
  eager: false,
  onOpen: (photos, index, origin) => { lightboxSource = 'wall'; lightbox.open(photos, index, origin); },
});

data.addEventListener('update', async event => {
  tree = event.detail.tree;
  // 首頁立體藝廊：_首頁主圖 資料夾優先；沒有就用精選；沒指定精選就用最新的作品（家人一上傳就會出現）
  const hero = tree.hero.length ? tree.hero : featuredPhotos(latestPhotos(tree, Infinity), CONFIG.exhibition.featuredPhotoIds, 6);
  exhibition.setPhotos(hero);
  renderCategories(tree);
  renderAlbums(tree);
  await renderLatest(tree, event.detail.appeared);
  if (lightbox.isOpen) lightbox.updatePhotos(lightboxSource === 'hero' ? exhibition.photos : wall.photos);
  updateLiveHint();
  if (!event.detail.first) retryFailed();
});
data.addEventListener('status', () => { updateLiveHint(); retryFailed(); });
data.init();

function renderCategories(t) {
  const section = $('#categories'), grid = $('#cat-grid');
  section.hidden = !t.categories.length;
  const key = t.categories.map(c => c.id + c.name + c.coverPhotoId + c.albums.map(a => a.photos.length).join()).join('|');
  if (grid.dataset.key === key) return;
  grid.dataset.key = key; grid.replaceChildren();
  t.categories.forEach((cat, index) => {
    const selected = findPhoto(t, CONFIG.exhibition.categoryCovers[cat.name]);
    const cover = selected?.catId === cat.id ? selected : findPhoto(t, cat.coverPhotoId);
    const card = renderCategoryCard(cat, cover, cat.albums.reduce((sum, a) => sum + a.photos.length, 0));
    card.setAttribute('data-tilt', '');
    card.append(el('span', { class: 'cat-index', text: 'COLLECTION / ' + String(index + 1).padStart(2, '0'), 'aria-hidden': 'true' }));
    grid.append(card);
  });
  observeReveal(grid);
}

function renderAlbums(t) {
  $('#albums').hidden = !t.categories.length;
  if (!t.categories.length) return;
  if (!t.categories.some(c => c.id === albumTab)) albumTab = t.categories[0].id;
  const tabs = $('#album-tabs'); tabs.replaceChildren(); tabs.hidden = t.categories.length < 2;
  for (const c of t.categories) tabs.append(renderPill(c.name, { active: c.id === albumTab, onClick: () => { albumTab = c.id; renderAlbums(tree); } }));
  const cat = t.categories.find(c => c.id === albumTab);
  const grid = $('#album-grid'); grid.replaceChildren();
  for (const album of cat.albums) grid.append(renderAlbumCard(cat, album));
  $('#album-empty').hidden = cat.albums.length > 0;
}

async function renderLatest(t, appeared = []) {
  const pills = $('#latest-pills'); pills.replaceChildren();
  if (latestTab && !t.categories.some(c => c.id === latestTab)) latestTab = null;
  pills.append(renderPill('全部精選', { active: latestTab === null, onClick: () => { latestTab = null; renderLatest(tree); } }));
  for (const c of t.categories) pills.append(renderPill(c.name, { active: latestTab === c.id, onClick: () => { latestTab = c.id; renderLatest(tree); } }));
  const available = latestPhotos(t, Infinity, latestTab);
  const photos = featuredPhotos(available, CONFIG.exhibition.featuredPhotoIds, CONFIG.latestCount);
  $('#latest-empty').hidden = photos.length > 0;
  $('#latest-wall').hidden = photos.length === 0;
  await wall.setPhotos(photos, { appeared });
}

/* ---------- 店家資訊 ---------- */
function renderInfo() {
  const info = CONFIG.info;
  const addr = $('#info-address'); addr.textContent = info.address || '—';
  if (info.mapLink) addr.href = info.mapLink; else addr.removeAttribute('href');
  const phone = $('#info-phone'); phone.textContent = info.phoneDisplay || info.phone || '—';
  if (info.phone) phone.href = 'tel:' + String(info.phone).replace(/[^\d+]/g, ''); else phone.removeAttribute('href');
  const hours = $('#info-hours'); hours.innerHTML = '';
  (Array.isArray(info.hours) ? info.hours : [String(info.hours || '')]).filter(Boolean).forEach((h) => {
    // 「星期一～星期六　採預約制」→ 兩欄；沒有分隔符就整行佔兩欄
    const m = String(h).match(/^(.*?)(?:[\u3000\t]+|\s{2,})(.+)$/);
    if (m) hours.append(el('li', {}, [el('span', { class: 'h-day', text: m[1].trim() }), el('span', { class: 'h-note', text: m[2].trim() })]));
    else hours.append(el('li', { class: 'h-single' }, [el('span', { text: String(h).trim() })]));
  });
  if (info.hoursNote) hours.append(el('li', { class: 'h-single h-muted' }, [el('span', { text: info.hoursNote })]));
  renderSocialPills($('#info-social'));
  // 地址卡先完整呈現；有需要時再開啟原有 Google 互動地圖。
  const wrap = $('#map-wrap');
  if (!info.mapEmbedUrl) { wrap.hidden = true; return; }
  const cover = el('div', { class: 'map-cover' }, [
    el('span', { class: 'eyebrow', text: 'A LITTLE PLACE FOR BEAUTY' }),
    el('span', { class: 'map-flower', html: ICONS.flower, 'aria-hidden': 'true' }),
    el('p', { class: 'map-script', text: 'See you here.' }),
    el('p', { class: 'map-address', text: info.address }),
  ]);
  const open = el('button', { class: 'text-link map-open', type: 'button', text: '展開互動地圖' }, [el('span', { text: '↗', 'aria-hidden': 'true' })]);
  const close = el('button', { class: 'map-close', type: 'button', text: '收起地圖 ×', hidden: true });
  const link = info.mapLink ? el('a', { class: 'map-external', href: info.mapLink, target: '_blank', rel: 'noopener', text: '在 Google 地圖查看 ↗' }) : null;
  cover.append(open);
  wrap.replaceChildren(cover, close, ...(link ? [link] : []));
  open.addEventListener('click', () => {
    if (!wrap.querySelector('iframe')) {
      const iframe = el('iframe', { src: info.mapEmbedUrl, title: `${CONFIG.shopName} 的 Google 地圖位置`, allowfullscreen: '', referrerpolicy: 'no-referrer-when-downgrade' });
      iframe.addEventListener('load', () => iframe.classList.add('is-loaded'));
      wrap.append(iframe);
    }
    wrap.classList.add('map-expanded'); cover.hidden = true; close.hidden = false; close.focus();
  });
  close.addEventListener('click', () => {
    wrap.classList.remove('map-expanded'); cover.hidden = false; close.hidden = true; open.focus();
  });
}

function updateLiveHint() {
  const dot = $('#live-dot'); if (!dot) return;
  dot.classList.toggle('is-on', data.liveStatus.state === 'ok'); // 連不上即時清單時隱藏
}
