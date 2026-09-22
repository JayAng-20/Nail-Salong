import { $, getParams, setParams } from './util.js';
import { CONFIG } from './config.js';
import { initCommon, galleryLink } from './common.js';
import { GalleryData } from './data.js';
import { flattenPhotos } from './tree.js';
import { renderPill } from './render.js';
import { Wall } from './wall.js';
import { Lightbox } from './lightbox.js';
import { Exhibition } from './exhibition.js';
import { exhibitionOrder } from './curation.js';
import { retryFailed } from './image-source.js';

initCommon({ pageTitle: '作品集' });
const data = new GalleryData(); window.__galleryData = data;
const lightbox = new Lightbox({ linkFor: p => galleryLink(p) });
const open = (photos, index, origin) => lightbox.open(photos, index, origin);
const wall = new Wall($('#gallery-wall'), { onOpen: open });
const exhibition = new Exhibition($('#gallery-exhibition'), { onOpen: open, labels: CONFIG.exhibition.labels });
let tree = null, renderVersion = 0;
const params = getParams();
let sel = { cat: params.get('c') || null, album: params.get('a') || null };
let pendingPhoto = params.get('p') || null;
const preferredView = p => ['grid', 'space'].includes(p.get('view')) ? p.get('view') : matchMedia('(max-width: 767px)').matches ? 'grid' : 'space';
let view = preferredView(params);

lightbox.onChange = (photo, kind) => {
  if (kind === 'close') setParams({ p: null });
  else if (photo) setParams({ p: photo.id });
};

data.addEventListener('update', async e => {
  tree = e.detail.tree;
  await render(e.detail.appeared);
  if (lightbox.isOpen) lightbox.updatePhotos(exhibition.photos);
  updateLiveHint();
  if (!e.detail.first) retryFailed();
});
data.addEventListener('status', () => { updateLiveHint(); retryFailed(); });
data.init();

window.addEventListener('popstate', () => {
  const p = getParams();
  sel = { cat: p.get('c') || null, album: p.get('a') || null };
  pendingPhoto = p.get('p') || null;
  view = preferredView(p);
  if (!pendingPhoto && lightbox.isOpen) lightbox.close();
  if (tree) render([]);
});

document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => {
  view = button.dataset.view;
  setParams({ view }, { replace: false });
  if (tree) render([]);
}));

async function render(appeared = []) {
  const version = ++renderVersion;
  const cats = tree.categories;
  if (sel.cat && !cats.some(c => c.id === sel.cat)) sel.cat = null;
  const cat = cats.find(c => c.id === sel.cat);
  if (!cat || !cat.albums.some(a => a.id === sel.album)) sel.album = null;
  const tabs = $('#cat-tabs'); tabs.replaceChildren();
  tabs.append(renderPill('全部作品', { count: tree.stats.photos, active: !sel.cat, onClick: () => select(null, null) }));
  cats.forEach(c => tabs.append(renderPill(c.name, { count: c.albums.reduce((n, a) => n + a.photos.length, 0), active: c.id === sel.cat, onClick: () => select(c.id, null) })));
  const chips = $('#album-chips'); chips.replaceChildren(); chips.hidden = !cat || cat.albums.length < 2;
  if (cat?.albums.length > 1) {
    chips.append(renderPill('全部相簿', { active: !sel.album, onClick: () => select(sel.cat, null) }));
    cat.albums.forEach(a => chips.append(renderPill(a.name, { count: a.photos.length, active: a.id === sel.album, onClick: () => select(sel.cat, a.id) })));
  }
  const album = cat?.albums.find(a => a.id === sel.album);
  const photos = exhibitionOrder(flattenPhotos(tree, { catId: sel.cat, albumId: sel.album }), CONFIG.exhibition.featuredPhotoIds);
  $('#gallery-title').textContent = album ? `${cat.name}・${album.name}` : cat?.name || '全部作品';
  $('#gallery-sub').textContent = album?.subtitle || (cat ? '每一款，都有自己的表情。' : '美甲・美睫的日常靈感');
  $('#gallery-sub').classList.toggle('is-album-subtitle', !!album?.subtitle);
  $('#gallery-count').textContent = `${photos.length} 件作品`;
  document.title = `${$('#gallery-title').textContent}｜作品集｜${CONFIG.shopName}`;
  setParams({ c: sel.cat, a: sel.album, view, p: pendingPhoto || (lightbox.isOpen ? lightbox.current?.id : null) });
  $('#gallery-empty').hidden = photos.length > 0;
  $('#gallery-space').hidden = view !== 'space' || !photos.length;
  $('#gallery-wall').hidden = view !== 'grid' || !photos.length;
  document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === view)));
  exhibition.setPhotos(photos);
  if (view === 'grid') await wall.setPhotos(photos, { appeared });
  if (version !== renderVersion) return;
  if (pendingPhoto) {
    const id = pendingPhoto; pendingPhoto = null;
    const i = photos.findIndex(p => p.id === id);
    if (i >= 0) {
      exhibition.index = i; exhibition.position(); exhibition.updateText();
      const origin = view === 'grid' ? document.querySelector(`.work[data-id="${CSS.escape(id)}"]`) : exhibition.cards[i]?.card;
      lightbox.open(photos, i, origin);
    } else setParams({ p: null });
  }
}

function select(cat, album) {
  sel = { cat, album }; pendingPhoto = null;
  setParams({ c: cat, a: album, p: null }, { replace: false });
  render([]);
}
function updateLiveHint() { $('#live-dot').classList.toggle('is-on', data.liveStatus.state === 'ok'); }
