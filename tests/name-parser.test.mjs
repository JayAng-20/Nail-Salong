import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadAppsScript } from './load-gs.mjs';

const gs = loadAppsScript();
const parse = gs.parseFolderName;

// 第 7 節要求的案例
const cases = [
  ['01_簡約裸色_純粹耐看', { ignored: false, order: 1, name: '簡約裸色', subtitle: '純粹耐看' }],
  ['2-法式',              { ignored: false, order: 2, name: '法式', subtitle: '' }],
  ['03 節慶彩繪',         { ignored: false, order: 3, name: '節慶彩繪', subtitle: '' }],
  ['個性設計',            { ignored: false, order: null, name: '個性設計', subtitle: '' }],
  ['_草稿',               { ignored: true }],
  ['＿草稿',              { ignored: true }],
  ['10_暈染＿夢幻',       { ignored: false, order: 10, name: '暈染', subtitle: '夢幻' }],
  // 補充案例
  ['01.法式',             { ignored: false, order: 1, name: '法式', subtitle: '' }],
  ['05．跳色',            { ignored: false, order: 5, name: '跳色', subtitle: '' }],
  ['07－貓眼',            { ignored: false, order: 7, name: '貓眼', subtitle: '' }],
  ['  02_ 春季 _ 櫻花粉 ', { ignored: false, order: 2, name: '春季', subtitle: '櫻花粉' }],
  ['3D彩繪',              { ignored: false, order: null, name: '3D彩繪', subtitle: '' }], // 沒有分隔符：數字是名稱的一部分
  ['2024',                { ignored: false, order: null, name: '2024', subtitle: '' }],   // 只有數字：當名稱
  ['美甲',                { ignored: false, order: null, name: '美甲', subtitle: '' }],
  ['_首頁主圖',           { ignored: false, isHero: true }],
  ['＿首頁主圖',          { ignored: false, isHero: true }],
  ['_首頁主圖草稿',       { ignored: true }],
];

for (const [input, expected] of cases) {
  test(`parseFolderName(${JSON.stringify(input)})`, () => {
    const got = parse(input);
    for (const [k, v] of Object.entries(expected)) assert.equal(got[k], v, `${k} 應為 ${JSON.stringify(v)}，實際 ${JSON.stringify(got[k])}`);
  });
}

test('排序：有數字在前依數字，沒數字在後依名稱', () => {
  const names = ['個性設計', '10_暈染', '2-法式', '01_簡約', '節慶', '03 節慶彩繪'];
  const sorted = names.map(parse).sort(gs.compareParsed).map((p) => p.name);
  assert.deepEqual(sorted, ['簡約', '法式', '節慶彩繪', '暈染', '個性設計', '節慶']);
});

test('封面檔名判斷不分大小寫、不看副檔名', () => {
  assert.equal(gs.isCoverName('cover.jpg'), true);
  assert.equal(gs.isCoverName('COVER.HEIC'), true);
  assert.equal(gs.isCoverName(' Cover .png'), true);
  assert.equal(gs.isCoverName('cover2.jpg'), false);
  assert.equal(gs.isCoverName('IMG_0001.jpg'), false);
});

test('圖片判斷：靠 mimeType，mimeType 不明時看副檔名；影片與文字檔一律不是', () => {
  const folder = 'application/vnd.google-apps.folder';
  assert.equal(gs.isImageFile({ name: 'a.jpg', mimeType: 'image/jpeg' }), true);
  assert.equal(gs.isImageFile({ name: 'a.HEIC', mimeType: 'image/heif' }), true);
  assert.equal(gs.isImageFile({ name: 'a.HEIC', mimeType: 'application/octet-stream' }), true);
  assert.equal(gs.isImageFile({ name: '專題.txt', mimeType: 'text/plain' }), false);
  assert.equal(gs.isImageFile({ name: 'clip.mov', mimeType: 'video/quicktime' }), false);
  assert.equal(gs.isImageFile({ name: 'x', mimeType: folder }), false);
  assert.equal(gs.isImageFile({ name: 'logo.svg', mimeType: 'image/svg+xml' }), false);
});
