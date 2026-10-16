// Thông số game. Tất cả giá trị cân bằng nằm ở đây để dễ chỉnh.
export const SIM_DT = 1 / 60; // bước mô phỏng cố định (dễ đồng bộ khi chơi mạng)
export const MAP_HALF = 40;

export const PHYS = { gravity: 24, jumpVel: 8.2, radius: 0.42, height: 1.8, eye: 1.5, stepUp: 0.45,
  proneEye: 0.45, proneHeight: 0.7 };

export const HUMAN = { hp: 100, speed: 6.2, proneMul: 0.3 };
export const ZOMBIE = {
  hp: 500, motherMul: 2, speed: 7.0,
  reviveTime: 7, reviveHp: 0.6,
  range: 1.9, damage: 34, rate: 0.6,
};

export const WEAPONS = {
  rifle: { name: 'SÚNG MÁY', mag: 30, reserve: 240, rate: 0.095, damage: 14, headMul: 2,
    spread: 0.028, aimSpread: 0.006, range: 150, reload: 1.8 },
  // súng ngắm: bắn từng phát, giữ Q để ngắm x4
  sniper: { name: 'SÚNG NGẮM', mag: 10, reserve: 30, rate: 1.1, damage: 85, headMul: 2.5, semi: true,
    spread: 0.05, aimSpread: 0.0006, range: 250, reload: 2.4, zoom: 4 },
  knife: { name: 'DAO', rate: 0.45, range: 2.0, damage: 55 },
  grenade: { name: 'LỰU ĐẠN', count: 1, fuse: 1.8, radius: 6.5, damage: 160, throwSpeed: 16 },
};

// aimError: độ lệch (mét) khi bắn mục tiêu cách 10m
export const DIFFICULTY = {
  easy:   { reaction: 0.8,  aimError: 0.75, turn: 4.5, burst: 0.35, pause: 0.6 },
  normal: { reaction: 0.45, aimError: 0.45, turn: 7,   burst: 0.5,  pause: 0.4 },
  hard:   { reaction: 0.22, aimError: 0.22, turn: 11,  burst: 0.8,  pause: 0.25 },
};

export const MODES = {
  zombie: { label: 'ZOMBIE V4', prep: 6, roundTime: 150, teamA: 'NGƯỜI', teamB: 'ĐỘT BIẾN' },
  tdm: { label: 'ĐẤU ĐỘI', roundTime: 300, killTarget: 30, respawn: 3, teamA: 'XANH', teamB: 'ĐỎ' },
};

// vùng an toàn đầu mỗi vòng: không ai bắn hay nhận sát thương, không ra khỏi vùng
export const SAFE = { time: 5 };

export const TEAM_CLOTH = { human: 0x7d8450, blue: 0x3f6fd1, red: 0xc8463c };

export const BOT_NAMES = ['RushB', 'Tèo', 'Bé Na', 'Sniper99', 'Mèo Ú', 'Đạt Pro', 'Huy Gà', 'Linh Xinh',
  'Kẹo Ngọt', 'Bão Lửa', 'Gấu Mập', 'Tí Nị', 'Ninja Lead', 'Cá Mập', 'Phở Bò', 'Rồng Đen', 'Bin Bin',
  'Sói Xám', 'Tôm Hùm'];
