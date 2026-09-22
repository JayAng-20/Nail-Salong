// 共用渲染：作品格、相簿卡、類別卡、社群按鈕
import { el } from './util.js';
import { CONFIG } from './config.js';
import { ICONS } from './icons.js';
import { loadInto, registerFailed, clearFailed } from './image-source.js';
import { photoAlt, photoCaption } from './tree.js';

/** 模糊佔位：建置時每張存了 16px 的小圖（photo.lqip），先鋪上模糊版，清晰圖到了再淡入 */
function applyLqip(node, photo) {
  if (photo && photo.lqip) { node.style.setProperty('--lqip', `url("${photo.lqip}")`); node.classList.add('has-lqip'); }
}

/** 作品格（齊行牆用）。回傳 { el, ratio, photo }；showNew 由呼叫端依牆面規則決定；priority=true 時首批高優先、不 lazy */
export function renderWorkTile(photo, { onOpen, lazy = true, showNew = false, priority = false } = {}) {
  const ratio = photo.width && photo.height ? photo.width / photo.height : null;
  const fig = el('figure', {
    class: 'work' + (photo.live ? ' is-live' : ''),
    'data-id': photo.id, 'data-cat': photo.catId || '', 'data-album': photo.albumId || '',
    style: photo.color ? { '--ph-color': photo.color } : null, tabindex: '0', role: 'button',
    'aria-label': `${photoAlt(photo)}，開啟大圖`,
  });
  applyLqip(fig, photo);
  const img = el('img', { alt: photoAlt(photo), decoding: 'async', draggable: 'false' });
  if (photo.width && photo.height) { img.width = photo.width; img.height = photo.height; }
  if (priority) img.setAttribute('fetchpriority', 'high');
  else if (lazy && photo.local) img.setAttribute('loading', 'lazy');
  fig.append(img);
  if (showNew) fig.append(el('span', { class: 'badge-new', text: 'NEW' }));
  fig.append(el('figcaption', { class: 'work-cap', text: photoCaption(photo) }));
  const item = { el: fig, ratio, photo, img, eager: priority || !lazy };
  const open = () => onOpen && onOpen(item);
  fig.addEventListener('click', open);
  fig.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  return item;
}

/** 讓作品格開始載圖（進入視窗附近才載；載入失敗就隱藏那一格） */
export function startTileLoad(item, onChange) {
  const { el: fig, img, photo } = item;
  item.loadObserver?.disconnect();
  const go = async () => {
    const ok = await loadInto(img, item.photo, 'thumb');
    if (!ok) { fig.classList.add('is-failed'); registerFailed(fig, async () => { const ok2 = await go(); return ok2; }); onChange && onChange('failed', item); return false; }
    clearFailed(fig);
    if (!item.ratio && img.naturalWidth) { item.ratio = img.naturalWidth / img.naturalHeight; onChange && onChange('ratio', item); }
    onChange && onChange('loaded', item);
    return true;
  };
  if (item.eager || !('IntersectionObserver' in window)) return go();
  const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) { io.disconnect(); go(); } }, { rootMargin: '400px 0px' });
  item.loadObserver = io;
  io.observe(fig);
}

/** 通用圖片容器（相簿卡、類別卡、主圖用） */
export function renderPhotoBox(photo, { size = 'thumb', cls = '', alt = '', eager = false, sizes = null } = {}) {
  const box = el('div', { class: 'ph ' + cls, style: photo?.color ? { '--ph-color': photo.color } : null });
  if (!photo) return box;
  applyLqip(box, photo);
  const img = el('img', { alt, decoding: 'async' });
  if (sizes) img.sizes = sizes;
  if (eager) img.setAttribute('fetchpriority', 'high');
  else if (photo.local) img.setAttribute('loading', 'lazy');
  box.append(img);
  const go = () => loadInto(img, photo, size).then((ok) => { if (!ok) { box.classList.add('is-failed'); registerFailed(box, go); } else clearFailed(box); return ok; });
  go();
  return box;
}

export function renderCategoryCard(cat, cover, count) {
  const a = el('a', { class: 'cat-card', href: `gallery.html?c=${encodeURIComponent(cat.id)}`, 'aria-label': `${cat.name}，${count} 件作品` });
  a.append(renderPhotoBox(cover, { alt: `${cat.name} 作品封面`, size: 'hero', sizes: '(max-width: 767px) 44vw, 46vw' }));
  a.append(el('div', { class: 'cat-card-body' }, [
    el('div', {}, [el('h3', {}, [cat.name, el('span', { class: 'category-en', text: cat.name === '美甲' ? 'Nails' : cat.name === '美睫' ? 'Lashes' : 'Collection' })]), el('div', { class: 'cat-meta', text: `${count} 件作品` })]),
    el('span', { class: 'arrow-circle', html: ICONS.arrow }),
  ]));
  return a;
}

export function renderAlbumCard(cat, album) {
  const a = el('a', { class: 'album-card', href: `gallery.html?c=${encodeURIComponent(cat.id)}&a=${encodeURIComponent(album.id)}` });

  a.append(el('div', { class: 'album-card-body' }, [
    el('div', { class: 'album-card-text' }, [
      el('h3', { text: album.name }),
      album.subtitle ? el('div', { class: 'sub', text: album.subtitle }) : null,
      el('div', { class: 'count', text: `${album.photos.length} WORKS` }),
    ]),
    el('span', { class: 'arrow-circle', html: ICONS.arrow }),
  ]));
  return a;
}

/** 相簿 1～3 張時填滿剩餘欄位的低調佔位卡（不可點、輔助科技忽略） */
export function renderAlbumPlaceholder(span) {
  return el('div', { class: 'album-placeholder', 'aria-hidden': 'true', style: { '--album-span': String(span) } }, [
    el('span', { text: CONFIG.albumPlaceholderText || '' }),
    (() => { const d = document.createElement('div'); d.innerHTML = ICONS.flower; return d.firstChild; })(),
  ]);
}

export function renderPill(label, { count = null, active = false, onClick } = {}) {
  const b = el('button', { class: 'pill' + (active ? ' is-active' : ''), type: 'button', 'aria-pressed': active ? 'true' : 'false' }, [label]);
  if (count !== null) b.append(el('span', { class: 'count', text: String(count) }));
  if (onClick) b.addEventListener('click', () => onClick(b));
  return b;
}

const SOCIAL = [
  { key: 'instagram', label: 'Instagram', icon: 'instagram' },
  { key: 'facebook', label: 'Facebook', icon: 'facebook' },
  { key: 'line', label: 'LINE', icon: 'line' },
];

/** 導覽列／頁尾的圓形社群圖示按鈕 */
export function renderSocialIcons(container) {
  container.innerHTML = '';
  for (const s of SOCIAL) {
    const url = CONFIG.social?.[s.key]; if (!url) continue;
    container.append(el('a', { class: 'icon-btn', href: url, target: '_blank', rel: 'noopener', 'aria-label': s.label, title: s.label, html: ICONS[s.icon] }));
  }
}

/** 店家資訊區的膠囊社群按鈕（有圖示與文字） */
export function renderSocialPills(container) {
  container.innerHTML = '';
  for (const s of SOCIAL) {
    const url = CONFIG.social?.[s.key]; if (!url) continue;
    container.append(el('a', { class: 'social-pill', href: url, target: '_blank', rel: 'noopener', html: ICONS[s.icon] + `<span>${s.label}</span>` }));
  }
  container.hidden = container.children.length === 0;
}

const GROUP_ICON = { 美甲: 'sparkle', 美睫: 'eye', 美足: 'foot', 手足保養: 'heart', 保養: 'lotus' };

/** 服務價目：一張白色面板內的菜單式排版（分組由 CSS 多欄排列、不拆欄；項目為 名稱…點線…價格），沒有任何按鈕 */
export function renderServices(container, note, tabs = null) {
  container.innerHTML = '';
  const groups = Array.isArray(CONFIG.serviceGroups) ? CONFIG.serviceGroups : [];
  for (const g of groups) {
    if (!g || !Array.isArray(g.items)) continue;
    const icon = ICONS[g.icon] || ICONS[GROUP_ICON[g.title]] || ICONS.leaf;
    const group = el('section', { class: 'svc-group' });
    group.append(el('div', { class: 'svc-icon', html: icon }));
    group.append(el('h3', {}, [g.title || '', g.titleEn ? el('span', { class: 'en', text: g.titleEn }) : null]));
    const list = el('ul', { class: 'svc-list' });
    for (const it of g.items) {
      if (!it) continue;
      const price = Number(it.price);
      list.append(el('li', { class: 'svc-item' }, [
        el('div', { class: 'svc-text' }, [el('div', { class: 'svc-name', text: it.name || '' }), it.desc ? el('div', { class: 'svc-desc', text: it.desc }) : null]),
        el('span', { class: 'svc-leader', 'aria-hidden': 'true' }),
        el('div', { class: 'svc-price' }, [
          el('span', { class: 'cur', text: 'NT$' }), isFinite(price) ? price.toLocaleString('zh-TW') : String(it.price ?? ''),
          it.suffix ? el('span', { class: 'suffix', text: it.suffix }) : null,
        ]),
      ]));
    }
    group.append(list);
    container.append(group);
  }
  container.hidden = container.children.length === 0;
  if (note) { note.textContent = CONFIG.serviceNote || ''; note.hidden = !CONFIG.serviceNote; }
  if (tabs) {
    const compact = matchMedia('(max-width: 767px)');
    let active = 0;
    const sections = [...container.children];
    const update = () => {
      tabs.hidden = !compact.matches || sections.length < 2;
      sections.forEach((section, i) => { section.hidden = compact.matches && active !== i; });
      [...tabs.children].forEach((button, i) => button.setAttribute('aria-pressed', String(i === active)));
    };
    tabs.replaceChildren();
    sections.forEach((section, i) => tabs.append(el('button', { type: 'button', text: section.querySelector('h3').textContent, onclick: () => { active = i; update(); } })));
    compact.addEventListener('change', update);
    update();
  }
}
