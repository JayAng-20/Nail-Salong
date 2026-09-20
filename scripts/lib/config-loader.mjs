// 讀取 site/site-config.js（瀏覽器用的純 script），在 Node 裡用 vm 取出 window.SITE_CONFIG
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

export function loadSiteConfig(path) {
  const src = readFileSync(path, 'utf8');
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'site-config.js', timeout: 2000 });
  const cfg = sandbox.window.SITE_CONFIG;
  if (!cfg || typeof cfg !== 'object') throw new Error('site-config.js 沒有設定 window.SITE_CONFIG');
  return JSON.parse(JSON.stringify(cfg));
}

/** 檢查必要欄位與型別；回傳錯誤訊息陣列（空陣列＝合格） */
export function validateSiteConfig(cfg) {
  const errors = [];
  const str = (path, required = false) => {
    const v = get(cfg, path);
    if (v === undefined || v === null || v === '') { if (required) errors.push(`缺少必填欄位 ${path}`); return; }
    if (typeof v !== 'string') errors.push(`${path} 必須是文字（用引號包起來）`);
  };
  const arr = (path, required = false) => {
    const v = get(cfg, path);
    if (v === undefined || v === null) { if (required) errors.push(`缺少必填欄位 ${path}`); return; }
    if (!Array.isArray(v)) errors.push(`${path} 必須是中括號 [ ] 包起來的清單`);
  };
  str('shopName', true); str('shopNameEn'); str('tagline'); str('footerQuote');
  str('hero.eyebrow'); arr('hero.titleLines', true); str('hero.description'); str('hero.primaryButton'); str('hero.secondaryButton');
  str('hero.bottomLine'); str('hero.scriptText'); arr('hero.badgeLines');
  arr('serviceGroups', true);
  (Array.isArray(cfg.serviceGroups) ? cfg.serviceGroups : []).forEach((g, gi) => {
    if (!g || typeof g !== 'object') return errors.push(`serviceGroups[${gi}] 格式不對`);
    if (typeof g.title !== 'string' || !g.title) errors.push(`serviceGroups[${gi}].title 必須是文字`);
    if (!Array.isArray(g.items)) return errors.push(`serviceGroups[${gi}].items 必須是清單`);
    g.items.forEach((it, ii) => {
      const at = `serviceGroups[${gi}]「${g.title}」items[${ii}]`;
      if (!it || typeof it !== 'object') return errors.push(`${at} 格式不對`);
      if (typeof it.name !== 'string' || !it.name) errors.push(`${at}.name 必須是文字`);
      if (typeof it.price !== 'number' || !isFinite(it.price) || it.price < 0) errors.push(`${at}.price 必須是數字（不要加 $ 或逗號）`);
      if (it.suffix !== undefined && typeof it.suffix !== 'string') errors.push(`${at}.suffix 必須是文字`);
      if (it.desc !== undefined && typeof it.desc !== 'string') errors.push(`${at}.desc 必須是文字`);
    });
  });
  str('serviceNote');
  str('info.address', true); str('info.mapLink'); str('info.mapEmbedUrl'); str('info.phone'); str('info.phoneDisplay'); arr('info.hours'); str('info.hoursNote');
  const embed = get(cfg, 'info.mapEmbedUrl');
  if (embed && !/^https:\/\/(www\.google\.com\/maps\/embed|maps\.google\.com\/maps)/.test(embed)) errors.push('info.mapEmbedUrl 必須是 Google 地圖「嵌入地圖」的網址（https://www.google.com/maps/embed?pb=…）');
  ['facebook', 'instagram', 'line'].forEach((k) => {
    const v = get(cfg, 'social.' + k);
    if (v && !/^https?:\/\//.test(v)) errors.push(`social.${k} 必須是以 http:// 或 https:// 開頭的網址（或留空字串）`);
  });
  str('seo.title'); str('seo.description'); str('seo.ogImage'); str('seo.siteUrl');
  str('appsScriptUrl');
  const asu = get(cfg, 'appsScriptUrl');
  if (asu && !/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(asu)) errors.push('appsScriptUrl 必須以 https://script.google.com/macros/s/ 開頭、/exec 結尾（或留空）');
  ['liveRefreshSeconds', 'liveTimeoutMs', 'newBadgeDays', 'newBadgeMajorityLimit', 'latestCount'].forEach((k) => {
    const v = cfg[k]; if (v !== undefined && (typeof v !== 'number' || !isFinite(v) || v < 0)) errors.push(`${k} 必須是 0 或正數`);
  });
  str('albumPlaceholderText'); str('uncategorizedAlbumName');
  // 密鑰防呆：設定檔裡不得出現看起來像權杖的字串
  const text = JSON.stringify(cfg);
  if (/github_pat_[A-Za-z0-9_]{20,}|ghp_[A-Za-z0-9]{30,}|AIza[0-9A-Za-z_-]{30,}/.test(text)) errors.push('設定檔裡出現看起來像權杖／金鑰的字串，請移除（任何密鑰都不得放在設定檔）');
  return errors;
}

function get(obj, path) { return String(path).split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj); }
