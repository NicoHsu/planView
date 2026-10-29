# PlanView Focus Planner

規劃下一段時間 → 專注 → 回報進度 → 改善下次預估。

PlanView 包含 macOS / Windows 桌面版（Electron）與 iOS MVP（Expo / React Native）。資料保存在本機，不需要帳號，尚未提供跨裝置同步。

## 開發

需要 Node.js 24（`.nvmrc`）。

```bash
nvm use
npm ci
npm run dev          # Electron
npm run mobile      # Expo
npm run mobile:ios  # 需要 Xcode / Simulator，或改用真機開發版本
```

## 已實作

- 桌面版多任務 timebox、標籤、系統匣倒數、背景通知、暫停／繼續／提前結束。
- 手機版 Today 任務池、時間預估、每個任務的意圖、專注頁與回顧頁。
- 絕對結束時間計時，暫停與重開後恢復，逾時進入回報。
- 回報完成／部分完成／受阻，未完成項目可保留、延後或丟棄。
- 通知拒絕或排程失敗時仍可計時，並顯示提醒狀態。
- 歷史、標籤統計、本地日期的每日實際時數、Plan vs Actual。
- 回報期間與暫停時間不計入專注時數，跨日回報歸屬於專注結束日。
- 手機 SQLite 交易保存；桌面原子寫入，防止重複回報與部分提交。

## 驗證

```bash
npm run test:unit          # 核心、手機流程、真實 SQLite 交易、桌面儲存
npm run test:e2e           # 實際啟動 Electron，使用隔離的暫存資料
npm test                  # 自動測試 + Expo 設定 + iOS bundle + Electron 打包
npm --workspace apps/mobile run doctor
npm run ios:release:check
```

Electron 操作測試需要可啟動桌面應用的 macOS / Windows 環境；Linux CI 需搭配 Xvfb。GitHub Actions 使用 macOS runner。

## 安裝檔與 iOS 建置

```bash
npm run assets            # 從既有 SVG 產生 iOS / 桌面 icon
npm run dist:mac           # Intel + Apple Silicon，dmg / zip
npm run dist:win           # x64 + arm64，NSIS / zip
npm run release:manifest   # 產生安裝檔清單與 SHA-256 校驗碼
npm run ios:build:simulator # 不需要 Apple 付費會員，供 iOS 模擬器使用
npm run ios:build:preview  # 需要 Expo 登入與 Apple 簽章
npm run ios:build:production
npm --workspace apps/mobile run submit:ios
```

桌面安裝檔輸出至 `dist/`。目前未配置 Developer ID / Windows 簽章，下載後系統可能要求額外確認。iOS bundle 匯出是 JavaScript 建置檢查，不代表已產生 IPA 或通過 TestFlight。

## 資料保存

- 桌面：Electron `userData/planner-state.json`，單次原子提交歷史與進行中任務。
- 舊版 `history.json` / `active-session.json` 會在第一次寫入時遷移，原檔保留。
- iOS：裝置上的 `planview.db`（SQLite），完成回報時以交易更新歷史、任務池與進行中狀態。
- 卸載 App 可能移除本機資料，尚無雲端備份。

## 發布資訊

- [發布狀態與尚待人工驗證項目](docs/RELEASE_STATUS.md)
- [iOS 產品計畫](docs/IOS_PRODUCT_PLAN.md)
- [App Store 文案](docs/store/APP_STORE_METADATA.md)
- [TestFlight 檢查表](docs/store/TESTFLIGHT_QA.md)
- [iOS 建置手冊](docs/store/IOS_BUILD_RUNBOOK.md)
- [支援網站](https://nicohsu.github.io/planView/support.html)
- [隱私權政策](https://nicohsu.github.io/planView/privacy.html)

支援信箱：[nicohsu000@gmail.com](mailto:nicohsu000@gmail.com)

EAS 專案：[nicohsu/planview](https://expo.dev/accounts/nicohsu/projects/planview)。尚未加入 Apple Developer 付費會員，目前以模擬器建置驗證原生編譯，TestFlight／App Store 待會員開通。
