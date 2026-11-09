# 夾娃娃機 Physics Lab（DL-G2-BASE）

依 `proj-chat.md` 研究結論建立的**單台物理實驗場**：鼎莉「選物販賣機二代」手冊基準機，Web（手機＋電腦）、Three.js＋Rapier 3D。
線上版：https://makaronma.github.io/claw-machine-claude/

## 執行

```bash
npm install
npm run dev             # 開發伺服器
npm run build           # 型別檢查＋打包到 dist/
npm run test:physics    # 6 項物理測試 → reports/physics-report.html
npm run check:layouts   # 擺台健檢：落定、出界、何時完全靜止
npm run bench           # 物理每步耗時
npm run perf:chart      # 效能前後對照圖 → reports/perf-report.html
```

操作：WASD／方向鍵移動天車、Space 下爪（下爪中再按＝二收）、滑鼠拖曳轉視角、1~4 切換視角、P 暫停、`.` 單步。手機（觸控）會顯示 8 方向數位搖桿與紅色下爪鈕。

## 台灣實景（research/real-world-reference.md）

參考 33 張實拍照片（台北遊樂場、Wikimedia Commons 新竹店面、ETtoday／NOWnews／自由時報新聞畫面、TNW）與玩家／業者回饋：

- **保證取物（保夾）**：每次 NT$10，累計到保證價（預設 NT$250，上限 790）後爪力轉全力，直到出貨才歸零；機內黃色價格盒即時顯示累計金額。保夾只讓爪子變強，仍要對準。
- **機板預設**：原廠設定（手冊）、摸摸爪（台主常見）、全程強爪。
- **擺台**：零食疊疊樂（粉紅泡棉墊高台＋直排疊盒＋罐裝飲料）、扭蛋殼山、大頭抱枕排排站、木架鐵盒（架子台）、布偶山、腳撐洞口、恐龍尾巴凹槽。
- **外觀**：亮黃機身、全像亮片背板、粗黑螺旋電線、「恕不挑款 隨機出貨」「食品效期」貼紙、台主白板筆字、機內監視器、機台編號。
- **店面**：狹長店面兩排機台面對面、日光燈管、壁扇、兌幣機、木長椅。

所有獎品與品牌為原創，沒有使用實拍照片或未授權角色。

## 架構

| 模組 | 檔案 | 內容 |
|---|---|---|
| Machine Profile | `src/sim/profile.ts` | 所有參數＋來源標記（手冊／他廠／假設） |
| 機械 | `src/sim/machine.ts` | 天車加減速、卷線機、**自訂單向軟約束鋼索**、電磁鐵芯＋連桿閉迴路三爪、爪套墊片 |
| 電磁 | `src/sim/solenoid.ts` | `L dI/dt = V − RI`、`F = K I² / (gap+g0)²`（非線性） |
| 韌體 | `src/sim/firmware.ts` | AIM → 下爪 → P1/T1 → P2 上升 → P3/T3 → P4 回出口 → 鬆爪；保夾累計 |
| 獎品／擺台 | `src/sim/prizes.ts`、`layouts.ts` | 彩盒／圓柱罐／球形扭蛋＋多段剛體布偶；9 種擺台＋靜態道具 |
| 測試 | `src/sim/tests.ts` | T01 擺盪週期、T02 急停、T04 鬆弛、T06 爪力掃描、T07 原廠時序、T11 長時間穩定 |
| 渲染／UI | `src/render/*`、`src/ui/*`、`src/main.ts` | 程式建模機台與獎品、除錯軌跡／接觸力、遙測圖、調參面板 |

物理固定 120 Hz、與畫面 FPS 無關；效能不足時整體變慢並明確提示，不偷改物理。

## 效能（reports/perf-report.html）

- 全域 solver 8 次，爪子連桿所在 island 另加 24 次（`setAdditionalSolverIterations`）。
- 靜止的獎品成群進入睡眠（用 0.25 s 平均位移判斷；Rapier 的 `linvel` 在位置修正後會有假速度）。
- 靜態幾何依材質合併、材質／貼圖共用：同一場景 draw call 259 → 161。
- 畫面完全靜止時跳過渲染與陰影更新；HUD 10 Hz、遙測 20 Hz；自動調整解析度；測試模組延遲載入。
- 物理每步：閒置 1.13 → 0.21 ms、夾取中 1.12 → 0.56 ms；擺台落定 484 → 183 ms。

## 開發中發現的引擎問題（已處理）

- Rapier rope joint 不認得放線速度，拉緊時會把爪頭速度歸零 → 改用自訂軟約束鋼索（Ċ = u·v − L̇）。
- 鋼索若直接讀 `linvel`，會因 Rapier 位置修正留下的假速度在鬆弛時仍往上拉（收爪時整組爪子被吊高 11 mm）→ 改用實際位移速度。
- Rapier JS 0.14 的 `JointData.intoRaw()` **會忽略 revolute 的 limits** → 建立後呼叫 `setLimits()`。
- `roundCuboid` 碰撞體在本情境觸發 WASM panic → 爪套改用一般 cuboid。
- 布偶：四隻彈簧腿＋尾巴同時著地會持續抖動 → 恐龍短腿改成軀幹複合碰撞體；部件最小 10 g；布料只加角阻尼。

## 限制

- 未實測參數（爪頭質量、電磁力曲線、天車加速度、摩擦、獎品質量…）皆為**暫定值**，測試比對的是理論值與物理一致性，**不是真機**。
- 置中硬盒直接三爪抬起時，盒子會繞兩個接觸點轉出（T06/T07），尚無實測可判定此行為是否符合真機。
- 防甩片實際安裝位置未取得，暫定為擋板上方加高壓克力片。
- 部分玩家技巧來源（Dcard 等）阻擋自動化瀏覽，只有搜尋摘要，標為未驗證。
- 3D 模型全部程式建模（原創造型），未使用外部素材。

`tests/cdp-shot.mjs` 是以 Chrome DevTools Protocol 自動截圖的開發驗證工具。
