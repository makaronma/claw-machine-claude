import type RAPIER_NS from '@dimforge/rapier3d-compat';
import { ClawMachine } from './machine';
import { Firmware, FwInput, FwState } from './firmware';
import { PropSpec, buildLayout } from './layouts';
import { PrizeInstance, resetPrizeIds } from './prizes';
import { MachineProfile, cloneProfile } from './profile';
import { V3, add, qRotate, v3 } from './math';

type R = typeof RAPIER_NS;

export interface ContactViz { point: V3; normal: V3; force: number }
export interface Telemetry {
  t: number;
  state: FwState;
  swingX: number; swingZ: number; // 爪頭相對天車的水平偏移（m）
  headY: number;
  cableLength: number;
  cableDist: number;
  tension: number; // 估計值（N）
  current: number; // A
  solenoidForce: number; // N
  plungerX: number;
  legAngle: number; // 三爪平均（rad）
  trolleyVx: number; trolleyVz: number;
}

export class Sim {
  world!: RAPIER_NS.World;
  machine!: ClawMachine;
  firmware!: Firmware;
  prizes: PrizeInstance[] = [];
  props: PropSpec[] = [];
  prof: MachineProfile;
  time = 0;
  dt: number;
  layoutId: string;
  telemetry: Telemetry[] = [];
  telemetryMax = 120 * 30;
  wonCount = 0;
  onWin?: (p: PrizeInstance) => void;
  input: FwInput = { dirX: 0, dirZ: 0, dropPressed: false };
  private pendingDrop = false;
  lastTension = 0;
  rawTension = 0;
  collectContacts = false;
  /** 測試時可關閉韌體，直接控制天車／卷線機／電磁鐵 */
  firmwareEnabled = true;
  contacts: ContactViz[] = [];

  constructor(private RAPIER: R, prof: MachineProfile, layoutId = 'standard') {
    this.prof = cloneProfile(prof);
    this.dt = 1 / this.prof.physics.hz;
    this.layoutId = layoutId;
    this.build();
  }

  build() {
    if (this.world) this.world.free();
    resetPrizeIds();
    const { RAPIER } = this;
    this.dt = 1 / this.prof.physics.hz;
    this.world = new RAPIER.World({ x: 0, y: -this.prof.physics.gravity, z: 0 });
    this.world.timestep = this.dt;
    this.world.integrationParameters.numSolverIterations = this.prof.physics.solverIterations;
    this.machine = new ClawMachine(RAPIER, this.world, this.prof);
    this.machine.applyExtraIterations(this.prof.physics.clawExtraIterations);
    const lay = buildLayout(RAPIER, this.world, this.prof, this.layoutId);
    this.prizes = lay.prizes;
    this.props = lay.props;
    this.firmware = new Firmware(this.machine, this.prof, () => this.prizesSleeping(), () => this.lastTension);
    this.time = 0;
    this.telemetry = [];
    this.wonCount = 0;
  }

  dispose() {
    this.world?.free();
    (this as { world?: unknown }).world = undefined;
  }

  setProfile(prof: MachineProfile) {
    this.prof = cloneProfile(prof);
    this.build();
  }
  setLayout(id: string) {
    this.layoutId = id;
    this.build();
  }

  /** 擺台後先讓獎品自然落定（爪子停在頂部） */
  settle(seconds = 2.5) {
    const n = Math.round(seconds / this.dt);
    for (let i = 0; i < n; i++) this.step();
    this.time = 0;
    this.telemetry = [];
  }

  pressDrop() { this.pendingDrop = true; }

  prizesSleeping(): boolean {
    for (const p of this.prizes) {
      if (p.won) continue;
      for (const part of p.parts) {
        const v = part.body.linvel();
        const w = part.body.angvel();
        if (Math.hypot(v.x, v.y, v.z) > 0.01 || Math.hypot(w.x, w.y, w.z) > 0.1) return false;
      }
    }
    return true;
  }

  step() {
    const input: FwInput = { ...this.input, dropPressed: this.pendingDrop };
    this.pendingDrop = false;
    if (this.firmwareEnabled) this.firmware.update(this.dt, input);
    this.machine.preStep(this.dt);

    this.world.step();
    this.time += this.dt;

    this.checkWins();
    this.sleepStillPrizes();
    // 鬆線開關的機械反應有時間常數，張力做一階低通（τ = 40 ms，假設值）
    const raw = this.machine.tension;
    this.rawTension = raw;
    const a = 1 - Math.exp(-this.dt / 0.04);
    this.lastTension += (raw - this.lastTension) * a;
    if (this.collectContacts) this.contacts = this.gatherContacts();
    this.recordTelemetry();
  }

  /**
   * 睡眠管理：布偶關節彈簧會讓 island 永遠微動而不睡，造成每步都在解所有獎品。
   * 平均速度（0.25 s 視窗）低於門檻 0.5 s 的獎品進入睡眠（硬盒 2 mm/s、布偶 4 mm/s）；
   * 被爪子或其他醒著的物體碰到時，Rapier 會自動喚醒。
   */
  private stillTime = new Map<number, number>();
  private lastPose = new Map<number, { x: number; y: number; z: number; qx: number; qy: number; qz: number; qw: number }>();
  /** 每步實際位移換算的速度（Rapier 的位置修正不會寫回 linvel，讀到的速度會有假值） */
  private motion(body: RAPIER_NS.RigidBody): { v: number; w: number } {
    const t = body.translation(), q = body.rotation();
    const prev = this.lastPose.get(body.handle);
    this.lastPose.set(body.handle, { x: t.x, y: t.y, z: t.z, qx: q.x, qy: q.y, qz: q.z, qw: q.w });
    if (!prev) return { v: Infinity, w: Infinity };
    const v = Math.hypot(t.x - prev.x, t.y - prev.y, t.z - prev.z) / this.dt;
    const dotq = Math.min(1, Math.abs(q.x * prev.qx + q.y * prev.qy + q.z * prev.qz + q.w * prev.qw));
    const w = (2 * Math.acos(dotq)) / this.dt;
    return { v, w };
  }
  headSpeed = Infinity;
  private windowPose = new Map<number, { x: number; y: number; z: number }>();
  private windowSteps = 0;
  private sleepStillPrizes() {
    this.headSpeed = this.motion(this.machine.head).v;
    // 以 0.25 s 視窗的平均位移判斷靜止（多段布偶在 PGS 下會原地微振，逐步速度不準）
    if (++this.windowSteps < Math.round(0.25 / this.dt)) return;
    const win = this.windowSteps * this.dt;
    this.windowSteps = 0;
    // Rapier 以「接觸 island」為單位睡眠：只讓單一獎品睡會被醒著的鄰居叫醒，
    // 所以等所有醒著的獎品都靜止後，一起進入睡眠。
    let allStill = true, anyAwake = false;
    for (const p of this.prizes) {
      if (p.parts[0].body.isSleeping()) { this.stillTime.set(p.id, 1); for (const pt of p.parts) this.windowPose.delete(pt.body.handle); continue; }
      anyAwake = true;
      let still = true;
      const vt = p.kind === 'plush' ? 0.004 : 0.002; // m/s（平均）
      for (const pt of p.parts) {
        const t = pt.body.translation();
        const prev = this.windowPose.get(pt.body.handle);
        this.windowPose.set(pt.body.handle, { x: t.x, y: t.y, z: t.z });
        if (!prev || Math.hypot(t.x - prev.x, t.y - prev.y, t.z - prev.z) / win > vt) still = false;
      }
      const t = still ? (this.stillTime.get(p.id) ?? 0) + win : 0;
      this.stillTime.set(p.id, t);
      if (t < 0.5) allStill = false;
    }
    if (anyAwake && allStill && !this.clawTouchingPrize()) {
      for (const p of this.prizes) for (const pt of p.parts) pt.body.sleep();
    }
  }
  private clawTouchingPrize(): boolean {
    const claw = new Set(this.machine.allClawBodies().map((b) => b.handle));
    let touching = false;
    for (const c of this.machine.clawColliders) {
      this.world.contactPairsWith(c, (o) => {
        const b = o.parent();
        if (!b || !b.isDynamic() || claw.has(b.handle)) return;
        this.world.narrowPhase.contactPair(c.handle, o.handle, (m) => { if (m.numContacts() > 0) touching = true; });
      });
      if (touching) return true;
    }
    return false;
  }

  private checkWins() {
    const sensor = this.machine.sensor;
    const hit = new Set<number>();
    this.world.intersectionPairsWith(sensor, (other) => {
      const b = other.parent();
      if (b) hit.add(b.handle);
    });
    if (!hit.size) return;
    for (const p of this.prizes) {
      if (p.won) continue;
      if (p.parts.some((part) => hit.has(part.body.handle))) {
        p.won = true;
        p.wonAt = this.time;
        this.wonCount++;
        this.firmware.onPrizeWon();
        this.onWin?.(p);
      }
    }
  }

  gatherContacts(): ContactViz[] {
    const out: ContactViz[] = [];
    const seen = new Set<string>();
    const cols: RAPIER_NS.Collider[] = [...this.machine.clawColliders];
    for (const p of this.prizes) for (const part of p.parts) for (let i = 0; i < part.body.numColliders(); i++) cols.push(part.body.collider(i));
    for (const col of cols) {
      this.world.contactPairsWith(col, (other) => {
        const key = col.handle < other.handle ? `${col.handle}-${other.handle}` : `${other.handle}-${col.handle}`;
        if (seen.has(key)) return;
        seen.add(key);
        this.world.narrowPhase.contactPair(col.handle, other.handle, (man, flipped) => {
          const c1 = flipped ? other : col;
          const n = man.normal();
          for (let i = 0; i < man.numContacts(); i++) {
            const J = man.contactImpulse(i);
            if (J <= 1e-6) continue;
            const lp = man.localContactPoint1(i);
            if (!lp) continue;
            const wp = add(c1.translation(), qRotate(c1.rotation(), lp));
            out.push({ point: wp, normal: n, force: J / this.dt });
          }
        });
      });
    }
    return out;
  }

  private recordTelemetry() {
    const m = this.machine;
    const h = m.head.translation();
    const angles = m.legAngles();
    const px = m.plungerX();
    this.telemetry.push({
      t: this.time,
      state: this.firmware.state,
      swingX: h.x - m.trolleyPos.x,
      swingZ: h.z - m.trolleyPos.z,
      headY: h.y,
      cableLength: m.cableLength,
      cableDist: m.cableDistance(),
      tension: this.lastTension,
      current: m.solenoid.current,
      solenoidForce: m.solenoid.force(px),
      plungerX: px,
      legAngle: (angles[0] + angles[1] + angles[2]) / 3,
      trolleyVx: m.trolleyVel.x,
      trolleyVz: m.trolleyVel.z,
    });
    // 分批裁切（攤銷 O(1)），避免每步 splice 整個陣列
    if (this.telemetry.length > this.telemetryMax + 600) this.telemetry.splice(0, this.telemetry.length - this.telemetryMax);
  }

  kineticEnergy(): number {
    let E = 0;
    const add1 = (b: RAPIER_NS.RigidBody) => {
      const v = b.linvel();
      E += 0.5 * b.mass() * (v.x * v.x + v.y * v.y + v.z * v.z);
    };
    this.machine.allClawBodies().forEach(add1);
    for (const p of this.prizes) p.parts.forEach((pt) => add1(pt.body));
    return E;
  }

  /** 畫面是否完全靜止（可跳過渲染與陰影更新） */
  isQuiet(): boolean {
    const m = this.machine;
    if (this.firmware.state !== 'aim' || m.cmdX || m.cmdZ || m.trolleyVel.x || m.trolleyVel.z || m.winchVel) return false;
    if (this.headSpeed > 5e-4) return false;
    for (const p of this.prizes) if (!p.parts[0].body.isSleeping()) return false;
    return true;
  }

  headUp(): V3 { return qRotate(this.machine.head.rotation(), v3(0, 1, 0)); }
}
