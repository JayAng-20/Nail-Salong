// 取得雲端硬碟原檔（穩定層用）
//   主要路徑：資料夾是「知道連結者可檢視」，可直接從 drive.usercontent.google.com 下載原檔（T1／T3 實測：JPG、22 MB PNG、HEIC 都可）
//   備援路徑：Apps Script ③（POST {action:"file", id, key}，需 FILE_SECRET）
const DIRECT_URLS = [
  (id) => `https://drive.usercontent.google.com/download?id=${encodeURIComponent(id)}&export=download`,
  (id) => `https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`,
];
const RETRY_DELAYS = [1000, 3000, 8000];

export async function fetchWithTimeout(url, opts = {}, timeoutMs = 60000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try { return await fetch(url, { ...opts, signal: ctrl.signal }); }
  finally { clearTimeout(t); }
}

/** 直接下載公開檔案；回傳 { buffer, contentType, via } 或丟出錯誤 */
export async function downloadOriginal(id, { appsScriptUrl = '', fileSecret = '', log = () => {} } = {}) {
  const errors = [];
  for (const mk of DIRECT_URLS) {
    const url = mk(id);
    for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
      if (attempt > 0) await sleep(RETRY_DELAYS[attempt - 1]);
      try {
        const res = await fetchWithTimeout(url, { redirect: 'follow', headers: { 'User-Agent': 'nail-gallery-build/1.0' } }, 90000);
        const type = res.headers.get('content-type') || '';
        if (res.status === 429 || res.status >= 500) { errors.push(`${res.status} ${url}`); continue; }
        if (!res.ok) { errors.push(`${res.status} ${url}`); break; }
        if (/text\/html/i.test(type)) { errors.push(`回傳 HTML（可能是病毒掃描確認頁或權限頁）${url}`); break; }
        const buffer = Buffer.from(await res.arrayBuffer());
        if (!buffer.length) { errors.push(`空回應 ${url}`); continue; }
        return { buffer, contentType: type, via: 'direct' };
      } catch (err) {
        errors.push(`${err.name === 'AbortError' ? '逾時' : err.message} ${url}`);
      }
    }
  }
  // 備援：Apps Script ③
  if (appsScriptUrl && fileSecret) {
    try {
      const res = await fetchWithTimeout(appsScriptUrl, {
        method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'file', id, key: fileSecret }),
      }, 180000);
      const data = await res.json();
      if (data && data.ok && data.base64) return { buffer: Buffer.from(data.base64, 'base64'), contentType: data.mimeType || '', via: 'apps-script' };
      errors.push(`Apps Script: ${data && data.error ? data.error : 'HTTP ' + res.status}`);
    } catch (err) { errors.push(`Apps Script: ${err.message}`); }
  }
  throw new Error('下載失敗：' + errors.join(' | '));
}

export function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
