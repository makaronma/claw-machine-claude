import * as THREE from 'three';
import type { Sim } from '../sim/sim';
import { LEG_PHI, LEG_SHAPE, PAD_HALF, padLocalPose, radial } from '../sim/machine';
import { mergeStatic } from './merge';
import { backdropTexture, glassStickerTexture, glassWritingTexture, guaranteeSignTexture, holoTexture, lcdTexture, lightboxTexture, panelTexture, stickerTexture } from './textures';
import type { LayoutInfo, PropSpec } from '../sim/layouts';
import { fabricBumpTexture } from './textures';

/**
 * 台灣標準台外觀（依鼎莉二代手冊外部尺寸 800×860×1910 mm）
 * 造型元素：上方燈箱招牌、四角鋁柱、LED 燈條、前方大玻璃、
 * 凸出控制台（球頭搖桿＋紅色下爪鈕＋投幣口）、左下取物口。
 * 內部細節與比例為合理推測，非原廠圖面。
 */
export interface CabinetTheme { body: number; accent: number; led: number; sign: string; backdrop: string }
export const THEMES: CabinetTheme[] = [
  // 台灣最常見：亮黃色機身＋全像亮片背板（實拍照片 research/real-world-reference.md #1 #2）
  { body: 0xffcf1f, accent: 0x2f6fe0, led: 0xfff1a6, sign: '#ff3b5c', backdrop: 'holo' },
  { body: 0xf7f7f9, accent: 0xff4f8b, led: 0xff5fa2, sign: '#ff4f8b', backdrop: '#ff8fb8' },
  { body: 0x1f2a44, accent: 0x34b7ff, led: 0x48c8ff, sign: '#2f9bff', backdrop: '#4aa8ff' },
  { body: 0xfff4d6, accent: 0xffa630, led: 0xffc145, sign: '#ff9f1c', backdrop: '#ffc46b' },
];

// 材質快取：多台機台共用同一份材質，合併幾何時才能併成同一個 draw call
const matCache = new Map<string, THREE.Material>();
const cached = <T extends THREE.Material>(key: string, make: () => T): T => {
  let m = matCache.get(key);
  if (!m) { m = make(); matCache.set(key, m); }
  return m as T;
};
const std = (color: number, roughness: number, metalness = 0, extra: THREE.MeshStandardMaterialParameters = {}) =>
  cached(`std|${color}|${roughness}|${metalness}|${JSON.stringify(extra, (k, v) => (v && v.isTexture ? v.uuid : v))}`, () => new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra }));
const mat = {
  metal: () => std(0xc9ccd2, 0.3, 0.9),
  darkMetal: () => std(0x3a3d44, 0.4, 0.7),
  glass: () => cached('glass', () => new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0.05, transparent: true, opacity: 0.12, envMapIntensity: 1.2, depthWrite: false })),
  acrylic: () => cached('acrylic', () => new THREE.MeshPhysicalMaterial({ color: 0xd8f0ff, roughness: 0.08, transparent: true, opacity: 0.35, depthWrite: false })),
};

/** 機櫃零件：預設只接收陰影（只有爪子與獎品投射陰影，陰影 pass 才便宜） */
function box(w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.receiveShadow = true;
  return mesh;
}

export function buildCabinet(sim: Sim, theme: CabinetTheme, decorOnly = false): THREE.Group {
  const c = sim.prof.cabinet;
  const g = new THREE.Group();
  const W = c.width, D = c.depth, H = c.height;
  const zFront = c.playMaxZ; // 玻璃面
  const zBack = -D / 2;
  const bodyMat = std(theme.body, 0.45, 0.1);
  const accentMat = std(theme.accent, 0.35, 0.2);
  const ledMat = std(theme.led, 0.5, 0, { emissive: new THREE.Color(theme.led), emissiveIntensity: 2.2 });

  // 下櫃
  const baseH = c.playFloorY - 0.12;
  g.add(box(W, baseH, zFront - zBack, bodyMat, 0, baseH / 2, (zFront + zBack) / 2));
  // 下櫃彩色飾條
  g.add(box(W + 0.004, 0.05, zFront - zBack + 0.004, accentMat, 0, baseH - 0.08, (zFront + zBack) / 2));
  // 取物口（左下）：深色開口＋透明擋片
  const hx = c.playMinX + c.holeSizeX / 2;
  const doorY = c.chuteBottomY + 0.08;
  const door = box(c.holeSizeX * 0.9, 0.18, 0.02, std(0x111114, 0.8), hx, doorY, zFront + 0.001);
  g.add(door);
  const flap = box(c.holeSizeX * 0.86, 0.16, 0.006, mat.acrylic(), hx, doorY, zFront + 0.02);
  g.add(flap);
  g.add(box(c.holeSizeX * 0.96, 0.02, 0.05, accentMat, hx, doorY + 0.1, zFront + 0.02));
  // 機台腳座
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.03, 12), mat.darkMetal());
    foot.position.set(sx * (W / 2 - 0.05), 0.015, sz * (D / 2 - 0.06));
    g.add(foot);
  }

  // 控制台（凸出）
  const panelTop = c.playFloorY - 0.12;
  const cp = new THREE.Group();
  const cpBody = box(W, 0.12, 0.13, bodyMat, 0, 0, 0);
  cp.add(cpBody);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.04, 0.12), cached('panelFace', () => new THREE.MeshStandardMaterial({ map: panelTexture(), roughness: 0.6 })));
  face.rotation.x = -Math.PI / 2;
  face.position.set(0, 0.0605, 0);
  cp.add(face);
  cp.position.set(0, panelTop + 0.06, zFront + 0.065);
  g.add(cp);
  // 球頭搖桿
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.07, 12), mat.metal());
  stick.position.set(-W * 0.23, panelTop + 0.155, zFront + 0.06);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.022, 24, 16), std(0xe0192f, 0.25));
  ball.position.set(0, 0.04, 0);
  stick.add(ball);
  stick.name = 'joystick';
  g.add(stick);
  const boot = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.028, 0.012, 20), std(0x111111, 0.9));
  boot.position.set(-W * 0.23, panelTop + 0.126, zFront + 0.06);
  g.add(boot);
  // 紅色大按鈕
  const btnBase = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.01, 32), std(0xffd400, 0.4));
  btnBase.position.set(W * 0.23, panelTop + 0.125, zFront + 0.06);
  g.add(btnBase);
  const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.032, 0.02, 32), new THREE.MeshStandardMaterial({ color: 0xe0192f, roughness: 0.3, emissive: 0x400008 }));
  btn.position.set(W * 0.23, panelTop + 0.138, zFront + 0.06);
  btn.name = 'dropButton';
  g.add(btn);
  // 投幣口與小螢幕
  const coin = box(0.07, 0.1, 0.012, mat.metal(), W * 0.34, panelTop - 0.1, zFront + 0.006);
  g.add(coin);
  g.add(box(0.004, 0.035, 0.014, std(0x111111, 0.9), W * 0.34, panelTop - 0.09, zFront + 0.007));
  const lcd = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.038), cached('lcd', () => new THREE.MeshBasicMaterial({ map: lcdTexture('FREE') })));
  lcd.position.set(0, panelTop - 0.06, zFront + 0.002);
  g.add(lcd);

  // 遊戲艙：四角鋁柱、背板、側板玻璃、前玻璃
  const yA = c.playFloorY - 0.12, yB = c.ceilingY + 0.02;
  const ph = yB - yA;
  for (const sx of [-1, 1]) for (const z of [zFront, zBack + 0.03]) {
    g.add(box(0.035, ph, 0.035, mat.metal(), sx * (W / 2 - 0.0175), yA + ph / 2, z));
  }
  // 背板（內部印刷）
  const back = new THREE.Mesh(new THREE.PlaneGeometry(c.playMaxX - c.playMinX, c.ceilingY - c.playFloorY), cached(`backdrop|${theme.backdrop}`, () => theme.backdrop === 'holo' ? new THREE.MeshStandardMaterial({ map: holoTexture(), metalness: 0.55, roughness: 0.28, envMapIntensity: 1.6 }) : new THREE.MeshStandardMaterial({ map: backdropTexture(theme.backdrop), roughness: 0.7 })));
  back.position.set(0, (c.ceilingY + c.playFloorY) / 2, c.playMinZ - 0.001);
  back.receiveShadow = true;
  g.add(back);
  g.add(box(W, ph, 0.02, bodyMat, 0, yA + ph / 2, zBack + 0.02));
  // 側玻璃＋前玻璃
  const glassM = mat.glass();
  for (const sx of [-1, 1]) {
    const sg = new THREE.Mesh(new THREE.PlaneGeometry(D - 0.12, c.ceilingY - c.playFloorY + 0.12), glassM);
    sg.rotation.y = Math.PI / 2;
    sg.position.set(sx * (W / 2 - 0.01), (c.ceilingY + yA) / 2, (zFront + zBack) / 2);
    sg.renderOrder = 10;
    g.add(sg);
  }
  const fg = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.04, c.ceilingY - yA), glassM);
  fg.position.set(0, (c.ceilingY + yA) / 2, zFront + 0.012);
  fg.renderOrder = 10;
  g.add(fg);
  const sticker = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.07), cached('sticker', () => new THREE.MeshBasicMaterial({ map: glassStickerTexture(), transparent: true })));
  sticker.position.set(W * 0.26, c.ceilingY - 0.06, zFront + 0.014);
  g.add(sticker);
  // LED 燈條
  for (const sx of [-1, 1]) g.add(box(0.008, ph - 0.04, 0.008, ledMat, sx * (W / 2 - 0.04), yA + ph / 2, zFront + 0.02));
  g.add(box(W - 0.08, 0.008, 0.008, ledMat, 0, yA + 0.01, zFront + 0.02));

  // 燈箱
  const lbH = H - yB;
  g.add(box(W, lbH, D - 0.04, bodyMat, 0, yB + lbH / 2, -0.02));
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.05, lbH - 0.05), cached(`sign|${theme.sign}`, () => {
    const t = lightboxTexture('選物販賣機', 'DL-G2 研究基準機', theme.sign);
    return new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveIntensity: 0.55, emissiveMap: t });
  }));
  sign.position.set(0, yB + lbH / 2, (D - 0.04) / 2 - 0.02 + 0.001);
  g.add(sign);
  g.add(box(W + 0.01, 0.025, D - 0.03, accentMat, 0, yB + 0.012, -0.02));

  if (decorOnly) return g;

  // 場內：底板（彩色墊）、洞口擋板、防甩片、出貨通道
  const floorMat = std(0xf1e7f5, 0.85);
  const acr = mat.acrylic();
  for (const part of sim.machine.statics) {
    if (part.kind === 'wall' || part.kind === 'glass' || part.kind === 'ceiling') continue;
    const m = part.kind === 'floor' ? floorMat : part.kind === 'bin' ? std(0x22222a, 0.9) : part.kind === 'chute' ? std(0x555a66, 0.6) : acr;
    const mesh = box(part.half.x * 2, part.half.y * 2, part.half.z * 2, m, part.center.x, part.center.y, part.center.z);
    if (part.kind === 'barrier' || part.kind === 'antiswing') { mesh.castShadow = false; mesh.renderOrder = 5; }
    g.add(mesh);
    if (part.kind === 'barrier' || part.kind === 'antiswing') {
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), cached('edgeBlue', () => new THREE.LineBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.8 })));
      edges.position.copy(mesh.position);
      g.add(edges);
    }
  }
  // 洞口邊框（黃黑警示色，台灣常見的洞口貼條）
  const hz0 = c.playMaxZ - c.holeSizeZ;
  const stripe = std(0xffcc00, 0.5);
  g.add(box(c.holeSizeX, 0.004, 0.012, stripe, c.playMinX + c.holeSizeX / 2, c.playFloorY + c.barrierHeight + (c.antiSwingEnabled ? c.antiSwingHeight : 0) + 0.002, hz0 - 0.003));
  g.add(box(0.012, 0.004, c.holeSizeZ, stripe, c.playMinX + c.holeSizeX - 0.003, c.playFloorY + c.barrierHeight + (c.antiSwingEnabled ? c.antiSwingHeight : 0) + 0.002, c.playMaxZ - c.holeSizeZ / 2));

  // 天車軌道
  const p = sim.prof.physics;
  const railY = p.trolleyY + 0.03;
  for (const sx of [-1, 1]) g.add(box(0.02, 0.02, c.playMaxZ - c.playMinZ, mat.darkMetal(), sx * (c.playMaxX - 0.01), railY, (c.playMaxZ + c.playMinZ) / 2));
  return g;
}

// ------------------------------------------------------------------ claw
export class ClawView {
  group = new THREE.Group();
  head: THREE.Group;
  legs: THREE.Group[] = [];
  cable: THREE.Line;
  cord: THREE.InstancedMesh;
  crossRail: THREE.Mesh;
  trolley: THREE.Mesh;
  private cordRings = 46;
  private tmpM = new THREE.Matrix4();
  private tmpQ = new THREE.Quaternion();
  private tmpV = new THREE.Vector3();

  constructor(private sim: Sim) {
    const p = sim.prof.physics;
    const chrome = new THREE.MeshStandardMaterial({ color: 0xd9dde3, metalness: 1, roughness: 0.22 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2b2e35, metalness: 0.6, roughness: 0.4 });
    const sleeve = new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.85 });

    // 爪頭：鍍鉻圓筒＋上蓋＋線圈環
    this.head = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(p.headRadius, p.headRadius * 1.05, p.headHeight, 32), chrome);
    body.castShadow = true;
    this.head.add(body);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(p.headRadius * 0.55, p.headRadius, 0.02, 32), dark);
    cap.position.y = p.headHeight / 2 + 0.01;
    cap.castShadow = true;
    this.head.add(cap);
    for (const y of [-0.02, 0.0, 0.02]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(p.headRadius + 0.001, 0.0025, 8, 40), dark);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = y;
      this.head.add(ring);
    }
    const bottom = new THREE.Mesh(new THREE.CylinderGeometry(p.headRadius * 1.05, p.headRadius * 0.9, 0.01, 32), dark);
    bottom.position.y = -p.headHeight / 2 - 0.005;
    this.head.add(bottom);
    this.head = mergeStatic(this.head);
    this.group.add(this.head);

    // 三爪：沿爪腳外形的管狀彎鉤＋白色爪套
    for (const phi of LEG_PHI) {
      const lg = new THREE.Group();
      const pts = [LEG_SHAPE.segA[0], LEG_SHAPE.segA[1], LEG_SHAPE.segB[1]].map((q) => {
        const r = radial(phi, q);
        return new THREE.Vector3(r.x, r.y, r.z);
      });
      const curve = new THREE.CatmullRomCurve3([pts[0], pts[0].clone().lerp(pts[1], 0.5), pts[1], pts[1].clone().lerp(pts[2], 0.6), pts[2]], false, 'centripetal');
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, p.legRadius, 8), chrome);
      tube.castShadow = true;
      lg.add(tube);
      const pad = padLocalPose(phi, p.tipRadius);
      const padMesh = new THREE.Mesh(new THREE.BoxGeometry(PAD_HALF.x * 2, PAD_HALF.y * 2, PAD_HALF.z * 2), sleeve);
      padMesh.position.set(pad.pos.x, pad.pos.y, pad.pos.z);
      padMesh.quaternion.set(pad.rot.x, pad.rot.y, pad.rot.z, pad.rot.w);
      padMesh.castShadow = true;
      lg.add(padMesh);
      const hinge = new THREE.Mesh(new THREE.SphereGeometry(0.007, 12, 8), dark);
      lg.add(hinge);
      const merged = mergeStatic(lg);
      this.legs.push(merged);
      this.group.add(merged);
    }

    // 吊線＋螺旋電線
    this.cable = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0x888888 }));
    this.group.add(this.cable);
    // 粗黑螺旋電線（實拍照片 #1）：用一串 instanced 圓環表現線圈
    this.cord = new THREE.InstancedMesh(new THREE.TorusGeometry(0.0105, 0.0026, 6, 14), new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.45 }), this.cordRings);
    this.cord.castShadow = true;
    this.cord.frustumCulled = false;
    this.group.add(this.cord);

    // 天車
    const c = sim.prof.cabinet;
    this.crossRail = new THREE.Mesh(new THREE.BoxGeometry(c.playMaxX - c.playMinX, 0.02, 0.03), dark);
    this.group.add(this.crossRail);
    this.trolley = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.08), new THREE.MeshStandardMaterial({ color: 0x444a55, metalness: 0.5, roughness: 0.5 }));
    this.trolley.castShadow = true;
    this.group.add(this.trolley);
  }

  update() {
    const m = this.sim.machine;
    const hp = m.head.translation(), hq = m.head.rotation();
    this.head.position.set(hp.x, hp.y, hp.z);
    this.head.quaternion.set(hq.x, hq.y, hq.z, hq.w);
    m.legs.forEach((leg, i) => {
      const t = leg.translation(), q = leg.rotation();
      this.legs[i].position.set(t.x, t.y, t.z);
      this.legs[i].quaternion.set(q.x, q.y, q.z, q.w);
    });
    const tp = m.trolleyPos;
    const top = m.headTopWorld();
    const pos = this.cable.geometry.attributes.position as THREE.BufferAttribute;
    pos.setXYZ(0, tp.x, tp.y, tp.z);
    pos.setXYZ(1, top.x, top.y, top.z);
    pos.needsUpdate = true;
    this.cable.geometry.computeBoundingSphere();
    // 螺旋電線：吊點旁 2.5 cm 平行於鋼索，鬆線時向側邊鼓出；線圈間距隨長度伸縮（彈簧線）
    const slack = Math.max(0, m.cableLength - m.cableDistance());
    const n = this.cordRings;
    const ax = tp.x + 0.026, ay = tp.y - 0.01, az = tp.z;
    const bx = top.x + 0.026, by = top.y, bz = top.z;
    const dir = this.tmpV.set(bx - ax, by - ay, bz - az).normalize();
    this.tmpQ.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    for (let i = 0; i < n; i++) {
      const s = (i + 0.5) / n;
      const sag = Math.sin(Math.PI * s) * slack * 0.5;
      this.tmpM.makeRotationFromQuaternion(this.tmpQ);
      this.tmpM.setPosition(ax + (bx - ax) * s + sag, ay + (by - ay) * s, az + (bz - az) * s);
      this.cord.setMatrixAt(i, this.tmpM);
    }
    this.cord.instanceMatrix.needsUpdate = true;
    this.crossRail.position.set(0, tp.y + 0.03, tp.z);
    this.trolley.position.set(tp.x, tp.y + 0.02, tp.z);
  }
}

// ------------------------------------------------------------------ 擺台道具與實拍細節
let foamBump: THREE.Texture | null = null;
/** 墊高台（泡棉／漆木）、木架、斜坡 */
export function buildProps(props: PropSpec[]): THREE.Group {
  const g = new THREE.Group();
  foamBump ??= fabricBumpTexture();
  for (const p of props) {
    const m = p.kind === 'wood'
      ? std(p.color, 0.7, 0)
      : cached(`foam|${p.color}`, () => new THREE.MeshStandardMaterial({ color: p.color, roughness: 1, bumpMap: foamBump, bumpScale: 0.8 }));
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(p.half.x * 2, p.half.y * 2, p.half.z * 2), m);
    mesh.position.set(p.center.x, p.center.y, p.center.z);
    mesh.quaternion.set(p.rot.x, p.rot.y, p.rot.z, p.rot.w);
    mesh.receiveShadow = true;
    mesh.castShadow = p.kind === 'wood';
    g.add(mesh);
  }
  return g;
}

/** 實拍常見的機台細節：貼紙、台主手寫字、機台編號、機內監視器 */
export function buildMachineDecor(sim: Sim, layout: LayoutInfo | undefined): THREE.Group {
  const c = sim.prof.cabinet;
  const g = new THREE.Group();
  const z = c.playMaxZ + 0.013;
  const plane = (w: number, h: number, mat: THREE.Material, x: number, y: number, zz = z) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y, zz);
    m.renderOrder = 12;
    g.add(m);
    return m;
  };
  // 「恕不挑款 隨機出貨」貼紙（右下）
  plane(0.11, 0.055, cached('stk-random', () => new THREE.MeshBasicMaterial({ map: stickerTexture(['恕不挑款', '隨機出貨'], '#d81b3c') })), c.playMaxX - 0.08, c.playFloorY + 0.04);
  if (layout?.food) plane(0.1, 0.05, cached('stk-food', () => new THREE.MeshBasicMaterial({ map: stickerTexture(['食品效期', '115.06.30'], '#1c6dd0') })), c.playMaxX - 0.2, c.playFloorY + 0.04);
  // 「請勿拍打玻璃與搖晃機台」
  plane(0.13, 0.032, cached('stk-noshake', () => new THREE.MeshBasicMaterial({ map: stickerTexture(['請勿拍打搖晃機台'], '#333333') })), 0.05, c.ceilingY - 0.035);
  // 台主白板筆手寫字（透明底）
  if (layout?.writing?.length) {
    plane(0.22, 0.11, new THREE.MeshBasicMaterial({ map: glassWritingTexture(layout.writing, '#3df07a'), transparent: true, depthWrite: false }), 0.12, c.playFloorY + 0.32);
  }
  // 機台編號
  plane(0.06, 0.035, cached('stk-no', () => new THREE.MeshBasicMaterial({ map: stickerTexture(['No.07'], '#111111') })), -c.width / 2 + 0.07, c.height - 0.02, c.depth / 2 - 0.04 + 0.002);
  // 機內監視器（右後上角）
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.022, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), std(0x111114, 0.2, 0.3));
  dome.rotation.x = Math.PI;
  dome.position.set(c.playMaxX - 0.04, c.ceilingY - 0.002, c.playMinZ + 0.05);
  g.add(dome);
  return g;
}

/** 黃色「保證取物」價格盒：LED 顯示即時累計金額（實拍照片 #1：歸位角上方的黃色盒子） */
export class GuaranteeSign {
  mesh: THREE.Mesh;
  private key = '';
  private mat = new THREE.MeshBasicMaterial();
  constructor(sim: Sim) {
    const c = sim.prof.cabinet;
    this.mesh = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.08, 0.03), [std(0xffcf1f, 0.5), std(0xffcf1f, 0.5), std(0xffcf1f, 0.5), std(0xffcf1f, 0.5), this.mat, std(0xffcf1f, 0.5)]);
    this.mesh.position.set(c.playMinX + 0.085, c.ceilingY - 0.07, c.playMaxZ - 0.02);
  }
  update(price: number, credits: number, active: boolean, enabled: boolean) {
    const key = `${price}|${credits}|${active}|${enabled}`;
    if (key === this.key) return;
    this.key = key;
    this.mat.map?.dispose();
    this.mat.map = guaranteeSignTexture(Math.min(price, 790), credits, active, enabled);
    this.mat.needsUpdate = true;
  }
}
