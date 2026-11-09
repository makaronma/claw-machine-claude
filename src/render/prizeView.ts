import * as THREE from 'three';
import type { BoxSpec, PlushSpec, PrizeInstance, PartVisual } from '../sim/prizes';
import { qFromYTo } from '../sim/math';
import { boxFrontTexture, boxSideTexture, fabricBumpTexture } from './textures';

let bump: THREE.Texture | null = null;
const fabric = (color: number) => {
  bump ??= fabricBumpTexture();
  return new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0, bumpMap: bump, bumpScale: 0.6 });
};
const black = new THREE.MeshStandardMaterial({ color: 0x15151a, roughness: 0.3 });
const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
const blush = new THREE.MeshStandardMaterial({ color: 0xff9aae, roughness: 0.9 });

export class PrizeView {
  meshes: THREE.Object3D[] = [];
  constructor(public prize: PrizeInstance) {
    if (prize.kind === 'box') this.meshes.push(buildBox(prize.spec as BoxSpec));
    else for (const part of prize.parts) this.meshes.push(buildPlushPart(part.visual, prize.spec as PlushSpec));
  }
  update() {
    this.prize.parts.forEach((part, i) => {
      const t = part.body.translation(), q = part.body.rotation();
      this.meshes[i].position.set(t.x, t.y, t.z);
      this.meshes[i].quaternion.set(q.x, q.y, q.z, q.w);
    });
  }
}

function buildBox(spec: BoxSpec): THREE.Object3D {
  const { x: w, y: h, z: d } = spec.size;
  const g = new THREE.Group();
  if (spec.art === 'figure') {
    // 標準透明盒：透明 PET 外殼＋背卡＋底座＋公仔（原創 Q 版角色）
    const shell = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.22, depthWrite: false }),
    );
    shell.renderOrder = 3;
    g.add(shell);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(shell.geometry), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 }));
    g.add(edges);
    const card = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.98, h * 0.98), new THREE.MeshStandardMaterial({ map: boxFrontTexture('figure', w / h), roughness: 0.6 }));
    card.position.z = d / 2 - 0.002;
    card.rotation.y = Math.PI;
    g.add(card);
    const base = new THREE.Mesh(new THREE.BoxGeometry(w * 0.96, 0.012, d * 0.96), new THREE.MeshStandardMaterial({ color: 0xff6fa0, roughness: 0.5 }));
    base.position.y = -h / 2 + 0.006;
    base.castShadow = true;
    g.add(base);
    const fig = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({ color: 0xffe0c8, roughness: 0.5 });
    const dress = new THREE.MeshStandardMaterial({ color: 0x6f7dff, roughness: 0.5 });
    const hair = new THREE.MeshStandardMaterial({ color: 0x40324f, roughness: 0.4 });
    const torso = new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.06, 20), dress);
    torso.position.y = 0.03;
    fig.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.024, 24, 16), skin);
    head.position.y = 0.085;
    fig.add(head);
    const hairM = new THREE.Mesh(new THREE.SphereGeometry(0.026, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.6), hair);
    hairM.position.y = 0.088;
    fig.add(hairM);
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.004, 8, 6), black);
      eye.position.set(sx * 0.009, 0.084, -0.021);
      fig.add(eye);
    }
    fig.position.y = -h / 2 + 0.012;
    fig.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
    g.add(fig);
    return g;
  }
  const front = new THREE.MeshStandardMaterial({ map: boxFrontTexture(spec.art, w / h), roughness: 0.55 });
  const side = new THREE.MeshStandardMaterial({ map: boxSideTexture(spec.art), roughness: 0.6 });
  // BoxGeometry 材質順序：+x, -x, +y, -y, +z, -z；正面 = -z（朝玩家時依擺放而定）
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [side, side, side, side, front, front]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  g.add(mesh);
  return g;
}

function capsuleOrBall(v: PartVisual, m: THREE.Material) {
  if (v.shape === 'ball') return new THREE.Mesh(new THREE.SphereGeometry(v.radius, 28, 20), m);
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(v.radius, v.halfHeight * 2, 8, 20), m);
  const q = qFromYTo(v.dir);
  mesh.quaternion.set(q.x, q.y, q.z, q.w);
  return mesh;
}

function buildPlushPart(v: PartVisual, spec: PlushSpec): THREE.Object3D {
  const g = new THREE.Group();
  const s = spec.scale;
  const main = capsuleOrBall(v, fabric(v.color));
  main.castShadow = true;
  main.receiveShadow = true;
  g.add(main);
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, sc = 1) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x * s, y * s, z * s);
    mesh.scale.setScalar(sc);
    mesh.castShadow = true;
    g.add(mesh);
    return mesh;
  };
  if (v.role === 'head') {
    if (spec.plush === 'bear') {
      // 團團熊：圓耳、豆豆眼、口鼻區、腮紅（臉朝 -z）
      for (const sx of [-1, 1]) {
        add(new THREE.SphereGeometry(0.018 * s, 16, 12), fabric(spec.color), sx * 0.036, 0.036, 0.004);
        add(new THREE.SphereGeometry(0.01 * s, 12, 8), fabric(spec.accent), sx * 0.036, 0.036, -0.006);
        add(new THREE.SphereGeometry(0.0055 * s, 10, 8), black, sx * 0.017, 0.008, -0.046);
        add(new THREE.SphereGeometry(0.007 * s, 10, 8), blush, sx * 0.03, -0.006, -0.038).scale.set(1, 0.5, 0.4);
      }
      const muzzle = add(new THREE.SphereGeometry(0.02 * s, 16, 12), fabric(spec.accent), 0, -0.012, -0.04);
      muzzle.scale.set(1.2, 0.85, 0.7);
      add(new THREE.SphereGeometry(0.006 * s, 10, 8), black, 0, -0.006, -0.054);
    } else if (spec.plush === 'dino') {
      for (const sx of [-1, 1]) {
        add(new THREE.SphereGeometry(0.008 * s, 12, 8), white, sx * 0.018, 0.012, -0.03);
        add(new THREE.SphereGeometry(0.0045 * s, 10, 8), black, sx * 0.019, 0.012, -0.037);
      }
      const snout = add(new THREE.SphereGeometry(0.028 * s, 16, 12), fabric(spec.color), 0, -0.008, -0.03);
      snout.scale.set(1, 0.75, 1.1);
    } else {
      // 長條貓：臉朝 -x
      for (const sz of [-1, 1]) {
        const ear = add(new THREE.ConeGeometry(0.014 * s, 0.026 * s, 12), fabric(spec.color), -0.006, 0.036, sz * 0.02);
        ear.rotation.x = sz * 0.3;
        add(new THREE.SphereGeometry(0.0045 * s, 10, 8), black, -0.037, 0.008, sz * 0.014);
        add(new THREE.SphereGeometry(0.006 * s, 10, 8), blush, -0.032, -0.006, sz * 0.024).scale.set(0.4, 0.5, 1);
      }
      add(new THREE.SphereGeometry(0.004 * s, 8, 6), new THREE.MeshStandardMaterial({ color: 0xff7f95 }), -0.04, -0.002, 0);
    }
  }
  if (v.role === 'torso' && spec.plush === 'dino') {
    // 背刺
    for (let i = -1; i <= 1; i++) {
      const spike = add(new THREE.ConeGeometry(0.01 * s, 0.022 * s, 10), fabric(spec.accent), 0, 0.04, i * 0.025);
      spike.position.y = 0.038 * s;
    }
  }
  if (v.role === 'torso' && spec.plush === 'bear') {
    const belly = add(new THREE.SphereGeometry(0.028 * s, 16, 12), fabric(spec.accent), 0, 0, -0.022);
    belly.scale.set(1, 1.1, 0.5);
  }
  if (v.role === 'segment' && spec.plush === 'longcat') {
    // 條紋
    const stripe = add(new THREE.TorusGeometry(v.radius * 0.98, 0.004 * s, 8, 24), fabric(0xe8d2b0), 0, 0, 0);
    stripe.rotation.y = Math.PI / 2;
  }
  return g;
}
