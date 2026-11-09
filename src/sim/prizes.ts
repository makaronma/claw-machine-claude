import type RAPIER_NS from '@dimforge/rapier3d-compat';
import { GROUP_PRIZE, nextPlushGroup, resetPlushBits } from './groups';
import { Q4, V3, add, qFromYTo, qRotate, v3, sub, scale } from './math';

type R = typeof RAPIER_NS;

/**
 * 獎品：全部為程式建模的「原創」造型，比例參考台灣娃娃機常見獎品類型
 * （標準透明盒公仔、3C 彩盒、薄盒、長盒、小盲盒、圓頭布偶、長尾恐龍、長條布偶）。
 * 品牌與角色皆為自創，避免使用未授權 IP。
 * 尺寸與質量為合理假設，尚未實測。
 */

export type BoxArt = 'figure' | 'earbuds' | 'fan' | 'thin' | 'long' | 'blind' | 'snack' | 'tin' | 'bigfig' | 'can' | 'capsule' | 'pillow';
export type PlushKind = 'bear' | 'dino' | 'longcat';

export interface BoxSpec {
  kind: 'box';
  art: BoxArt;
  label: string;
  size: V3; // W, H, D
  mass: number;
  comOffset: V3;
  friction: number;
  /** 碰撞形狀：cuboid（預設）、cylinder（size.x = 直徑, size.y = 高）、ball（size.x = 直徑） */
  shape?: 'cuboid' | 'cylinder' | 'ball';
  restitution?: number;
  /** 角阻尼：Rapier 沒有滾動阻力，球形獎品用它模擬（假設值） */
  angularDamping?: number;
}

export interface PartVisual {
  role: 'torso' | 'head' | 'arm' | 'leg' | 'tail' | 'segment' | 'tag';
  shape: 'ball' | 'capsule';
  radius: number;
  halfHeight: number; // capsule
  dir: V3; // capsule 方向（部件座標）
  color: number;
  side?: number; // 左右
  /** 同一剛體上的附加碰撞形狀（例如恐龍短腿），offset 相對本部件 */
  extras?: { shape: 'ball' | 'capsule'; offset: V3; radius: number; halfHeight: number; dir: V3; color: number }[];
}

export interface PrizePart {
  body: RAPIER_NS.RigidBody;
  visual: PartVisual;
}

export interface PrizeInstance {
  id: number;
  kind: 'box' | 'plush';
  spec: BoxSpec | PlushSpec;
  label: string;
  parts: PrizePart[];
  won: boolean;
  wonAt?: number;
}

export interface PlushSpec {
  kind: 'plush';
  plush: PlushKind;
  label: string;
  scale: number;
  color: number;
  accent: number;
}

export const BOX_SPECS: Record<BoxArt, BoxSpec> = {
  figure: { kind: 'box', art: 'figure', label: '標準透明盒公仔', size: v3(0.11, 0.16, 0.09), mass: 0.23, comOffset: v3(0, -0.025, 0), friction: 0.35 },
  earbuds: { kind: 'box', art: 'earbuds', label: '藍牙耳機彩盒', size: v3(0.1, 0.13, 0.05), mass: 0.16, comOffset: v3(0, -0.01, 0.004), friction: 0.45 },
  fan: { kind: 'box', art: 'fan', label: '手持風扇彩盒', size: v3(0.085, 0.21, 0.06), mass: 0.22, comOffset: v3(0, 0.02, 0), friction: 0.45 },
  thin: { kind: 'box', art: 'thin', label: '薄型彩盒', size: v3(0.15, 0.21, 0.035), mass: 0.17, comOffset: v3(0, 0, 0), friction: 0.45 },
  long: { kind: 'box', art: 'long', label: '長型彩盒', size: v3(0.32, 0.085, 0.085), mass: 0.33, comOffset: v3(0.03, 0, 0), friction: 0.45 },
  blind: { kind: 'box', art: 'blind', label: '小盲盒', size: v3(0.07, 0.07, 0.07), mass: 0.08, comOffset: v3(0, 0, 0), friction: 0.45 },
  // 以下依實拍照片新增（research/real-world-reference.md）；尺寸質量為合理假設
  snack: { kind: 'box', art: 'snack', label: '可可脆片零食盒', size: v3(0.13, 0.19, 0.035), mass: 0.11, comOffset: v3(0, 0, 0), friction: 0.4 },
  tin: { kind: 'box', art: 'tin', label: '印花鐵盒', size: v3(0.12, 0.085, 0.09), mass: 0.28, comOffset: v3(0, -0.01, 0), friction: 0.28 },
  bigfig: { kind: 'box', art: 'bigfig', label: '大型景品公仔盒', size: v3(0.16, 0.25, 0.12), mass: 0.48, comOffset: v3(0, -0.04, 0), friction: 0.38 },
  can: { kind: 'box', art: 'can', label: '罐裝氣泡飲', size: v3(0.066, 0.123, 0.066), mass: 0.37, comOffset: v3(0, 0, 0), friction: 0.3, shape: 'cylinder' },
  capsule: { kind: 'box', art: 'capsule', label: '扭蛋殼', size: v3(0.08, 0.08, 0.08), mass: 0.05, comOffset: v3(0, -0.008, 0), friction: 0.22, shape: 'ball', restitution: 0.25, angularDamping: 2.5 },
  pillow: { kind: 'box', art: 'pillow', label: '大頭抱枕', size: v3(0.2, 0.2, 0.07), mass: 0.13, comOffset: v3(0, 0, 0), friction: 0.9, restitution: 0.02 },
};

export interface Pose { pos: V3; rot: Q4 }

let nextId = 1;
export function resetPrizeIds() { nextId = 1; resetPlushBits(); }

export function spawnBox(RAPIER: R, world: RAPIER_NS.World, spec: BoxSpec, pose: Pose): PrizeInstance {
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(pose.pos.x, pose.pos.y, pose.pos.z)
      .setRotation(pose.rot)
      .setLinearDamping(0.05)
      .setAngularDamping(spec.angularDamping ?? 0.1),
  );
  const { x: w, y: h, z: d } = spec.size;
  const m = spec.mass;
  let desc: RAPIER_NS.ColliderDesc, inertia: V3;
  if (spec.shape === 'cylinder') {
    const r = w / 2;
    inertia = v3((m * (3 * r * r + h * h)) / 12, (m * r * r) / 2, (m * (3 * r * r + h * h)) / 12);
    desc = RAPIER.ColliderDesc.cylinder(h / 2, r);
  } else if (spec.shape === 'ball') {
    const r = w / 2;
    const I = 0.5 * m * r * r; // 薄殼＋內容物，介於實心球與薄殼之間
    inertia = v3(I, I, I);
    desc = RAPIER.ColliderDesc.ball(r);
  } else {
    inertia = v3((m / 12) * (h * h + d * d), (m / 12) * (w * w + d * d), (m / 12) * (w * w + h * h));
    desc = RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2);
  }
  world.createCollider(
    desc
      .setMassProperties(m, spec.comOffset, inertia, { x: 0, y: 0, z: 0, w: 1 })
      .setFriction(spec.friction)
      .setRestitution(spec.restitution ?? 0.1)
      .setCollisionGroups(GROUP_PRIZE),
    body,
  );
  return {
    id: nextId++, kind: 'box', spec, label: spec.label, won: false,
    parts: [{ body, visual: { role: 'torso', shape: 'ball', radius: 0, halfHeight: 0, dir: v3(0, 1, 0), color: 0xffffff } }],
  };
}

// ------------------------------------------------------------------ plush
interface ExtraDef { shape: 'ball' | 'capsule'; pos: V3; radius: number; halfHeight?: number; dir?: V3; color: number; mass: number }
interface PartDef {
  extras?: ExtraDef[];
  key: string;
  role: PartVisual['role'];
  shape: 'ball' | 'capsule';
  pos: V3; // 布偶座標中的部件中心
  radius: number;
  halfHeight?: number;
  dir?: V3;
  mass: number;
  color: number;
  side?: number;
}
interface JointDef { a: string; b: string; anchor: V3; axis: V3; lim: number; k: number; c: number }

function plushDef(spec: PlushSpec): { parts: PartDef[]; joints: JointDef[] } {
  const s = spec.scale;
  const col = spec.color, acc = spec.accent;
  const P = (x: number, y: number, z: number) => v3(x * s, y * s, z * s);
  if (spec.plush === 'bear') {
    // 團團熊：坐姿、大頭、短四肢（腳朝前 -z 方向為正面）
    const parts: PartDef[] = [
      { key: 'torso', role: 'torso', shape: 'capsule', pos: P(0, 0.045, 0), radius: 0.04 * s, halfHeight: 0.012 * s, dir: v3(0, 1, 0), mass: 0.06 * s ** 3, color: col },
      { key: 'head', role: 'head', shape: 'ball', pos: P(0, 0.125, 0), radius: 0.05 * s, mass: 0.05 * s ** 3, color: col },
      { key: 'armL', role: 'arm', shape: 'capsule', pos: P(-0.048, 0.06, -0.008), radius: 0.015 * s, halfHeight: 0.014 * s, dir: v3(-0.5, -1, -0.3), mass: 0.01 * s ** 3, color: col, side: -1 },
      { key: 'armR', role: 'arm', shape: 'capsule', pos: P(0.048, 0.06, -0.008), radius: 0.015 * s, halfHeight: 0.014 * s, dir: v3(0.5, -1, -0.3), mass: 0.01 * s ** 3, color: col, side: 1 },
      { key: 'legL', role: 'leg', shape: 'capsule', pos: P(-0.024, 0.016, -0.04), radius: 0.017 * s, halfHeight: 0.016 * s, dir: v3(0, 0, -1), mass: 0.012 * s ** 3, color: acc, side: -1 },
      { key: 'legR', role: 'leg', shape: 'capsule', pos: P(0.024, 0.016, -0.04), radius: 0.017 * s, halfHeight: 0.016 * s, dir: v3(0, 0, -1), mass: 0.012 * s ** 3, color: acc, side: 1 },
    ];
    const joints: JointDef[] = [
      { a: 'torso', b: 'head', anchor: P(0, 0.083, 0), axis: v3(1, 0, 0), lim: 0.5, k: 60, c: 2 },
      { a: 'torso', b: 'armL', anchor: P(-0.038, 0.07, -0.005), axis: v3(1, 0, 0), lim: 1.0, k: 25, c: 1 },
      { a: 'torso', b: 'armR', anchor: P(0.038, 0.07, -0.005), axis: v3(1, 0, 0), lim: 1.0, k: 25, c: 1 },
      { a: 'torso', b: 'legL', anchor: P(-0.024, 0.02, -0.018), axis: v3(1, 0, 0), lim: 0.9, k: 25, c: 1 },
      { a: 'torso', b: 'legR', anchor: P(0.024, 0.02, -0.018), axis: v3(1, 0, 0), lim: 0.9, k: 25, c: 1 },
    ];
    return { parts, joints };
  }
  if (spec.plush === 'dino') {
    // 長尾小恐龍：四腳站姿，頭朝 -z，長尾巴向 +z
    const parts: PartDef[] = [
      // 短腿直接做成軀幹的複合碰撞體：四隻彈簧腿＋尾巴同時著地會過度拘束而持續抖動
      { key: 'torso', role: 'torso', shape: 'capsule', pos: P(0, 0.05, 0), radius: 0.038 * s, halfHeight: 0.03 * s, dir: v3(0, 0, 1), mass: 0.07 * s ** 3, color: col,
        extras: [-1, 1].flatMap((sx) => [-1, 1].map((sz) => ({ shape: 'capsule' as const, pos: P(0.026 * sx, 0.016, 0.03 * sz), radius: 0.014 * s, halfHeight: 0.006 * s, dir: v3(0, 1, 0), color: col, mass: 0.006 * s ** 3 }))) },
      { key: 'head', role: 'head', shape: 'ball', pos: P(0, 0.085, -0.085), radius: 0.04 * s, mass: 0.035 * s ** 3, color: col },
      { key: 'tail1', role: 'tail', shape: 'capsule', pos: P(0, 0.045, 0.085), radius: 0.026 * s, halfHeight: 0.022 * s, dir: v3(0, -0.2, 1), mass: 0.014 * s ** 3, color: col },
      { key: 'tail2', role: 'tail', shape: 'capsule', pos: P(0, 0.035, 0.145), radius: 0.019 * s, halfHeight: 0.02 * s, dir: v3(0, -0.2, 1), mass: 0.008 * s ** 3, color: col },
      { key: 'tail3', role: 'tail', shape: 'capsule', pos: P(0, 0.027, 0.195), radius: 0.012 * s, halfHeight: 0.018 * s, dir: v3(0, -0.1, 1), mass: 0.004 * s ** 3, color: acc },
    ];
    const joints: JointDef[] = [
      { a: 'torso', b: 'head', anchor: P(0, 0.075, -0.055), axis: v3(1, 0, 0), lim: 0.5, k: 50, c: 2 },
      { a: 'torso', b: 'tail1', anchor: P(0, 0.05, 0.058), axis: v3(0, 1, 0), lim: 0.7, k: 30, c: 1 },
      { a: 'tail1', b: 'tail2', anchor: P(0, 0.04, 0.115), axis: v3(0, 1, 0), lim: 0.8, k: 22, c: 0.8 },
      { a: 'tail2', b: 'tail3', anchor: P(0, 0.031, 0.17), axis: v3(1, 0, 0), lim: 0.8, k: 15, c: 0.6 },
    ];
    return { parts, joints };
  }
  // 長條布偶（長條貓抱枕）：5 段身體沿 x 軸，頭在 -x 端
  const parts: PartDef[] = [];
  const joints: JointDef[] = [];
  const n = 5;
  const seg = 0.06;
  for (let i = 0; i < n; i++) {
    parts.push({ key: `s${i}`, role: 'segment', shape: 'capsule', pos: P(-0.12 + i * seg, 0.034, 0), radius: 0.034 * s, halfHeight: 0.012 * s, dir: v3(1, 0, 0), mass: 0.025 * s ** 3, color: i === n - 1 ? spec.accent : col });
    if (i > 0) joints.push({ a: `s${i - 1}`, b: `s${i}`, anchor: P(-0.12 + (i - 0.5) * seg, 0.034, 0), axis: i % 2 ? v3(0, 1, 0) : v3(0, 0, 1), lim: 0.7, k: 30, c: 1.2 });
  }
  parts.push({ key: 'head', role: 'head', shape: 'ball', pos: P(-0.185, 0.04, 0), radius: 0.04 * s, mass: 0.03 * s ** 3, color: col });
  joints.push({ a: 's0', b: 'head', anchor: P(-0.152, 0.037, 0), axis: v3(0, 0, 1), lim: 0.5, k: 40, c: 1.5 });
  return { parts, joints };
}

export function spawnPlush(RAPIER: R, world: RAPIER_NS.World, spec: PlushSpec, pose: Pose): PrizeInstance {
  const def = plushDef(spec);
  const bodies = new Map<string, { body: RAPIER_NS.RigidBody; def: PartDef }>();
  const parts: PrizePart[] = [];
  const group = nextPlushGroup();
  for (const p of def.parts) {
    const wp = add(pose.pos, qRotate(pose.rot, p.pos));
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(wp.x, wp.y, wp.z).setRotation(pose.rot)// 布料內摩擦：只加角阻尼（線性阻尼會拖慢自由落下，不物理）
      .setLinearDamping(0.2).setAngularDamping(2.0),
    );
    const dir = p.dir ?? v3(0, 1, 0);
    const desc = p.shape === 'ball'
      ? RAPIER.ColliderDesc.ball(p.radius)
      : RAPIER.ColliderDesc.capsule(p.halfHeight ?? 0.01, p.radius).setRotation(qFromYTo(dir));
    // 布料：高摩擦、低反彈（假設值）
    // 部件最小 10 g：質量比太懸殊時 PGS 關節會持續抖動
    world.createCollider(desc.setMass(Math.max(p.mass, 0.01)).setFriction(0.85).setRestitution(0.02).setCollisionGroups(group), body);
    for (const e of p.extras ?? []) {
      const off = sub(e.pos, p.pos);
      const ed = e.shape === 'ball' ? RAPIER.ColliderDesc.ball(e.radius) : RAPIER.ColliderDesc.capsule(e.halfHeight ?? 0.01, e.radius).setRotation(qFromYTo(e.dir ?? v3(0, 1, 0)));
      world.createCollider(ed.setTranslation(off.x, off.y, off.z).setMass(Math.max(e.mass, 0.005)).setFriction(0.85).setRestitution(0.02).setCollisionGroups(group), body);
    }
    bodies.set(p.key, { body, def: p });
    parts.push({ body, visual: { role: p.role, shape: p.shape, radius: p.radius, halfHeight: p.halfHeight ?? 0, dir, color: p.color, side: p.side,
      extras: p.extras?.map((e) => ({ shape: e.shape, offset: sub(e.pos, p.pos), radius: e.radius, halfHeight: e.halfHeight ?? 0, dir: e.dir ?? v3(0, 1, 0), color: e.color })) } });
  }
  // 布偶關節：impulse revolute。注意 Rapier JS 0.14 的 JointData.intoRaw() 會忽略
  // revolute 的 limits，必須在建立後呼叫 setLimits()，否則頭／四肢會轉到塌陷。
  for (const j of def.joints) {
    const A = bodies.get(j.a)!, B = bodies.get(j.b)!;
    const a1 = sub(j.anchor, A.def.pos);
    const a2 = sub(j.anchor, B.def.pos);
    const joint = world.createImpulseJoint(RAPIER.JointData.revolute(a1, a2, j.axis), A.body, B.body, true) as RAPIER_NS.RevoluteImpulseJoint;
    joint.setContactsEnabled(false);
    joint.setLimits(-j.lim, j.lim);
    // 布偶彈性：關節馬達當作回復彈簧（填充物回彈的簡化，假設值）
    joint.configureMotorPosition(0, j.k, j.c);
  }
  return { id: nextId++, kind: 'plush', spec, label: spec.label, parts, won: false };
}

export function prizeCenter(p: PrizeInstance): V3 {
  let m = 0;
  let c = v3();
  for (const part of p.parts) {
    const bm = part.body.mass();
    c = add(c, scale(part.body.translation(), bm));
    m += bm;
  }
  return scale(c, 1 / Math.max(m, 1e-9));
}
export function prizeMass(p: PrizeInstance): number {
  return p.parts.reduce((s, part) => s + part.body.mass(), 0);
}

