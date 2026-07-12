import {
  UNIT_STATS,
  INITIAL_SOLDIERS,
  GENERAL_RANK_BONUS,
  VICE_GENERAL_RANK_BONUS,
  ELITE_RANK_BONUS,
  MAX_SQUAD_SIZE,
} from './units.js';

let uidCounter = 1;
function nextId() {
  return `sq${uidCounter++}`;
}

export function createSquad({ ownerId, type, isGeneral = false, isViceGeneral = false, isElite = false, x = -1, y = -1, count = INITIAL_SOLDIERS, characterId = null }) {
  const baseStats = UNIT_STATS[type];
  const rankBonus = (isGeneral ? GENERAL_RANK_BONUS : isViceGeneral ? VICE_GENERAL_RANK_BONUS : 0) + (isElite ? ELITE_RANK_BONUS : 0);
  const stats = rankBonus ? { ...baseStats, rank: baseStats.rank + rankBonus } : { ...baseStats };
  return {
    id: nextId(),
    ownerId,
    type,
    baseType: type,
    isGeneral,
    isViceGeneral,
    isElite,
    stats,
    count,
    x,
    y,
    alive: true,
    actedThisTurn: false,
    fatigue: 0,
    usedAmbush: false,
    ambushOverride: false,
    tempShield: false,
    tempInspire: false,
    tempIronwall: false,
    tempSnipe: false,
    tempMoveBonus: 0,
    rapidAvailable: false,
    isEliteGeneral: false,
    characterId, // 固有パッシブ・専用スキルを持つキャラクター(ラセル/シャーレ/フィルス等)を率いているかどうか
    tempAttackMult: 1, // 鬼神の一撃など、このターンだけ攻撃力を乗算するための係数(既定は1=無効)
    tempSteadfast: false, // 堅牢の守り: 次に防御する戦闘だけ受ける損害を半減する
    tempAnyTarget: false, // 神弓の使い手: 次の射撃だけ射程・射線を無視してどこでも狙える
  };
}

export function canSplit(squad, amount) {
  return amount > 0 && amount < squad.count;
}

export function canMerge(a, b) {
  return (
    a.ownerId === b.ownerId &&
    a.type === b.type &&
    !a.isGeneral &&
    !b.isGeneral &&
    !a.isViceGeneral &&
    !b.isViceGeneral &&
    !!a.isElite === !!b.isElite &&
    a.alive &&
    b.alive &&
    a.count + b.count <= MAX_SQUAD_SIZE
  );
}
