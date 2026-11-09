/**
 * Machine Profile：DL-G2-BASE（鼎莉「選物販賣機二代」手冊基準機）
 *
 * 所有數值都是 SI 單位（m、kg、s、N）。
 * 每個參數的來源記在 PARAM_SOURCES：
 *   manual     = 鼎莉二代原廠手冊（外部尺寸、P1~P4、速度控制值、T1/T3、下爪時間）
 *   other-ref  = 其他台灣原廠資料（例如飛絡力洞口板尺寸），非鼎莉本機
 *   assumption = 合理假設（暫定值），尚未實測，不能當作真機數據
 */

export interface MachineProfile {
  id: string;
  cabinet: {
    width: number; depth: number; height: number; // 外部尺寸
    playFloorY: number; // 場內底板高度
    playMinX: number; playMaxX: number; playMinZ: number; playMaxZ: number; // 場內淨空
    ceilingY: number;
    holeSizeX: number; holeSizeZ: number; // 洞口（左前角）
    barrierHeight: number; barrierThickness: number; // 洞口前擋板（壓克力）
    antiSwingEnabled: boolean; antiSwingHeight: number; // 防甩片：擋板上方加高的壓克力片
    chuteBottomY: number;
  };
  controller: {
    P1: number; P2: number; P3: number; P4: number; // 爪力 0~255
    T1: number; T3: number; // 底部停留、頂部停留（秒）
    descentMaxSeconds: number;
    speedForward: number; speedBackward: number; speedLeft: number; speedRight: number;
    speedDown: number; speedUp: number; // 控制值 0~255
    releaseSeconds: number;
    secondClawEnabled: boolean;
    // 保證取物（保夾）：累計投幣達保證價後，爪力轉為全力直到出貨（金額歸零）
    guaranteeEnabled: boolean;
    guaranteePrice: number; // NT$，經濟部函釋原則上限 790
    pricePerPlay: number; // NT$／次
    guaranteePower: number; // 保夾後 P1~P4 爪力
  };
  physics: {
    gravity: number;
    hz: number;
    solverIterations: number; // 全域 PGS 迭代
    clawExtraIterations: number; // 爪子連桿所在 island 額外迭代（閉迴路需要較多迭代才不漂移）
    trolleyMaxSpeedAt255: number; // m/s，控制值 255 對應速度
    trolleyAccel: number; trolleyBrake: number; // m/s²
    trolleyY: number; // 天車吊點高度
    homeX: number; homeZ: number; // 出口上方歸位點
    railMinX: number; railMaxX: number; railMinZ: number; railMaxZ: number;
    winchMaxSpeedAt255: number; // m/s
    winchAccel: number;
    cableMinLength: number; cableMaxLength: number;
    slackThreshold: number; // 完全鬆線距離（m）
    slackTensionRatio: number; // 鬆線開關：張力 < 比例 × 爪重 即判定觸底
    cableBendK: number; cableBendC: number; // 鋼索根部彎曲剛性
    cableStiffnessHz: number; cableDampingRatio: number; // 鋼索＋避震彈簧的軟約束
    headMass: number; headRadius: number; headHeight: number;
    headLinearDamping: number; headAngularDamping: number;
    cordTorsionK: number; cordTorsionC: number; // 螺旋電線扭轉剛性
    plungerMass: number; plungerStroke: number; plungerReturnForce: number;
    legMass: number; legRadius: number; tipRadius: number;
    hingeRadius: number;
    solenoidVoltage: number; solenoidR: number; solenoidL: number;
    solenoidK: number; solenoidGap0: number; // F = K I² / (gap + gap0)²
    frictionClawSleeve: number; frictionMetal: number;
    frictionFloor: number; frictionAcrylic: number;
  };
}

export const DL_G2_BASE: MachineProfile = {
  id: 'DL-G2-BASE',
  cabinet: {
    width: 0.8, depth: 0.86, height: 1.91,
    playFloorY: 0.8,
    playMinX: -0.36, playMaxX: 0.36, playMinZ: -0.36, playMaxZ: 0.3,
    ceilingY: 1.62,
    holeSizeX: 0.25, holeSizeZ: 0.25,
    barrierHeight: 0.1, barrierThickness: 0.006,
    antiSwingEnabled: true, antiSwingHeight: 0.08,
    chuteBottomY: 0.3,
  },
  controller: {
    P1: 255, P2: 200, P3: 45, P4: 45,
    T1: 1.0, T3: 0.7,
    descentMaxSeconds: 3.5,
    speedForward: 130, speedBackward: 120, speedLeft: 170, speedRight: 170,
    speedDown: 255, speedUp: 255,
    releaseSeconds: 1.2,
    secondClawEnabled: true,
    guaranteeEnabled: true,
    guaranteePrice: 250,
    pricePerPlay: 10,
    guaranteePower: 255,
  },
  physics: {
    gravity: 9.81,
    hz: 120,
    solverIterations: 8,
    clawExtraIterations: 24,
    trolleyMaxSpeedAt255: 0.3,
    trolleyAccel: 1.2, trolleyBrake: 2.0,
    trolleyY: 1.56,
    homeX: -0.235, homeZ: 0.175,
    railMinX: -0.3, railMaxX: 0.3, railMinZ: -0.3, railMaxZ: 0.24,
    winchMaxSpeedAt255: 0.3,
    winchAccel: 2.0,
    cableMinLength: 0.06, cableMaxLength: 0.82,
    slackThreshold: 0.008,
    slackTensionRatio: 0.6,
    cableBendK: 0.05, cableBendC: 0.005,
    cableStiffnessHz: 12, cableDampingRatio: 0.7,
    headMass: 0.55, headRadius: 0.045, headHeight: 0.09,
    headLinearDamping: 0.25, headAngularDamping: 0.6,
    cordTorsionK: 0.004, cordTorsionC: 0.002,
    plungerMass: 0.15, plungerStroke: 0.022, plungerReturnForce: 1.0,
    legMass: 0.04, legRadius: 0.005, tipRadius: 0.009,
    hingeRadius: 0.038,
    solenoidVoltage: 48, solenoidR: 24, solenoidL: 0.12,
    solenoidK: 9e-3, solenoidGap0: 0.02,
    frictionClawSleeve: 0.8, frictionMetal: 0.25,
    frictionFloor: 0.5, frictionAcrylic: 0.3,
  },
};

export type ParamSource = 'manual' | 'other-ref' | 'assumption';
export const PARAM_SOURCES: Record<string, { src: ParamSource; note: string }> = {
  'cabinet.width': { src: 'manual', note: '鼎莉二代手冊 800 mm' },
  'cabinet.depth': { src: 'manual', note: '鼎莉二代手冊 860 mm' },
  'cabinet.height': { src: 'manual', note: '鼎莉二代手冊 1910 mm' },
  'cabinet.holeSizeX': { src: 'other-ref', note: '參考飛絡力標準台洞口板 298×330 mm 扣除邊框，非鼎莉實測' },
  'cabinet.holeSizeZ': { src: 'other-ref', note: '同上' },
  'cabinet.antiSwingEnabled': { src: 'assumption', note: '防甩片實際安裝位置未取得，暫定為擋板上方加高壓克力片' },
  'controller.P1': { src: 'manual', note: '原廠初始值 255' },
  'controller.P2': { src: 'manual', note: '原廠初始值 200' },
  'controller.P3': { src: 'manual', note: '原廠初始值 45' },
  'controller.P4': { src: 'manual', note: '原廠初始值 45' },
  'controller.T1': { src: 'manual', note: '底部停留 1 s' },
  'controller.T3': { src: 'manual', note: '頂部停留 0.7 s' },
  'controller.descentMaxSeconds': { src: 'manual', note: '最大下爪時間 3.5 s' },
  'controller.speedForward': { src: 'manual', note: '控制值 130' },
  'controller.speedBackward': { src: 'manual', note: '控制值 120' },
  'controller.speedLeft': { src: 'manual', note: '控制值 170' },
  'controller.speedRight': { src: 'manual', note: '控制值 170' },
  'controller.guaranteePrice': { src: 'other-ref', note: '實拍機台標示 250 元（irenebrination 2023）；經濟部 2018 函釋原則上限 790 元' },
  'controller.pricePerPlay': { src: 'other-ref', note: '台灣常見 NT$10／次' },
  'physics.solenoidVoltage': { src: 'manual', note: '接線圖標示 +48V（不代表每階段都輸出 48V）' },
};
export const sourceOf = (path: string): ParamSource => PARAM_SOURCES[path]?.src ?? 'assumption';

export function cloneProfile(p: MachineProfile): MachineProfile {
  return JSON.parse(JSON.stringify(p));
}
