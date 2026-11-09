import * as THREE from 'three';
import type { Sim } from '../sim/sim';
import { LEG_PHI, LEG_SHAPE, PAD_HALF, padLocalPose, radial } from '../sim/machine';
import { backdropTexture, glassStickerTexture, lcdTexture, lightboxTexture, panelTexture } from './textures';

/**
 * 台灣標準台外觀（依鼎莉二代手冊外部尺寸 800×860×1910 mm）
 * 造型元素：上方燈箱招牌、四角鋁柱、LED 燈條、前方大玻璃、
 * 凸出控制台（球頭搖桿＋紅色下爪鈕＋投幣口）、左下取物口。
 * 內部細節與比例為合理推測，非原廠圖面。
 */
export interface CabinetTheme { body: number; accent: number; led: number; sign: string; backdrop: string }
export const THEMES: CabinetTheme[] = [
  { body: 0xf7f7f9, accent: 0xff4f8b, led: 0xff5fa2, sign: '#ff4f8b', backdrop: '#ff8fb8' },
  { body: 0x1f2a44, accent: 0x34b7ff, led: 0x48c8ff, sign: '#2f9bff', backdrop: '#4aa8ff' },
  { body: 0xfff4d6, accent: 0xffa630, led: 0xffc145, sign: '#ff9f1c', backdrop: '#ffc46b' },
];

const mat = {
  metal: () => new THREE.MeshStandardMaterial({ color: 0xc9ccd2, metalness: 0.9, roughness: 0.3 }),
  darkMetal: () => new THREE.MeshStandardMaterial({ color: 0x3a3d44, metalness: 0.7, roughness: 0.4 }),
  glass: () => new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0.05, transparent: true, opacity: 0.12, envMapIntensity: 1.2, depthWrite: false }),
  acrylic: () => new THREE.MeshPhysicalMaterial({ color: 0xd8f0ff, roughness: 0.08, transparent: true, opacity: 0.35, depthWrite: false }),
};

function box(w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function buildCabinet(sim: Sim, theme: CabinetTheme, decorOnly = false): THREE.Group {
  const c = sim.prof.cabinet;
  const g = new THREE.Group();
  const W = c.width, D = c.depth, H = c.height;
  const zFront = c.playMaxZ; // 玻璃面
  const zBack = -D / 2;
  const bodyMat = new THREE.MeshStandardMaterial({ color: theme.body, roughness: 0.45, metalness: 0.1 });
  const accentMat = new THREE.MeshStandardMaterial({ color: theme.accent, roughness: 0.35, metalness: 0.2 });
  const ledMat = new THREE.MeshStandardMaterial({ color: theme.led, emissive: theme.led, emissiveIntensity: 2.2 });

  // 下櫃
  const baseH = c.playFloorY - 0.12;
  g.add(box(W, baseH, zFront - zBack, bodyMat, 0, baseH / 2, (zFront + zBack) / 2));
  // 下櫃彩色飾條
  g.add(box(W + 0.004, 0.05, zFront - zBack + 0.004, accentMat, 0, baseH - 0.08, (zFront + zBack) / 2));
  // 取物口（左下）：深色開口＋透明擋片
  const hx = c.playMinX + c.holeSizeX / 2;
  const doorY = c.chuteBottomY + 0.08;
  const door = box(c.holeSizeX * 0.9, 0.18, 0.02, new THREE.MeshStandardMaterial({ color: 0x111114, roughness: 0.8 }), hx, doorY, zFront + 0.001);
  g.add(door);
  const flap = box(c.holeSizeX * 0.86, 0.16, 0.006, mat.acrylic(), hx, doorY, zFront + 0.02);
  g.add(flap);
  g.add(box(c.holeSizeX * 0.96, 0.02, 0.05, accentMat, hx, doorY + 0.1, zFront + 0.02));
  // 機台腳座
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.03, 16), mat.darkMetal());
    foot.position.set(sx * (W / 2 - 0.05), 0.015, sz * (D / 2 - 0.06));
    g.add(foot);
  }

  // 控制台（凸出）
  const panelTop = c.playFloorY - 0.12;
  const cp = new THREE.Group();
  const cpBody = box(W, 0.12, 0.13, bodyMat, 0, 0, 0);
  cp.add(cpBody);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.04, 0.12), new THREE.MeshStandardMaterial({ map: panelTexture(), roughness: 0.6 }));
  face.rotation.x = -Math.PI / 2;
  face.position.set(0, 0.0605, 0);
  cp.add(face);
  cp.position.set(0, panelTop + 0.06, zFront + 0.065);
  g.add(cp);
  // 球頭搖桿
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.07, 12), mat.metal());
  stick.position.set(-W * 0.23, panelTop + 0.155, zFront + 0.06);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.022, 24, 16), new THREE.MeshStandardMaterial({ color: 0xe0192f, roughness: 0.25 }));
  ball.position.set(0, 0.04, 0);
  stick.add(ball);
  stick.name = 'joystick';
  g.add(stick);
  const boot = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.028, 0.012, 20), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 }));
  boot.position.set(-W * 0.23, panelTop + 0.126, zFront + 0.06);
  g.add(boot);
  // 紅色大按鈕
  const btnBase = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.01, 32), new THREE.MeshStandardMaterial({ color: 0xffd400, roughness: 0.4 }));
  btnBase.position.set(W * 0.23, panelTop + 0.125, zFront + 0.06);
  g.add(btnBase);
  const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.032, 0.02, 32), new THREE.MeshStandardMaterial({ color: 0xe0192f, roughness: 0.3, emissive: 0x400008 }));
  btn.position.set(W * 0.23, panelTop + 0.138, zFront + 0.06);
  btn.name = 'dropButton';
  g.add(btn);
  // 投幣口與小螢幕
  const coin = box(0.07, 0.1, 0.012, mat.metal(), W * 0.34, panelTop - 0.1, zFront + 0.006);
  g.add(coin);
  g.add(box(0.004, 0.035, 0.014, new THREE.MeshStandardMaterial({ color: 0x111111 }), W * 0.34, panelTop - 0.09, zFront + 0.007));
  const lcd = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.038), new THREE.MeshBasicMaterial({ map: lcdTexture('FREE') }));
  lcd.position.set(0, panelTop - 0.06, zFront + 0.002);
  g.add(lcd);

  // 遊戲艙：四角鋁柱、背板、側板玻璃、前玻璃
  const yA = c.playFloorY - 0.12, yB = c.ceilingY + 0.02;
  const ph = yB - yA;
  for (const sx of [-1, 1]) for (const z of [zFront, zBack + 0.03]) {
    g.add(box(0.035, ph, 0.035, mat.metal(), sx * (W / 2 - 0.0175), yA + ph / 2, z));
  }
  // 背板（內部印刷）
  const back = new THREE.Mesh(new THREE.PlaneGeometry(c.playMaxX - c.playMinX, c.ceilingY - c.playFloorY), new THREE.MeshStandardMaterial({ map: backdropTexture(theme.backdrop), roughness: 0.7 }));
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
  const sticker = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.07), new THREE.MeshBasicMaterial({ map: glassStickerTexture(), transparent: true }));
  sticker.position.set(W * 0.26, c.ceilingY - 0.06, zFront + 0.014);
  g.add(sticker);
  // LED 燈條
  for (const sx of [-1, 1]) g.add(box(0.008, ph - 0.04, 0.008, ledMat, sx * (W / 2 - 0.04), yA + ph / 2, zFront + 0.02));
  g.add(box(W - 0.08, 0.008, 0.008, ledMat, 0, yA + 0.01, zFront + 0.02));

  // 燈箱
  const lbH = H - yB;
  g.add(box(W, lbH, D - 0.04, bodyMat, 0, yB + lbH / 2, -0.02));
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.05, lbH - 0.05), new THREE.MeshStandardMaterial({ map: lightboxTexture('選物販賣機', 'DL-G2 研究基準機', theme.sign), emissive: 0xffffff, emissiveIntensity: 0.55, emissiveMap: null }));
  (sign.material as THREE.MeshStandardMaterial).emissiveMap = (sign.material as THREE.MeshStandardMaterial).map;
  sign.position.set(0, yB + lbH / 2, (D - 0.04) / 2 - 0.02 + 0.001);
  g.add(sign);
  g.add(box(W + 0.01, 0.025, D - 0.03, accentMat, 0, yB + 0.012, -0.02));

  if (decorOnly) return g;

  // 場內：底板（彩色墊）、洞口擋板、防甩片、出貨通道
  const floorMat = new THREE.MeshStandardMaterial({ color: 0xf1e7f5, roughness: 0.85 });
  const acr = mat.acrylic();
  for (const part of sim.machine.statics) {
    if (part.kind === 'wall' || part.kind === 'glass' || part.kind === 'ceiling') continue;
    const m = part.kind === 'floor' ? floorMat : part.kind === 'bin' ? new THREE.MeshStandardMaterial({ color: 0x22222a, roughness: 0.9 }) : part.kind === 'chute' ? new THREE.MeshStandardMaterial({ color: 0x555a66, roughness: 0.6, side: THREE.DoubleSide }) : acr;
    const mesh = box(part.half.x * 2, part.half.y * 2, part.half.z * 2, m, part.center.x, part.center.y, part.center.z);
    if (part.kind === 'barrier' || part.kind === 'antiswing') { mesh.castShadow = false; mesh.renderOrder = 5; }
    g.add(mesh);
    if (part.kind === 'barrier' || part.kind === 'antiswing') {
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.8 }));
      edges.position.copy(mesh.position);
      g.add(edges);
    }
  }
  // 洞口邊框（黃黑警示色，台灣常見的洞口貼條）
  const hz0 = c.playMaxZ - c.holeSizeZ;
  const stripe = new THREE.MeshStandardMaterial({ color: 0xffcc00, roughness: 0.5 });
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
  cord: THREE.Line;
  crossRail: THREE.Mesh;
  trolley: THREE.Mesh;
  private cordPts = 140;

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
      this.legs.push(lg);
      this.group.add(lg);
    }

    // 吊線＋螺旋電線
    this.cable = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0x888888 }));
    this.group.add(this.cable);
    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.cordPts * 3), 3));
    this.cord = new THREE.Line(cg, new THREE.LineBasicMaterial({ color: 0x111111 }));
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
    // 螺旋電線：沿鋼索旁邊的螺旋線（鬆線時下垂一些）
    const cp = this.cord.geometry.attributes.position as THREE.BufferAttribute;
    const slack = Math.max(0, m.cableLength - m.cableDistance());
    const n = this.cordPts;
    const dx = top.x - tp.x, dy = top.y - tp.y, dz = top.z - tp.z;
    const turns = 6 + m.cableLength * 40;
    for (let i = 0; i < n; i++) {
      const s = i / (n - 1);
      const sag = Math.sin(Math.PI * s) * slack * 0.5;
      const ang = s * turns * Math.PI * 2;
      const r = 0.012;
      cp.setXYZ(i, tp.x + dx * s + 0.03 + Math.cos(ang) * r + sag, tp.y + dy * s, tp.z + dz * s + Math.sin(ang) * r);
    }
    cp.needsUpdate = true;
    this.cord.geometry.computeBoundingSphere();
    this.crossRail.position.set(0, tp.y + 0.03, tp.z);
    this.trolley.position.set(tp.x, tp.y + 0.02, tp.z);
  }
}
