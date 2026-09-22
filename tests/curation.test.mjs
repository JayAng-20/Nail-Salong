import { test } from 'node:test';
import assert from 'node:assert/strict';
import { featuredPhotos, exhibitionOrder, wrapDistance } from '../js/curation.js';
const photos = ['a','b','c','d'].map(id => ({id}));
test('首頁精選略過已刪除 ID、去重、保持指定順序', () => {
 assert.deepEqual(featuredPhotos(photos, ['c','missing','c','a'], 3).map(p=>p.id), ['c','a']);
});
test('未指定精選或精選全部刪除，使用現有作品', () => {
 assert.deepEqual(featuredPhotos(photos, [], 2).map(p=>p.id), ['a','b']);
 assert.deepEqual(featuredPhotos(photos, ['deleted'], 2).map(p=>p.id), ['a','b']);
 assert.deepEqual(featuredPhotos([], ['deleted']), []);
});
test('立體展示調整順序後，全部作品仍保留且沒有重複', () => {
 const result=exhibitionOrder(photos,['c','a','missing']);
 assert.deepEqual(result.map(p=>p.id),['c','a','b','d']);
 assert.equal(new Set(result.map(p=>p.id)).size, photos.length);
 assert.deepEqual(photos.map(p=>p.id),['a','b','c','d']);
});
test('循環藝廊在首尾、奇數、偶數與單張時距離正確', () => {
 assert.equal(wrapDistance(0,5,6),1);
 assert.equal(wrapDistance(5,0,6),-1);
 assert.equal(wrapDistance(0,4,5),1);
 assert.equal(wrapDistance(4,0,5),-1);
 assert.equal(wrapDistance(0,0,1),0);
 assert.equal(wrapDistance(0,0,0),0);
});
