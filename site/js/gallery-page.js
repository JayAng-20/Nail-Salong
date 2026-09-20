// 作品集頁：類別切換 → 相簿標籤 → 作品牆 → 燈箱；網址可深層連結（?c=類別ID&a=相簿ID&p=照片ID）
import { $, el, getParams, setParams } from './util.js';
import { initCommon, galleryLink } from './common.js';
import { GalleryData } from './data.js';
import { flattenPhotos } from './tree.js';
import { renderPill } from './render.js';
import { Wall } from './wall.js';
import { Lightbox } from './lightbox.js';

initCommon({ pageTitle: '作品集' });

const data = new GalleryData();
const lightbox = new Lightbox({ linkFor: (p) => galleryLink(p) });
const wall = new Wall($('#gallery-wall'), { onOpen: (photos, index, originEl) => lightbox.open(photos, index, originEl) });

let tree = null;
const params = getParams();
let sel = { cat: params.get('c') || null, album: params.get('a') || null };
let pendingPhoto = params.get('p') || null;

lightbox.onChange = (photo, kind) => {
  if (kind === 'close') setParams({ p: null });
  else if (photo) setParams({ p: photo.id, c: photo.catId, a: sel.album ? photo.albumId : null });
};

data.addEventListener('update', (e) => {
  tree = e.detail.tree;
  render(e.detail.appeared);
  if (lightbox.isOpen) lightbox.updatePhotos(wall.photos);
  updateLiveHint();
});
data.addEventListener('status', updateLiveHint);
data.init();

window.addEventListener('popstate', () => {
  const p = getParams();
  sel = { cat: p.get('c') || null, album: p.get('a') || null };
  pendingPhoto = p.get('p') || null;
  if (tree) render([]);
});

async function render(appeared = []) {
  const cats = tree.categories;
  const empty = $('#gallery-empty');
  if (!cats.length) { $('#cat-tabs').innerHTML = ''; $('#album-chips').innerHTML = ''; empty.hidden = false; await wall.setPhotos([]); return; }
  empty.hidden = true;

  // 類別：網址指定的不存在就退回第一個
  if (!sel.cat || !cats.some((c) => c.id === sel.cat)) sel.cat = cats[0].id;
  const cat = cats.find((c) => c.id === sel.cat);
  // 相簿：不存在就退回「全部」；只有一個相簿時直接選它並隱藏標籤
  if (sel.album && !cat.albums.some((a) => a.id === sel.album)) sel.album = null;
  if (cat.albums.length === 1) sel.album = cat.albums[0].id;

  // 類別頁籤
  const tabs = $('#cat-tabs'); tabs.innerHTML = '';
  tabs.hidden = cats.length < 2;
  for (const c of cats) tabs.append(renderPill(c.name, { count: c.albums.reduce((n, a) => n + a.photos.length, 0), active: c.id === sel.cat, onClick: () => select(c.id, null) }));

  // 相簿標籤
  const chips = $('#album-chips'); chips.innerHTML = '';
  chips.hidden = cat.albums.length < 2;
  if (cat.albums.length > 1) {
    chips.append(renderPill('全部', { active: !sel.album, onClick: () => select(sel.cat, null) }));
    for (const a of cat.albums) chips.append(renderPill(a.name, { count: a.photos.length, active: a.id === sel.album, onClick: () => select(sel.cat, a.id) }));
  }

  // 標題與數量
  const album = sel.album ? cat.albums.find((a) => a.id === sel.album) : null;
  const photos = flattenPhotos(tree, { catId: sel.cat, albumId: sel.album });
  $('#gallery-title').textContent = album ? `${cat.name}・${album.name}` : cat.name;
  $('#gallery-sub').textContent = album ? album.subtitle || '' : (cat.subtitle || '全部相簿');
  $('#gallery-count').textContent = `${photos.length} 件作品`;
  document.title = `${album ? `${cat.name}・${album.name}` : cat.name}｜作品集｜${document.title.split('｜').pop()}`;

  setParams({ c: sel.cat, a: sel.album, p: pendingPhoto });
  await wall.setPhotos(photos, { appeared });

  // 深層連結指定照片：開燈箱
  if (pendingPhoto) {
    const list = wall.photos; const i = list.findIndex((p) => p.id === pendingPhoto);
    pendingPhoto = null;
    if (i >= 0) {
      const origin = document.querySelector(`.work[data-id="${CSS.escape(list[i].id)}"]`);
      origin?.scrollIntoView({ block: 'center' });
      lightbox.open(list, i, origin);
    } else setParams({ p: null });
  }
}

function select(catId, albumId) {
  sel = { cat: catId, album: albumId };
  setParams({ c: catId, a: albumId, p: null }, { replace: false });
  render([]);
}

function updateLiveHint() {
  const dot = $('#live-dot'); if (!dot) return;
  const on = data.liveStatus.state === 'ok';
  dot.classList.toggle('is-on', on);
  dot.title = on ? '即時清單連線正常' : (data.liveEnabled ? '目前只顯示已建置的作品' : '尚未設定即時清單');
}
