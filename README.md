# 彩蝶美甲美睫沙龍 作品展示網站

GitHub Pages 靜態網站 ＋ Google 雲端硬碟資料夾當後台：家人用手機把照片丟進雲端資料夾，網站幾秒內更新；GitHub Actions 定期把照片壓縮成 WebP 放到 Pages。

- 設定教學：[docs/SETUP.md](docs/SETUP.md)
- 給店主的上傳說明：[docs/家人上傳說明.md](docs/家人上傳說明.md)
- 架構與交接：[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)、[docs/交接報告.md](docs/交接報告.md)
- 實測與驗收：[docs/TEST-REPORT.md](docs/TEST-REPORT.md)

```bash
npm install
npm test            # 測試
npm run local       # 本機正式模式 http://127.0.0.1:8080（功能同線上）
npm run dev         # 開發模式（假資料 API）http://localhost:5173
```

只要改 `site/site-config.js` 就能改價目、店家資訊、社群連結。
