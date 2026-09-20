// 狀態檢查頁：一眼看出壞的是哪一段（gallery.json／即時清單／數量差異／Apps Script 通知／圖片來源）
import { $, el, formatTime, formatRelative } from './util.js';
import { CONFIG, CONFIG_LOADED, siteBase } from './config.js';
import { initCommon } from './common.js';
import { normalizeTree, photoIndex, flattenPhotos } from './tree.js';
import { liveCandidates, probe } from './image-source.js';
import { isLiveUrl } from './data.js';

initCommon({ pageTitle: '狀態檢查' });

const grid = $('#status-grid');
const cards = {};
function card(key, title) {
  const c = el('section', { class: 'card status-card' }, [el('h3', {}, [el('span', { class: 'dot', 'data-dot': '' }), title]), el('div', { class: 'body', text: '檢查中…' })]);
  cards[key] = c; grid.append(c); return c;
}
function set(key, state, html) { const c = cards[key]; c.querySelector('[data-dot]').className = 'dot ' + state; c.querySelector('.body').innerHTML = html; }
function kv(rows) { return '<dl class="kv">' + rows.map(([k, v]) => `<dt>${k}</dt><dd>${v ?? '—'}</dd>`).join('') + '</dl>'; }
function esc(s) { return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

card('config', '設定檔');
card('built', '已建置清單 gallery.json');
card('live', '即時清單（Apps Script）');
card('diff', '兩邊數量差異');
card('script', 'Apps Script 變動偵測 → GitHub');
card('images', '圖片來源候選網址測試');
card('warnings', '雲端硬碟誤放提醒');

run();

async function run() {
  // 設定檔
  const liveOk = isLiveUrl(CONFIG.appsScriptUrl);
  set('config', CONFIG_LOADED ? (liveOk ? 'ok' : 'warn') : 'fail', kv([
    ['site-config.js', CONFIG_LOADED ? '已讀到' : '<b>讀不到（語法錯誤或檔案不存在），目前用預設文字</b>'],
    ['店名', esc(CONFIG.shopName)],
    ['Apps Script 網址', liveOk ? '格式正確' : (CONFIG.appsScriptUrl ? '<b>格式不對</b>（需以 https://script.google.com/macros/s/ 開頭、/exec 結尾）' : '<b>未填</b>（即時層關閉）')],
    ['輪詢間隔', CONFIG.liveRefreshSeconds + ' 秒'], ['即時逾時', CONFIG.liveTimeoutMs + ' ms'],
  ]));

  // gallery.json
  let built = null;
  {
    const t0 = performance.now();
    try {
      const res = await fetch(siteBase() + 'data/gallery.json', { cache: 'no-cache' });
      const ms = Math.round(performance.now() - t0);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const raw = await res.json(); built = normalizeTree(raw, 'build');
      if (!built) throw new Error('格式不符（schemaVersion 或 categories）');
      set('built', 'ok', kv([['建置時間', `${formatTime(raw.builtAt)}（${formatRelative(raw.builtAt)}）`], ['清單來源時間', formatTime(raw.generatedAt)], ['數量', `${built.stats.categories} 類別／${built.stats.albums} 相簿／${built.stats.photos} 照片`], ['首頁主圖', built.hero.length + ' 張'], ['載入時間', ms + ' ms'], ['轉檔失敗', raw.failed?.length ? raw.failed.length + ' 張（見下方）' : '0'], ['輸出大小', raw.outputBytes ? (raw.outputBytes / 1048576).toFixed(1) + ' MB' : '—']]) + (raw.failed?.length ? '<ul class="status-list">' + raw.failed.map((f) => `<li>${esc(f.id)}：${esc(f.error)}</li>`).join('') + '</ul>' : ''));
    } catch (err) {
      set('built', 'warn', kv([['狀態', `<b>讀不到</b>：${esc(err.message)}`], ['說明', '第一次部署前是正常的；之後若一直讀不到，代表 GitHub Actions 建置沒有成功。']]));
    }
  }

  // 即時清單
  let live = null, liveRaw = null;
  if (!liveOk) set('live', 'warn', '尚未設定 Apps Script 網址，即時層關閉。');
  else {
    const t0 = performance.now();
    const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), CONFIG.liveTimeoutMs);
    try {
      const res = await fetch(CONFIG.appsScriptUrl + '?action=list&_=' + Date.now(), { signal: ctrl.signal, cache: 'no-store' });
      const ms = Math.round(performance.now() - t0);
      const raw = await res.json(); liveRaw = raw; live = normalizeTree(raw, 'live');
      if (!live) throw new Error(raw.error || '格式不符');
      set('live', ms > 4000 ? 'warn' : 'ok', kv([['回應時間', ms + ' ms' + (raw.cached ? '（快取）' : '（未命中快取，Drive 列舉 ' + (raw.buildMs ?? '?') + ' ms）')], ['產生時間', formatTime(raw.generatedAt)], ['數量', `${live.stats.categories} 類別／${live.stats.albums} 相簿／${live.stats.photos} 照片`], ['首頁主圖', live.hero.length + ' 張'], ['結構版本', raw.schemaVersion]]));
    } catch (err) {
      const aborted = err.name === 'AbortError';
      set('live', 'fail', kv([['狀態', `<b>連不上</b>：${aborted ? '逾時 ' + CONFIG.liveTimeoutMs + ' ms' : esc(err.message)}`], ['網站表現', '客人只會看到 gallery.json 的作品，不會看到錯誤。'], ['可能原因', '網址錯、部署未設「任何人」、Apps Script 出錯（看下一張卡）']]));
    } finally { clearTimeout(timer); }
  }

  // 差異
  if (built && live) {
    const b = photoIndex(built), l = photoIndex(live);
    const onlyLive = [...l.keys()].filter((id) => !b.has(id));
    const onlyBuilt = [...b.keys()].filter((id) => !l.has(id));
    const changed = [...l.entries()].filter(([id, v]) => b.has(id) && b.get(id).p.rev && v.p.rev && b.get(id).p.rev !== v.p.rev).map(([id]) => id);
    const state = onlyLive.length + onlyBuilt.length + changed.length === 0 ? 'ok' : 'warn';
    set('diff', state, kv([['只在即時清單', `${onlyLive.length} 張（剛上傳，等重建）`], ['只在建置清單', `${onlyBuilt.length} 張（已刪除，前端會立刻隱藏）`], ['內容已更換', `${changed.length} 張`], ['判讀', state === 'ok' ? '兩邊一致' : '正常情況下，下一次穩定層重建後會歸零；若超過 30 分鐘仍不一致，檢查 Apps Script 通知與 Actions 是否成功。']]));
  } else set('diff', 'warn', '需要兩邊都讀得到才能比對。');

  // Apps Script 狀態
  if (liveOk) {
    try {
      const res = await fetch(CONFIG.appsScriptUrl + '?action=status&_=' + Date.now(), { cache: 'no-store' });
      const s = await res.json();
      const dispatchOk = !s.lastDispatchResult || String(s.lastDispatchResult).startsWith('ok');
      const cfgOk = s.config && s.config.rootFolderSet && s.config.repoSet && s.config.tokenSet && s.config.driveServiceEnabled;
      const state = !s.ok ? 'fail' : (!cfgOk || !s.triggerInstalled || !dispatchOk || s.lastError) ? 'warn' : 'ok';
      set('script', state, kv([
        ['指令碼屬性', s.config ? `總資料夾 ${s.config.rootFolderSet ? '✔' : '✘'}｜repo ${s.config.repoSet ? '✔' : '✘'}｜權杖 ${s.config.tokenSet ? '✔' : '✘'}｜Drive API ${s.config.driveServiceEnabled ? '✔' : '✘'}｜原圖密鑰 ${s.config.fileSecretSet ? '✔' : '－'}` : '—'],
        ['觸發器', s.triggerInstalled ? '已安裝（每 5 分鐘）' : '<b>未安裝</b>（在編輯器執行 installTriggers）'],
        ['最近檢查', s.lastCheckAt ? `${formatTime(s.lastCheckAt)}（${formatRelative(s.lastCheckAt)}）` : '尚未執行過'],
        ['今日檢查次數', s.checksToday ?? '—'],
        ['最近偵測到變動', formatTime(s.lastChangeAt)],
        ['最近通知 GitHub', `${formatTime(s.lastDispatchAt)} → ${esc(s.lastDispatchResult) || '—'}`],
        ['最近錯誤', s.lastError ? `<b>${esc(s.lastError)}</b>（${formatTime(s.lastErrorAt)}）` : '無'],
        ['端點錯誤', s.error ? `<b>${esc(s.error)}</b>` : '無'],
      ]));
    } catch (err) { set('script', 'fail', `讀不到狀態端點：${esc(err.message)}`); }
  } else set('script', 'warn', '尚未設定 Apps Script 網址。');

  // 圖片來源測試：挑即時清單（或建置清單）的前兩張照片，測每個候選網址
  {
    const tree = live || built;
    const photos = tree ? flattenPhotos(tree).slice(0, 2) : [];
    if (!photos.length) set('images', 'warn', '沒有照片可以測試。');
    else {
      const results = [];
      for (const p of photos) for (const url of liveCandidates(p.id, 'thumb')) results.push(await probe(url));
      const okCount = results.filter((r) => r.ok).length;
      set('images', okCount === results.length ? 'ok' : okCount ? 'warn' : 'fail', '<ul class="status-list">' + results.map((r) => `<li>${r.ok ? '✔' : '✘'} ${r.ms} ms — ${esc(r.url)}</li>`).join('') + '</ul><p class="muted" style="font-size:12px;margin-top:8px">第一個是 lh3 直連（主要來源），第二個是 drive.google.com/thumbnail（備援）。</p>');
    }
  }

  // 誤放提醒
  {
    const w = (live && live.warnings) || (liveRaw && liveRaw.warnings) || (built && built.warnings) || [];
    set('warnings', w.length ? 'warn' : 'ok', w.length ? '<ul class="status-list">' + w.map((x) => `<li>${esc(x.message || x.code)}</li>`).join('') + '</ul>' : '沒有誤放的項目。');
  }
}
