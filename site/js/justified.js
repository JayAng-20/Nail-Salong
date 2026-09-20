// 齊行式作品牆：每列等高、寬度依長寬比；最後一列不硬撐；手機由 CSS 兩欄格線接手
export function isMobileGrid(container) {
  return container.classList.contains('wall-grid-mobile') && window.innerWidth < 640;
}

/** 回傳每一列的項目陣列（給呼叫端判斷最後一列的組成） */
export function layoutJustified(container, items, opts = {}) {
  const width = container.clientWidth;
  if (!width) return [];
  if (opts.mobileGrid !== false && isMobileGrid(container)) { for (const it of items) { it.el.style.width = ''; it.el.style.height = ''; } return [items]; }

  const gap = opts.gap ?? 10;
  const target = opts.targetHeight ?? (window.innerWidth < 640 ? 180 : window.innerWidth < 1024 ? 230 : 260);
  const maxStretch = opts.maxLastRowStretch ?? 1.25;
  let row = [], rowRatio = 0;
  const rows = [];
  for (const it of items) {
    const r = clampRatio(it.ratio);
    row.push({ it, r }); rowRatio += r;
    const rowWidth = rowRatio * target + gap * (row.length - 1);
    if (rowWidth >= width) { rows.push({ row, rowRatio, full: true }); row = []; rowRatio = 0; }
  }
  if (row.length) rows.push({ row, rowRatio, full: false });
  for (const { row: r, rowRatio: rr, full } of rows) {
    let h = (width - gap * (r.length - 1)) / rr;
    if (!full && h > target * maxStretch) h = target * maxStretch; // 最後一列不硬撐
    h = Math.round(h * 100) / 100;
    let used = 0;
    r.forEach(({ it, r: ratio }, i) => {
      let w = Math.floor(h * ratio * 100) / 100;
      if (full && i === r.length - 1) w = Math.max(40, width - used - gap * (r.length - 1)); // 最後一格吃掉四捨五入誤差
      used += w;
      it.el.style.width = w + 'px'; it.el.style.height = h + 'px';
    });
  }
  return rows.map((r) => r.row.map((x) => x.it));
}

export function clampRatio(r) {
  const v = Number(r);
  if (!isFinite(v) || v <= 0) return 3 / 4; // 沒有寬高：先假設直式 3:4，載入後再補排
  return Math.min(2.4, Math.max(0.45, v));
}
