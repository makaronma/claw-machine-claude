import type { ClawMachine } from './machine';
import type { MachineProfile } from './profile';
import { v3 } from './math';

/**
 * 鼎莉二代基礎時序（依原廠手冊參數）：
 *   AIM → DESCENT（放線，可二收）→ CLOSE（P1，停 T1）→ LIFT（P2 收線）
 *   → TOP（P3，停 T3）→ RETURN（P4，天車回出口）→ RELEASE（鬆爪）→ SETTLE → AIM
 * 遊戲不限時間／金額／次數，SETTLE 後可無限次繼續。
 */
export type FwState = 'aim' | 'descent' | 'close' | 'lift' | 'top' | 'return' | 'release' | 'settle';

export const STATE_LABEL: Record<FwState, string> = {
  aim: '瞄準（移動天車）',
  descent: '下爪（放線）',
  close: '收爪 P1',
  lift: '上升 P2',
  top: '頂部 P3',
  return: '回出口 P4',
  release: '鬆爪',
  settle: '等待穩定',
};

export interface FwInput { dirX: -1 | 0 | 1; dirZ: -1 | 0 | 1; dropPressed: boolean }

export class Firmware {
  state: FwState = 'aim';
  stateTime = 0;
  secondClawUsed = false;
  private slackFrames = 0;
  attempts = 0;
  onStateChange?: (s: FwState) => void;

  constructor(
    private m: ClawMachine,
    private prof: MachineProfile,
    private prizesSleeping: () => boolean,
    private tension: () => number,
  ) {}

  private go(s: FwState) {
    this.state = s;
    this.stateTime = 0;
    this.slackFrames = 0;
    this.onStateChange?.(s);
  }

  update(dt: number, input: FwInput) {
    const c = this.prof.controller;
    const p = this.prof.physics;
    const m = this.m;
    this.stateTime += dt;
    switch (this.state) {
      case 'aim':
        m.autoTarget = null;
        m.cmdX = input.dirX;
        m.cmdZ = input.dirZ;
        m.winchCmd = 0;
        m.solenoid.command = 0;
        if (input.dropPressed) {
          m.cmdX = 0; m.cmdZ = 0;
          this.secondClawUsed = false;
          this.attempts++;
          this.go('descent');
        }
        break;
      case 'descent': {
        m.cmdX = 0; m.cmdZ = 0; // 天車煞車，爪頭依慣性繼續擺盪
        m.winchCmd = 1;
        m.solenoid.command = 0;
        if (input.dropPressed && c.secondClawEnabled) {
          this.secondClawUsed = true;
          m.winchCmd = 0;
          this.go('close');
          break;
        }
        // 鬆線開關：爪子碰到獎品或底板，鋼索張力下降（或完全鬆弛）
        const weight = m.clawMass() * p.gravity;
        const slack = m.isSlack() || this.tension() < p.slackTensionRatio * weight;
        if (this.stateTime > 0.25 && slack) this.slackFrames++; else this.slackFrames = 0;
        const bottom = m.cableLength >= p.cableMaxLength - 1e-6;
        if (this.slackFrames >= 3 || bottom || this.stateTime >= c.descentMaxSeconds) {
          m.winchCmd = 0;
          this.go('close');
        }
        break;
      }
      case 'close':
        m.winchCmd = 0;
        m.solenoid.command = c.P1;
        if (this.stateTime >= c.T1) this.go('lift');
        break;
      case 'lift':
        m.solenoid.command = c.P2;
        m.winchCmd = -1;
        if (m.cableLength <= p.cableMinLength + 1e-6) {
          m.winchCmd = 0;
          this.go('top');
        }
        break;
      case 'top':
        m.solenoid.command = c.P3;
        if (this.stateTime >= c.T3) this.go('return');
        break;
      case 'return': {
        m.solenoid.command = c.P4;
        m.autoTarget = v3(p.homeX, p.trolleyY, p.homeZ);
        const dx = Math.abs(m.trolleyPos.x - p.homeX), dz = Math.abs(m.trolleyPos.z - p.homeZ);
        const still = Math.abs(m.trolleyVel.x) + Math.abs(m.trolleyVel.z) < 1e-3;
        if ((dx < 0.003 && dz < 0.003 && still) || this.stateTime > 8) this.go('release');
        break;
      }
      case 'release':
        m.solenoid.command = 0;
        if (this.stateTime >= c.releaseSeconds) this.go('settle');
        break;
      case 'settle':
        m.autoTarget = null;
        if ((this.stateTime > 0.5 && this.prizesSleeping()) || this.stateTime > 3) this.go('aim');
        break;
    }
  }
}
