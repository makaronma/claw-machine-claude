import type RAPIER_NS from '@dimforge/rapier3d-compat';
import type { MachineProfile } from './profile';
import { GROUP_HEAD, GROUP_INTERNAL, GROUP_LEG, GROUP_SENSOR, GROUP_STATIC } from './groups';
import { Solenoid } from './solenoid';
import { V3, add, cross, len, norm, qFromBasis, qFromYTo, qRotate, scale, sub, v3, clamp, dot } from './math';

type R = typeof RAPIER_NS;

export interface StaticPart {
  name: string;
  kind: 'floor' | 'wall' | 'glass' | 'ceiling' | 'barrier' | 'antiswing' | 'chute' | 'bin';
  center: V3;
  half: V3;
}

/** 爪腳外形（徑向平面座標 dr, dy，以鉸點為原點；開爪姿態） */
export const LEG_SHAPE = {
  segA: [v3(0, 0, 0), v3(0.065, -0.06, 0)],
  segB: [v3(0.065, -0.06, 0), v3(0.05, -0.115, 0)],
  tip: v3(0.05, -0.115, 0),
  leverTip: v3(-0.022, 0.005, 0),
};
const PLUNGER_Y0 = -0.02; // 鐵芯原點（爪頭座標）
const PIN_R = 0.01;
const PIN_DY = -0.035; // 連桿銷相對鐵芯
export const PAD_HALF = v3(0.012, 0.015, 0.006);
/** 爪套墊片相對鉸點的位置與方向 */
export function padLocalPose(phi: number, tipRadius: number) {
  const axisT = v3(Math.sin(phi), 0, -Math.cos(phi));
  const tip = radial(phi, LEG_SHAPE.tip);
  const segDir = norm(sub(radial(phi, LEG_SHAPE.segB[1]), radial(phi, LEG_SHAPE.segB[0])));
  const padZ = cross(axisT, segDir);
  const rot = qFromBasis(axisT, segDir, padZ);
  const inward = scale(v3(-Math.cos(phi), 0, -Math.sin(phi)), tipRadius * 0.4);
  const pos = add(add(tip, scale(segDir, -0.012)), inward);
  return { pos, rot };
}
export const LEG_PHI = [Math.PI / 2, Math.PI / 2 + (2 * Math.PI) / 3, Math.PI / 2 + (4 * Math.PI) / 3];

/** 把徑向平面座標 (dr, dy) 轉成 3D（相對鉸點） */
export const radial = (phi: number, p: V3): V3 => v3(p.x * Math.cos(phi), p.y, p.x * Math.sin(phi));

export class ClawMachine {
  statics: StaticPart[] = [];
  trolley!: RAPIER_NS.RigidBody;
  head!: RAPIER_NS.RigidBody;
  plunger!: RAPIER_NS.RigidBody;
  legs: RAPIER_NS.RigidBody[] = [];
  links: RAPIER_NS.RigidBody[] = [];
  legJoints: RAPIER_NS.RevoluteImpulseJoint[] = [];
  plungerJoint!: RAPIER_NS.PrismaticImpulseJoint;
  /** 鋼索張力（N），由約束衝量直接求得 */
  tension = 0;
  private prevAttach: V3 | null = null;
  clawColliders: RAPIER_NS.Collider[] = [];
  legColliders: RAPIER_NS.Collider[] = [];
  sensor!: RAPIER_NS.Collider;
  solenoid: Solenoid;

  // 天車與卷線狀態
  trolleyPos: V3;
  trolleyVel = v3();
  cableLength: number;
  winchVel = 0;
  /** 天車指令：每軸 -1/0/1（數位方向，與微動開關搖桿相同） */
  cmdX = 0;
  cmdZ = 0;
  /** 歸位模式：自動移動到 target */
  autoTarget: V3 | null = null;
  winchCmd: -1 | 0 | 1 = 0;
  limitHit = { x: false, z: false };

  constructor(private RAPIER: R, private world: RAPIER_NS.World, private prof: MachineProfile) {
    this.solenoid = new Solenoid(prof);
    const p = prof.physics;
    this.trolleyPos = v3(p.homeX, p.trolleyY, p.homeZ);
    this.cableLength = p.cableMinLength;
    this.buildCabinet();
    this.buildGantryAndClaw();
  }

  // ---------------------------------------------------------------- cabinet
  private addStatic(part: StaticPart, friction: number, restitution = 0.05) {
    const { RAPIER, world } = this;
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(part.center.x, part.center.y, part.center.z));
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(part.half.x, part.half.y, part.half.z)
        .setFriction(friction)
        .setRestitution(restitution)
        .setCollisionGroups(GROUP_STATIC),
      body,
    );
    this.statics.push(part);
  }

  private buildCabinet() {
    const c = this.prof.cabinet;
    const ph = this.prof.physics;
    const t = 0.01;
    const fy = c.playFloorY;
    const hx0 = c.playMinX, hx1 = c.playMinX + c.holeSizeX; // 洞口 x 範圍
    const hz0 = c.playMaxZ - c.holeSizeZ, hz1 = c.playMaxZ; // 洞口 z 範圍
    const box = (name: string, kind: StaticPart['kind'], x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, fr: number) =>
      this.addStatic({ name, kind, center: v3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), half: v3((x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2) }, fr);

    // 場內底板（扣掉洞口）
    box('floor-main', 'floor', hx1, c.playMaxX, fy - 0.02, fy, c.playMinZ, c.playMaxZ, ph.frictionFloor);
    box('floor-left', 'floor', c.playMinX, hx1, fy - 0.02, fy, c.playMinZ, hz0, ph.frictionFloor);
    // 牆與玻璃
    const h0 = c.chuteBottomY, h1 = c.ceilingY;
    box('wall-left', 'wall', c.playMinX - t, c.playMinX, h0, h1, c.playMinZ, c.playMaxZ, ph.frictionAcrylic);
    box('wall-right', 'wall', c.playMaxX, c.playMaxX + t, fy, h1, c.playMinZ, c.playMaxZ, ph.frictionAcrylic);
    box('wall-back', 'wall', c.playMinX, c.playMaxX, fy, h1, c.playMinZ - t, c.playMinZ, ph.frictionAcrylic);
    box('glass-front', 'glass', c.playMinX, c.playMaxX, h0, h1, c.playMaxZ, c.playMaxZ + t, ph.frictionAcrylic);
    box('ceiling', 'ceiling', c.playMinX, c.playMaxX, h1, h1 + t, c.playMinZ, c.playMaxZ, ph.frictionAcrylic);
    // 洞口擋板（壓克力，放在洞口側，底板邊緣齊平）
    const bt = c.barrierThickness;
    box('barrier-x', 'barrier', hx1 - bt, hx1, fy, fy + c.barrierHeight, hz0 - bt, hz1, ph.frictionAcrylic);
    box('barrier-z', 'barrier', hx0, hx1, fy, fy + c.barrierHeight, hz0 - bt, hz0, ph.frictionAcrylic);
    if (c.antiSwingEnabled) {
      const y0 = fy + c.barrierHeight, y1 = y0 + c.antiSwingHeight;
      box('antiswing-x', 'antiswing', hx1 - bt, hx1, y0, y1, hz0 - bt, hz1, ph.frictionAcrylic);
      box('antiswing-z', 'antiswing', hx0, hx1, y0, y1, hz0 - bt, hz0, ph.frictionAcrylic);
    }
    // 出貨通道（洞口下方）
    box('chute-x', 'chute', hx1, hx1 + t, h0, fy - 0.02, hz0, hz1, ph.frictionAcrylic);
    box('chute-z', 'chute', hx0, hx1, h0, fy - 0.02, hz0 - t, hz0, ph.frictionAcrylic);
    box('bin', 'bin', hx0, hx1, h0 - t, h0, hz0, hz1, ph.frictionFloor);

    // 出貨感應器（Sensor 只偵測交集，不施力）
    const { RAPIER, world } = this;
    const sb = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation((hx0 + hx1) / 2, (h0 + fy) / 2 - 0.05, (hz0 + hz1) / 2));
    this.sensor = world.createCollider(
      RAPIER.ColliderDesc.cuboid(c.holeSizeX / 2 - 0.01, (fy - h0) / 2 - 0.12, c.holeSizeZ / 2 - 0.01)
        .setSensor(true)
        .setCollisionGroups((globalThis as { __NOSENSOR?: boolean }).__NOSENSOR ? 0 : GROUP_SENSOR),
      sb,
    );
  }

  // ---------------------------------------------------------------- claw
  private buildGantryAndClaw() {
    const { RAPIER, world } = this;
    const p = this.prof.physics;
    this.trolley = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(this.trolleyPos.x, this.trolleyPos.y, this.trolleyPos.z),
    );
    const headTopLocal = v3(0, p.headHeight / 2, 0);
    const headPos = v3(this.trolleyPos.x, this.trolleyPos.y - this.cableLength - p.headHeight / 2, this.trolleyPos.z);

    // 爪頭本體
    this.head = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(headPos.x, headPos.y, headPos.z)
        .setLinearDamping(p.headLinearDamping)
        .setAngularDamping(p.headAngularDamping)
        .setCanSleep(false)
        ,
    );
    this.clawColliders.push(
      world.createCollider(
        RAPIER.ColliderDesc.cylinder(p.headHeight / 2, p.headRadius)
          .setMass(p.headMass)
          .setFriction(p.frictionMetal)
          .setCollisionGroups(GROUP_HEAD),
        this.head,
      ),
    );

    // 吊線：自訂單向軟約束（見 applyCable），不用 Rapier rope joint——
    // rope joint 不知道放線速度 L̇，拉緊瞬間會把爪頭速度歸零，造成非物理的彈跳。
    void headTopLocal;

    // 中央鐵芯：沿爪頭 Y 軸的滑動關節
    const plungerPos = add(headPos, v3(0, PLUNGER_Y0, 0));
    this.plunger = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(plungerPos.x, plungerPos.y, plungerPos.z).setCanSleep(false),
    );
    world.createCollider(RAPIER.ColliderDesc.ball(0.01).setMass(p.plungerMass).setCollisionGroups(GROUP_INTERNAL), this.plunger);
    const pj = RAPIER.JointData.prismatic(v3(0, PLUNGER_Y0, 0), v3(), v3(0, 1, 0));
    pj.limitsEnabled = true;
    pj.limits = [0, p.plungerStroke];
    this.plungerJoint = world.createImpulseJoint(pj, this.head, this.plunger, true) as RAPIER_NS.PrismaticImpulseJoint;
    this.plungerJoint.setContactsEnabled(false);

    // 三爪 + 連桿（閉迴路：爪頭—鉸點—爪腳槓桿—連桿—鐵芯—滑軌）
    for (const phi of LEG_PHI) {
      const pivotLocal = add(v3(p.hingeRadius * Math.cos(phi), -p.headHeight / 2, p.hingeRadius * Math.sin(phi)), v3());
      const pivotWorld = add(headPos, pivotLocal);
      const leg = world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic().setTranslation(pivotWorld.x, pivotWorld.y, pivotWorld.z).setCanSleep(false),
      );
      const seg = (a: V3, b: V3, mass: number, friction: number) => {
        const A = radial(phi, a), B = radial(phi, b);
        const mid = scale(add(A, B), 0.5);
        const d = sub(B, A);
        const q = qFromYTo(d);
        const col = world.createCollider(
          RAPIER.ColliderDesc.capsule(len(d) / 2, p.legRadius)
            .setTranslation(mid.x, mid.y, mid.z)
            .setRotation(q)
            .setMass(mass)
            .setFriction(friction)
            .setCollisionGroups(GROUP_LEG),
          leg,
        );
        this.clawColliders.push(col);
        this.legColliders.push(col);
      };
      seg(LEG_SHAPE.segA[0], LEG_SHAPE.segA[1], p.legMass * 0.4, p.frictionMetal);
      seg(LEG_SHAPE.segB[0], LEG_SHAPE.segB[1], p.legMass * 0.35, p.frictionMetal);
      // 爪套墊片：方塊面朝內，提供面接觸（含扭轉摩擦）。
      // 註：roundCuboid 在 Rapier 0.14 會觸發 WASM panic，改用一般 cuboid。
      const axisT = v3(Math.sin(phi), 0, -Math.cos(phi));
      const { pos: padPos, rot: padRot } = padLocalPose(phi, p.tipRadius);
      const tipCol = world.createCollider(
        RAPIER.ColliderDesc.cuboid(PAD_HALF.x, PAD_HALF.y, PAD_HALF.z)
          .setTranslation(padPos.x, padPos.y, padPos.z)
          .setRotation(padRot)
          .setMass(p.legMass * 0.25)
          .setFriction(p.frictionClawSleeve)
          // 橡膠爪套：摩擦取兩者較大值（Rapier 預設是平均）
          .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Max)
          .setCollisionGroups(GROUP_LEG),
        leg,
      );
      this.clawColliders.push(tipCol);
      this.legColliders.push(tipCol);

      const rj = RAPIER.JointData.revolute(pivotLocal, v3(), axisT); // 正角度 = 收爪
      const joint = world.createImpulseJoint(rj, this.head, leg, true) as RAPIER_NS.RevoluteImpulseJoint;
      joint.setContactsEnabled(false);
      // 收爪極限：爪尖在中心附近相遇。revolute 的 limits 必須建立後設定（JointData.intoRaw 會忽略）
      joint.setLimits(-0.05, 0.78);
      this.legJoints.push(joint);
      this.legs.push(leg);

      // 連桿
      const pinLocalPlunger = v3(PIN_R * Math.cos(phi), PIN_DY, PIN_R * Math.sin(phi));
      const pinWorld = add(plungerPos, pinLocalPlunger);
      const leverLocalLeg = radial(phi, LEG_SHAPE.leverTip);
      const leverWorld = add(pivotWorld, leverLocalLeg);
      const linkMid = scale(add(pinWorld, leverWorld), 0.5);
      const linkVec = sub(leverWorld, pinWorld);
      const link = world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic().setTranslation(linkMid.x, linkMid.y, linkMid.z).setRotation(qFromYTo(linkVec)).setCanSleep(false),
      );
      world.createCollider(
        RAPIER.ColliderDesc.capsule(len(linkVec) / 2, 0.002).setMass(0.008).setCollisionGroups(GROUP_INTERNAL),
        link,
      );
      const hl = len(linkVec) / 2;
      const j1 = world.createImpulseJoint(RAPIER.JointData.spherical(pinLocalPlunger, v3(0, -hl, 0)), this.plunger, link, true);
      const j2 = world.createImpulseJoint(RAPIER.JointData.spherical(v3(0, hl, 0), leverLocalLeg), link, leg, true);
      j1.setContactsEnabled(false);
      j2.setContactsEnabled(false);
      this.links.push(link);
    }
  }

  // ---------------------------------------------------------------- queries
  /** 只對爪子所在 island 加迭代，其餘（靜止的獎品）用較少迭代 */
  applyExtraIterations(n: number) {
    for (const b of this.allClawBodies()) b.setAdditionalSolverIterations(n);
  }
  allClawBodies(): RAPIER_NS.RigidBody[] {
    return [this.head, this.plunger, ...this.legs, ...this.links];
  }
  clawMass(): number {
    return this.allClawBodies().reduce((s, b) => s + b.mass(), 0);
  }
  headTopWorld(): V3 {
    const t = this.head.translation();
    return add(t, qRotate(this.head.rotation(), v3(0, this.prof.physics.headHeight / 2, 0)));
  }
  /** 吊點到爪頭頂部距離 */
  cableDistance(): number {
    return len(sub(this.headTopWorld(), this.trolleyPos));
  }
  isSlack(): boolean {
    return this.cableDistance() < this.cableLength - this.prof.physics.slackThreshold;
  }
  /** 鐵芯行程 0 = 開、stroke = 吸合 */
  plungerX(): number {
    const hp = this.head.translation();
    const pp = this.plunger.translation();
    const up = qRotate(this.head.rotation(), v3(0, 1, 0));
    return dot(sub(pp, add(hp, qRotate(this.head.rotation(), v3(0, PLUNGER_Y0, 0)))), up);
  }
  legAngles(): number[] {
    return this.legJoints.map((j) => {
      // 從爪頭座標求爪腳相對旋轉角（繞切線軸）
      return legAngleFromBodies(this.head, this.legs[this.legJoints.indexOf(j)], LEG_PHI[this.legJoints.indexOf(j)]);
    });
  }

  /** 測試用：把天車與整組爪子瞬移到 (x, z)，速度歸零 */
  teleportTrolley(x: number, z: number) {
    const dx = x - this.trolleyPos.x, dz = z - this.trolleyPos.z;
    this.trolleyPos.x = x; this.trolleyPos.z = z;
    this.trolleyVel = v3();
    this.trolley.setTranslation(this.trolleyPos, true);
    this.prevAttach = null;
    for (const b of this.allClawBodies()) {
      const t = b.translation();
      b.setTranslation({ x: t.x + dx, y: t.y, z: t.z + dz }, true);
      b.setLinvel(v3(), true);
      b.setAngvel(v3(), true);
    }
  }

  setCableLength(L: number) {
    this.cableLength = L;
  }

  /**
   * 鋼索單向約束：C = d − L ≤ 0，只能拉（T ≥ 0）。
   * 速度層：Ċ = u·v_rel − L̇（納入放線／收線速度）。
   * 使用軟約束（Catto soft constraint）模擬鋼索＋避震彈簧的有限剛性，數值上無條件穩定。
   */
  private applyCable(dt: number) {
    const p = this.prof.physics;
    const attach = this.headTopWorld();
    const hp = this.head.translation();
    const diff = sub(attach, this.trolleyPos);
    const d = len(diff);
    if (d < 1e-6) { this.tension = 0; return; }
    const u = scale(diff, 1 / d);
    // 吊點速度用「實際位移 / dt」：Rapier 的位置修正不會寫回 linvel，
    // 直接讀 linvel 會有假速度，讓鋼索在鬆弛時仍往上拉（爪子會被「吊高」）。
    void hp;
    const prev = this.prevAttach;
    this.prevAttach = { ...attach };
    const vAttach = prev ? scale(sub(attach, prev), 1 / dt) : v3();
    const vRel = sub(vAttach, this.trolleyVel);
    const g = v3(0, -p.gravity * dt, 0); // 本步重力造成的速度增量（預測）
    const Cdot = dot(u, add(vRel, g)) - this.winchVel;
    const C = d - this.cableLength;
    const m = this.clawMass();
    let lambda = 0;
    if (C + dt * Cdot > 0) {
      if (C < 0) {
        lambda = -(Cdot + C / dt) * m; // 本步剛好拉直
      } else {
        const w = 2 * Math.PI * p.cableStiffnessHz;
        const k = m * w * w, c = 2 * m * p.cableDampingRatio * w;
        const gamma = 1 / (dt * (c + dt * k));
        const beta = (dt * k) / (c + dt * k);
        lambda = -(Cdot + (beta * C) / dt) / (1 / m + gamma);
      }
    }
    lambda = Math.min(lambda, 0); // 只能拉
    this.tension = -lambda / dt;
    if (lambda < 0) this.head.applyImpulseAtPoint(scale(u, lambda), attach, true);
  }

  // ---------------------------------------------------------------- per-step drive
  /** 在 world.step() 之前呼叫 */
  preStep(dt: number) {
    const p = this.prof.physics;
    const c = this.prof.controller;
    // ---- 天車：每軸獨立加減速（實際機台為獨立前後／左右馬達）
    const vmax = (v: number) => (v / 255) * p.trolleyMaxSpeedAt255;
    let targetVx = 0, targetVz = 0;
    if (this.autoTarget) {
      const dx = this.autoTarget.x - this.trolleyPos.x;
      const dz = this.autoTarget.z - this.trolleyPos.z;
      const sx = vmax(dx < 0 ? c.speedLeft : c.speedRight);
      const sz = vmax(dz < 0 ? c.speedForward : c.speedBackward);
      // 依煞車距離提早減速，靠近時精準停在出口上方
      targetVx = Math.sign(dx) * Math.min(sx, Math.sqrt(2 * p.trolleyBrake * Math.abs(dx)));
      targetVz = Math.sign(dz) * Math.min(sz, Math.sqrt(2 * p.trolleyBrake * Math.abs(dz)));
      if (Math.abs(dx) < 0.002) targetVx = 0;
      if (Math.abs(dz) < 0.002) targetVz = 0;
    } else {
      targetVx = this.cmdX * vmax(this.cmdX < 0 ? c.speedLeft : c.speedRight);
      targetVz = this.cmdZ * vmax(this.cmdZ < 0 ? c.speedForward : c.speedBackward);
    }
    const approach = (v: number, target: number) => {
      const accel = Math.abs(target) > Math.abs(v) && Math.sign(target) === Math.sign(v || target) ? p.trolleyAccel : p.trolleyBrake;
      const dv = clamp(target - v, -accel * dt, accel * dt);
      return v + dv;
    };
    this.trolleyVel.x = approach(this.trolleyVel.x, targetVx);
    this.trolleyVel.z = approach(this.trolleyVel.z, targetVz);
    let nx = this.trolleyPos.x + this.trolleyVel.x * dt;
    let nz = this.trolleyPos.z + this.trolleyVel.z * dt;
    // 限位開關：碰到即停
    this.limitHit.x = false; this.limitHit.z = false;
    if (nx < p.railMinX || nx > p.railMaxX) { nx = clamp(nx, p.railMinX, p.railMaxX); this.trolleyVel.x = 0; this.limitHit.x = true; }
    if (nz < p.railMinZ || nz > p.railMaxZ) { nz = clamp(nz, p.railMinZ, p.railMaxZ); this.trolleyVel.z = 0; this.limitHit.z = true; }
    this.trolleyPos.x = nx; this.trolleyPos.z = nz;
    this.trolley.setNextKinematicTranslation(this.trolleyPos);

    // ---- 卷線機
    let wTarget = this.winchCmd > 0 ? (c.speedDown / 255) * p.winchMaxSpeedAt255 : this.winchCmd < 0 ? -(c.speedUp / 255) * p.winchMaxSpeedAt255 : 0;
    // 接近上限時依減速度提早減速（避免瞬間停止的非物理衝擊）
    if (wTarget < 0) wTarget = Math.max(wTarget, -Math.sqrt(2 * p.winchAccel * Math.max(0, this.cableLength - p.cableMinLength)) - 0.005);
    this.winchVel += clamp(wTarget - this.winchVel, -p.winchAccel * dt, p.winchAccel * dt);
    let L = this.cableLength + this.winchVel * dt;
    if (L <= p.cableMinLength) { L = p.cableMinLength; if (this.winchVel < 0) this.winchVel = 0; }
    if (L >= p.cableMaxLength) { L = p.cableMaxLength; if (this.winchVel > 0) this.winchVel = 0; }
    this.setCableLength(L);

    // ---- 電磁鐵：力作用於鐵芯（向上），反作用於爪頭
    this.solenoid.step(dt);
    const up = qRotate(this.head.rotation(), v3(0, 1, 0));
    const F = this.solenoid.force(this.plungerX()) - p.plungerReturnForce;
    const J = scale(up, F * dt);
    this.plunger.applyImpulse(J, true);
    this.head.applyImpulse(scale(J, -1), true);

    // ---- 鋼索根部彎曲剛性：讓爪頭軸線傾向對齊鋼索（假設值）
    const cableDir = norm(sub(this.trolleyPos, this.headTopWorld()));
    const bend = cross(up, cableDir);
    const w = this.head.angvel();
    const wPerp = sub(w, scale(up, dot(w, up)));
    const tb = sub(scale(bend, p.cableBendK), scale(wPerp, p.cableBendC));
    this.head.applyTorqueImpulse(scale(tb, dt), true);

    // ---- 螺旋電線扭轉：繞世界 Y 的回復力矩
    const xAxis = qRotate(this.head.rotation(), v3(1, 0, 0));
    const yaw = Math.atan2(-xAxis.z, xAxis.x);
    const wy = this.head.angvel().y;
    const tau = -p.cordTorsionK * yaw - p.cordTorsionC * wy;
    this.head.applyTorqueImpulse(v3(0, tau * dt, 0), true);

    // ---- 鋼索（最後計算，使用已更新的速度）
    this.applyCable(dt);
  }
}

export function legAngleFromBodies(head: RAPIER_NS.RigidBody, leg: RAPIER_NS.RigidBody, phi: number): number {
  // 爪腳 local 的「下方向」在爪頭座標中的角度
  const hq = head.rotation();
  const lq = leg.rotation();
  const inv = { x: -hq.x, y: -hq.y, z: -hq.z, w: hq.w };
  const down = qRotate(inv, qRotate(lq, v3(0, -1, 0)));
  const r = down.x * Math.cos(phi) + down.z * Math.sin(phi);
  // 開爪 θ=0 時 down=(0,-1)；收爪時 r̂ 分量變負
  return Math.atan2(-r, -down.y);
}

export const unit = norm;
