// 圖片轉檔：先依 EXIF 轉正 → 移除全部 EXIF → 兩種尺寸 WebP（縮圖寬 640、大圖長邊 1920，品質 80，不放大）
// HEIC／HEIF：sharp 預編譯版讀得到中繼資料但解不了 HEVC 像素，改走外部工具鏈（依序嘗試）：
//   ImageMagick（magick / convert，-auto-orient -strip）→ heif-convert（libheif）→ sips（macOS）
import sharp from 'sharp';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, readFile, unlink, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const execFileP = promisify(execFile);
export const THUMB_WIDTH = 640;
export const LARGE_EDGE = 1920;
export const WEBP_QUALITY = 80;

const toolCache = new Map();
async function hasTool(name) {
  if (toolCache.has(name)) return toolCache.get(name);
  let ok = false;
  try { await execFileP(process.platform === 'win32' ? 'where' : 'which', [name]); ok = true; } catch { ok = false; }
  toolCache.set(name, ok);
  return ok;
}

/** 回報可用的外部轉檔工具（T4 實測用） */
export async function availableTools() {
  const out = {};
  for (const t of ['magick', 'convert', 'heif-convert', 'sips']) out[t] = await hasTool(t);
  out.sharp = sharp.versions;
  return out;
}

const EXTERNAL = [
  { name: 'magick', args: (i, o) => [i, '-auto-orient', '-strip', '-quality', '95', o] },
  { name: 'convert', args: (i, o) => [i, '-auto-orient', '-strip', '-quality', '95', o] },
  { name: 'heif-convert', args: (i, o) => ['-q', '95', i, o] },
  { name: 'sips', args: (i, o) => ['-s', 'format', 'jpeg', '-s', 'formatOptions', '95', i, '--out', o] },
];

/** 用外部工具把（sharp 解不開的）檔案轉成 JPEG buffer；回傳 { buffer, tool } */
async function externalDecode(buffer, ext) {
  const dir = await mkdtemp(path.join(tmpdir(), 'nailconv-'));
  const input = path.join(dir, 'in.' + (ext || 'bin'));
  const output = path.join(dir, 'out.jpg');
  await writeFile(input, buffer);
  const errors = [];
  try {
    for (const tool of EXTERNAL) {
      if (!(await hasTool(tool.name))) continue;
      try {
        await execFileP(tool.name, tool.args(input, output), { timeout: 120000, maxBuffer: 16 * 1024 * 1024 });
        const out = await readFile(output);
        if (out.length > 0) return { buffer: out, tool: tool.name };
      } catch (err) {
        errors.push(`${tool.name}: ${String(err.stderr || err.message || err).split('\n')[0].slice(0, 160)}`);
      }
    }
    throw new Error('沒有可用的外部轉檔工具' + (errors.length ? '（' + errors.join('；') + '）' : ''));
  } finally {
    for (const f of [input, output]) { try { await unlink(f); } catch { /* 忽略 */ } }
  }
}

/**
 * 轉檔主函式。回傳 { thumb: Buffer, large: Buffer, width, height, thumbWidth, thumbHeight, largeWidth, largeHeight, color, decoder }
 * width/height 為轉正後的原圖尺寸。
 */
export async function convertPhoto(buffer, { ext = '', mimeType = '' } = {}) {
  let src = buffer, decoder = 'sharp';
  const isHeif = /heic|heif/i.test(mimeType) || /^(heic|heif)$/i.test(ext);
  let base;
  const tryDecode = async (buf) => {
    // rotate() 依 EXIF 方向轉正；之後輸出 WebP 時預設不帶 EXIF（等同移除 GPS 等全部中繼資料）
    const img = sharp(buf, { failOn: 'none', limitInputPixels: 300e6 }).rotate();
    const meta = await img.metadata();
    // 實際解碼一次（HEVC 會在這裡失敗）
    const probe = await img.clone().resize({ width: 8, height: 8, fit: 'inside' }).raw().toBuffer();
    if (!probe.length) throw new Error('decode failed');
    return { img, meta };
  };
  try {
    if (isHeif) throw new Error('heif: 走外部工具');
    base = await tryDecode(src);
  } catch (err) {
    const ext2 = ext || (isHeif ? 'heic' : 'bin');
    const ex = await externalDecode(src, ext2);
    src = ex.buffer; decoder = ex.tool;
    base = await tryDecode(src);
  }
  const { img } = base;
  // 取得轉正後尺寸：先產生大圖再讀其尺寸最準確
  const largeBuf = await img.clone().resize({ width: LARGE_EDGE, height: LARGE_EDGE, fit: 'inside', withoutEnlargement: true }).webp({ quality: WEBP_QUALITY, effort: 4 }).toBuffer();
  const thumbBuf = await img.clone().resize({ width: THUMB_WIDTH, withoutEnlargement: true }).webp({ quality: WEBP_QUALITY, effort: 4 }).toBuffer();
  const [lm, tm] = await Promise.all([sharp(largeBuf).metadata(), sharp(thumbBuf).metadata()]);
  // 轉正後原圖尺寸：用 rotate 後的 pipeline 輸出一個 1x1 太浪費；改用 metadata + orientation 推算
  const meta = base.meta;
  let width = meta.width || lm.width, height = meta.height || lm.height;
  if (meta.orientation && meta.orientation >= 5) [width, height] = [height, width];
  // 主色（載入前佔位色）
  let color = null;
  try { const st = await sharp(thumbBuf).stats(); const d = st.dominant; color = '#' + [d.r, d.g, d.b].map((v) => v.toString(16).padStart(2, '0')).join(''); } catch { /* 選配 */ }
  return { thumb: thumbBuf, large: largeBuf, width, height, thumbWidth: tm.width, thumbHeight: tm.height, largeWidth: lm.width, largeHeight: lm.height, color, decoder };
}

/** 檢查輸出的 WebP 是否不含 EXIF（AC-08） */
export async function hasExif(buffer) {
  const m = await sharp(buffer).metadata();
  return !!(m.exif || m.icc && false);
}
