/**
 * 彩蝶美甲美睫沙龍 作品網站 — Google Apps Script（唯一的 Google 端程式）
 * =====================================================================
 *
 * 功能：
 *   ① 即時清單 API   GET  ?action=list    → 整棵「類別 → 相簿 → 照片」樹（公開、15 秒快取）
 *   ② 變動偵測       時間觸發器 checkForChanges() 每 5 分鐘：樹有變就通知 GitHub（repository_dispatch）
 *   ③ 原圖提供       POST {action:"file", id, key} → base64 原檔（只給穩定層用，需共用密鑰；為備援路徑）
 *   ④ 狀態           GET  ?action=status  → 最近檢查／通知結果、數量、被忽略項目提醒
 *
 * 部署方式與要填的「指令碼屬性」請見 docs/SETUP.md。
 * 程式碼裡「只有屬性名稱」，沒有任何實際的 ID、權杖或密鑰。
 *
 * 需要啟用的服務：Apps Script 編輯器左側「服務」→ 新增「Drive API」（版本 v3）。
 *   （這是 Apps Script 內建的進階服務，不需要自己建立 Google Cloud 專案。）
 */

// ---------------------------------------------------------------------------
// 指令碼屬性（Script Properties）名稱 — 值在「專案設定 → 指令碼屬性」裡填
// ---------------------------------------------------------------------------
var PROP = {
  ROOT_FOLDER_ID: 'ROOT_FOLDER_ID',       // 必填：作品總資料夾 ID
  GITHUB_REPO: 'GITHUB_REPO',             // 必填：例如 JayAng-20/Nail-Salong
  GITHUB_TOKEN: 'GITHUB_TOKEN',           // 必填：fine-grained PAT（contents: read & write）
  GITHUB_EVENT_TYPE: 'GITHUB_EVENT_TYPE', // 選填：預設 drive-changed
  FILE_SECRET: 'FILE_SECRET',             // 選填：③ 原圖提供的共用密鑰（GitHub Secret 同值）
  NOTIFY_EMAIL: 'NOTIFY_EMAIL',           // 選填：錯誤通知信收件人，預設為指令碼擁有者
};

// 內部狀態（由程式自己寫入，不必手動填）
var STATE = {
  LAST_SIGNATURE: 'STATE_LAST_SIGNATURE',
  LAST_CHECK_AT: 'STATE_LAST_CHECK_AT',
  LAST_CHANGE_AT: 'STATE_LAST_CHANGE_AT',
  LAST_DISPATCH_AT: 'STATE_LAST_DISPATCH_AT',
  LAST_DISPATCH_RESULT: 'STATE_LAST_DISPATCH_RESULT',
  LAST_ERROR: 'STATE_LAST_ERROR',
  LAST_ERROR_AT: 'STATE_LAST_ERROR_AT',
  LAST_MAIL_KEY: 'STATE_LAST_MAIL_KEY',
  CHECK_COUNT_DATE: 'STATE_CHECK_COUNT_DATE',
  CHECK_COUNT: 'STATE_CHECK_COUNT',
};

var SCHEMA_VERSION = 1;          // 清單資料結構版本（前端與建置腳本都會檢查）
var LIST_CACHE_SECONDS = 15;     // 即時清單快取秒數（暫定 15 秒）
var CACHE_KEY_TREE = 'tree:v' + SCHEMA_VERSION;
var HERO_FOLDER_NAME = '首頁主圖';   // 底線開頭的唯一例外：_首頁主圖
var UNSORTED_ALBUM_NAME = '未分類';  // 類別資料夾底下散圖的隱含相簿
var ALL_WORKS_ALBUM_NAME = '全部作品'; // 類別底下「只有散圖、沒有任何相簿」時的隱含相簿名稱
var PARENTS_PER_QUERY = 25;      // 一次 Drive 查詢最多合併幾個父資料夾
var MAX_FILE_BYTES = 40 * 1024 * 1024; // ③ 原圖提供的單檔上限（Apps Script 回應大小保護）

var IMAGE_MIME = {
  'image/jpeg': true, 'image/jpg': true, 'image/png': true, 'image/webp': true,
  'image/heic': true, 'image/heif': true, 'image/heic-sequence': false, 'image/heif-sequence': false,
};
var IMAGE_EXT = { jpg: true, jpeg: true, png: true, webp: true, heic: true, heif: true };
var FOLDER_MIME = 'application/vnd.google-apps.folder';

// ===========================================================================
// 純函式：資料夾名稱解析（可在 Node 測試中直接載入本檔測試）
// ===========================================================================

/**
 * 解析資料夾名稱（第 7 節規則）。
 *   "01_簡約裸色_純粹耐看" → { order: 1, name: "簡約裸色", subtitle: "純粹耐看" }
 *   "2-法式"  → { order: 2, name: "法式" }      "03 節慶彩繪" → { order: 3, name: "節慶彩繪" }
 *   "個性設計" → { order: null, name: "個性設計" }
 *   "_草稿" / "＿草稿" → { ignored: true }
 *   "10_暈染＿夢幻" → { order: 10, name: "暈染", subtitle: "夢幻" }
 */
function parseFolderName(raw) {
  var original = String(raw == null ? '' : raw);
  var trimmed = original.trim();
  var startsWithUnderscore = /^[_＿]/.test(trimmed);
  var withoutUnderscore = trimmed.replace(/^[_＿]+/, '').trim();
  var isHero = startsWithUnderscore && withoutUnderscore === HERO_FOLDER_NAME;
  var ignored = startsWithUnderscore && !isHero;

  var order = null;
  var rest = trimmed;
  // 開頭數字 + 至少一個分隔符（_ ＿ - － . ． 空白）→ 排序用數字，顯示時去掉
  var m = trimmed.match(/^(\d+)[\s_＿\-－\.．]+(.*)$/);
  if (m && m[2].trim()) {
    order = parseInt(m[1], 10);
    rest = m[2].trim();
  }
  // 第一個底線之前是顯示名稱，之後是副標（選用）
  var name = rest;
  var subtitle = '';
  var s = rest.match(/^([^_＿]+)[_＿]+(.*)$/);
  if (s) {
    name = s[1].trim();
    subtitle = s[2].trim();
  }
  if (!name) name = trimmed || original;
  return { raw: original, ignored: ignored, isHero: isHero, order: order, name: name, subtitle: subtitle };
}

/** 排序：有數字的在前（數字小→大），沒數字的在後（依名稱）。 */
function compareParsed(a, b) {
  var ao = a.order, bo = b.order;
  if (ao !== null && bo !== null && ao !== bo) return ao - bo;
  if (ao !== null && bo === null) return -1;
  if (ao === null && bo !== null) return 1;
  return compareNames(a.name, b.name);
}

function compareNames(a, b) {
  try { return String(a).localeCompare(String(b), 'zh-Hant-TW'); }
  catch (e) { return String(a) < String(b) ? -1 : (String(a) > String(b) ? 1 : 0); }
}

function fileExtension(name) {
  var m = String(name || '').match(/\.([A-Za-z0-9]+)$/);
  return m ? m[1].toLowerCase() : '';
}

function isImageFile(item) {
  if (!item || item.mimeType === FOLDER_MIME) return false;
  if (IMAGE_MIME[item.mimeType] === true) return true;
  if (IMAGE_MIME[item.mimeType] === false) return false;
  return IMAGE_EXT[fileExtension(item.name)] === true;
}

function isFolder(item) {
  return !!item && item.mimeType === FOLDER_MIME;
}

function isCoverName(name) {
  return String(name || '').replace(/\.[A-Za-z0-9]+$/, '').trim().toLowerCase() === 'cover';
}

/** 把 Drive 檔案轉成「照片」物件（不含檔名、不含任何個資）。 */
function toPhoto(item) {
  var meta = item.imageMediaMetadata || {};
  var w = meta.width || null, h = meta.height || null;
  var rotation = meta.rotation || 0;
  if (w && h && (rotation === 1 || rotation === 3)) { var t = w; w = h; h = t; }
  var rev = item.md5Checksum ? String(item.md5Checksum).slice(0, 10)
          : shortHash(String(item.modifiedTime || '') + ':' + String(item.size || ''));
  return {
    id: item.id,
    createdTime: item.createdTime || null,
    modifiedTime: item.modifiedTime || null,
    mimeType: item.mimeType || '',
    width: w, height: h,
    rev: rev,
    isCover: isCoverName(item.name) || undefined,
  };
}

function sortPhotosNewestFirst(photos) {
  photos.sort(function (a, b) {
    var c = String(b.createdTime || '').localeCompare(String(a.createdTime || ''));
    return c !== 0 ? c : String(a.id).localeCompare(String(b.id));
  });
  // cover 排第一
  var idx = -1;
  for (var i = 0; i < photos.length; i++) if (photos[i].isCover) { idx = i; break; }
  if (idx > 0) { var cover = photos.splice(idx, 1)[0]; photos.unshift(cover); }
  return photos;
}

/**
 * 建立整棵樹（純函式）。listChildren(parentIds) 需回傳這些父資料夾底下的所有項目
 * （欄位：id, name, mimeType, createdTime, modifiedTime, md5Checksum, size, imageMediaMetadata, parents）。
 */
function buildTree(rootId, listChildren, nowIso) {
  var warnings = [];
  var rootItems = listChildren([rootId]);

  var categoryFolders = [];
  var heroFolder = null;
  rootItems.forEach(function (item) {
    if (isFolder(item)) {
      var p = parseFolderName(item.name);
      if (p.isHero) { heroFolder = item; return; }
      if (p.ignored) return;
      categoryFolders.push({ item: item, parsed: p });
    } else if (isImageFile(item)) {
      warnings.push({ code: 'loose-image-at-root', name: item.name, id: item.id,
        message: '總資料夾底下有一張沒有放進類別的照片，不會顯示：' + item.name });
    }
  });
  categoryFolders.sort(function (a, b) { return compareParsed(a.parsed, b.parsed); });

  // 第二層：一次列出所有類別資料夾（＋主圖資料夾）的內容
  var level2Parents = categoryFolders.map(function (c) { return c.item.id; });
  if (heroFolder) level2Parents.push(heroFolder.id);
  var level2 = groupByParent(level2Parents.length ? listChildren(level2Parents) : [], level2Parents);

  // 先決定每個類別的相簿資料夾，收集所有相簿 ID 後一次列出第三層
  var albumFolderIds = [];
  var categoriesDraft = categoryFolders.map(function (c) {
    var children = level2[c.item.id] || [];
    var albumFolders = [];
    var loosePhotos = [];
    children.forEach(function (item) {
      if (isFolder(item)) {
        var p = parseFolderName(item.name);
        if (p.ignored) return;
        albumFolders.push({ item: item, parsed: p });
        albumFolderIds.push(item.id);
      } else if (isImageFile(item)) {
        loosePhotos.push(toPhoto(item));
      }
    });
    albumFolders.sort(function (a, b) { return compareParsed(a.parsed, b.parsed); });
    return { folder: c, albumFolders: albumFolders, loosePhotos: loosePhotos };
  });
  var level3 = groupByParent(albumFolderIds.length ? listChildren(albumFolderIds) : [], albumFolderIds);

  var categories = [];
  categoriesDraft.forEach(function (d) {
    var cat = {
      id: d.folder.item.id,
      name: d.folder.parsed.name,
      subtitle: d.folder.parsed.subtitle,
      order: d.folder.parsed.order,
      coverPhotoId: null,
      albums: [],
    };
    d.albumFolders.forEach(function (a) {
      var children = level3[a.item.id] || [];
      var photos = [];
      children.forEach(function (item) {
        if (isFolder(item)) {
          warnings.push({ code: 'deep-folder', name: item.name, id: item.id,
            message: '第三層資料夾會被忽略：' + cat.name + ' / ' + a.parsed.name + ' / ' + item.name });
        } else if (isImageFile(item)) {
          photos.push(toPhoto(item));
        }
      });
      if (!photos.length) return; // 空相簿不顯示
      sortPhotosNewestFirst(photos);
      cat.albums.push({
        id: a.item.id,
        name: a.parsed.name,
        subtitle: a.parsed.subtitle,
        order: a.parsed.order,
        implicit: false,
        coverPhotoId: photos[0].id,
        photos: photos,
      });
    });
    if (d.loosePhotos.length) {
      sortPhotosNewestFirst(d.loosePhotos);
      cat.albums.push({
        id: cat.id + '__loose',
        name: cat.albums.length ? UNSORTED_ALBUM_NAME : ALL_WORKS_ALBUM_NAME,
        subtitle: '',
        order: null,
        implicit: true,
        coverPhotoId: d.loosePhotos[0].id,
        photos: d.loosePhotos,
      });
    }
    if (!cat.albums.length) return; // 沒有任何照片的類別不顯示
    cat.coverPhotoId = cat.albums[0].coverPhotoId;
    categories.push(cat);
  });

  var hero = [];
  if (heroFolder) {
    (level2[heroFolder.id] || []).forEach(function (item) { if (isImageFile(item)) hero.push(toPhoto(item)); });
    sortPhotosNewestFirst(hero);
  }

  var stats = { categories: categories.length, albums: 0, photos: 0 };
  categories.forEach(function (c) { stats.albums += c.albums.length; c.albums.forEach(function (a) { stats.photos += a.photos.length; }); });

  return {
    schemaVersion: SCHEMA_VERSION,
    source: 'live',
    generatedAt: nowIso || new Date().toISOString(),
    rootId: rootId,
    categories: categories,
    hero: hero,
    warnings: warnings,
    stats: stats,
  };
}

function groupByParent(items, parentIds) {
  var map = {};
  parentIds.forEach(function (id) { map[id] = []; });
  items.forEach(function (item) {
    (item.parents || []).forEach(function (pid) { if (map[pid]) map[pid].push(item); });
  });
  return map;
}

/** 樹的簽章：任何 ID／名稱／修改時間／內容變動都會改變（不含 warnings）。 */
function treeSignature(tree) {
  var lines = [];
  tree.categories.forEach(function (c) {
    lines.push('C|' + c.id + '|' + c.name + '|' + c.subtitle + '|' + c.order);
    c.albums.forEach(function (a) {
      lines.push('A|' + c.id + '|' + a.id + '|' + a.name + '|' + a.subtitle + '|' + a.order);
      a.photos.forEach(function (p) { lines.push('P|' + a.id + '|' + p.id + '|' + p.rev + '|' + p.createdTime + '|' + (p.isCover ? 1 : 0)); });
    });
  });
  tree.hero.forEach(function (p) { lines.push('H|' + p.id + '|' + p.rev); });
  lines.sort();
  return sha256Hex(lines.join('\n'));
}

// ===========================================================================
// Google 端：Drive 列舉、快取、狀態
// ===========================================================================

function getProps_() { return PropertiesService.getScriptProperties(); }
function getProp_(name, fallback) { var v = getProps_().getProperty(name); return (v === null || v === undefined || v === '') ? fallback : v; }
function setProp_(name, value) { getProps_().setProperty(name, value === null || value === undefined ? '' : String(value)); }
function requireProp_(name) { var v = getProp_(name, ''); if (!v) throw new Error('缺少指令碼屬性：' + name + '（請到「專案設定 → 指令碼屬性」填入）'); return v; }

function assertDriveService_() {
  if (typeof Drive === 'undefined' || !Drive.Files || !Drive.Files.list) {
    throw new Error('尚未啟用 Drive API 進階服務：請在 Apps Script 編輯器左側「服務」新增「Drive API」（版本 v3）。');
  }
}

/** 用 Drive API v3 一次列出多個父資料夾的內容（每 25 個父資料夾合併成一次查詢，含分頁）。 */
function driveListChildren_(parentIds) {
  assertDriveService_();
  var results = [];
  var fields = 'nextPageToken, files(id, name, mimeType, createdTime, modifiedTime, md5Checksum, size, parents, imageMediaMetadata(width, height, rotation))';
  for (var i = 0; i < parentIds.length; i += PARENTS_PER_QUERY) {
    var chunk = parentIds.slice(i, i + PARENTS_PER_QUERY);
    var q = '(' + chunk.map(function (id) { return "'" + id.replace(/'/g, "\\'") + "' in parents"; }).join(' or ') + ') and trashed = false';
    var pageToken = null;
    do {
      var params = { q: q, pageSize: 1000, fields: fields, supportsAllDrives: true, includeItemsFromAllDrives: true };
      if (pageToken) params.pageToken = pageToken;
      var resp = Drive.Files.list(params);
      if (resp && resp.files) results = results.concat(resp.files);
      pageToken = resp ? resp.nextPageToken : null;
    } while (pageToken);
  }
  return results;
}

/** 建立即時樹（不經快取）。 */
function buildLiveTree_() {
  var rootId = requireProp_(PROP.ROOT_FOLDER_ID);
  var t0 = Date.now();
  var tree = buildTree(rootId, driveListChildren_, new Date().toISOString());
  tree.buildMs = Date.now() - t0;
  return tree;
}

/** 取得樹（15 秒快取）。 */
function getTreeCached_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get(CACHE_KEY_TREE);
  if (hit) { try { var t = JSON.parse(hit); t.cached = true; return t; } catch (e) { /* 重建 */ } }
  var tree = buildLiveTree_();
  var json = JSON.stringify(tree);
  if (json.length < 100 * 1024) { // CacheService 單筆上限 100 KB；超過就不快取（仍正常回傳）
    cache.put(CACHE_KEY_TREE, json, LIST_CACHE_SECONDS);
  }
  tree.cached = false;
  return tree;
}

function buildStatus_() {
  var status = {
    ok: true,
    time: new Date().toISOString(),
    schemaVersion: SCHEMA_VERSION,
    lastCheckAt: getProp_(STATE.LAST_CHECK_AT, null),
    lastChangeAt: getProp_(STATE.LAST_CHANGE_AT, null),
    lastDispatchAt: getProp_(STATE.LAST_DISPATCH_AT, null),
    lastDispatchResult: getProp_(STATE.LAST_DISPATCH_RESULT, null),
    lastError: getProp_(STATE.LAST_ERROR, null),
    lastErrorAt: getProp_(STATE.LAST_ERROR_AT, null),
    checksToday: null,
    triggerInstalled: false,
    config: {
      rootFolderSet: !!getProp_(PROP.ROOT_FOLDER_ID, ''),
      repoSet: !!getProp_(PROP.GITHUB_REPO, ''),
      tokenSet: !!getProp_(PROP.GITHUB_TOKEN, ''),
      fileSecretSet: !!getProp_(PROP.FILE_SECRET, ''),
      driveServiceEnabled: (typeof Drive !== 'undefined' && !!Drive.Files),
    },
    counts: null,
    warnings: [],
    error: null,
  };
  try {
    var today = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd');
    if (getProp_(STATE.CHECK_COUNT_DATE, '') === today) status.checksToday = parseInt(getProp_(STATE.CHECK_COUNT, '0'), 10);
  } catch (e) { /* 忽略 */ }
  try {
    status.triggerInstalled = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'checkForChanges'; });
  } catch (e) { /* 網頁應用程式以擁有者身分執行時可讀；讀不到就維持 false */ }
  try {
    var tree = getTreeCached_();
    status.counts = tree.stats;
    status.warnings = tree.warnings;
    status.treeGeneratedAt = tree.generatedAt;
    status.treeCached = !!tree.cached;
    status.treeBuildMs = tree.buildMs || null;
  } catch (e) {
    status.ok = false;
    status.error = String(e && e.message ? e.message : e);
  }
  return status;
}

// ===========================================================================
// 網頁應用程式入口
// ===========================================================================

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'list';
  try {
    if (action === 'list') return jsonOut_(getTreeCached_());
    if (action === 'status') return jsonOut_(buildStatus_());
    if (action === 'ping') return jsonOut_({ ok: true, time: new Date().toISOString(), schemaVersion: SCHEMA_VERSION });
    if (action === 'file') return jsonOut_({ ok: false, error: 'file 動作只接受 POST' });
    return jsonOut_({ ok: false, error: '未知的 action' });
  } catch (err) {
    return jsonOut_({ ok: false, schemaVersion: SCHEMA_VERSION, error: String(err && err.message ? err.message : err) });
  }
}

function doPost(e) {
  var body = {};
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) { body = {}; }
  var action = body.action || (e && e.parameter && e.parameter.action) || '';
  try {
    if (action === 'file') return jsonOut_(serveFile_(body));
    if (action === 'ping') return jsonOut_({ ok: true, time: new Date().toISOString() });
    return jsonOut_({ ok: false, error: '未知的 action' });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** ③ 原圖提供：驗證密鑰後回傳 base64。密鑰錯誤、檔案不在總資料夾底下，一律回相同的拒絕訊息。 */
function serveFile_(body) {
  var DENY = { ok: false, error: 'denied' };
  var secret = getProp_(PROP.FILE_SECRET, '');
  if (!secret || !body || !body.key || !constantTimeEqual_(String(body.key), secret)) return DENY;
  var id = String(body.id || '');
  if (!/^[A-Za-z0-9_-]{10,}$/.test(id)) return DENY;
  var rootId = requireProp_(PROP.ROOT_FOLDER_ID);
  if (!isUnderFolder_(id, rootId, 5)) return DENY; // 只提供總資料夾底下的檔案，避免密鑰持有者讀到其他檔案
  var file = DriveApp.getFileById(id);
  var blob = file.getBlob();
  var bytes = blob.getBytes();
  if (bytes.length > MAX_FILE_BYTES) return { ok: false, error: 'too-large', size: bytes.length };
  return { ok: true, id: id, mimeType: blob.getContentType(), size: bytes.length, base64: Utilities.base64Encode(bytes) };
}

function isUnderFolder_(fileId, rootId, maxDepth) {
  assertDriveService_();
  var current = fileId;
  for (var depth = 0; depth < maxDepth; depth++) {
    var meta = Drive.Files.get(current, { fields: 'id, parents', supportsAllDrives: true });
    var parents = (meta && meta.parents) || [];
    if (!parents.length) return false;
    if (parents.indexOf(rootId) >= 0) return true;
    current = parents[0];
  }
  return false;
}

function constantTimeEqual_(a, b) {
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ===========================================================================
// ② 變動偵測（時間觸發器每 5 分鐘）
// ===========================================================================

function checkForChanges() {
  var now = new Date();
  var nowIso = now.toISOString();
  bumpCheckCount_(now);
  setProp_(STATE.LAST_CHECK_AT, nowIso);
  var tree;
  try {
    tree = buildLiveTree_();
  } catch (err) {
    recordError_('list', '列出雲端硬碟失敗：' + err.message);
    return;
  }
  var sig = treeSignature(tree);
  var last = getProp_(STATE.LAST_SIGNATURE, '');
  if (sig === last) return; // 沒有變動

  setProp_(STATE.LAST_CHANGE_AT, nowIso);
  var result = dispatchToGitHub_(sig, nowIso);
  setProp_(STATE.LAST_DISPATCH_AT, nowIso);
  setProp_(STATE.LAST_DISPATCH_RESULT, result.ok ? 'ok ' + result.status : 'fail ' + result.status + ' ' + result.message);
  if (result.ok) {
    setProp_(STATE.LAST_SIGNATURE, sig); // 通知成功後才更新簽章；失敗會在下一輪重試
    setProp_(STATE.LAST_ERROR, '');
  } else {
    recordError_('dispatch', '通知 GitHub 失敗（HTTP ' + result.status + '）：' + result.message);
  }
}

function dispatchToGitHub_(signature, changedAt) {
  var repo = getProp_(PROP.GITHUB_REPO, '');
  var token = getProp_(PROP.GITHUB_TOKEN, '');
  if (!repo || !token) return { ok: false, status: 0, message: '尚未設定 GITHUB_REPO 或 GITHUB_TOKEN' };
  var eventType = getProp_(PROP.GITHUB_EVENT_TYPE, 'drive-changed');
  var url = 'https://api.github.com/repos/' + repo + '/dispatches';
  var resp = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    payload: JSON.stringify({ event_type: eventType, client_payload: { signature: signature, changedAt: changedAt } }),
    muteHttpExceptions: true,
  });
  var code = resp.getResponseCode();
  if (code === 204) return { ok: true, status: 204, message: '' };
  var text = String(resp.getContentText() || '').slice(0, 200);
  return { ok: false, status: code, message: text };
}

function bumpCheckCount_(now) {
  try {
    var today = Utilities.formatDate(now, 'Asia/Taipei', 'yyyy-MM-dd');
    var n = getProp_(STATE.CHECK_COUNT_DATE, '') === today ? parseInt(getProp_(STATE.CHECK_COUNT, '0'), 10) : 0;
    setProp_(STATE.CHECK_COUNT_DATE, today);
    setProp_(STATE.CHECK_COUNT, String(n + 1));
  } catch (e) { /* 忽略 */ }
}

/** 記錄錯誤供狀態端點查詢；同一種錯誤一天最多寄一封信給擁有者。 */
function recordError_(kind, message) {
  var nowIso = new Date().toISOString();
  setProp_(STATE.LAST_ERROR, '[' + kind + '] ' + message);
  setProp_(STATE.LAST_ERROR_AT, nowIso);
  try {
    var day = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd');
    var mailKey = kind + ':' + day;
    if (getProp_(STATE.LAST_MAIL_KEY, '') === mailKey) return;
    var to = getProp_(PROP.NOTIFY_EMAIL, '') || Session.getEffectiveUser().getEmail();
    if (!to) return;
    MailApp.sendEmail(to, '[作品網站] Apps Script 錯誤：' + kind,
      '時間：' + nowIso + '\n\n' + message + '\n\n' +
      '處理方式請見專案 docs/SETUP.md「權杖到期怎麼換」與「壞掉時看哪裡」。\n' +
      '（同一種錯誤一天只會寄一封。）');
    setProp_(STATE.LAST_MAIL_KEY, mailKey);
  } catch (e) { /* 寄信失敗不影響主流程 */ }
}

// ===========================================================================
// 一次性設定輔助（在編輯器裡手動執行）
// ===========================================================================

/** 建立（或重建）每 5 分鐘的變動偵測觸發器。 */
function installTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'checkForChanges') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('checkForChanges').timeBased().everyMinutes(5).create();
  Logger.log('已建立觸發器：checkForChanges 每 5 分鐘執行一次');
}

/** 檢查設定是否齊全、Drive 是否讀得到、列舉花多久。執行後看「執行記錄」。 */
function testSetup() {
  var report = [];
  ['ROOT_FOLDER_ID', 'GITHUB_REPO', 'GITHUB_TOKEN'].forEach(function (k) {
    report.push((getProp_(PROP[k], '') ? '✔ ' : '✘ 缺少 ') + k);
  });
  report.push((getProp_(PROP.FILE_SECRET, '') ? '✔ ' : '－ （選填）') + 'FILE_SECRET');
  try {
    assertDriveService_();
    report.push('✔ Drive API 進階服務已啟用');
    var tree = buildLiveTree_();
    report.push('✔ 列舉成功：' + tree.stats.categories + ' 個類別、' + tree.stats.albums + ' 個相簿、' + tree.stats.photos + ' 張照片，耗時 ' + tree.buildMs + ' ms');
    tree.categories.forEach(function (c) {
      report.push('   類別「' + c.name + '」：' + c.albums.map(function (a) { return a.name + '(' + a.photos.length + ')'; }).join('、'));
    });
    if (tree.hero.length) report.push('   首頁主圖：' + tree.hero.length + ' 張');
    tree.warnings.forEach(function (w) { report.push('   ⚠ ' + w.message); });
    var json = JSON.stringify(tree);
    report.push('   清單 JSON 大小：' + Math.round(json.length / 1024) + ' KB' + (json.length >= 100 * 1024 ? '（超過 100 KB，將不使用 CacheService 快取）' : ''));
  } catch (e) {
    report.push('✘ ' + e.message);
  }
  report.push('觸發器：' + (ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'checkForChanges'; }) ? '已安裝' : '尚未安裝（請執行 installTriggers）'));
  Logger.log(report.join('\n'));
  return report.join('\n');
}

/** 手動送一次 repository_dispatch（測試權杖用）。 */
function testDispatch() {
  var r = dispatchToGitHub_('manual-test', new Date().toISOString());
  Logger.log(r.ok ? '✔ GitHub 已接受通知（204）' : '✘ 失敗：HTTP ' + r.status + ' ' + r.message);
  return r;
}

/** 清除簽章，讓下一次 checkForChanges 一定會通知 GitHub。 */
function resetSignature() {
  setProp_(STATE.LAST_SIGNATURE, '');
  Logger.log('已清除簽章');
}

// ===========================================================================
// 工具
// ===========================================================================

function sha256Hex(str) {
  if (typeof Utilities !== 'undefined' && Utilities.computeDigest) {
    var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, str, Utilities.Charset.UTF_8);
    return bytes.map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
  }
  if (typeof __nodeSha256 === 'function') return __nodeSha256(str); // Node 測試環境注入
  return simpleHash_(str);
}

function shortHash(str) { return sha256Hex(str).slice(0, 10); }

function simpleHash_(str) {
  var h = 2166136261;
  for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return ('00000000' + h.toString(16)).slice(-8);
}
