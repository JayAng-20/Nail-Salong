#!/usr/bin/env node
// T4／AC-09 實測：下載指定的（公開）雲端硬碟原檔，走同一套轉檔鏈，回報解碼工具、尺寸、是否殘留 EXIF。
// 用法：node scripts/test-heic.mjs <fileId> [<fileId> ...]   （預設用總資料夾裡的兩張 HEIC）
import sharp from 'sharp';
import { downloadOriginal } from './lib/drive-download.mjs';
import { convertPhoto, availableTools } from './lib/convert.mjs';

const ids = process.argv.slice(2).length ? process.argv.slice(2) : ['1nsdGOCbbQGHl_B7qvgSUx7NWbpw1khqg', '17NDZINfzabGSfixlM7SXhuSIxjJoEbBi'];
console.log('可用工具：', JSON.stringify(await availableTools()));
let failed = 0;
for (const id of ids) {
  const t0 = Date.now();
  try {
    const { buffer, contentType, via } = await downloadOriginal(id);
    const head = buffer.subarray(4, 12).toString('latin1');
    const isHeif = /ftyp(heic|heix|mif1|heif)/i.test(head);
    const out = await convertPhoto(buffer, { ext: isHeif ? 'heic' : '', mimeType: contentType });
    const meta = await sharp(out.large).metadata();
    console.log(`✔ ${id}: 原檔 ${Math.round(buffer.length / 1024)} KB（${via}，${contentType || '?'}${isHeif ? '，HEIF' : ''}）→ 解碼 ${out.decoder}，尺寸 ${out.width}×${out.height}，大圖 ${out.largeWidth}×${out.largeHeight}，縮圖 ${out.thumbWidth}×${out.thumbHeight}，EXIF 殘留：${meta.exif ? '有' : '無'}，主色 ${out.color}，${Date.now() - t0} ms`);
  } catch (err) {
    failed++;
    console.log(`✘ ${id}: ${err.message}`);
  }
}
process.exit(failed ? 1 : 0);
