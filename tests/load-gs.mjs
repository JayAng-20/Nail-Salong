// 在 Node 裡載入 apps-script/Code.gs 的純函式（parseFolderName、buildTree…）供測試與假資料使用。
// Google 專屬的全域物件（Drive、DriveApp、CacheService…）不存在，只呼叫純函式即可。
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const gsPath = path.join(here, '..', 'apps-script', 'Code.gs');

export function loadAppsScript() {
  const src = readFileSync(gsPath, 'utf8');
  const sandbox = {
    __nodeSha256: (s) => createHash('sha256').update(s, 'utf8').digest('hex'),
    Math, JSON, Date, String, Number, parseInt, Array, Object, RegExp, Error, console,
  };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'Code.gs' });
  // vm 內建立的陣列／物件屬於另一個 realm，轉回主 realm 讓 assert.deepEqual 能比對
  const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
  const wrap = (fn) => (...args) => clone(fn(...args));
  return {
    ...sandbox,
    parseFolderName: wrap(sandbox.parseFolderName),
    buildTree: wrap(sandbox.buildTree),
    treeSignature: sandbox.treeSignature,
    compareParsed: sandbox.compareParsed,
    isCoverName: sandbox.isCoverName,
    isImageFile: sandbox.isImageFile,
  };
}
