import {
  UNIT_STATS,
  INITIAL_SOLDIERS,
  GENERAL_RANK_BONUS,
  VICE_GENERAL_RANK_BONUS,
  MAX_SQUAD_SIZE,
} from './units.js';

let uidCounter = 1;
function nextId() {
  return `sq${uidCounter++}`;
}

export function createSquad({ ownerId, type, isGeneral = false, isViceGeneral = false, x = -1, y = -1, count = INITIAL_SOLDIERS }) {
  const baseStats = UNIT_STATS[type];
  const rankBonus = isGeneral ? GENERAL_RANK_BONUS : isViceGeneral ? VICE_GENERAL_RANK_BONUS : 0;
  const stats = rankBonus ? { ...baseStats, rank: baseStats.rank + rankBonus } : { ...baseStats };
  return {
    id: nextId(),
    ownerId,
    type,
    baseType: type,
    isGeneral,
    isViceGeneral,
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
    a.alive &&
    b.alive &&
    a.count + b.count <= MAX_SQUAD_SIZE
  );
}
