// 讀取 site-config.js 並補上預設值：即使設定檔壞掉，也要顯示替代文字而不是整頁空白
const DEFAULTS = {
  shopName: '美甲美睫工作室',
  shopNameEn: 'Nail & Lash Studio',
  tagline: 'NAIL · LASH · BEAUTY',
  footerQuote: '美不只是一種外表，更是一種生活態度。',
  hero: {
    eyebrow: 'NAILS TELL YOUR STORY',
    titleLines: ['讓指尖成為', '你的風格名片'],
    description: '從日常到特別的日子，用細膩的美學，點綴屬於你的獨特光芒。',
    primaryButton: '瀏覽作品',
    secondaryButton: '店家資訊',
    bottomLine: 'MORE THAN NAILS · A BRIGHTER YOU',
    scriptText: 'Good Nails, Brighter Days',
    badgeLines: ['指尖的溫柔', '是一種生活態度'],
  },
  serviceGroups: [],
  serviceNote: '',
  info: { address: '', mapLink: '', mapEmbedUrl: '', phone: '', phoneDisplay: '', hours: [], hoursNote: '' },
  social: { facebook: '', instagram: '', line: '' },
  seo: { title: '', description: '', ogImage: '', siteUrl: '' },
  appsScriptUrl: '',
  liveRefreshSeconds: 50,
  liveTimeoutMs: 6000,
  newBadgeDays: 14,
  latestCount: 12,
};

function isObj(v) { return v && typeof v === 'object' && !Array.isArray(v); }
function merge(base, over) {
  const out = { ...base };
  if (!isObj(over)) return out;
  for (const [k, v] of Object.entries(over)) {
    if (isObj(v) && isObj(base[k])) out[k] = merge(base[k], v);
    else if (v !== undefined && v !== null) out[k] = v;
  }
  return out;
}

export const CONFIG_LOADED = isObj(window.SITE_CONFIG);
export const CONFIG = merge(DEFAULTS, window.SITE_CONFIG);
CONFIG.liveRefreshSeconds = Math.min(60, Math.max(45, Number(CONFIG.liveRefreshSeconds) || 50));
CONFIG.liveTimeoutMs = Math.max(1000, Number(CONFIG.liveTimeoutMs) || 6000);
CONFIG.newBadgeDays = Math.max(0, Number(CONFIG.newBadgeDays) || 14);
CONFIG.latestCount = Math.max(1, Number(CONFIG.latestCount) || 12);

/** 網站根路徑（GitHub Pages 專案頁面在 /repo/ 底下） */
export function siteBase() {
  const p = location.pathname;
  return p.endsWith('/') ? p : p.slice(0, p.lastIndexOf('/') + 1);
}

/** 把設定文字套進頁面上標了 data-cfg 的元素 */
export function applyConfigText(root = document) {
  root.querySelectorAll('[data-cfg]').forEach((node) => {
    const v = getPath(CONFIG, node.dataset.cfg);
    if (v === undefined || v === null) return;
    node.textContent = Array.isArray(v) ? v.join(' ') : String(v);
  });
  root.querySelectorAll('[data-cfg-href]').forEach((node) => {
    const v = getPath(CONFIG, node.dataset.cfgHref);
    if (v) node.setAttribute('href', String(v));
    else (node.closest('[data-cfg-hide]') || node).hidden = true;
  });
  const year = String(new Date().getFullYear());
  root.querySelectorAll('[data-year]').forEach((n) => { n.textContent = year; });
}

export function getPath(obj, path) {
  return String(path).split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

/** 標題、描述、Open Graph、JSON-LD（美容業店家的結構化資料） */
export function applySeo({ pageTitle, ogImage } = {}) {
  const base = CONFIG.seo.title || CONFIG.shopName;
  document.title = pageTitle ? `${pageTitle}｜${CONFIG.shopName}` : base;
  const desc = CONFIG.seo.description || `${CONFIG.shopName} 作品集`;
  setMeta('name', 'description', desc);
  setMeta('property', 'og:title', document.title);
  setMeta('property', 'og:description', desc);
  setMeta('property', 'og:type', 'website');
  setMeta('property', 'og:site_name', CONFIG.shopName);
  const built = document.head.querySelector('meta[property="og:image"]')?.getAttribute('content') || '';
  const img = ogImage || CONFIG.seo.ogImage || built;
  if (img) { setMeta('property', 'og:image', img); setMeta('name', 'twitter:card', 'summary_large_image'); }
  if (CONFIG.seo.siteUrl) setMeta('property', 'og:url', CONFIG.seo.siteUrl + location.pathname.split('/').pop() + location.search);

  const ld = {
    '@context': 'https://schema.org',
    '@type': 'BeautySalon',
    name: CONFIG.shopName,
    alternateName: CONFIG.shopNameEn || undefined,
    description: desc,
    url: CONFIG.seo.siteUrl || location.origin + siteBase(),
    telephone: CONFIG.info.phone || undefined,
    address: CONFIG.info.address ? { '@type': 'PostalAddress', streetAddress: CONFIG.info.address, addressCountry: 'TW' } : undefined,
    image: img || undefined,
    sameAs: Object.values(CONFIG.social || {}).filter(Boolean),
    priceRange: '$$',
  };
  let s = document.getElementById('ld-json');
  if (!s) { s = document.createElement('script'); s.type = 'application/ld+json'; s.id = 'ld-json'; document.head.append(s); }
  s.textContent = JSON.stringify(ld);
}

function setMeta(attr, key, value) {
  let m = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!m) { m = document.createElement('meta'); m.setAttribute(attr, key); document.head.append(m); }
  m.setAttribute('content', value);
}
