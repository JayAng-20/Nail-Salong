# ARCHITECTURE：系統架構與專案交接

## 一句話

GitHub Pages 靜態網站 ＋ Google 雲端硬碟資料夾當後台。**穩定層**（GitHub Actions 定期重建、圖片放 Pages）負責快與省流量；**即時層**（瀏覽器開頁時直接問 Apps Script）負責秒級更新。前端只有一套渲染邏輯，兩層資料結構相同，只差每張照片的圖片來源。

```
家人手機 ──上傳──▶ Google 雲端硬碟（公開檢視的總資料夾）
                        │
                        ▼
              Apps Script（apps-script/Code.gs）
              ① GET ?action=list   即時清單（15 秒快取）
              ② 每 5 分鐘 checkForChanges → 簽章不同就 repository_dispatch
              ③ POST {action:file}  原圖備援（需 FILE_SECRET）
              ④ GET ?action=status 狀態
                        │ drive-changed
                        ▼
              GitHub Actions（.github/workflows/deploy.yml）
              scripts/build-gallery.mjs：取清單 → 只下載新增／變更 → 轉檔（轉正、去 EXIF、WebP×2）
              → data/gallery.json + images/ → actions/deploy-pages
                        │
                        ▼
              瀏覽器：先畫 gallery.json（快）→ 取即時清單比對 → 新的補上（Google 縮圖）、刪的隱藏
```

## 目錄結構

網站檔案直接放在專案根目錄：同一個資料夾既是 GitHub repo 的根、也是 Pages 的根，也可以整個拖進任何靜態伺服器（例如「本地伺服器」工具）直接瀏覽。

```
.
├─ index.html gallery.html status.html   ← 三個頁面（由 scripts/build-pages.py 從片段組裝，已提交）
├─ site-config.js         ← 唯一要手動改的設定檔（店名、價目、店家資訊、社群、Apps Script 網址）
├─ css/styles.css         ← 全站樣式、動畫、響應式、燈箱
├─ js/                    ← ES modules，無框架
│   ├─ config.js          讀設定＋預設值、SEO／JSON-LD
│   ├─ data.js            即時層：gallery.json + Apps Script 輪詢（前景 45～60 秒、背景暫停、逾時 6 秒安靜降級）
│   ├─ tree.js            資料樹驗證、攤平、合併（結構以即時清單為準，圖片優先本站）
│   ├─ image-source.js    圖片來源轉接：本站路徑 → lh3 → drive thumbnail；逾時換候選；剛上傳延遲重試；併發 4；no-referrer
│   ├─ justified.js       齊行式排版
│   ├─ wall.js            作品牆控制器（差異更新、淡出／重排／淡入、尾格「探索更多」）
│   ├─ render.js icons.js 共用渲染與 SVG 圖示
│   ├─ lightbox.js        <dialog> 燈箱：FLIP 開合、滑動跟手、鍵盤、預載、分享
│   ├─ animations.js nav.js common.js
│   └─ home.js gallery-page.js status.js   各頁進入點
├─ assets/                ← logo、favicon
├─ data/gallery.json      ← 建置產物（gitignore）
├─ images/                ← 建置產物（gitignore）：<fileId>-<rev>-t.webp（寬 640）、-l.webp（長邊 1920）
├─ apps-script/Code.gs    ← 整檔貼到 Apps Script 編輯器；純函式部分可在 Node 測試
├─ scripts/
│   ├─ build-gallery.mjs      穩定層建置（Actions 與本機共用）
│   ├─ lib/convert.mjs        轉檔鏈：sharp →（HEIC）ImageMagick／heif-convert／sips
│   ├─ lib/drive-download.mjs 原圖下載：drive.usercontent.google.com 直接下載 → Apps Script ③ 備援
│   ├─ lib/config-loader.mjs  設定檔讀取與格式檢查
│   ├─ validate-config.mjs    Actions 第一步：設定檔不合格就不部署
│   ├─ local-server.mjs       本機正式模式 127.0.0.1:8080（同一套檔案＋定時重建）
│   ├─ dev-server.mjs         開發用：靜態＋假的即時清單 API（情境切換）
│   ├─ mock-data.mjs          合成假資料（多相簿、佔位圖）
│   ├─ mock/make-live-list.mjs 從公開資料夾產生本機測試清單（開發用）
│   ├─ test-heic.mjs          T4／AC-09 轉檔鏈實測
│   ├─ export-github.mjs      產生「上傳Github的全部資料」快照
│   └─ build-pages.py         從 scripts/pages/*.html 片段組裝三個頁面
├─ tests/                     name-parser、tree（node --test）
├─ .github/workflows/deploy.yml  建置與部署（發布前只把網站檔案組進 _site/）；heic-test.yml  T4 工具鏈測試
└─ docs/                      SETUP、家人上傳說明、ARCHITECTURE、TEST-REPORT、交接報告、reference/範例.png
```

## 資料契約（schemaVersion 1）

```jsonc
{
  "schemaVersion": 1, "source": "live|build", "generatedAt": "…", "builtAt": "…（build 才有）",
  "categories": [{
    "id": "<Drive 資料夾 ID>", "name": "美甲", "subtitle": "", "order": 1, "coverPhotoId": "…",
    "albums": [{
      "id": "<Drive 資料夾 ID> 或 <類別ID>__loose", "name": "簡約裸色", "subtitle": "純粹耐看", "order": 1, "implicit": false, "coverPhotoId": "…",
      "photos": [{ "id": "<Drive 檔案 ID>", "createdTime": "…", "modifiedTime": "…", "mimeType": "image/jpeg", "width": 3024, "height": 4032, "rev": "<md5 前 10 碼>", "isCover": true,
                   "local": { "thumb": "images/…-t.webp", "large": "images/…-l.webp", "thumbWidth": 640, … }, "color": "#e8d7cf" }]   // local／color 只有 build 才有
    }]
  }],
  "hero": [ photo… ], "warnings": [{ "code": "deep-folder|loose-image-at-root", "message": "…" }], "stats": { "categories": 2, "albums": 2, "photos": 23 }
}
```
- 鍵值一律用 Drive ID，資料夾改名後深層連結仍有效。
- 不含檔名、擁有者、電子郵件等任何個資。
- `rev` 變了代表同一個 ID 的內容被替換，前端會改用即時來源直到重建完成。

## 主要決策與理由

| 決策 | 理由 |
|---|---|
| 原圖直接從 `drive.usercontent.google.com/download?id=…&export=download` 下載，Apps Script ③ 只當備援 | T3 實測公開資料夾的 JPG／22 MB PNG／HEIC 都能直接下載，不需密鑰也沒有 6 分鐘／回應大小限制 |
| 即時圖片先 lh3 直連、再 drive thumbnail，且一律 `no-referrer` | T1 實測：兩者同後端（thumbnail 302 到 lh3）；429 是依 Referer 計算的配額，不帶 Referer 時 100 張並行全 200 |
| 圖片快取用 Actions cache，遺失時先從線上網站抓回舊圖 | 圖片不能進 git 歷史；線上網站本身就是最可靠的「上一版」 |
| Apps Script 清單失敗時退回線上 gallery.json | 讓「只改設定檔」的推送在 Google 端故障時仍能部署 |
| Drive API v3 進階服務（非 DriveApp） | 整棵樹只要 3 次查詢（根／所有類別合併／所有相簿合併），且拿得到寬高與 md5 |
| 類別底下只有散圖時隱含相簿叫「全部作品」（有其他相簿才叫「未分類」） | 家人目前就是這種結構，「未分類」當唯一相簿名稱很突兀（暫定調整，見交接報告） |
| HTML 由 `scripts/build-pages.py` 組裝 | header／footer 三頁一致；產物已提交，部署不需要 Python |
| 作品牆排版：`computeRows()` 純函式（枚舉最後一列張數＋均分前綴＋違規量評分） | 首頁尾格「探索更多」要吸收剩餘寬度且不放大最後一列；純函式可用 244 個組合做單元測試 |
| 「未分類」只在前端改顯示名稱（`uncategorizedAlbumName`，預設「其他作品」） | 名稱是 Apps Script 自動產生的，穩定 ID `<類別ID>__loose` 與深層連結不變 |
| 相簿 1～3 張時放佔位卡（`aria-hidden`、不可點） | 四欄格線只有 2 張時右半邊全空 |

## 前端即時層流程

1. `GalleryData.init()`：同時取 `data/gallery.json` 與 `?action=list`；建置資料先到先畫。
2. `mergeTrees(built, live)`：結構（類別／相簿／名稱／排序）以 live 為準；照片若在 built 且 `rev` 相同 → 用本站圖；否則標 `live: true` → 走 Google 縮圖。
3. 前景每 `liveRefreshSeconds`（50）秒重取；`visibilitychange` 回前景時若超過間隔立刻重取。
4. `Wall.setPhotos()`：離開的淡出 → 重排 → 新的淡入；即時新出現的加 `.is-new`（滑入＋NEW）。
5. 即時清單逾時（6 秒）或錯誤：只用 gallery.json，畫面無任何錯誤訊息；標題旁小圓點不亮。

## 額度與上限（離上限多遠）

| 項目 | 用量估計 | 上限 |
|---|---|---|
| Apps Script 觸發器總時間 | 288 次/日 × ~2 秒 ≈ 10 分鐘 | 90 分鐘/日 |
| UrlFetch | 只在偵測到變動時 1 次 | 20,000/日 |
| 即時清單請求 | 每個開著的分頁每 50 秒 1 次；15 秒快取 | Apps Script 無明確 GET 上限；每次未命中 3 次 Drive 查詢 |
| CacheService 單筆 | 300 張約 45 KB | 100 KB（超過就不快取，仍正常回傳） |
| Pages 大小 | 300 張 ≈ 300 × (60 + 250) KB ≈ 95 MB | 1 GB（超過 800 MB 建置會警告） |
| Actions 完整重建 | 300 張約 3～5 分鐘（本機 23 張 15 秒） | 30 分鐘（工作流程設定） |
