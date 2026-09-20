#!/usr/bin/env node
// 設定檔格式檢查：不合格就以非 0 結束，讓 GitHub Actions 工作流程失敗、不部署（第 9.2-1 節）
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSiteConfig, validateSiteConfig } from './lib/config-loader.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = process.argv[2] || path.join(root, 'site', 'site-config.js');

let cfg;
try {
  cfg = loadSiteConfig(file);
} catch (err) {
  console.error('✘ site-config.js 語法錯誤，無法讀取：');
  console.error('  ' + String(err.message || err).split('\n')[0]);
  console.error('  提示：檢查是否少了引號、逗號或括號；只改引號裡的文字和數字。');
  process.exit(1);
}
const errors = validateSiteConfig(cfg);
if (errors.length) {
  console.error(`✘ site-config.js 有 ${errors.length} 個問題：`);
  errors.forEach((e) => console.error('  - ' + e));
  process.exit(1);
}
console.log(`✔ site-config.js 格式正確（店名：${cfg.shopName}；價目分組 ${cfg.serviceGroups.length} 組；Apps Script 網址${cfg.appsScriptUrl ? '已填' : '未填（即時層關閉）'}）`);
