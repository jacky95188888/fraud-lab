# FRAUD LAB Visual DNA V4

這份檔案記錄 2026-09-22 新介面圖像的可落地生成規格，避免未來只把示意圖當參考。

## 核心視覺
- 背景：深海軍藍 #010814 / #031526，低亮度科技格線與電路紋。
- 安全主色：霓虹青 #26C7FF、電光藍 #087CFF。
- 危險警示：#FF5265，只用於詐騙、165、風險訊號。
- 安全狀態：#35E0A4。
- 獨立作品／高級點綴：#FFC958 金色。
- 材質：半透明深色玻璃、細霓虹描邊、內發光、柔和 bloom，不做廉價大面積漸層。
- 主圖騰：3D/全息防詐盾牌 + 雷達同心圓 + orbit 粒子 + 鎖頭/檢測核心。
- 卡片：真 HTML；圖像只做 icon/hero 裝飾，不把整頁文字烘焙進圖片。
- 手機優先：資訊層級清楚、觸控區至少約 44px，避免圖片文字縮放失真。

## 圖像生成提示骨架
「高級深藍 cyber-security / anti-fraud interface asset，黑藍玻璃材質，cyan/blue neon edge light，holographic shield/radar/circuit motifs，少量 red threat warning，精緻 3D 科技感，乾淨、高對比、可信賴、無浮水印、無內嵌 UI 文字。」

## 實作原則
1. 文字、按鈕、連結、功能入口全部保持 HTML。
2. Hero 可用獨立人物/盾牌 WebP 或 PNG，但必須有 CSS fallback。
3. 所有素材都要有 mobile crop；不可用整頁截圖當背景。
4. 危險紅與安全青有語意，不互換。
5. 新頁面沿用 master-v3.css token 與上述色票。
