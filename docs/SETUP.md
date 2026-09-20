# SETUP：我要手動做的每一步

> 依序做完 A → B → C → D。每個值要貼到哪裡都寫在該步驟裡。全部做完大約 20 分鐘。
> 你目前的資料：總資料夾 ID `17jTLrm2Z2958BIaaDeGGGQjq2W9oeH-o`、repo `JayAng-20/Nail-Salong`。

---

## A. Google Apps Script（Google 端唯一的程式）

### A-1 建立專案並貼上程式
1. 用**擁有雲端硬碟總資料夾的 Google 帳號**登入，打開 <https://script.google.com/> → 左上「新專案」。
2. 左上專案名稱改成 `彩蝶作品網站`（名稱隨意）。
3. 把 `apps-script/Code.gs` **整個檔案內容**複製，貼到編輯器裡取代原本的 `function myFunction() {}`，按 Ctrl/⌘+S 存檔。

### A-2 啟用 Drive API 進階服務（一定要做，否則列不出資料夾）
1. 編輯器左側「服務」旁邊的「＋」。
2. 找到 **Drive API** → 版本選 **v3** → 識別碼維持 `Drive` → 新增。

### A-3 填指令碼屬性（所有可變設定都在這裡，程式碼裡沒有任何實際值）
左側齒輪「專案設定」→ 最下面「指令碼屬性」→「新增指令碼屬性」，逐一加入：

| 屬性名稱 | 值 | 說明 |
|---|---|---|
| `ROOT_FOLDER_ID` | `17jTLrm2Z2958BIaaDeGGGQjq2W9oeH-o` | 作品總資料夾 ID |
| `GITHUB_REPO` | `JayAng-20/Nail-Salong` | 帳號/repo |
| `GITHUB_TOKEN` | （B-1 產生的 fine-grained PAT） | 可以先留空，B-1 做完再回來填 |
| `FILE_SECRET` | （選填）自己隨便打一串 32 字以上的亂碼 | 原圖備援通道的共用密鑰，和 B-4 的 Secret 填一樣的值 |
| `NOTIFY_EMAIL` | （選填）錯誤通知信收件人 | 不填就寄給你自己 |

按「儲存指令碼屬性」。

### A-4 測試與授權
1. 編輯器上方函式下拉選單選 `testSetup` → 按「執行」。
2. 第一次會跳「需要授權」→ 選你的帳號 → 若出現「Google 尚未驗證這個應用程式」→ 點「進階」→「前往（專案名稱）（不安全）」→ 允許。（這是你自己寫的程式，只有你自己在用。）
3. 看下方「執行記錄」，應該出現：
   ```
   ✔ ROOT_FOLDER_ID … ✔ Drive API 進階服務已啟用
   ✔ 列舉成功：2 個類別、2 個相簿、23 張照片，耗時 xxx ms
      類別「美甲」：全部作品(16)  類別「美睫」：全部作品(7)
   ```
   （`專題.txt` 與 `.DS_Store` 會自動被忽略；耗時數字請回報給我，這是 T2／效能實測資料。）

### A-5 部署成網頁應用程式（拿到網址）
1. 右上「部署」→「新增部署作業」→ 左邊齒輪選「網頁應用程式」。
2. 說明隨意；**執行身分：我**；**誰可以存取：任何人**。→「部署」。
3. 複製「網頁應用程式」的網址（`https://script.google.com/macros/s/……/exec`）。**這就是要回覆給我的 Apps Script 網址。**
4. 之後若修改 Code.gs：部署 → 管理部署作業 → 鉛筆 → 版本選「新版本」→ 部署（網址不會變）。

### A-6 建立每 5 分鐘的變動偵測觸發器
函式下拉選單選 `installTriggers` → 執行。左側「觸發條件」（鬧鐘圖示）應看到 `checkForChanges` 每 5 分鐘。

> 額度估算：每次檢查約 1～3 秒（3 次 Drive 查詢），一天 288 次 ≈ 10～15 分鐘，遠低於免費帳號每日 90 分鐘的觸發器上限。UrlFetch 只在偵測到變動時用 1 次（每日上限 20,000）。

---

## B. GitHub

### B-1 建立 fine-grained PAT（給 Apps Script 通知用）
1. GitHub 右上頭像 → Settings → 最下面 Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token。
2. Token name：`nail-salon-dispatch`；Expiration：最長可選 1 年（到期前 GitHub 會寄信提醒，換法見最後一節）。
3. Repository access：**Only select repositories** → 選 `Nail-Salong`。
4. Permissions → Repository permissions → **Contents：Read and write**（Metadata 會自動變成 Read）。其他都不用。
5. Generate token → 複製（只會顯示一次）→ 回到 A-3 貼進 `GITHUB_TOKEN` → 儲存。
6. 回 Apps Script 執行 `testDispatch`，執行記錄應顯示 `✔ GitHub 已接受通知（204）`（要先做完 B-2 推送，repo 裡有工作流程才會真的跑起來）。

### B-2 把程式放上 repo
- 方法一（我來做）：回覆我「授權推送」，我用你的 git 憑證推到 `main`。
- 方法二（你自己）：把專案資料夾裡「上傳Github的全部資料」的**內容**上傳到 repo（網頁：Add file → Upload files，記得包含 `.github` 資料夾），或用 git push。

### B-3 把 Pages 來源設為 GitHub Actions
repo → Settings → Pages → Build and deployment → Source 選 **GitHub Actions**。（不要選 Deploy from a branch。）

### B-4 設定 Secrets（選填）
repo → Settings → Secrets and variables → Actions → New repository secret：
- `FILE_SECRET`：和 A-3 一樣的值（只有在「直接下載原圖」失敗時才會用到的備援通道；不填也能運作）。

### B-5 手動跑第一次建置
repo → Actions → 左側「Build & Deploy」→ Run workflow → Run。約 2～4 分鐘後，Settings → Pages 會顯示網址 `https://jayang-20.github.io/Nail-Salong/`。

---

## C. 把 Apps Script 網址填進設定檔

打開 `site/site-config.js`，找到：
```js
appsScriptUrl: "",
```
把 A-5 的網址貼進引號裡，存檔、推送（或重新上傳這個檔案）。推送會自動觸發建置。

---

## D. 驗證

1. 打開 `https://jayang-20.github.io/Nail-Salong/status.html`：七張卡片都應該是綠點或黃點，「Apps Script 變動偵測」卡要顯示觸發器已安裝。
2. 打開首頁，最新作品標題旁的小圓點變綠 ＝ 即時清單連線正常。
3. 到雲端硬碟丟一張照片進「美甲」，重新整理網站 → 幾秒內出現；5～10 分鐘後 Actions 會自動重建，status.html 的「兩邊數量差異」會歸零。

---

## 本機架設（127.0.0.1:8080，功能與線上相同）

```bash
npm install          # 第一次
npm run local        # 先建置一次（會連 Apps Script 取清單、下載新照片、轉檔），再在 http://127.0.0.1:8080 提供，每 5 分鐘增量重建
```
- 不用 Node 的替代：`npm run build` 後 `cd site && python3 -m http.server 8080 --bind 127.0.0.1`。
- 開發時想用假資料測情境：`npm run dev`（5173 埠，會注入假的即時清單 API，**不是**正式模式）。

---

## 日常維護

- **改價目／店家資訊／社群連結**：只改 `site/site-config.js`，推送後 2～5 分鐘生效。改壞格式時 Actions 會失敗、線上維持舊版，錯誤訊息在 Actions 記錄裡（用中文寫清楚哪一行）。
- **PAT 到期怎麼換**：B-1 重做一次產生新 token → Apps Script 專案設定 → 指令碼屬性 → 更新 `GITHUB_TOKEN`。到期時你會收到 Apps Script 寄的錯誤信（同一種錯誤一天一封）。
- **壞掉時看哪裡**：
  1. `status.html`：哪張卡是紅點就是哪一段壞了。
  2. Apps Script 編輯器 → 左側「執行項目」：看 `checkForChanges` 是否失敗。
  3. GitHub → Actions：看最近一次 Build & Deploy 的紅色步驟。
- **想強制全部重建**：Actions → Build & Deploy → Run workflow → 勾「full_rebuild」。
- **想立刻觸發一次重建**（不等 5 分鐘）：Apps Script 執行 `resetSignature` 再執行 `checkForChanges`；或直接 Run workflow。
