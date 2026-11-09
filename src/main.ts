import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import GUI from 'lil-gui';
import RAPIER from '@dimforge/rapier3d-compat';
import { Sim } from './sim/sim';
import { DL_G2_BASE, MachineProfile, cloneProfile, sourceOf } from './sim/profile';
import { LAYOUTS } from './sim/layouts';
import { STATE_LABEL } from './sim/firmware';
import { DebugView, MachineScene, buildStore, setupLights } from './render/scene';
import { InputState } from './ui/input';
import { TelemetryPanel } from './ui/hud';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

await RAPIER.init();

// ------------------------------------------------------------------ 模擬
let editProf: MachineProfile = cloneProfile(DL_G2_BASE);
const sim = new Sim(RAPIER, editProf, 'snackstack');
sim.settle(2.5);

// ------------------------------------------------------------------ 渲染
const canvas = $<HTMLCanvasElement>('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
// 解析度：高 DPI 上限 1.5，之後依實際幀時間自動調整（見 adaptiveResolution）
let pixelRatio = Math.min(1.5, window.devicePixelRatio || 1);
renderer.setPixelRatio(pixelRatio);
renderer.shadowMap.enabled = true;
renderer.shadowMap.autoUpdate = false; // 只有東西在動時才重畫陰影
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping; // ACES 會讓亮黃機身與彩盒褪色
renderer.toneMappingExposure = 0.92;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xeeece6);
const camera = new THREE.PerspectiveCamera(42, 1, 0.02, 30);
const controls = new OrbitControls(camera, canvas);
let viewDirty = true; // 視角或 UI 改變 → 需要重繪
controls.addEventListener('change', () => { viewDirty = true; });
controls.enableDamping = true;
controls.minDistance = 0.35;
controls.maxDistance = 3.5;
controls.maxPolarAngle = Math.PI * 0.62;
setupLights(scene, renderer, sim);
buildStore(scene, sim);
let ms = new MachineScene(sim);
scene.add(ms.root);
const debug = new DebugView();
scene.add(debug.group);

const VIEWS: Record<string, { pos: [number, number, number]; target: [number, number, number] }> = {
  正面: { pos: [0.0, 1.42, 1.85], target: [0, 1.1, -0.03] },
  側面: { pos: [1.35, 1.3, 0.05], target: [0, 1.05, -0.03] },
  俯視: { pos: [0.0, 2.35, 0.25], target: [0, 0.95, -0.03] },
  洞口: { pos: [0.12, 1.42, 0.95], target: [-0.2, 0.88, 0.12] },
};
function setView(name: string) {
  const v = VIEWS[name];
  camera.position.set(...v.pos);
  controls.target.set(...v.target);
  controls.update();
}
setView('正面');

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // 直式手機：拉遠一點讓整台機器入鏡
  camera.fov = w < h ? 58 : 42;
  camera.updateProjectionMatrix();
  viewDirty = true;
}
window.addEventListener('resize', resize);
resize();

// ------------------------------------------------------------------ 輸入
const input = new InputState($('joystick'), $('knob'), $('drop'));
input.onDrop = () => {
  sim.pressDrop();
  $('drop').classList.add('pressed');
  setTimeout(() => $('drop').classList.remove('pressed'), 150);
};
input.onKey = (k) => {
  if (k === 'p') opts.paused = !opts.paused, gui.controllersRecursive().forEach((c) => c.updateDisplay());
  if (k === '.') stepOnce = true;
  if (k === '1') setView('正面');
  if (k === '2') setView('側面');
  if (k === '3') setView('俯視');
  if (k === '4') setView('洞口');
};

// ------------------------------------------------------------------ 面板
const opts = {
  layout: 'snackstack',
  machinePreset: '原廠設定（手冊）',
  timeScale: 1,
  paused: false,
  step: () => { stepOnce = true; },
  showTrail: true,
  showContacts: false,
  showTelemetry: true,
  followClaw: false,
  view: '正面',
  resetLayout: () => rebuild(),
  applyPhysics: () => { rebuild(); },
  resetDefaults: () => { editProf = cloneProfile(DL_G2_BASE); rebuild(); refreshGui(); },
  runTests: () => runTests(),
};
let stepOnce = false;
const MACHINE_PRESETS: Record<string, Partial<MachineProfile['controller']>> = {
  '原廠設定（手冊）': { P1: 255, P2: 200, P3: 45, P4: 45 },
  '全程強爪（示意）': { P1: 255, P2: 255, P3: 255, P4: 255 },
  '摸摸爪（台主常見）': { P1: 190, P2: 110, P3: 25, P4: 25 },
};

const gui = new GUI({ title: '控制面板', width: 300 });
if (window.innerWidth < 720) gui.close();
const tag = (path: string) => ({ manual: '［手冊］', 'other-ref': '［他廠］', assumption: '［假設］' })[sourceOf(path)];

const fGame = gui.addFolder('遊戲');
fGame.add(opts, 'layout', Object.fromEntries(LAYOUTS.map((l) => [l.name, l.id]))).name('擺台').onChange(() => rebuild());
fGame.add(opts, 'resetLayout').name('↺ 重新擺台');
fGame.add(opts, 'machinePreset', Object.keys(MACHINE_PRESETS)).name('機板設定').onChange((v: string) => {
  Object.assign(editProf.controller, MACHINE_PRESETS[v]);
  Object.assign(sim.prof.controller, MACHINE_PRESETS[v]);
  refreshGui();
});
fGame.add(opts, 'view', Object.keys(VIEWS)).name('視角（1~4）').onChange((v: string) => setView(v));
fGame.add(opts, 'followClaw').name('鏡頭跟隨爪頭');

const fTime = gui.addFolder('時間');
fTime.add(opts, 'timeScale', { '1×': 1, '0.5×': 0.5, '0.25×': 0.25, '0.1×（慢動作）': 0.1 }).name('時間倍率');
fTime.add(opts, 'paused').name('暫停（P）');
fTime.add(opts, 'step').name('單步 1/120 s（.）');

const fShow = gui.addFolder('顯示');
fShow.add(opts, 'showTrail').name('爪頭軌跡');
fShow.add(opts, 'showContacts').name('接觸力箭頭').onChange((v: boolean) => { sim.collectContacts = v; });
fShow.add(opts, 'showTelemetry').name('即時遙測圖').onChange((v: boolean) => $('telemetry').classList.toggle('hidden', !v));

// 機板參數：即時生效（直接改 sim.prof）
const fCtl = gui.addFolder('機板參數（即時）');
const ctlKeys: [keyof MachineProfile['controller'], string, number, number, number][] = [
  ['P1', 'P1 底部抓取', 0, 255, 1], ['P2', 'P2 上升', 0, 255, 1], ['P3', 'P3 到頂', 0, 255, 1], ['P4', 'P4 回出口', 0, 255, 1],
  ['T1', 'T1 底部停留 s', 0, 3, 0.05], ['T3', 'T3 頂部停留 s', 0, 3, 0.05], ['descentMaxSeconds', '最大下爪時間 s', 0.5, 6, 0.1],
  ['speedForward', '往後（遠離）速度', 0, 255, 1], ['speedBackward', '往前（靠近）速度', 0, 255, 1],
  ['speedLeft', '往左速度', 0, 255, 1], ['speedRight', '往右速度', 0, 255, 1], ['speedDown', '下降速度', 0, 255, 1], ['speedUp', '上升速度', 0, 255, 1],
];
for (const [k, label, lo, hi, st] of ctlKeys) {
  fCtl.add(editProf.controller, k, lo, hi, st).name(`${label} ${tag(`controller.${k}`)}`).onChange((v: number) => { (sim.prof.controller as unknown as Record<string, number>)[k] = v; });
}
fCtl.add(editProf.controller, 'secondClawEnabled').name('二收（下爪中再按一次）').onChange((v: boolean) => { sim.prof.controller.secondClawEnabled = v; });
const fG = gui.addFolder('保證取物（保夾）');
fG.add(editProf.controller, 'guaranteeEnabled').name('啟用保夾').onChange((v: boolean) => { sim.prof.controller.guaranteeEnabled = v; });
fG.add(editProf.controller, 'guaranteePrice', 10, 790, 10).name(`保證價 NT$ ${tag('controller.guaranteePrice')}`).onChange((v: number) => { sim.prof.controller.guaranteePrice = v; });
fG.add(editProf.controller, 'pricePerPlay', 5, 50, 5).name(`每次 NT$ ${tag('controller.pricePerPlay')}`).onChange((v: number) => { sim.prof.controller.pricePerPlay = v; });
fG.add(editProf.controller, 'guaranteePower', 100, 255, 1).name('保夾後爪力').onChange((v: number) => { sim.prof.controller.guaranteePower = v; });
fCtl.close();

// 物理參數：需要重建
const fPhy = gui.addFolder('物理參數（套用後重建）');
const phyKeys: [keyof MachineProfile['physics'], string, number, number, number][] = [
  ['trolleyMaxSpeedAt255', '天車極速@255 m/s', 0.05, 0.8, 0.01], ['trolleyAccel', '天車加速度 m/s²', 0.2, 6, 0.1], ['trolleyBrake', '天車煞車 m/s²', 0.2, 8, 0.1],
  ['winchMaxSpeedAt255', '卷線速度@255 m/s', 0.05, 0.8, 0.01],
  ['headMass', '爪頭質量 kg', 0.2, 1.5, 0.01], ['plungerMass', '鐵芯質量 kg', 0.03, 0.4, 0.01], ['legMass', '爪腳質量 kg', 0.01, 0.15, 0.005],
  ['solenoidK', '電磁常數 K', 1e-3, 3e-2, 1e-4], ['solenoidGap0', '氣隙偏移 m', 0.005, 0.04, 0.001], ['solenoidR', '線圈電阻 Ω', 8, 60, 1], ['solenoidL', '線圈電感 H', 0.01, 0.5, 0.01],
  ['frictionClawSleeve', '爪套摩擦 μ', 0.1, 1.5, 0.05], ['frictionFloor', '底板摩擦 μ', 0.1, 1.2, 0.05], ['frictionAcrylic', '壓克力摩擦 μ', 0.05, 1, 0.05],
  ['headLinearDamping', '空氣阻尼', 0, 2, 0.01], ['cableStiffnessHz', '鋼索剛性 Hz', 3, 30, 0.5], ['cordTorsionK', '電線扭轉剛性', 0, 0.05, 0.001],
  ['slackTensionRatio', '鬆線開關門檻（×爪重）', 0.1, 0.95, 0.05],
];
for (const [k, label, lo, hi, st] of phyKeys) fPhy.add(editProf.physics, k, lo, hi, st).name(`${label} ${tag(`physics.${k}`)}`);
fPhy.add(editProf.cabinet, 'barrierHeight', 0.03, 0.2, 0.005).name(`擋板高度 m ${tag('cabinet.barrierHeight')}`);
fPhy.add(editProf.cabinet, 'antiSwingEnabled').name(`防甩片 ${tag('cabinet.antiSwingEnabled')}`);
fPhy.add(opts, 'applyPhysics').name('✔ 套用並重建');
fPhy.add(opts, 'resetDefaults').name('↺ 回復 DL-G2 預設');
fPhy.close();

const fTest = gui.addFolder('物理測試');
fTest.add(opts, 'runTests').name('▶ 執行 6 項測試（約 10 秒）');

gui.onChange(() => { viewDirty = true; });
function refreshGui() { gui.controllersRecursive().forEach((c) => c.updateDisplay()); }

function rebuild() {
  const keepCtl = { ...editProf.controller };
  sim.layoutId = opts.layout;
  sim.setProfile({ ...editProf, controller: keepCtl });
  sim.collectContacts = opts.showContacts;
  sim.settle(2.5);
  ms.dispose();
  ms = new MachineScene(sim);
  scene.add(ms.root);
  debug.clearTrail();
  sim.onWin = onWin;
  viewDirty = true;
  shadowStale = true;
  wonList.innerHTML = '';
}

// ------------------------------------------------------------------ HUD
const wonList = $('won-list');
const toast = $('toast');
function onWin(p: { label: string }) {
  const li = document.createElement('li');
  li.textContent = p.label;
  wonList.prepend(li);
  toast.textContent = `🎉 出貨！${p.label}`;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2200);
}
sim.onWin = onWin;
const telemetry = new TelemetryPanel($<HTMLCanvasElement>('telemetry-canvas'));
const stateEl = $('state'), readout = $('readout'), slowEl = $('slow');

// ------------------------------------------------------------------ 物理測試（瀏覽器內執行）
async function runTests() {
  // 測試模組延遲載入，不佔首次載入的 bundle
  const [{ ALL_TESTS }, { showTestResults }] = await Promise.all([import('./sim/tests'), import('./ui/hud')]);
  type TestResult = ReturnType<(typeof ALL_TESTS)[number]>;
  const overlay = $('tests');
  const body = $('tests-body');
  overlay.classList.remove('hidden');
  body.innerHTML = '<p class="running">執行中…（每項測試都是獨立的 Rapier 世界，不影響目前機台）</p>';
  const results: TestResult[] = [];
  for (const fn of ALL_TESTS) {
    await new Promise((r) => setTimeout(r, 30));
    results.push(fn(RAPIER, cloneProfile(editProf)));
    body.querySelector('.running')!.textContent = `執行中… ${results.length}/${ALL_TESTS.length}`;
  }
  showTestResults(body, results);
}
$('tests-close').addEventListener('click', () => $('tests').classList.add('hidden'));

// ------------------------------------------------------------------ 主迴圈：固定 120 Hz 物理，與畫面更新率無關
let acc = 0;
let last = performance.now();
const MAX_STEPS = 6;
const joystickMesh = () => ms.root.getObjectByName('joystick');
const dropMesh = () => ms.root.getObjectByName('dropButton');
let lastHud = 0, lastTel = 0, renderedFrames = 0, shadowStale = true;
// 自動解析度：連續 1.5 秒平均幀間隔 > 24 ms 就降 0.25（最低 0.75）；很順時慢慢升回
let frameAvg = 16, lowSince = 0, highSince = 0;
function adaptiveResolution(dt: number) {
  frameAvg = frameAvg * 0.95 + dt * 1000 * 0.05;
  const t = performance.now();
  const maxPR = Math.min(1.5, window.devicePixelRatio || 1);
  if (frameAvg > 24) { highSince = 0; lowSince ||= t; if (t - lowSince > 1500 && pixelRatio > 0.75) { pixelRatio = Math.max(0.75, pixelRatio - 0.25); renderer.setPixelRatio(pixelRatio); resize(); lowSince = 0; } }
  else if (frameAvg < 14) { lowSince = 0; highSince ||= t; if (t - highSince > 4000 && pixelRatio < maxPR) { pixelRatio = Math.min(maxPR, pixelRatio + 0.25); renderer.setPixelRatio(pixelRatio); resize(); highSince = 0; } }
  else { lowSince = 0; highSince = 0; }
}
const perf = { phys: 0, render: 0, hud: 0, frame: 0, calls: 0, tris: 0, steps: 0, rendered: 0, pixelRatio: 1 };
(window as unknown as { __perf: typeof perf }).__perf = perf;
const ema = (k: keyof typeof perf, v: number) => { perf[k] = perf[k] * 0.9 + v * 0.1; };
function frame(now: number) {
  const tF0 = performance.now();
  const realDt = Math.max(0, Math.min(0.1, (now - last) / 1000));
  last = now;
  sim.input.dirX = input.dirX;
  sim.input.dirZ = input.dirZ;
  let steps = 0;
  if (!opts.paused) {
    acc += realDt * opts.timeScale;
    while (acc >= sim.dt && steps < MAX_STEPS) { sim.step(); acc -= sim.dt; steps++; }
    // 效能不足時不偷改物理：多出來的時間直接丟棄＝整體變慢，並明確提示
    slowEl.classList.toggle('hidden', acc < sim.dt * 2);
    if (acc > sim.dt * MAX_STEPS) acc = 0;
  } else if (stepOnce) {
    sim.step();
    steps = 1;
  }
  stepOnce = false;
  const tP1 = performance.now();
  ms.update();
  const hp = sim.machine.head.translation();
  if (steps && opts.showTrail) debug.pushTrail(hp.x, hp.y, hp.z);
  debug.trail.visible = opts.showTrail;
  debug.contacts.visible = opts.showContacts;
  if (opts.showContacts && steps) debug.setContacts(sim.contacts);
  // 控制台動畫
  const js = joystickMesh();
  if (js) { js.rotation.x = input.dirZ * 0.35; js.rotation.z = -input.dirX * 0.35; }
  const db = dropMesh();
  if (db) db.position.y = (db.userData.y0 ??= db.position.y) - ($('drop').classList.contains('pressed') ? 0.006 : 0);
  if (opts.followClaw) {
    controls.target.lerp(new THREE.Vector3(hp.x, hp.y - 0.1, hp.z), 0.08);
  }
  controls.update();
  // 畫面完全靜止（瞄準中、爪子不動、獎品都在睡）且視角沒變 → 跳過渲染，省電
  const quiet = steps === 0 || sim.isQuiet();
  const tR0 = performance.now();
  if (!quiet || viewDirty || opts.followClaw) {
    if (!quiet || shadowStale) { renderer.shadowMap.needsUpdate = true; shadowStale = !quiet; }
    renderer.render(scene, camera);
    renderedFrames++;
    viewDirty = false;
  }
  const tR1 = performance.now();
  adaptiveResolution(realDt);

  // HUD：文字 10 Hz、遙測圖 20 Hz（每幀改 innerHTML／重畫 canvas 很貴）
  const t = sim.telemetry.at(-1);
  const hudDue = now - lastHud > 100, telDue = now - lastTel > 50;
  if (hudDue) {
    lastHud = now;
    stateEl.textContent = `${STATE_LABEL[sim.firmware.state]}${opts.paused ? '（暫停）' : ''}`;
    stateEl.dataset.state = sim.firmware.state;
  }
  if (t && hudDue) {
    readout.innerHTML =
      `嘗試 <b>${sim.firmware.attempts}</b>　出貨 <b>${sim.wonCount}</b>　已投 <b>NT$${sim.firmware.totalSpent}</b><br>` +
      (sim.prof.controller.guaranteeEnabled ? (sim.firmware.guaranteeActive ? '<b class="g-on">保夾中：本次全力爪</b><br>' : `距保夾 NT$${sim.firmware.creditsToGuarantee()}（累計 ${sim.firmware.credits}）<br>`) : '') +
      `鋼索 L ${(t.cableLength * 100).toFixed(1)} cm　張力 ${t.tension.toFixed(2)} N<br>` +
      `爪力 P ${sim.machine.solenoid.command}　電流 ${t.current.toFixed(2)} A　電磁力 ${t.solenoidForce.toFixed(1)} N<br>` +
      `三爪閉合 ${(t.legAngle * 57.3).toFixed(0)}°　模擬時間 ${sim.time.toFixed(1)} s`;
  }
  // 靜止時每秒仍刷新一次（避免一開始是空白）
  if (opts.showTelemetry && telDue && (!quiet || now - lastTel > 1000)) { lastTel = now; telemetry.draw(sim); }
  const tH1 = performance.now();
  ema('phys', tP1 - tF0); ema('render', tR1 - tR0); ema('hud', tH1 - tR1); ema('frame', tH1 - tF0); ema('steps', steps);
  perf.calls = renderer.info.render.calls; perf.tris = renderer.info.render.triangles; perf.rendered = renderedFrames; perf.pixelRatio = pixelRatio;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
$('loading').remove();
// 供除錯／自動化截圖用
(window as unknown as { __sim: Sim; __setView: (v: string) => void }).__sim = sim;
(window as unknown as { __setView: (v: string) => void }).__setView = setView;
(window as unknown as { __runTests: () => Promise<void> }).__runTests = runTests;
(window as unknown as { __setLayout: (id: string) => void }).__setLayout = (id: string) => { opts.layout = id; rebuild(); refreshGui(); };
