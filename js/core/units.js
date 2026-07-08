// 兵種の定義、三すくみ相性、特殊カード定義

export const UNIT_TYPES = {
  INFANTRY: 'infantry',
  ARCHER: 'archer',
  CAVALRY: 'cavalry',
};

export const UNIT_STATS = {
  [UNIT_TYPES.INFANTRY]: { rank: 5, move: 3, range: 1, label: '歩兵', icon: '🛡️' },
  [UNIT_TYPES.ARCHER]: { rank: 6, move: 2, range: 6, label: '弓兵', icon: '🏹' },
  [UNIT_TYPES.CAVALRY]: { rank: 7, move: 4, range: 1, label: '騎兵', icon: '🐎' },
};

export const INITIAL_SOLDIERS = 100;
// 分隊後の各隊、および部隊が行動(移動・攻撃)できる最低人数
export const MIN_ACTIVE_SOLDIERS = 100;
// 1マス(1部隊)あたりの最大人数
export const MAX_SQUAD_SIZE = 500;

// 三すくみ: 歩兵 > 騎兵 > 弓兵 > 歩兵 (ランク差を埋めるため相性ボーナスは組み合わせごとに異なる)
const BEATS = {
  [UNIT_TYPES.INFANTRY]: UNIT_TYPES.CAVALRY,
  [UNIT_TYPES.CAVALRY]: UNIT_TYPES.ARCHER,
  [UNIT_TYPES.ARCHER]: UNIT_TYPES.INFANTRY,
};

// 勝つ側の兵種ごとの相性ボーナス値(歩兵→騎兵+5、騎兵→弓兵+3、弓兵→歩兵+3)
const ADVANTAGE_VALUE = {
  [UNIT_TYPES.INFANTRY]: 5,
  [UNIT_TYPES.CAVALRY]: 3,
  [UNIT_TYPES.ARCHER]: 3,
};

export function advantageBonus(attackerType, defenderType) {
  // 戻り値: { attackerBonus, defenderBonus }
  if (BEATS[attackerType] === defenderType) return { attackerBonus: ADVANTAGE_VALUE[attackerType], defenderBonus: 0 };
  if (BEATS[defenderType] === attackerType) return { attackerBonus: 0, defenderBonus: ADVANTAGE_VALUE[defenderType] };
  return { attackerBonus: 0, defenderBonus: 0 };
}

export function randomUnitType() {
  const types = Object.values(UNIT_TYPES);
  return types[Math.floor(Math.random() * types.length)];
}

// 大将の精鋭ボーナス(基本ランク+2)
export const GENERAL_RANK_BONUS = 2;
// 戦闘中の大将参加ボーナス
export const GENERAL_COMBAT_BONUS = 3;

// 副将の精鋭ボーナス(大将のおよそ半分。基本ランク+1、戦闘参加ボーナス+2)
export const VICE_GENERAL_RANK_BONUS = 1;
export const VICE_GENERAL_COMBAT_BONUS = 2;

// 一般部隊が精鋭兵になる確率とそのランクボーナス(配置テンプレート生成時に1回だけ判定する)
export const ELITE_CHANCE = 0.1;
export const ELITE_RANK_BONUS = 1;

// --- 特殊カード ---
// effect: 'shield' | 'rapid' | 'charge' | 'inspire'
export const CARD_DEFS = {
  shield: {
    id: 'shield',
    unitType: UNIT_TYPES.INFANTRY,
    name: '盾構え',
    desc: 'この部隊は次に防御する戦闘だけ地形防御+2',
    effect: 'shield',
  },
  rapid: {
    id: 'rapid',
    unitType: UNIT_TYPES.ARCHER,
    name: '連射',
    desc: '反撃なしのまま同ターン中にもう一度射撃できる',
    effect: 'rapid',
  },
  charge: {
    id: 'charge',
    unitType: UNIT_TYPES.CAVALRY,
    name: '強行突破',
    desc: 'このターンだけ移動力+2',
    effect: 'charge',
  },
  inspire: {
    id: 'inspire',
    unitType: 'general',
    name: '鼓舞',
    desc: '隣接する味方全員に密集陣形ボーナス+2を追加(次の相手ターンまで)',
    effect: 'inspire',
  },
};

// --- プレミアムカード(ショップのガチャで解放。実際の課金は行わないシミュレーション) ---
export const PREMIUM_CARD_DEFS = {
  ironwall: {
    id: 'ironwall',
    unitType: UNIT_TYPES.INFANTRY,
    name: '鉄壁',
    desc: 'この部隊が次に防御する戦闘だけ、受ける損害を30%軽減する',
    effect: 'ironwall',
    premium: true,
  },
  snipe: {
    id: 'snipe',
    unitType: UNIT_TYPES.ARCHER,
    name: '狙撃',
    desc: '次の射撃だけ、相手の地形防御と密集陣形ボーナスを無視する',
    effect: 'snipe',
    premium: true,
  },
  lightning: {
    id: 'lightning',
    unitType: UNIT_TYPES.CAVALRY,
    name: '電光石火',
    desc: 'このターンだけ移動力+3。奇襲を使用済みでも発動できる',
    effect: 'lightning',
    premium: true,
  },
  allout: {
    id: 'allout',
    unitType: 'general',
    name: '総攻撃',
    desc: '味方全部隊に密集陣形ボーナス+2を付与する(次の相手ターンまで)',
    effect: 'allout',
    premium: true,
  },
};

// 名将化(武将ガチャ)で解放できる兵種。解放済みの兵種が大将になった場合、追加でランク+1される
export const GENERAL_UPGRADE_TYPES = [UNIT_TYPES.INFANTRY, UNIT_TYPES.ARCHER, UNIT_TYPES.CAVALRY];
export const GENERAL_UPGRADE_BONUS = 1;

function makeCardInstance(def) {
  return { ...def, uid: `${def.id}_${Math.random().toString(36).slice(2, 8)}` };
}

// キャラクター固有スキル用: {name, desc, effect}からその場でカードインスタンスを組み立てる
// (ストーリーモードで武将ごとに異なるスキルを手札に加える際に使う)
export function makeSkillCard(name, desc, effect, unitType) {
  return makeCardInstance({ id: `skill_${effect}`, unitType, name, desc, effect, premium: true });
}

export function initialHand(unlockedCardIds = []) {
  // 基本カードは各兵種1枚ずつ、加えてショップで解放したプレミアムカードを配布する
  const base = Object.values(CARD_DEFS).map(makeCardInstance);
  const premium = unlockedCardIds
    .map((id) => PREMIUM_CARD_DEFS[id])
    .filter(Boolean)
    .map(makeCardInstance);
  return [...base, ...premium];
}
