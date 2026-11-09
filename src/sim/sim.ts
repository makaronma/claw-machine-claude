import type RAPIER_NS from '@dimforge/rapier3d-compat';
import { ClawMachine } from './machine';
import { Firmware, FwInput, FwState } from './firmware';
import { buildLayout } from './layouts';
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
    this.prizes = buildLayout(RAPIER, this.world, this.prof, this.layoutId);
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
    // 鬆線開關的機械反應有時間常數，張力做一階低通（τ = 40 ms，假設值）
    const raw = this.machine.tension;
    this.rawTension = raw;
    const a = 1 - Math.exp(-this.dt / 0.04);
    this.lastTension += (raw - this.lastTension) * a;
    if (this.collectContacts) this.contacts = this.gatherContacts();
    this.recordTelemetry();
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
    if (this.telemetry.length > this.telemetryMax) this.telemetry.splice(0, this.telemetry.length - this.telemetryMax);
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

  headUp(): V3 { return qRotate(this.machine.head.rotation(), v3(0, 1, 0)); }
}
