# 彩蝶美甲美睫沙龍 作品展示網站（要上傳到 GitHub 的內容）

這個資料夾裡的**內容**就是 GitHub repository 根目錄該有的東西：`index.html` 要在最外層，並且要包含隱藏的 `.github` 資料夾。

## 上傳

把這個資料夾裡的所有項目拖到 repository 根目錄（不是拖整個資料夾進去）。沿用原本的 Google Apps Script、指令碼屬性與 Pages「GitHub Actions」設定，不需要重新設定雲端。

**這裡沒有照片，是正常的。** 照片不進 GitHub：家人把照片丟到雲端硬碟資料夾後，GitHub Actions 會自己下載、轉成 WebP 再放到網站上（`images/` 與 `data/gallery.json` 都是它產生的）。

## 只要改一個檔案

店名、價目、地址、電話、營業時間、社群連結都在 `site-config.js`。改完上傳，2～5 分鐘生效；改錯了不會部署，GitHub Actions 會用中文說明哪裡錯。

## 本機想先看看

在這個資料夾執行（需要 Node.js 20 以上，第一次會花幾分鐘下載並轉檔照片）：

```sh
npm ci
npm run local
```

然後打開 http://127.0.0.1:8080/ 。按 Ctrl+C 結束。

## 說明文件

- `docs/SETUP.md`：雲端硬碟、Apps Script、權杖、Pages 的設定步驟
- `docs/家人上傳說明.md`：給店主的一頁上傳說明
- `docs/ARCHITECTURE.md`：架構與設計決策
