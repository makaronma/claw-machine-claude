import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { Sim } from '../sim/sim';
import { ClawView, THEMES, buildCabinet } from './machineView';
import { PrizeView } from './prizeView';
import { posterTexture, tileFloorTexture } from './textures';

/** 台灣街邊夾娃娃店：明亮白光、磁磚地、密集排機；重點是機台不是裝潢 */
export function buildStore(scene: THREE.Scene, sim: Sim) {
  const floorTex = tileFloorTexture();
  floorTex.repeat.set(10, 10);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.35, metalness: 0.05 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xf4f3ef, roughness: 0.9 });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(12, 3.2), wallMat);
  back.position.set(0, 1.6, -0.9);
  scene.add(back);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = 2.9;
  scene.add(ceil);
  // 日光燈板
  for (let i = -2; i <= 2; i++) for (const z of [-0.2, 1.4]) {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    panel.rotation.x = Math.PI / 2;
    panel.position.set(i * 1.3, 2.89, z);
    scene.add(panel);
  }
  // 牆上公告
  const posters: [string, string[], string, number][] = [
    ['夾娃娃規則', ['本店機台皆保證取物', '請勿搖晃機台', '有問題請洽店長'], '#e4324c', -2.2],
    ['新品上架', ['3C 景品・公仔', '每週補貨', '歡迎拍照打卡'], '#2f7de1', 2.2],
  ];
  for (const [t, lines, color, x] of posters) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.7), new THREE.MeshStandardMaterial({ map: posterTexture(t, lines, color), roughness: 0.8 }));
    p.position.set(x, 1.7, -0.895);
    scene.add(p);
  }
  // 兩側鄰台（純裝飾，不跑物理；台灣店內密集並排）
  for (const [i, x] of [[1, -0.84], [2, 0.84], [1, -1.68], [2, 1.68]] as const) {
    const deco = buildCabinet(sim, THEMES[i], true);
    deco.position.x = x;
    scene.add(deco);
  }
}

export function setupLights(scene: THREE.Scene, renderer: THREE.WebGLRenderer, sim: Sim) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd9d6cf, 0.9));
  const dir = new THREE.DirectionalLight(0xffffff, 1.2);
  dir.position.set(1.5, 2.8, 2.2);
  scene.add(dir);
  // 機台內頂燈（投射陰影，幫助判斷爪子位置）
  const c = sim.prof.cabinet;
  const spot = new THREE.SpotLight(0xffffff, 6, 2.0, Math.PI / 3.2, 0.5, 1);
  spot.position.set(0.05, c.ceilingY - 0.02, -0.04);
  spot.target.position.set(0, c.playFloorY, -0.03);
  spot.castShadow = true;
  spot.shadow.mapSize.set(1024, 1024);
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
  constructor(public sim: Sim) {
    this.root.add(buildCabinet(sim, THEMES[0]));
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
  }
  dispose() {
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      for (const mm of mats) {
        (mm as THREE.MeshStandardMaterial).map?.dispose();
        mm.dispose();
      }
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
