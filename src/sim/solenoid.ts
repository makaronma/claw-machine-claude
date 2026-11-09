import type { MachineProfile } from './profile';

/**
 * 電磁爪線圈模型（簡化版，參數皆為合理假設）
 *
 *   L dI/dt = V_drive − R I          （忽略鐵芯移動造成的 dλ/dt 反電動勢）
 *   V_drive = V_supply × (P / 255)  （P 為機板爪力控制值，視為 PWM duty 平均）
 *   F = K I² / (gap + gap0)²         （氣隙越小、磁力越大）
 *
 * 注意：這不是「電壓與爪力線性」——爪力 ∝ I²，且隨鐵芯位置改變。
 */
export class Solenoid {
  current = 0;
  command = 0; // 0~255
  constructor(private prof: MachineProfile) {}

  step(dt: number) {
    const p = this.prof.physics;
    const v = p.solenoidVoltage * Math.max(0, Math.min(255, this.command)) / 255;
    const iInf = v / p.solenoidR;
    const tau = p.solenoidL / p.solenoidR;
    // 一階系統的精確離散解
    this.current = iInf + (this.current - iInf) * Math.exp(-dt / tau);
  }

  /** plungerX：0 = 全開（氣隙最大），stroke = 吸合 */
  force(plungerX: number): number {
    const p = this.prof.physics;
    const gap = Math.max(0, p.plungerStroke - plungerX);
    return (p.solenoidK * this.current * this.current) / ((gap + p.solenoidGap0) ** 2);
  }
}
