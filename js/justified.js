// 齊行式作品牆排版
//   - 純函式 computeRows()：只算數字（可在 Node 測試），applyLayout() 才碰 DOM
//   - 目標列高依容器寬度決定；每一列實際高度盡量落在目標的 0.8～1.25 倍之間
//   - 長寬比夾在 0.7～1.8（超出者由 CSS object-fit: cover 裁切顯示；燈箱仍是完整原圖）
//   - 首頁的「探索更多作品」尾格是「寬度可伸縮」的項目：吸收最後一列剩餘寬度（最小 220px、最大列寬 40%）；
//     做法是枚舉最後一列放 k 張照片，前面 n−k 張用一般規則排（必須每列都填滿），選剩餘寬度落在範圍內、且 k 最接近自然斷點的方案
//   - 作品集頁（沒有尾格）：最後一列填不滿時維持目標列高、靠左，不放大
//   - 手機（<640px）由 CSS 兩欄格線接手，這裡只清掉內聯尺寸

export const RATIO_MIN = 0.7;
export const RATIO_MAX = 1.8;
export const ROW_TOLERANCE = { min: 0.8, max: 1.25 };
export const FLEX_MIN = 220;
export const FLEX_MAX_FRACTION = 0.4;

export function clampRatio(r) {
  const v = Number(r);
  if (!isFinite(v) || v <= 0) return 3 / 4; // 沒有寬高：先假設直式 3:4，載入後再補排
  return Math.min(RATIO_MAX, Math.max(RATIO_MIN, v));
}

/** 目標列高：桌機 260～300、平板 200～240、大手機 180（依容器寬） */
export function targetHeightFor(width) {
  if (width >= 1600) return 300;
  if (width >= 1200) return 280;
  if (width >= 1024) return 260;
  if (width >= 768) return 240;
  if (width >= 640) return 200;
  return 180;
}

export function isMobileGrid(container) {
  return container.classList.contains('wall-grid-mobile') && window.innerWidth < 640;
}

const sum = (a) => a.reduce((x, y) => x + y, 0);

/**
 * 一般齊行：貪婪逐張累加，超過寬度時比較「含這張／不含這張」哪個列高更接近目標。
 * 回傳 [{ start, end, full }]；full=false 代表最後一列沒填滿。
 */
function greedyRows(rs, width, gap, target, { stretchLastUpTo = 0 } = {}) {
  const rows = [];
  let start = 0, acc = 0;
  for (let i = 0; i < rs.length; i++) {
    const count = i - start + 1;
    const withH = (width - gap * (count - 1)) / (acc + rs[i]);
    if (withH <= target) {
      const withoutH = count > 1 ? (width - gap * (count - 2)) / acc : Infinity;
      if (count === 1 || Math.abs(Math.log(withH / target)) <= Math.abs(Math.log(withoutH / target))) {
        rows.push({ start, end: i + 1, full: true }); start = i + 1; acc = 0;
      } else {
        rows.push({ start, end: i, full: true }); start = i; acc = rs[i];
      }
    } else acc += rs[i];
  }
  if (start < rs.length) {
    // 尾列差一點就滿（拉伸不超過 stretchLastUpTo 倍就能貼齊）時視為已填滿；stretchLastUpTo=0 表示一律不拉伸
    const h = (width - gap * (rs.length - start - 1)) / acc;
    rows.push({ start, end: rs.length, full: stretchLastUpTo > 0 && h <= target * stretchLastUpTo });
  }
  return rows;
}

/**
 * 均分切法：把 rs 依序切成 m 列（每列的長寬比總和盡量相等），m 從 1 試到 rs.length，
 * 取「各列高度違規量最小、其次最接近目標」的方案。所有列都拉伸貼齊（full: true）。
 */
function splitEven(rs, width, gap, target) {
  if (!rs.length) return { rows: [], score: 0 };
  const total = sum(rs);
  let best = null;
  for (let m = 1; m <= rs.length; m++) {
    const quota = total / m;
    const rows = [];
    let start = 0, acc = 0;
    for (let i = 0; i < rs.length && rows.length < m - 1; i++) {
      const itemsAfter = rs.length - i - 1;      // 這張之後還剩幾張
      const rowsAfter = m - rows.length - 1;     // 這列之後還要幾列
      const before = acc, after = acc + rs[i];
      const mustCutBefore = i > start && (rs.length - i) === rowsAfter + 0 && false; // 保留擴充
      // 越過配額時，比較「切在這張之前」與「含這張再切」哪個更接近配額；並確保後面每列至少一張
      if (after >= quota - 1e-9 || itemsAfter === rowsAfter) {
        const cutBefore = i > start && Math.abs(before - quota) < Math.abs(after - quota) && itemsAfter + 1 >= rowsAfter;
        if (cutBefore) { rows.push({ start, end: i, full: true }); start = i; acc = rs[i]; }
        else { rows.push({ start, end: i + 1, full: true }); start = i + 1; acc = 0; }
        if (itemsAfter === rowsAfter && !cutBefore) { /* 後面剛好每列一張 */ }
      } else acc = after;
      void mustCutBefore;
    }
    if (start < rs.length) rows.push({ start, end: rs.length, full: true });
    if (rows.length !== m) continue;
    let score = 0;
    for (const r of rows) {
      const h = rowHeight(rs, r, width, gap);
      if (h < target * ROW_TOLERANCE.min) score += (target * ROW_TOLERANCE.min - h) * 12;
      if (h > target * ROW_TOLERANCE.max) score += (h - target * ROW_TOLERANCE.max) * 12;
      score += Math.abs(h - target) * 0.15;
    }
    if (!best || score < best.score) best = { rows, score };
  }
  return best;
}

function rowHeight(rs, row, width, gap) {
  const rr = rs.slice(row.start, row.end);
  return (width - gap * (rr.length - 1)) / sum(rr);
}

/**
 * 計算列配置（純函式）。
 * @param {number} width 容器寬
 * @param {number[]} ratios 各張長寬比（可未 clamp）
 * @param {object} opts { gap=10, target, flex: { min, maxFraction } | null（尾格）}
 * @returns {{ rows: Array<{ start, end, height, widths:number[], flexWidth?:number, full:boolean }>, target }}
 */
export function computeRows(width, ratios, opts = {}) {
  const base = computeRowsOnce(width, ratios, opts);
  if (!opts.flex || !opts.allowHide || ratios.length < 2) return base;
  // 最後手段（只有首頁尾格模式）：硬性條件（列高比 ≤ 1.35、尾格 ≥ 200）仍不滿足時，最多藏起最後 2 張再試
  if (!hardViolation(base)) return base;
  for (let hide = 1; hide <= Math.min(2, ratios.length - 1); hide++) {
    const r = computeRowsOnce(width, ratios.slice(0, ratios.length - hide), opts);
    if (!hardViolation(r)) return { ...r, hidden: ratios.length - hide };
  }
  return base;
}

function hardViolation(result) {
  const hs = result.rows.map((r) => r.height);
  if (hs.length && Math.max(...hs) / Math.min(...hs) > 1.35) return true;
  const last = result.rows[result.rows.length - 1];
  if (last && last.flexWidth !== undefined && last.flexWidth < 200) return true;
  return false;
}

function computeRowsOnce(width, ratios, opts = {}) {
  const gap = opts.gap ?? 10;
  const target = opts.target ?? targetHeightFor(width);
  const rs = ratios.map(clampRatio);
  const n = rs.length;
  const flex = opts.flex || null;
  const flexMax = flex ? Math.max(flex.min, width * flex.maxFraction) : 0;

  let rows, tailPlan = null;
  if (!flex) {
    rows = greedyRows(rs, width, gap, target);
  } else if (n === 0) {
    rows = [{ start: 0, end: 0, full: true, tail: true }];
    tailPlan = { height: target, flexWidth: width };
  } else {
    // 枚舉最後一列的張數 k：前面 n−k 張用一般規則（每列都要填滿），最後一列 k 張＋尾格。
    // 每個 k 都算出具體方案（列高在 0.8～1.25 倍內調整以讓尾格落在 220px～40%），再用違規量評分，取最小；平手取最接近自然斷點者。
    const natural = greedyRows(rs, width, gap, target, { stretchLastUpTo: ROW_TOLERANCE.max });
    const k0 = natural[natural.length - 1].end - natural[natural.length - 1].start;
    let best = null;
    for (let k = 1; k <= n; k++) {
      const split = splitEven(rs.slice(0, n - k), width, gap, target);
      const prefix = split.rows;
      const prefixHeights = prefix.map((r) => rowHeight(rs, r, width, gap));
      const tail = rs.slice(n - k);
      const tailSum = sum(tail);
      const lo = target * ROW_TOLERANCE.min, hi = target * ROW_TOLERANCE.max;
      const loTail = target * 0.65; // 尾列為了讓尾格擠得下，允許再矮一點（會扣分）
      // 尾列高度：先向前面各列的平均靠攏（整面牆列高一致），再在容忍範圍內調整讓尾格落在 220px～40%
      let h = prefixHeights.length ? Math.min(hi, Math.max(lo, sum(prefixHeights) / prefixHeights.length)) : target;
      let card = width - tailSum * h - gap * k;
      if (card > flexMax) h = Math.min(hi, Math.max(lo, (width - gap * k - flexMax) / tailSum));
      else if (card < flex.min) h = Math.max(loTail, Math.min(hi, (width - gap * k - flex.min) / tailSum));
      card = width - tailSum * h - gap * k;
      let score = split.score;
      if (h < lo) score += (lo - h) * 3;
      if (card < flex.min) score += (flex.min - card) * 3; // 尾格擠不下最嚴重
      if (card > flexMax) score += (card - flexMax);
      if (prefixHeights.length) score += Math.abs(h - sum(prefixHeights) / prefixHeights.length) * 0.3; // 尾列與其他列高度差
      const allH = prefixHeights.concat([h]);
      const spread = Math.max(...allH) / Math.min(...allH);
      if (spread > 1.35) score += (spread - 1.35) * 5000; // 硬性驗收：列高最大÷最小 ≤ 1.35，違反時重罰
      score += Math.abs(k - k0) * 0.5; // 平手時取最接近自然斷點者
      if (!best || score < best.score) best = { score, prefix, k, height: h, flexWidth: card };
    }
    rows = best.prefix.map((r) => ({ ...r })).concat([{ start: n - best.k, end: n, full: true, tail: true }]);
    tailPlan = { height: best.height, flexWidth: best.flexWidth };
  }

  // 算每列高度與寬度；四捨五入誤差交給最後一格吸收（貼齊右緣，誤差 ≤ 1px）
  const out = rows.map((row) => {
    const rr = rs.slice(row.start, row.end);
    let height, widths, flexWidth;
    if (row.tail) {
      height = tailPlan.height;
      widths = rr.map((x) => x * height);
      flexWidth = rr.length ? width - sum(widths) - gap * rr.length : width;
    } else if (row.full) {
      height = rowHeight(rs, row, width, gap);
      widths = rr.map((x) => x * height);
    } else {
      height = target; // 沒填滿的最後一列：維持目標列高、靠左
      widths = rr.map((x) => x * height);
    }
    widths = widths.map((w) => Math.floor(w * 100) / 100);
    if (row.full || row.tail) {
      const total = sum(widths) + gap * (rr.length - 1) + (row.tail ? (rr.length ? gap : 0) + flexWidth : 0);
      const diff = width - total;
      if (row.tail) flexWidth += diff; else if (widths.length) widths[widths.length - 1] += diff;
    }
    return { start: row.start, end: row.end, full: !!row.full, height: Math.round(height * 100) / 100, widths, flexWidth: row.tail ? Math.round(flexWidth * 100) / 100 : undefined };
  });
  return { rows: out, target };
}

/** 把 computeRows 的結果套到元素上。items = [{ el, ratio }]；trailing = { el }（尾格）或 null */
export function applyLayout(container, items, trailing, opts = {}) {
  const width = container.clientWidth;
  if (!width) return null;
  if (opts.mobileGrid !== false && isMobileGrid(container)) {
    for (const it of items) { it.el.style.width = ''; it.el.style.height = ''; }
    if (trailing) { trailing.el.style.width = ''; trailing.el.style.height = ''; }
    return null;
  }
  const result = computeRows(width, items.map((i) => i.ratio), { gap: opts.gap ?? 10, target: opts.targetHeight, flex: trailing ? { min: FLEX_MIN, maxFraction: FLEX_MAX_FRACTION } : null, allowHide: !!trailing });
  items.forEach((it, i) => it.el.classList.toggle('is-overflow', result.hidden !== undefined && i >= result.hidden));
  for (const row of result.rows) {
    for (let k = row.start; k < row.end; k++) {
      items[k].el.style.width = row.widths[k - row.start] + 'px';
      items[k].el.style.height = row.height + 'px';
    }
    if (trailing && row.flexWidth !== undefined) { trailing.el.style.width = row.flexWidth + 'px'; trailing.el.style.height = row.height + 'px'; }
  }
  return result;
}
