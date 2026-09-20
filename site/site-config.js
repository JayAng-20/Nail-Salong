/* =====================================================================
 *  網站設定檔 —— 這是你唯一需要修改的檔案
 *  ---------------------------------------------------------------
 *  ✦ 只改「引號裡的文字」和「數字」，不要動引號、逗號、大括號、中括號。
 *  ✦ 每一行 // 後面是說明，不會顯示在網站上。
 *  ✦ 改完存檔、推送到 GitHub 後，網站會自動重新建置（約 2～5 分鐘）。
 *  ✦ 想暫時不顯示某個社群按鈕，把網址改成空字串 "" 即可。
 *  ✦ 改壞了也不用怕：建置會先檢查格式，格式不對就不會部署，線上維持舊版。
 * ===================================================================== */

window.SITE_CONFIG = {

  /* ---------- 店家基本資料 ---------- */
  shopName: "彩蝶美甲美睫沙龍",              // 店名（導覽列、頁尾、SEO 標題）
  shopNameEn: "Butterfly Nail & Lash",       // 英文店名（顯示在店名下方的小字）
  tagline: "NAIL · LASH · BEAUTY",           // 英文標語（頁尾與導覽列小字，全大寫較好看）
  footerQuote: "美不只是一種外表，更是一種生活態度。", // 頁尾右側的一句話

  /* ---------- 首頁主視覺文字 ---------- */
  hero: {
    eyebrow: "NAILS & LASHES TELL YOUR STORY", // 大標上方的英文小字
    titleLines: ["讓指尖與眼眸", "成為你的風格名片"], // 大標（兩行，各一段文字）
    description: "從日常到特別的日子，用細膩的美學，點綴屬於你的獨特光芒。", // 大標下方的一段說明
    primaryButton: "瀏覽作品",                // 實心按鈕文字（連到作品集）
    secondaryButton: "店家資訊",              // 外框按鈕文字（捲到店家資訊）
    bottomLine: "MORE THAN BEAUTY · A BRIGHTER YOU", // 按鈕下方帶橫線的英文小字
    scriptText: "Good Nails, Brighter Days",  // 主圖上的手寫英文
    badgeLines: ["指尖的溫柔", "是一種生活態度"], // 圓形徽章裡的兩行字
  },

  /* ---------- 服務價目 ----------
   *  每一組 = { title: "分組名稱", items: [ 項目, 項目, ... ] }
   *  每個項目 = { name: "名稱", desc: "說明（可空）", price: 數字, suffix: "起 或 空" }
   *  price 只填數字，不要加 $ 或逗號。
   */
  serviceGroups: [
    {
      title: "美甲",
      items: [
        { name: "水晶延甲", desc: "單指計價", price: 100, suffix: "" },
        { name: "光療延甲", desc: "單指計價", price: 100, suffix: "" },
        { name: "光療單色", desc: "手部", price: 600, suffix: "" },
        { name: "前處理", desc: "手部", price: 350, suffix: "起" },
      ],
    },
    {
      title: "美睫",
      items: [
        { name: "接睫毛", desc: "", price: 500, suffix: "" },
        { name: "水貂睫毛", desc: "", price: 1000, suffix: "" },
        { name: "山茶花睫毛", desc: "", price: 1200, suffix: "" },
      ],
    },
    {
      title: "美足",
      items: [
        { name: "光療單色", desc: "足部", price: 600, suffix: "" },
        { name: "前處理", desc: "足部", price: 350, suffix: "" },
      ],
    },
    {
      title: "手足保養",
      items: [
        { name: "手部保養", desc: "", price: 200, suffix: "" },
        { name: "足部保養", desc: "", price: 250, suffix: "" },
        { name: "足部去老繭", desc: "", price: 500, suffix: "" },
      ],
    },
  ],
  serviceNote: "價格僅供參考，實際費用依款式、指況與現場評估為準；歡迎透過社群私訊詢問。", // 價目表下方一行備註

  /* ---------- 店家資訊 ---------- */
  info: {
    address: "雲林縣斗南鎮長安路二段38號",     // 地址（點了會開 Google 地圖）
    mapLink: "https://www.google.com/maps/search/?api=1&query=%E9%9B%B2%E6%9E%97%E7%B8%A3%E6%96%97%E5%8D%97%E9%8E%AE%E9%95%B7%E5%AE%89%E8%B7%AF%E4%BA%8C%E6%AE%B538%E8%99%9F", // 點地址要開的 Google 地圖網址
    mapEmbedUrl: "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3654.1051777655966!2d120.47343099999999!3d23.6721964!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x346eb9b635bb529d%3A0xfabf59578d5b2175!2zNjMw6Zuy5p6X57ij5paX5Y2X6Y6u5piO5piM6YeM6ZW35a6J6Lev5LqM5q61MzjomZ8!5e0!3m2!1szh-TW!2stw!4v1789894315266!5m2!1szh-TW!2stw", // Google 地圖「分享 → 嵌入地圖」裡 src="..." 的網址
    phone: "0920224222",                       // 電話（點了可直接撥打）
    phoneDisplay: "0920-224-222",              // 電話顯示樣式
    hours: ["星期一～星期六　採預約制", "星期日　公休"], // 營業時間，一行一個
    hoursNote: "",                             // 營業時間補充（可空，例如「國定假日請先私訊確認」）
  },

  /* ---------- 社群連結（沒有的留空字串 ""，該按鈕就不會顯示） ---------- */
  social: {
    facebook: "https://www.facebook.com/pages/%E5%BD%A9%E8%9D%B6%E7%BE%8E%E7%94%B2%E7%BE%8E%E7%9D%AB%E6%B2%99%E9%BE%8D/189325661508264",
    instagram: "https://www.instagram.com/imjeorijeori",
    line: "https://line.me/ti/p/GOdtEnREuX",
  },

  /* ---------- SEO（搜尋引擎與社群分享預覽） ---------- */
  seo: {
    title: "彩蝶美甲美睫沙龍｜雲林斗南 美甲・美睫 作品集", // 瀏覽器分頁標題
    description: "雲林斗南的美甲美睫沙龍。凝膠美甲、光療延甲、接睫毛、手足保養，作品每日更新。採預約制，歡迎私訊詢問。", // 搜尋結果的描述文字
    ogImage: "",                               // 社群分享預覽圖網址（留空會自動用最新作品）
    siteUrl: "https://jayang-20.github.io/Nail-Salong/", // 網站正式網址（結尾要有 /）
  },

  /* ---------- 系統設定（照 docs/SETUP.md 的步驟填） ---------- */
  appsScriptUrl: "",   // Apps Script 網頁應用程式網址（以 https://script.google.com/macros/s/ 開頭、/exec 結尾）；留空＝關閉即時層

  /* 進階（通常不用改） */
  liveRefreshSeconds: 50,   // 頁面開著時，每隔幾秒重新向雲端硬碟查一次（45～60）
  liveTimeoutMs: 6000,      // 即時清單逾時毫秒數，超過就只用已建置的作品
  newBadgeDays: 14,         // 上傳幾天內的作品顯示「NEW」
  latestCount: 12,          // 首頁「最新作品」顯示幾張
};
