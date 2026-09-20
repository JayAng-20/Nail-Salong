import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadAppsScript } from './load-gs.mjs';

const gs = loadAppsScript();
const FOLDER = 'application/vnd.google-apps.folder';

function folder(id, name, parent) { return { id, name, mimeType: FOLDER, parents: [parent] }; }
function img(id, name, parent, created, extra = {}) {
  return { id, name, mimeType: 'image/jpeg', parents: [parent], createdTime: created, modifiedTime: created, md5Checksum: 'md5' + id, imageMediaMetadata: { width: 3000, height: 4000, rotation: 0 }, ...extra };
}

// 模擬雲端硬碟：符合第 7 節示意的結構，外加使用者目前「散圖直接放類別底下」的實況
function makeDrive() {
  const items = [
    folder('cat-nail', '01_美甲', 'root'),
    folder('cat-lash', '02_美睫', 'root'),
    folder('hero', '_首頁主圖', 'root'),
    folder('draft', '_草稿', 'root'),
    folder('cat-empty', '03_空類別', 'root'),
    img('root-loose', 'oops.jpg', 'root', '2026-09-01T00:00:00Z'),
    { id: 'root-txt', name: '說明.txt', mimeType: 'text/plain', parents: ['root'] },

    folder('alb-nude', '01_簡約裸色_純粹耐看', 'cat-nail'),
    folder('alb-french', '2-法式', 'cat-nail'),
    folder('alb-empty', '03_空相簿', 'cat-nail'),
    folder('alb-draft', '_草稿相簿', 'cat-nail'),
    img('nail-loose-1', 'IMG_1.jpg', 'cat-nail', '2026-09-10T00:00:00Z'),

    img('nude-1', 'IMG_a.jpg', 'alb-nude', '2026-09-05T00:00:00Z'),
    img('nude-2', 'IMG_b.jpg', 'alb-nude', '2026-09-06T00:00:00Z'),
    img('nude-cover', 'cover.jpg', 'alb-nude', '2026-01-01T00:00:00Z'),
    folder('deep', '太深的資料夾', 'alb-nude'),
    { id: 'nude-txt', name: 'note.txt', mimeType: 'text/plain', parents: ['alb-nude'] },
    { id: 'nude-mov', name: 'clip.mov', mimeType: 'video/quicktime', parents: ['alb-nude'] },

    img('fr-1', 'IMG_c.jpg', 'alb-french', '2026-09-07T00:00:00Z', { imageMediaMetadata: { width: 4032, height: 3024, rotation: 1 } }),

    // 美睫：沒有任何相簿，只有散圖（使用者目前的實況）
    img('lash-1', 'a.jpg', 'cat-lash', '2026-09-02T00:00:00Z'),
    img('lash-2', 'b.HEIC', 'cat-lash', '2026-09-03T00:00:00Z', { mimeType: 'image/heif' }),
    { id: 'lash-txt', name: '專題.txt', mimeType: 'text/plain', parents: ['cat-lash'] },

    img('hero-1', 'h1.jpg', 'hero', '2026-09-01T00:00:00Z'),
    img('draft-1', 'd.jpg', 'draft', '2026-09-01T00:00:00Z'),
  ];
  const calls = [];
  const listChildren = (parentIds) => { calls.push(parentIds.slice()); return items.filter((i) => parentIds.includes(i.parents[0])); };
  return { listChildren, calls };
}

test('buildTree：類別、相簿、隱含相簿、忽略規則、封面、排序', () => {
  const drive = makeDrive();
  const tree = gs.buildTree('root', drive.listChildren, '2026-09-20T00:00:00Z');

  assert.equal(tree.schemaVersion, 1);
  assert.deepEqual(tree.categories.map((c) => c.name), ['美甲', '美睫'], '空類別與草稿不出現');
  const nail = tree.categories[0];
  assert.deepEqual(nail.albums.map((a) => a.name), ['簡約裸色', '法式', '未分類'], '空相簿、草稿相簿不出現；散圖歸入「未分類」排最後');
  assert.equal(nail.albums[0].subtitle, '純粹耐看');
  assert.equal(nail.albums[0].coverPhotoId, 'nude-cover', 'cover.jpg 當封面');
  assert.deepEqual(nail.albums[0].photos.map((p) => p.id), ['nude-cover', 'nude-2', 'nude-1'], 'cover 第一、其餘新到舊');
  assert.equal(nail.coverPhotoId, 'nude-cover', '類別封面 = 第一個相簿的封面');
  assert.equal(nail.albums[2].implicit, true);

  const french = nail.albums[1];
  assert.equal(french.photos[0].width, 3024, 'rotation=1 時寬高互換');
  assert.equal(french.photos[0].height, 4032);

  const lash = tree.categories[1];
  assert.equal(lash.albums.length, 1);
  assert.equal(lash.albums[0].name, '全部作品', '類別底下只有散圖時，隱含相簿叫「全部作品」');
  assert.deepEqual(lash.albums[0].photos.map((p) => p.id), ['lash-2', 'lash-1']);

  assert.deepEqual(tree.hero.map((p) => p.id), ['hero-1']);
  assert.deepEqual(tree.warnings.map((w) => w.code).sort(), ['deep-folder', 'loose-image-at-root']);
  assert.equal(tree.stats.photos, 7);

  // 輸出不得含檔名或個資
  const json = JSON.stringify(tree.categories);
  assert.ok(!json.includes('IMG_'), '照片不得帶檔名');
  assert.ok(!json.includes('@'), '不得含電子郵件');

  // 列舉次數：根 1 次 + 第二層 1 次 + 第三層 1 次 = 3 次
  assert.equal(drive.calls.length, 3, `列舉次數應為 3，實際 ${drive.calls.length}`);
});

test('treeSignature：內容一樣簽章一樣；改名、增刪、換檔都會改變', () => {
  const a = gs.buildTree('root', makeDrive().listChildren, 'now');
  const b = gs.buildTree('root', makeDrive().listChildren, 'later');
  assert.equal(gs.treeSignature(a), gs.treeSignature(b), 'generatedAt 不影響簽章');

  const c = gs.buildTree('root', makeDrive().listChildren, 'now');
  c.categories[0].albums[0].name = '改名';
  assert.notEqual(gs.treeSignature(a), gs.treeSignature(c));

  const d = gs.buildTree('root', makeDrive().listChildren, 'now');
  d.categories[0].albums[0].photos.pop();
  assert.notEqual(gs.treeSignature(a), gs.treeSignature(d));

  const e = gs.buildTree('root', makeDrive().listChildren, 'now');
  e.categories[0].albums[0].photos[0].rev = 'changed';
  assert.notEqual(gs.treeSignature(a), gs.treeSignature(e));
});
