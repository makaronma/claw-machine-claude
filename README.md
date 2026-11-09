# 夾娃娃機 Physics Lab（DL-G2-BASE）

依 `proj-chat.md` 研究結論建立的**單台物理實驗場**：鼎莉「選物販賣機二代」手冊基準機，Web（手機＋電腦）、Three.js＋Rapier 3D。

## 執行

```bash
npm install
npm run dev            # 開發伺服器
npm run build          # 型別檢查＋打包到 dist/
npm run test:physics   # Node 執行 6 項物理測試 → reports/physics-report.html
```

操作：WASD／方向鍵移動天車、Space 下爪（下爪中再按＝二收）、滑鼠拖曳轉視角、1~4 切換視角、P 暫停、`.` 單步。手機（觸控）會顯示 8 方向數位搖桿與紅色下爪鈕。

## 架構

| 模組 | 檔案 | 內容 |
|---|---|---|
| Machine Profile | `src/sim/profile.ts` | 所有參數＋來源標記（手冊／他廠／假設） |
| 機械 | `src/sim/machine.ts` | 天車加減速、卷線機、**自訂單向軟約束鋼索**、電磁鐵芯＋連桿閉迴路三爪、爪套墊片 |
| 電磁 | `src/sim/solenoid.ts` | `L dI/dt = V − RI`、`F = K I² / (gap+g0)²`（非線性） |
| 韌體 | `src/sim/firmware.ts` | AIM → 下爪 → P1/T1 → P2 上升 → P3/T3 → P4 回出口 → 鬆爪 |
| 獎品／擺台 | `src/sim/prizes.ts`、`layouts.ts` | 原創彩盒＋多段剛體布偶；4 種擺台（含腳撐洞口、恐龍尾巴凹槽） |
| 測試 | `src/sim/tests.ts` | T01 擺盪週期、T02 急停、T04 鬆弛、T06 爪力掃描、T07 原廠時序、T11 長時間穩定 |
| 渲染／UI | `src/render/*`、`src/ui/*`、`src/main.ts` | 程式建模機台與獎品、除錯軌跡／接觸力、遙測圖、調參面板 |

物理固定 120 Hz、32 次 solver 迭代，與畫面 FPS 無關；效能不足時整體變慢並明確提示，不偷改物理。

## 開發中發現的引擎問題（已處理）

- Rapier rope joint 不認得放線速度，拉緊時會把爪頭速度歸零 → 改用自訂軟約束鋼索（Ċ = u·v − L̇）。
- Rapier JS 0.14 的 `JointData.intoRaw()` **會忽略 revolute 的 limits** → 建立後呼叫 `setLimits()`。
- `roundCuboid` 碰撞體在本情境觸發 WASM panic → 爪套改用一般 cuboid。

## 限制

- 未實測參數（爪頭質量、電磁力曲線、天車加速度、摩擦、獎品質量…）皆為**暫定值**，測試比對的是理論值與物理一致性，**不是真機**。
- 置中硬盒直接三爪抬起時，盒子會繞兩個接觸點轉出（T06/T07），尚無實測可判定此行為是否符合真機。
- 防甩片實際安裝位置未取得，暫定為擋板上方加高壓克力片。
- 3D 模型全部程式建模（原創造型），未使用外部素材。

`tests/cdp-shot.mjs` 是以 Chrome DevTools Protocol 自動截圖的開發驗證工具。
