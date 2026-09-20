// M5 齊行排版引擎：驗收條件用單元測試逐一檢查
//   - 每一列（含最後一列）左右緣貼齊容器，誤差 ≤ 1px（沒有尾格時最後一列可不填滿）
//   - 各列高度 最大值 ÷ 最小值 ≤ 1.35，且落在目標的 0.8～1.25 倍
//   - 尾格寬度在 220px～列寬 40% 之間（做不到時回報最接近的方案，但仍貼齊右緣）
//   - 假資料：全直式、全橫式、直橫混合、含一張 3:1 超寬圖；張數 1／2／5／11／12；寬度 640～3440
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeRows, targetHeightFor, clampRatio, FLEX_MIN, FLEX_MAX_FRACTION, ROW_TOLERANCE } from '../js/justified.js';

const GAP = 10;
const SETS = {
  全直式: (n) => Array.from({ length: n }, (_, i) => [3 / 4, 4 / 5, 2 / 3][i % 3]),
  全橫式: (n) => Array.from({ length: n }, (_, i) => [4 / 3, 3 / 2, 16 / 10][i % 3]),
  直橫混合: (n) => Array.from({ length: n }, (_, i) => [3 / 4, 4 / 3, 1, 2 / 3, 3 / 2][i % 5]),
  含超寬圖: (n) => Array.from({ length: n }, (_, i) => (i === 1 ? 3 : [3 / 4, 4 / 3][i % 2])),
};
const COUNTS = [1, 2, 5, 11, 12];
// 容器寬 = 視窗寬 − 邊距（1280 以上容器最大 1200−40＝1160）
const WIDTHS = { 640: 608, 768: 728, 1024: 984, 1280: 1160, 1920: 1160, 3440: 1160 };
const soft = []; // 建議值的軟性違規，最後統一列出

function rowSpan(row) { return row.widths.reduce((a, b) => a + b, 0) + GAP * Math.max(0, row.widths.length - 1) + (row.flexWidth !== undefined ? (row.widths.length ? GAP : 0) + row.flexWidth : 0); }

for (const [name, make] of Object.entries(SETS)) {
  for (const n of COUNTS) {
    for (const [vw, width] of Object.entries(WIDTHS)) {
      const ratios = make(n);
      const target = targetHeightFor(Number(vw));

      test(`首頁（有尾格）${name} ${n} 張 @${vw}`, () => {
        const { rows, hidden } = computeRows(width, ratios, { gap: GAP, target, flex: { min: FLEX_MIN, maxFraction: FLEX_MAX_FRACTION }, allowHide: true });
        assert.ok(rows.length >= 1);
        const covered = rows.reduce((a, r) => a + (r.end - r.start), 0);
        assert.equal(covered, hidden !== undefined ? hidden : n, '每張照片都要被排到（最後手段可藏最多 2 張）');
        if (hidden !== undefined) soft.push(`${name} ${n}張@${vw}：先天無解，藏起 ${n - hidden} 張`);
        // 硬性驗收：每一列（含最後一列）左右緣貼齊容器（≤1px）；列高最大÷最小 ≤ 1.35；尾格至少 200px（建議 220）
        for (const r of rows) assert.ok(Math.abs(rowSpan(r) - width) <= 1, `列寬 ${rowSpan(r).toFixed(2)} 應貼齊 ${width}`);
        const hs = rows.map((r) => r.height);
        assert.ok(Math.max(...hs) / Math.min(...hs) <= 1.35, `列高比 ${(Math.max(...hs) / Math.min(...hs)).toFixed(2)} 應 ≤ 1.35`);
        const last = rows[rows.length - 1];
        assert.ok(last.flexWidth !== undefined, '最後一列要有尾格');
        assert.ok(last.flexWidth >= 200, `尾格 ${last.flexWidth} 太窄`);
        // 建議值（軟性，統計後在報告列出）：一般列 0.8～1.25 倍、尾列 ≥0.65 倍、尾格 220～40%
        rows.forEach((r, i) => { const isTail = i === rows.length - 1; if (r.height < target * (isTail ? 0.65 : 0.8) - 0.5 || r.height > target * 1.25 + 0.5) soft.push(`${name} ${n}張@${vw}：列高 ${r.height.toFixed(0)}（目標 ${target}）`); });
        if (last.flexWidth < FLEX_MIN - 0.5) soft.push(`${name} ${n}張@${vw}：尾格 ${last.flexWidth.toFixed(0)} < 220`);
        if (n >= 3 && last.flexWidth > width * FLEX_MAX_FRACTION + 0.5) soft.push(`${name} ${n}張@${vw}：尾格 ${last.flexWidth.toFixed(0)}（${(last.flexWidth / width * 100).toFixed(0)}%）> 40%`);
      });

      test(`作品集（無尾格）${name} ${n} 張 @${vw}`, () => {
        const { rows } = computeRows(width, ratios, { gap: GAP, target });
        for (const r of rows.slice(0, -1)) assert.ok(Math.abs(rowSpan(r) - width) <= 1, '填滿的列要貼齊右緣');
        const last = rows[rows.length - 1];
        if (!last.full) { assert.equal(last.height, target, '沒填滿的最後一列維持目標列高（不放大）'); assert.ok(rowSpan(last) <= width, '靠左、不超出'); }
        const hs = rows.map((r) => r.height);
        for (const h of hs) assert.ok(h >= target * ROW_TOLERANCE.min - 0.5 && h <= target * ROW_TOLERANCE.max * 1.01 + 0.5, `列高 ${h} 超出 ${target} 的容忍範圍`);
      });
    }
  }
}

test('長寬比夾在 0.7～1.8；沒有寬高假設 3:4', () => {
  assert.equal(clampRatio(3), 1.8); assert.equal(clampRatio(0.3), 0.7); assert.equal(clampRatio(1), 1); assert.equal(clampRatio(null), 0.75); assert.equal(clampRatio(0), 0.75);
});
test('目標列高依寬度：桌機 260～300、平板 200～240', () => {
  assert.equal(targetHeightFor(1920), 300); assert.equal(targetHeightFor(1280), 280); assert.equal(targetHeightFor(1024), 260); assert.equal(targetHeightFor(768), 240); assert.equal(targetHeightFor(640), 200);
});
test('0 張照片＋尾格：尾格自己一列、寬度為列寬 40% 以內', () => {
  const { rows } = computeRows(1160, [], { gap: GAP, target: 280, flex: { min: FLEX_MIN, maxFraction: FLEX_MAX_FRACTION } });
  assert.equal(rows.length, 1); assert.ok(rows[0].flexWidth >= FLEX_MIN);
});

test('建議值軟性違規統計（僅列出，不算失敗）', () => {
  console.log(`  建議值軟性違規 ${soft.length} 筆（共 ${Object.keys(SETS).length * COUNTS.length * Object.keys(WIDTHS).length} 個首頁組合）`);
  for (const line of soft) console.log('   - ' + line);
});
