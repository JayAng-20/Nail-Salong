#!/usr/bin/env node
/**
 * 本機正式模式：在 http://127.0.0.1:8080 架起「和 GitHub Pages 一模一樣」的網站
 *
 *   - 提供同一個 site/ 資料夾（同一份 HTML／CSS／JS／site-config.js，不注入任何假資料）
 *   - 即時層：前端直接連 site-config.js 裡的 Apps Script 網址（和線上相同）
 *   - 穩定層：啟動時先跑同一支 scripts/build-gallery.mjs 產生 gallery.json 與 images/，
 *             之後每隔 N 分鐘再跑一次（線上是由 Apps Script 通知 GitHub Actions 重建；本機沒有人會來通知，所以改成定時）
 *
 * 用法：
 *   npm run local                       → 建置一次後在 127.0.0.1:8080 提供，每 5 分鐘增量重建
 *   node scripts/local-server.mjs --port 8080 --host 127.0.0.1 --rebuild 5
 *   node scripts/local-server.mjs --no-build                 → 不建置，只提供現有檔案
 *   node scripts/local-server.mjs --rebuild 0                → 不定時重建
 *
 * 不想用 Node 也可以：先 `npm run build`，再 `cd site && python3 -m http.server 8080 --bind 127.0.0.1`
 * （網站是純靜態，任何靜態伺服器都行；差別只在沒有定時重建。）
 */
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.join(ROOT, 'site');
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def; };
const HOST = opt('host', '127.0.0.1');
const PORT = Number(opt('port', 8080));
const REBUILD_MIN = Number(opt('rebuild', 5));
const BUILD = !args.includes('--no-build');

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.woff2': 'font/woff2' };

let building = false;
function runBuild(reason) {
  if (building) return Promise.resolve();
  building = true;
  console.log(`\n[${new Date().toLocaleTimeString('zh-TW', { hour12: false })}] 穩定層建置開始（${reason}）…`);
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'scripts', 'build-gallery.mjs')], { stdio: 'inherit', env: { ...process.env, LIVE_SITE_BASE: process.env.LIVE_SITE_BASE || '' } });
    child.on('exit', (code) => { building = false; console.log(code === 0 ? '建置完成。' : `建置失敗（exit ${code}），網站維持上一版。`); resolve(); });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  let p = decodeURIComponent(url.pathname);
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(SITE, p));
  if (!file.startsWith(SITE)) { res.writeHead(403); return res.end('forbidden'); }
  try {
    const st = await stat(file);
    if (st.isDirectory()) throw new Error('dir');
    const body = await readFile(file);
    // gallery.json 與 HTML 不快取（和 GitHub Pages 的行為一致：前端用 cache: 'no-cache' 取 gallery.json）；圖片檔名帶版本，可長快取
    const cache = /\.(webp|png|jpg|jpeg|svg)$/i.test(file) ? 'public, max-age=31536000, immutable' : 'no-cache';
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': cache });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('not found');
  }
});

(async () => {
  if (BUILD) await runBuild('啟動');
  server.listen(PORT, HOST, () => {
    console.log(`\n網站已在 http://${HOST}:${PORT}/ 提供（作品集 /gallery.html、狀態 /status.html）`);
    if (BUILD && REBUILD_MIN > 0) {
      console.log(`每 ${REBUILD_MIN} 分鐘增量重建一次；按 Ctrl+C 結束。`);
      setInterval(() => runBuild('定時'), REBUILD_MIN * 60000);
    }
  });
})();
