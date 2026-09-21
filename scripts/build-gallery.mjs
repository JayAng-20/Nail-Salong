#!/usr/bin/env node
/**
 * 穩定層建置腳本（GitHub Actions 上執行；本機也能跑）
 *
 *   1. 讀 site-config.js 取得 Apps Script 網址（或用 MOCK_LIST 指定本機清單）
 *   2. 向 Apps Script 取得目前清單（失敗時退回線上 gallery.json，讓設定檔變更仍能部署）
 *   3. 與快取 manifest 比對：只下載新增或變更（rev 不同）的照片；已刪除的從輸出移除
 *   4. 轉檔（EXIF 轉正→去 EXIF→WebP 縮圖 320/480/640＋大圖 1920＋16px 模糊佔位圖）；單張失敗記錄並跳過，該張繼續由即時層提供
 *   5. 產生 data/gallery.json（結構同即時清單＋本地路徑、寬高、主色、模糊圖、建置時間）
 *   6. 把首屏需要的東西寫進 index.html／gallery.html 的 <!-- build:head --> 區塊：
 *      內嵌清單（省一個來回）、首屏圖片 preload、Open Graph；讓瀏覽器讀到 HTML 就開始抓圖
 *
 * 圖片不進 git：快取放 .cache/images（Actions 快取），快取遺失時先從線上網站把舊圖抓回來，再不行才全部重做。
 *
 * 環境變數：
 *   APPS_SCRIPT_URL   覆蓋設定檔的 Apps Script 網址
 *   LIVE_SITE_BASE    線上網站根網址（例 https://user.github.io/repo/），用來復原已建置的圖片
 *   FILE_SECRET       Apps Script ③ 的共用密鑰（備援，可不填）
 *   MOCK_LIST         本機測試：直接讀這個 JSON 當清單
 *   CACHE_DIR / OUT_DIR / CONCURRENCY
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, readFile, writeFile, rm, stat, copyFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { loadSiteConfig } from './lib/config-loader.mjs';
import { downloadOriginal, fetchWithTimeout, sleep } from './lib/drive-download.mjs';
import { convertPhoto, availableTools } from './lib/convert.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.resolve(process.env.OUT_DIR || ROOT); // 網站就在專案根目錄
const CACHE_DIR = path.resolve(process.env.CACHE_DIR || path.join(ROOT, '.cache', 'images'));
const IMAGES_DIR = path.join(OUT_DIR, 'images');
const DATA_DIR = path.join(OUT_DIR, 'data');
const MANIFEST = path.join(CACHE_DIR, 'manifest.json');
const CONCURRENCY = Math.max(1, Number(process.env.CONCURRENCY) || 3);
const WARN_BYTES = 800 * 1024 * 1024;
const SCHEMA_VERSION = 1;
const MANIFEST_VERSION = 3;                  // 快取項目格式版本：v3 = 縮圖 320/480/640＋中圖 1080＋大圖 1920＋模糊圖；舊項目會重新轉檔
const THUMB_WIDTHS = [320, 480, 640];
const INLINE_LIMIT = 100 * 1024;            // 內嵌清單上限；超過就只內嵌首屏需要的部分
const IMAGE_SIZES = '(max-width: 639px) 46vw, (max-width: 1023px) 32vw, 280px'; // 與 js/image-source.js 的 IMAGE_SIZES 必須一致，preload 才會命中快取
const HERO_SIZES = '(max-width: 899px) 100vw, 480px';                              // 與 js/image-source.js 的 HERO_SIZES 一致

const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
const warn = (...a) => console.warn(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ⚠`, ...a);

main().catch((err) => { console.error('✘ 建置失敗：', err.stack || err.message || err); process.exit(1); });

async function main() {
  await mkdir(CACHE_DIR, { recursive: true });
  await mkdir(DATA_DIR, { recursive: true });
  log('轉檔工具：', JSON.stringify(await availableTools()));

  // ---- 1. 設定 ----
  let cfg = {};
  try { cfg = loadSiteConfig(path.join(OUT_DIR, 'site-config.js')); } catch (err) { warn('讀不到 site-config.js：', err.message); }
  const appsScriptUrl = process.env.APPS_SCRIPT_URL || cfg.appsScriptUrl || '';
  const liveSiteBase = normalizeBase(process.env.LIVE_SITE_BASE || cfg?.seo?.siteUrl || '');
  const fileSecret = process.env.FILE_SECRET || '';

  // ---- 2. 清單 ----
  const liveSite = await fetchLiveSiteGallery(liveSiteBase); // 線上舊版（可能為 null）
  let list = null, listSource = '';
  if (process.env.MOCK_LIST) {
    list = JSON.parse(await readFile(path.resolve(process.env.MOCK_LIST), 'utf8')); listSource = 'mock:' + process.env.MOCK_LIST;
  } else if (appsScriptUrl) {
    try { list = await fetchList(appsScriptUrl); listSource = 'apps-script'; }
    catch (err) { warn('取得即時清單失敗：', err.message); }
  } else warn('未設定 Apps Script 網址');
  if (!list && liveSite) { list = liveSite; listSource = 'live-site-fallback'; warn('改用線上 gallery.json 當清單（Google 端暫時不可用，設定檔變更仍會部署）'); }
  if (!list && existsSync(path.join(DATA_DIR, 'gallery.json'))) { list = JSON.parse(await readFile(path.join(DATA_DIR, 'gallery.json'), 'utf8')); listSource = 'local-previous'; warn('改用本機上一版 gallery.json'); }
  if (!list) {
    // 第一次部署且 Apps Script 網址還沒填（或連不上）：輸出空清單讓網站先上線，作品區顯示「準備中」，之後由即時層與下一次建置補上
    warn('沒有任何可用的清單（Apps Script 網址未填或連不上、線上也沒有舊版）→ 先部署空的作品清單');
    if (process.env.GITHUB_ACTIONS) console.log('::warning title=作品清單為空::請確認 site-config.js 的 appsScriptUrl 已填，並確認 Apps Script 已部署為「任何人」可存取');
    list = { schemaVersion: SCHEMA_VERSION, source: 'live', generatedAt: null, rootId: null, categories: [], hero: [], warnings: [], stats: { categories: 0, albums: 0, photos: 0 } };
    listSource = 'empty';
  }
  validateList(list);
  log(`清單來源：${listSource}；${list.stats?.categories ?? list.categories.length} 類別／${list.stats?.albums ?? '?'} 相簿／${list.stats?.photos ?? '?'} 照片；hero ${list.hero?.length ?? 0} 張`);

  // ---- 3. 快取 manifest ----
  const manifest = await readManifest();
  const needed = collectPhotos(list); // Map id → photo（含 hero）
  const results = new Map(); // id → entry
  const failed = [];

  // 先從線上網站復原快取缺的圖（快取遺失時避免全部重做）
  if (liveSite) await restoreFromLiveSite(liveSite, liveSiteBase, needed, manifest);

  // ---- 4. 逐張處理 ----
  const queue = [...needed.values()];
  let reused = 0, converted = 0;
  await runPool(queue, CONCURRENCY, async (photo) => {
    const rev = photo.rev || 'r0';
    const key = `${photo.id}-${rev}`;
    const hit = manifest[photo.id];
    if (hit && hit.v === MANIFEST_VERSION && hit.rev === rev && (await filesExist(hit))) { results.set(photo.id, hit); reused++; return; }
    try {
      const { buffer, via } = await downloadOriginal(photo.id, { appsScriptUrl, fileSecret });
      const ext = extFromMime(photo.mimeType) || '';
      const out = await convertPhoto(buffer, { ext, mimeType: photo.mimeType });
      const files = { l: `${key}-l.webp`, m: `${key}-m.webp` };
      for (const w of THUMB_WIDTHS) files['t' + w] = w === 640 ? `${key}-t.webp` : `${key}-t${w}.webp`;
      await writeFile(path.join(CACHE_DIR, files.l), out.large);
      await writeFile(path.join(CACHE_DIR, files.m), out.medium);
      for (const w of THUMB_WIDTHS) await writeFile(path.join(CACHE_DIR, files['t' + w]), out.thumbs[w]);
      const bytes = out.large.length + out.medium.length + THUMB_WIDTHS.reduce((a, w) => a + out.thumbs[w].length, 0);
      const entry = { v: MANIFEST_VERSION, rev, files, lqip: out.lqip, width: out.width, height: out.height, thumbWidth: out.thumbWidth, thumbHeight: out.thumbHeight, largeWidth: out.largeWidth, largeHeight: out.largeHeight, color: out.color, bytes, decoder: out.decoder, via, at: new Date().toISOString() };
      manifest[photo.id] = entry; results.set(photo.id, entry); converted++;
      log(`✔ ${photo.id} ${out.width}×${out.height} → ${Math.round(bytes / 1024)} KB（${out.decoder}/${via}，原始 ${Math.round(buffer.length / 1024)} KB）`);
    } catch (err) {
      failed.push({ id: photo.id, error: String(err.message || err).slice(0, 300) });
      warn(`✘ ${photo.id}：${String(err.message || err).slice(0, 200)}`);
    }
  });

  // 移除已刪除照片的快取
  let pruned = 0;
  if (listSource !== 'empty') for (const id of Object.keys(manifest)) if (!needed.has(id)) { await removeEntry(manifest[id]); delete manifest[id]; pruned++; }
  await writeFile(MANIFEST, JSON.stringify(manifest, null, 1));

  // ---- 5. 輸出 ----
  await rm(IMAGES_DIR, { recursive: true, force: true });
  await mkdir(IMAGES_DIR, { recursive: true });
  let outputBytes = 0;
  for (const entry of results.values()) {
    for (const f of entryFiles(entry)) { await copyFile(path.join(CACHE_DIR, f), path.join(IMAGES_DIR, f)); outputBytes += (await stat(path.join(IMAGES_DIR, f))).size; }
  }
  const gallery = buildOutput(list, results, { failed, outputBytes, listSource });
  await writeFile(path.join(DATA_DIR, 'gallery.json'), JSON.stringify(gallery));
  // 首屏加速：內嵌清單、首屏圖片 preload、Open Graph 一起寫進 HTML 的 build:head 區塊（本機與 Actions 都做；npm run pages 可還原成乾淨版）
  await injectHead(gallery, cfg);

  const mb = (outputBytes / 1048576).toFixed(1);
  log(`完成：重用 ${reused}、新轉檔 ${converted}、失敗 ${failed.length}、清除 ${pruned}；輸出圖片 ${results.size} 張共 ${mb} MB；gallery.json ${Math.round(JSON.stringify(gallery).length / 1024)} KB`);
  if (outputBytes > WARN_BYTES) {
    warn(`輸出總大小 ${mb} MB 已超過 800 MB（GitHub Pages 上限 1 GB）！請減少照片或降低尺寸。`);
    if (process.env.GITHUB_ACTIONS) console.log(`::warning title=輸出大小警告::圖片輸出 ${mb} MB，超過 800 MB，接近 Pages 1 GB 上限`);
  }
  if (failed.length && process.env.GITHUB_ACTIONS) console.log(`::warning title=有 ${failed.length} 張照片轉檔失敗::${failed.map((f) => f.id).join(', ')}（這些照片暫時由即時層提供）`);
  if (process.env.GITHUB_OUTPUT) {
    await writeFile(process.env.GITHUB_OUTPUT, `photos=${results.size}\nfailed=${failed.length}\noutput_mb=${mb}\nconverted=${converted}\nlist_source=${listSource}\n`, { flag: 'a' });
  }
}

// ---------------------------------------------------------------------------

async function fetchList(url) {
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await sleep(3000 * attempt);
    try {
      const res = await fetchWithTimeout(url + (url.includes('?') ? '&' : '?') + 'action=list&_=' + Date.now(), { redirect: 'follow' }, 60000);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      if (data && data.ok === false) throw new Error(data.error || 'Apps Script 回傳錯誤');
      return data;
    } catch (err) { lastErr = err; warn(`取清單第 ${attempt + 1} 次失敗：${err.message}`); }
  }
  throw lastErr;
}

function validateList(list) {
  if (!list || list.schemaVersion !== SCHEMA_VERSION || !Array.isArray(list.categories)) throw new Error('清單格式不符（schemaVersion 應為 ' + SCHEMA_VERSION + '）');
  if (!Array.isArray(list.hero)) list.hero = [];
}

function collectPhotos(list) {
  const map = new Map();
  for (const c of list.categories) for (const a of c.albums || []) for (const p of a.photos || []) if (p && p.id) map.set(p.id, p);
  for (const p of list.hero) if (p && p.id) map.set(p.id, p);
  return map;
}

async function readManifest() {
  try { return JSON.parse(await readFile(MANIFEST, 'utf8')); } catch { return {}; }
}
function entryFiles(entry) {
  if (entry.files) return Object.values(entry.files);
  return [entry.thumb, entry.large].filter(Boolean); // 舊格式（v1）
}
async function filesExist(entry) {
  try { for (const f of entryFiles(entry)) await stat(path.join(CACHE_DIR, f)); return true; } catch { return false; }
}
async function removeEntry(entry) {
  for (const f of entryFiles(entry)) { try { await rm(path.join(CACHE_DIR, f), { force: true }); } catch { /* 忽略 */ } }
}

function normalizeBase(u) { u = String(u || '').trim(); if (!u) return ''; return u.endsWith('/') ? u : u + '/'; }

async function fetchLiveSiteGallery(base) {
  if (!base) return null;
  try {
    const res = await fetchWithTimeout(base + 'data/gallery.json?_=' + Date.now(), { redirect: 'follow' }, 30000);
    if (!res.ok) { log(`線上 gallery.json：HTTP ${res.status}（第一次部署前是正常的）`); return null; }
    const data = await res.json();
    if (data && data.schemaVersion === SCHEMA_VERSION && Array.isArray(data.categories)) { log(`線上 gallery.json：${data.stats?.photos ?? '?'} 張，建置於 ${data.builtAt}`); return data; }
  } catch (err) { log('線上 gallery.json 讀不到：', err.message); }
  return null;
}

/** 快取裡沒有、但線上網站已經有同一版（rev 相同）的圖 → 直接抓回快取，省下重新下載原圖與轉檔 */
async function restoreFromLiveSite(liveSite, base, needed, manifest) {
  const online = collectPhotos(liveSite);
  const todo = [];
  for (const [id, photo] of needed) {
    const rev = photo.rev || 'r0';
    const hit = manifest[id];
    if (hit && hit.v === MANIFEST_VERSION && hit.rev === rev && (await filesExist(hit))) continue;
    const o = online.get(id);
    if (o && o.local && o.local.thumbs && o.local.medium && o.lqip && (o.rev || 'r0') === rev) todo.push({ id, rev, o }); // 只復原新格式；舊格式重新轉檔
  }
  if (!todo.length) return;
  log(`從線上網站復原 ${todo.length} 張已建置的圖片…`);
  let ok = 0;
  await runPool(todo, 6, async ({ id, rev, o }) => {
    try {
      const files = { l: `${id}-${rev}-l.webp`, m: `${id}-${rev}-m.webp` };
      for (const w of THUMB_WIDTHS) files['t' + w] = w === 640 ? `${id}-${rev}-t.webp` : `${id}-${rev}-t${w}.webp`;
      const bufs = { l: await fetchBinary(base + o.local.large), m: await fetchBinary(base + o.local.medium) };
      for (const w of THUMB_WIDTHS) bufs['t' + w] = await fetchBinary(base + o.local.thumbs[String(w)]);
      let bytes = 0;
      for (const k of Object.keys(files)) { await writeFile(path.join(CACHE_DIR, files[k]), bufs[k]); bytes += bufs[k].length; }
      manifest[id] = { v: MANIFEST_VERSION, rev, files, lqip: o.lqip, width: o.width, height: o.height, thumbWidth: o.local.thumbWidth, thumbHeight: o.local.thumbHeight, largeWidth: o.local.largeWidth, largeHeight: o.local.largeHeight, color: o.color || null, bytes, decoder: 'restored', via: 'live-site', at: new Date().toISOString() };
      ok++;
    } catch (err) { warn(`復原 ${id} 失敗：${err.message}`); }
  });
  log(`復原完成：${ok}/${todo.length}`);
}

async function fetchBinary(url) {
  const res = await fetchWithTimeout(url, { redirect: 'follow' }, 60000);
  if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + url);
  const type = res.headers.get('content-type') || '';
  if (!/image\//.test(type)) throw new Error('不是圖片：' + type);
  return Buffer.from(await res.arrayBuffer());
}

function buildOutput(list, results, { failed, outputBytes, listSource }) {
  const mapPhoto = (p) => {
    const e = results.get(p.id);
    const out = { id: p.id, createdTime: p.createdTime || null, modifiedTime: p.modifiedTime || null, mimeType: p.mimeType || '', rev: p.rev || 'r0', width: p.width || null, height: p.height || null };
    if (p.isCover) out.isCover = true;
    if (e) {
      out.width = e.width || out.width; out.height = e.height || out.height; out.color = e.color || null;
      if (e.lqip) out.lqip = e.lqip;
      const f = e.files || { t640: e.thumb, l: e.large };
      const thumbs = {};
      for (const w of THUMB_WIDTHS) if (f['t' + w]) thumbs[String(w)] = 'images/' + f['t' + w];
      out.local = { thumb: 'images/' + (f.t640 || e.thumb), thumbs, large: 'images/' + f.l, thumbWidth: e.thumbWidth, thumbHeight: e.thumbHeight, largeWidth: e.largeWidth, largeHeight: e.largeHeight };
      if (f.m) out.local.medium = 'images/' + f.m;
    }
    return out;
  };
  return {
    schemaVersion: SCHEMA_VERSION,
    source: 'build',
    generatedAt: list.generatedAt || null,
    builtAt: new Date().toISOString(),
    listSource,
    rootId: list.rootId || null,
    categories: list.categories.map((c) => ({ id: c.id, name: c.name, subtitle: c.subtitle || '', order: c.order ?? null, coverPhotoId: c.coverPhotoId || null,
      albums: (c.albums || []).map((a) => ({ id: a.id, name: a.name, subtitle: a.subtitle || '', order: a.order ?? null, implicit: !!a.implicit, coverPhotoId: a.coverPhotoId || null, photos: (a.photos || []).map(mapPhoto) })) })),
    hero: list.hero.map(mapPhoto),
    warnings: list.warnings || [],
    stats: list.stats || null,
    failed,
    outputBytes,
  };
}

/**
 * 把首屏需要的東西寫進 index.html／gallery.html：
 *   - <!-- build:head --> 區塊：內嵌清單（≤100 KB 內嵌全部，否則每相簿只嵌前 12 張並標 complete:false）、
 *     首屏圖片 preload（主圖、類別封面、前幾張作品格，作品格用 imagesrcset＋imagesizes 與前端的 sizes 一致）
 *   - Open Graph（og:title／description／image）
 */
async function injectHead(gallery, cfg) {
  const siteUrl = normalizeBase(cfg?.seo?.siteUrl || '');
  const title = cfg?.seo?.title || cfg?.shopName || '';
  const desc = cfg?.seo?.description || '';
  const allPhotos = [];
  for (const c of gallery.categories) for (const a of c.albums) for (const p of a.photos) allPhotos.push({ ...p, catId: c.id, albumId: a.id });
  const newest = allPhotos.slice().sort((a, b) => String(b.createdTime || '').localeCompare(String(a.createdTime || '')));
  const heroPhoto = gallery.hero.find((p) => p.local) || newest.find((p) => p.local) || null;
  let image = cfg?.seo?.ogImage || '';
  if (!image && siteUrl && heroPhoto) image = siteUrl + heroPhoto.local.large;

  // 內嵌清單（去掉建置專用的大欄位）
  const inlineFull = { ...gallery, failed: undefined, outputBytes: undefined, complete: true };
  let inline = inlineFull;
  if (JSON.stringify(inlineFull).length > INLINE_LIMIT) {
    inline = { ...inlineFull, complete: false, categories: gallery.categories.map((c) => ({ ...c, albums: c.albums.map((a) => ({ ...a, photos: a.photos.slice(0, 12), total: a.photos.length })) })) };
  }
  const inlineJson = JSON.stringify(inline).replace(/<\//g, '<\\/'); // 防止 </script> 提早結束
  const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const srcset = (p) => THUMB_WIDTHS.filter((w) => p.local?.thumbs?.[String(w)]).map((w) => `${p.local.thumbs[String(w)]} ${w}w`).join(', ');
  const preloadTile = (p, high) => p.local ? `  <link rel="preload" as="image" imagesrcset="${esc(srcset(p))}" imagesizes="${IMAGE_SIZES}"${high ? ' fetchpriority="high"' : ''}>` : '';
  const preloadImg = (p, high) => {
    if (!p?.local) return '';
    const set = [p.local.thumb ? `${p.local.thumb} 640w` : '', p.local.medium ? `${p.local.medium} 1080w` : '', `${p.local.large} 1920w`].filter(Boolean).join(', ');
    return `  <link rel="preload" as="image" imagesrcset="${esc(set)}" imagesizes="${HERO_SIZES}"${high ? ' fetchpriority="high"' : ''}>`;
  };

  const pages = {
    'index.html': () => {
      const lines = [];
      if (heroPhoto) lines.push(preloadImg(heroPhoto, true));
      // 類別封面（縮圖）
      for (const c of gallery.categories) { const cover = allPhotos.find((p) => p.id === c.coverPhotoId); if (cover) lines.push(preloadTile(cover, false)); }
      // 首頁最新作品前 8 張（前 4 張高優先）
      newest.slice(0, 8).forEach((p, i) => lines.push(preloadTile(p, i < 4)));
      return lines;
    },
    'gallery.html': () => {
      // 沒帶參數時預設顯示第一個類別的全部相簿：預載其前 8 張（前 4 張高優先）
      const first = gallery.categories[0];
      if (!first) return [];
      const photos = first.albums.flatMap((a) => a.photos).slice(0, 8);
      return photos.map((p, i) => preloadTile(p, i < 4));
    },
  };
  for (const [name, mk] of Object.entries(pages)) {
    const file = path.join(OUT_DIR, name);
    if (!existsSync(file)) continue;
    let html = await readFile(file, 'utf8');
    const block = ['<!-- build:head -->', `  <script id="gallery-inline" type="application/json">${inlineJson}</script>`, ...mk().filter(Boolean), '  <!-- /build:head -->'].join('\n');
    if (!/<!-- build:head -->[\s\S]*?<!-- \/build:head -->/.test(html)) { warn(`${name} 沒有 build:head 標記，略過首屏注入`); continue; }
    html = html.replace(/<!-- build:head -->[\s\S]*?<!-- \/build:head -->/, block);
    html = html.replace(/(<meta property="og:title" content=")[^"]*(" data-build-og="title">)/, `$1${esc(title)}$2`)
      .replace(/(<meta property="og:description" content=")[^"]*(" data-build-og="description">)/, `$1${esc(desc)}$2`)
      .replace(/(<meta property="og:image" content=")[^"]*(" data-build-og="image">)/, `$1${esc(image)}$2`)
      .replace(/(<meta name="description" content=")[^"]*(">)/, `$1${esc(desc)}$2`);
    await writeFile(file, html);
  }
  log(`首屏注入完成：內嵌清單 ${Math.round(inlineJson.length / 1024)} KB（${inline.complete ? '完整' : '部分'}）、og:image=${image || '（無）'}`);
}

function extFromMime(m) {
  return { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif', 'image/gif': 'gif' }[String(m || '').toLowerCase()] || '';
}

async function runPool(items, n, fn) {
  let i = 0;
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const it = items[i++]; await fn(it); } });
  await Promise.all(workers);
}
