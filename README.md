# Mechanical design demos · 機械設計作品集

**▶ Open the website (no download, no install): https://0smallcat0.github.io/mechanical-design-demos/**

**▶ 直接打開網站（不用下載、不用安裝）：https://0smallcat0.github.io/mechanical-design-demos/**

Everything runs in your web browser (Chrome, Edge, Safari, Firefox). The interactive 3D model is made for a computer screen; on a phone, open the project pages and the video.
The file list above is only the source of the website; you do not need to open any of it.

全部在瀏覽器裡開就能用。互動 3D 模型是給電腦螢幕用的，手機請看專案頁和影片。上面那一排檔案只是網站的原始檔，一般人不用點。

**Want one for your product? Order on Fiverr:** [mechanical animation](https://www.fiverr.com/lychnis_/create-a-mechanical-animation-showing-how-your-machine-works) · [product renders](https://www.fiverr.com/lychnis_/do-photorealistic-3d-product-rendering-and-exploded-views-from-your-cad) · [CAD model and drawing](https://www.fiverr.com/lychnis_/convert-your-sketch-or-pdf-into-a-3d-cad-model-and-2d-technical-drawing) · [3D viewer for your website](https://www.fiverr.com/lychnis_/build-an-interactive-3d-product-viewer-for-your-website-with-threejs)

---

## CD-11 cycloidal reducer · CD-11 擺線減速機

[![CD-11 interactive model](cd11-cycloid-reducer/renders/live_preview.png)](https://0smallcat0.github.io/mechanical-design-demos/cd11-cycloid-reducer/live.html)

**▶ [Open the 3D model · 打開 3D 模型](https://0smallcat0.github.io/mechanical-design-demos/cd11-cycloid-reducer/live.html)**  ·  [Project page with video, drawings and CAD files · 專案頁（影片、工程圖、CAD 檔）](https://0smallcat0.github.io/mechanical-design-demos/cd11-cycloid-reducer/)

A gearbox that turns a fast motor (3,000 rpm) into a slow, strong output (272.7 rpm, 11:1). The model moves, and the numbers on both sides (forces, stress, bearing life) are calculated live from the same motion.

把馬達的高轉速（3,000 rpm）降成慢而有力的輸出（272.7 rpm，11:1）的減速機。模型會動，兩側的數字（受力、應力、軸承壽命）跟著動作即時算出來。

How to use · 怎麼用：

| Do this · 動作 | What happens · 結果 |
| --- | --- |
| Just watch · 先看就好 | It starts with an automatic tour · 一開始會自動導覽 |
| Drag with the mouse / scroll · 拖曳、滾輪 | Turn and zoom · 轉視角、縮放 |
| **EXPLODE** (bottom right · 右下) | Pulls the parts apart so you see every piece · 把零件拆開來看 |
| **CUTAWAY** / **GLASS** | Cuts the housing open / makes it see-through · 剖開外殼／外殼變透明 |
| **FORCES** | Shows the force arrows · 顯示受力箭頭 |
| **PAUSE**, **−15° / +15°** (bottom left · 左下) | Stop and turn step by step · 暫停、一格一格轉 |
| **PLAYBACK** slider · 播放速度 | Slow down or speed up · 調慢或調快 |
| **INPUT TORQUE** slider · 輸入扭矩 | Load the gearbox harder and watch the forces change · 加大負載，看受力怎麼變 |
| **WHY 11:1?** | Explains the gear ratio · 解釋為什麼是 11:1 |

The project page also has a 30-second product film, a 41-second tour of the interactive model, photo-style renders, engineering drawings (PDF) and STEP files that open in any CAD program.

專案頁另有 30 秒產品片、41 秒互動模型導覽片、渲染圖、工程圖 PDF，以及任何 CAD 軟體都能開的 STEP 檔。

---

## Eight-legged pick-up robot + EV3 transport robot · 八足取物機器人＋EV3 運輸機器人

[![Pick-up robot simulation](walking-pick-robot/media/sim-pick.jpg)](https://0smallcat0.github.io/mechanical-design-demos/walking-pick-robot/live.html)

**▶ [Open the simulation · 打開模擬](https://0smallcat0.github.io/mechanical-design-demos/walking-pick-robot/live.html)**  ·  [Project page with the real robot, tour video and CAD motion · 專案頁（實機、導覽影片、CAD 動作）](https://0smallcat0.github.io/mechanical-design-demos/walking-pick-robot/)

University capstone (NCKU Mechanical Engineering, ME3173, six-person team). A walking robot picks up a part and hands it to a line-following EV3 robot. I led the team and owned the pick-up robot's electronics and control: Xbox controller → Python bridge → HC-05 Bluetooth → Arduino UNO, with a 500 ms command timeout so a dropped link stops the robot.

成大機械系「機械專題實作」（六人一組）。八足機器人夾取零件、交給循跡的 EV3 送走。我是組長，負責取物機器人的電控：Xbox 手把 → Python 橋接 → HC-05 藍牙 → Arduino UNO，500 ms 收不到指令就自動停。

| Do this · 動作 | What happens · 結果 |
| --- | --- |
| Just watch · 先看就好 | It plays the whole pick-and-hand-off sequence · 自動導覽整段流程 |
| Click anywhere, then F / B / L / R | Walk · 行走 |
| U / D, E / Q, A / Z | Arm up/down, rotate, reach · 手臂升降、旋轉、伸縮 |
| O / C, G / K | Gripper open/close, gate open/close · 夾爪開合、閘門開關 |
| **斷線** (top right · 右上) | Cuts the wireless link; the robot stops after 500 ms · 斷線，500 ms 後自動停 |
| View buttons (top · 上方 總覽／夾取／電控…) | Jump to a camera view · 切視角 |

The interface is in Chinese; the key letters are the same as on the real robot.

---

## Web 3D example · 網頁互動 3D 範例

Another interactive 3D page, in its own project: [Interactive 3D room with real products](https://0smallcat0.github.io/interactive-3d-room/) (drag, rotate and open furniture in the browser).

另一個網頁互動 3D 範例，獨立成另一個專案：[互動 3D 房間（真實商品）](https://0smallcat0.github.io/interactive-3d-room/)。
