import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { Sim } from '../sim/sim';
import { ClawView, GuaranteeSign, THEMES, buildCabinet, buildMachineDecor, buildProps } from './machineView';
import { LAYOUTS } from '../sim/layouts';
import { PrizeView } from './prizeView';
import { posterTexture, tileFloorTexture } from './textures';
import { mergeStatic } from './merge';

/**
 * 台灣街邊夾娃娃店（依實拍：狹長店面、兩排機台面對面、日光燈管、壁扇、兌幣機、木長椅）
 * 重點是機台不是裝潢。整包靜態物件合併成少數 draw call。
 */
export function buildStore(target: THREE.Scene, sim: Sim) {
  const scene = new THREE.Group();
  const W = 4.3, rowGap = 2.66; // 店寬、對面那排機台的 z
  const floorTex = tileFloorTexture();
  floorTex.repeat.set(8, 8);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, 4.4), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.35, metalness: 0.05 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = 1.2;
  floor.receiveShadow = true;
  scene.add(floor);
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xf4f3ef, roughness: 0.9 });
  const wall = (w: number, h: number, x: number, z: number, ry: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallMat);
    m.position.set(x, h / 2, z);
    m.rotation.y = ry;
    scene.add(m);
  };
  wall(W, 2.8, 0, -0.9, 0);
  wall(W, 2.8, 0, rowGap + 0.5, Math.PI);
  wall(4.4, 2.8, W / 2, 1.2, -Math.PI / 2);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, 4.4), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(0, 2.8, 1.2);
  scene.add(ceil);
  // 日光燈管（兩列，沿店的長邊）
  const tubeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.6 });
  const holderMat = new THREE.MeshStandardMaterial({ color: 0xdadada, roughness: 0.6 });
  for (const z of [0.55, 1.75]) for (const x of [-1.5, -0.3, 0.9]) {
    const holder = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.03, 0.12), holderMat);
    holder.position.set(x + 0.3, 2.78, z);
    scene.add(holder);
    for (const dz of [-0.03, 0.03]) {
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 1.2, 8), tubeMat);
      tube.rotation.z = Math.PI / 2;
      tube.position.set(x + 0.3, 2.75, z + dz);
      scene.add(tube);
    }
  }
  // 壁扇（側牆）
  const fan = new THREE.Group();
  const fanMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.6 });
  const cage = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.008, 6, 32), fanMat);
  fan.add(cage);
  for (let i = 0; i < 3; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.17, 0.005), new THREE.MeshStandardMaterial({ color: 0x9fc7ff, transparent: false }));
    blade.position.set(Math.cos((i * 2 * Math.PI) / 3) * 0.08, Math.sin((i * 2 * Math.PI) / 3) * 0.08, 0);
    blade.rotation.z = (i * 2 * Math.PI) / 3 - Math.PI / 2;
    fan.add(blade);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.08, 16), fanMat);
  hub.rotation.x = Math.PI / 2;
  fan.add(hub);
  fan.position.set(W / 2 - 0.12, 2.35, 1.2);
  fan.rotation.y = -Math.PI / 2 + 0.3;
  fan.rotation.x = 0.35;
  scene.add(fan);
  // 兌幣機（端牆）
  const changer = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.5, 0.38), new THREE.MeshStandardMaterial({ color: 0xc7ccd4, metalness: 0.6, roughness: 0.35 }));
  body.position.y = 0.75;
  changer.add(body);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.5), new THREE.MeshStandardMaterial({ map: posterTexture('兌幣機', ['NT$100 → 10 枚', '只收百元鈔', '找零請洽店長'], '#1f4fa8'), roughness: 0.7 }));
  face.position.set(0, 1.15, 0.191);
  changer.add(face);
  const slot = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.06), new THREE.MeshStandardMaterial({ color: 0x222222 }));
  slot.position.set(0, 0.35, 0.2);
  changer.add(slot);
  changer.position.set(W / 2 - 0.25, 0, 1.15);
  changer.rotation.y = -Math.PI / 2;
  scene.add(changer);
  // 木長椅（走道邊）
  const wood = new THREE.MeshStandardMaterial({ color: 0xa8743f, roughness: 0.8 });
  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.05, 0.32), wood);
  seat.position.set(1.45, 0.43, 1.42);
  scene.add(seat);
  for (const dx of [-0.42, 0.42]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.42, 0.3), wood);
    leg.position.set(1.45 + dx, 0.21, 1.42);
    scene.add(leg);
  }
  // 牆上公告
  const posters: [string, string[], string, number, number, number][] = [
    ['夾娃娃規則', ['本店機台皆保證取物', '請勿拍打搖晃機台', '24H 監視錄影中'], '#e4324c', W / 2 - 0.01, 1.6, 0.45],
    ['台主招租', ['機台出租中', '歡迎洽詢店長', '誠徵台主'], '#2f7de1', W / 2 - 0.01, 1.6, 2.0],
  ];
  for (const [t, lines, color, x, y, z] of posters) {
    const pm = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.6), new THREE.MeshStandardMaterial({ map: posterTexture(t, lines, color), roughness: 0.8 }));
    pm.position.set(x, y, z);
    pm.rotation.y = -Math.PI / 2;
    scene.add(pm);
  }
  // 兩排鄰台（純裝飾）：同排左右、以及走道對面那排（面向這台）
  const decoRoot = new THREE.Group();
  const rowA: [number, number][] = [[0, -0.84], [2, 0.84], [1, -1.68], [0, 1.68]];
  const rowB: [number, number][] = [[0, -1.68], [0, -0.84], [3, 0], [0, 0.84], [1, 1.68]];
  for (const [i, x] of rowA) {
    const deco = buildCabinet(sim, THEMES[i], true);
    deco.position.x = x;
    decoRoot.add(deco);
  }
  for (const [i, x] of rowB) {
    const deco = buildCabinet(sim, THEMES[i], true);
    deco.position.set(x, 0, rowGap);
    deco.rotation.y = Math.PI;
    decoRoot.add(deco);
  }
  target.add(mergeStatic(decoRoot));
  target.add(mergeStatic(scene));
}

export function setupLights(scene: THREE.Scene, renderer: THREE.WebGLRenderer, sim: Sim) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd9d6cf, 0.7));
  const dir = new THREE.DirectionalLight(0xffffff, 1.2);
  dir.position.set(1.5, 2.8, 2.2);
  scene.add(dir);
  // 機台內頂燈（投射陰影，幫助判斷爪子位置）
  const c = sim.prof.cabinet;
  const spot = new THREE.SpotLight(0xffffff, 6, 2.0, Math.PI / 3.2, 0.5, 1);
  spot.position.set(0.05, c.ceilingY - 0.02, -0.04);
  spot.target.position.set(0, c.playFloorY, -0.03);
  spot.castShadow = true;
  const small = Math.min(window.innerWidth, window.innerHeight) < 600;
  spot.shadow.mapSize.set(small ? 512 : 1024, small ? 512 : 1024);
  spot.shadow.bias = -0.0004;
  spot.shadow.camera.near = 0.1;
  spot.shadow.camera.far = 1.5;
  scene.add(spot, spot.target);
}

/** 動態內容：機台、爪子、獎品（換擺台／重建時整組替換） */
export class MachineScene {
  root = new THREE.Group();
  claw: ClawView;
  prizes: PrizeView[] = [];
  sign: GuaranteeSign;
  constructor(public sim: Sim) {
    this.root.add(mergeStatic(buildCabinet(sim, THEMES[0]), ['joystick', 'dropButton']));
    const layout = LAYOUTS.find((l) => l.id === sim.layoutId);
    this.root.add(mergeStatic(buildProps(sim.props)));
    this.root.add(mergeStatic(buildMachineDecor(sim, layout)));
    this.sign = new GuaranteeSign(sim);
    this.root.add(this.sign.mesh);
    this.claw = new ClawView(sim);
    this.root.add(this.claw.group);
    for (const p of sim.prizes) {
      const v = new PrizeView(p);
      this.prizes.push(v);
      v.meshes.forEach((m) => this.root.add(m));
    }
  }
  update() {
    this.claw.update();
    for (const p of this.prizes) p.update();
    const c = this.sim.prof.controller, fw = this.sim.firmware;
    this.sign.update(c.guaranteePrice, fw.credits, fw.guaranteeActive, c.guaranteeEnabled);
  }
  dispose() {
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      // 材質與貼圖有快取共用，不在這裡釋放
    });
    this.root.removeFromParent();
  }
}

/** 除錯：爪頭軌跡、接觸力箭頭 */
export class DebugView {
  group = new THREE.Group();
  trail: THREE.Line;
  contacts: THREE.LineSegments;
  private trailN = 360;
  private trailBuf: Float32Array;
  private trailCount = 0;
  maxContacts = 600;
  forceScale = 0.01; // m / N

  constructor() {
    this.trailBuf = new Float32Array(this.trailN * 3);
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(this.trailBuf, 3));
    this.trail = new THREE.Line(tg, new THREE.LineBasicMaterial({ color: 0x2a78d6, depthTest: false, transparent: true, opacity: 0.9 }));
    this.trail.renderOrder = 20;
    this.trail.frustumCulled = false;
    this.group.add(this.trail);
    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.maxContacts * 6), 3));
    cg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.maxContacts * 6), 3));
    this.contacts = new THREE.LineSegments(cg, new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false }));
    this.contacts.renderOrder = 21;
    this.contacts.frustumCulled = false;
    this.group.add(this.contacts);
  }

  pushTrail(x: number, y: number, z: number) {
    if (this.trailCount < this.trailN) {
      this.trailBuf.set([x, y, z], this.trailCount * 3);
      this.trailCount++;
    } else {
      this.trailBuf.copyWithin(0, 3);
      this.trailBuf.set([x, y, z], (this.trailN - 1) * 3);
    }
    const g = this.trail.geometry;
    (g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    g.setDrawRange(0, this.trailCount);
  }
  clearTrail() { this.trailCount = 0; this.trail.geometry.setDrawRange(0, 0); }

  setContacts(list: { point: { x: number; y: number; z: number }; normal: { x: number; y: number; z: number }; force: number }[]) {
    const pos = this.contacts.geometry.attributes.position as THREE.BufferAttribute;
    const col = this.contacts.geometry.attributes.color as THREE.BufferAttribute;
    const n = Math.min(list.length, this.maxContacts);
    for (let i = 0; i < n; i++) {
      const c = list[i];
      const L = Math.min(0.12, c.force * this.forceScale);
      pos.setXYZ(i * 2, c.point.x, c.point.y, c.point.z);
      pos.setXYZ(i * 2 + 1, c.point.x + c.normal.x * L, c.point.y + c.normal.y * L, c.point.z + c.normal.z * L);
      // 力越大越偏橘紅
      const t = Math.min(1, c.force / 5);
      col.setXYZ(i * 2, 1, 0.85 - 0.5 * t, 0.2);
      col.setXYZ(i * 2 + 1, 1, 0.85 - 0.5 * t, 0.2);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    this.contacts.geometry.setDrawRange(0, n * 2);
  }
}
