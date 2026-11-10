# Mechanical design demos · 機械設計作品集

**▶ Open the website (no download, no install): https://0smallcat0.github.io/mechanical-design-demos/**

Runs in any modern browser. The interactive models are built for desktop; on a phone, watch the films on the project pages.

瀏覽器直接開，免安裝；互動模型建議用電腦看。

**Want one for your product? Order on Fiverr:** [mechanical animation](https://www.fiverr.com/lychnis_/create-a-mechanical-animation-showing-how-your-machine-works) · [product renders](https://www.fiverr.com/lychnis_/do-photorealistic-3d-product-rendering-and-exploded-views-from-your-cad) · [CAD model and drawing](https://www.fiverr.com/lychnis_/convert-your-sketch-or-pdf-into-a-3d-cad-model-and-2d-technical-drawing) · [3D viewer for your website](https://www.fiverr.com/lychnis_/build-an-interactive-3d-product-viewer-for-your-website-with-threejs)

---

## CD-11 cycloidal reducer · CD-11 擺線減速機

[![CD-11 cycloidal reducer with the front cover off, showing the cycloid disc and ring pins](cd11-cycloid-reducer/renders/render_open.png)](https://0smallcat0.github.io/mechanical-design-demos/cd11-cycloid-reducer/live.html)

**▶ [Open the 3D model · 打開 3D 模型](https://0smallcat0.github.io/mechanical-design-demos/cd11-cycloid-reducer/live.html)**  ·  [Project page with video, drawings and CAD files · 專案頁（影片、工程圖、CAD 檔）](https://0smallcat0.github.io/mechanical-design-demos/cd11-cycloid-reducer/)

A gearbox that turns a fast motor (3,000 rpm) into a slow, strong output (272.7 rpm, 11:1). The model moves, and the numbers on both sides (forces, stress, bearing life) are calculated live from the same motion.

11:1 擺線減速機，受力、應力與軸承壽命隨動作即時算出。

How to use:

| Do this | What happens |
| --- | --- |
| Just watch | It starts with an automatic tour |
| Drag with the mouse / scroll | Turn and zoom |
| **EXPLODE** (bottom right) | Pulls the parts apart so you see every piece |
| **CUTAWAY** / **GLASS** | Cuts the housing open / makes it see-through |
| **FORCES** | Shows the force arrows |
| **PAUSE**, **−15° / +15°** (bottom left) | Stop and turn step by step |
| **PLAYBACK** slider | Slow down or speed up |
| **INPUT TORQUE** slider | Load the gearbox harder and watch the forces change |
| **WHY 11:1?** | Explains the gear ratio |

The project page also has a 30-second product film, a 41-second tour of the interactive model, photo-style renders, engineering drawings (PDF) and STEP files that open in any CAD program.

---

## Eight-legged pick-up robot + EV3 transport robot · 八足取物機器人＋EV3 運輸機器人

[![Studio render of the eight-legged pick-up robot](walking-pick-robot/media/render-hero.jpg)](https://0smallcat0.github.io/mechanical-design-demos/walking-pick-robot/live.html)

**▶ [Open the simulation · 打開模擬](https://0smallcat0.github.io/mechanical-design-demos/walking-pick-robot/live.html)**  ·  [Project page with the product film and tour · 專案頁（產品片、導覽影片）](https://0smallcat0.github.io/mechanical-design-demos/walking-pick-robot/)

University capstone (NCKU Mechanical Engineering, ME3173, six-person team). A walking robot picks up a part and hands it to a line-following EV3 robot. I led the team and owned the pick-up robot's electronics and control: Xbox controller → Python bridge → HC-05 Bluetooth → Arduino UNO, with a 500 ms command timeout so a dropped link stops the robot.

成大機械系專題：八足機器人夾取零件、交給循跡的 EV3 送走；我是組長，負責電控。

| Do this | What happens |
| --- | --- |
| Just watch | It plays the whole pick-and-hand-off sequence |
| Click anywhere, then F / B / L / R | Walk |
| U / D, E / Q, A / Z | Arm up/down, rotate, reach |
| O / C, G / K | Gripper open/close, gate open/close |
| **Cut link** (top right) | Cuts the wireless link; the robot stops after 500 ms |
| View buttons: Overview, Gripper, Electronics… (top) | Jump to a camera view |

The key letters are the same as on the real robot.

---

## Web 3D example · 網頁互動 3D 範例

Another interactive 3D page, in its own project: [Interactive 3D room with real products](https://0smallcat0.github.io/interactive-3d-room/) (drag, rotate and open furniture in the browser).

---

The interactive model pages are built with the MIT-licensed teardown kit (based on [claude-motion](https://github.com/whaleyxbt/claude-motion)); see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
