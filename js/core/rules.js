import { generateTerrain, TERRAIN } from './terrain.js';
import {
  UNIT_TYPES,
  randomUnitType,
  initialHand,
  makeSkillCard,
  INITIAL_SOLDIERS,
  MAX_SQUAD_SIZE,
  GENERAL_UPGRADE_BONUS,
  ELITE_CHANCE,
  generalTroopCountFor,
} from './units.js';
import { createSquad, canSplit, canMerge } from './squad.js';
import {
  computeReachable,
  computeMeleeTargets,
  computeArcherTargets,
  squadAt,
  isAdjacent,
  inBounds,
} from './board.js';
import { calcCombat } from './combat.js';
import { findCharacterCard, RARITY_RANK_BONUS, characterCollectionBonus } from './characters.js';

export function other(playerId) {
  return playerId === 'A' ? 'B' : 'A';
}

// 武将カードのレアリティ(☆の数)と、ガチャで集めた枚数(10枚ごとに+1、上限なし)を
// 合わせてランクボーナスとして乗せる
function applyCharacterEnhance(squad, characterId, profile) {
  const rarity = findCharacterCard(characterId)?.rarity || 1;
  const count = profile?.characterCardCounts?.[characterId] || 0;
  squad.stats.rank += (RARITY_RANK_BONUS[rarity] || 0) + characterCollectionBonus(count);
}

export function generateSquadTemplates(mode, ownerId, profile = null, generalCharacterId = null, viceGeneralCharacterIds = []) {
  const totalTroops = (mode.squadCount + (mode.viceGeneralCount || 0)) * INITIAL_SOLDIERS;
  const commandCount = generalTroopCountFor(totalTroops);
  const generalChar = generalCharacterId ? findCharacterCard(generalCharacterId) : null;
  const generalType = generalChar ? generalChar.type : randomUnitType();
  const general = createSquad({ ownerId, type: generalType, isGeneral: true, count: commandCount });
  if (profile?.unlockedGenerals?.includes(generalType)) {
    general.stats.rank += GENERAL_UPGRADE_BONUS;
    general.isEliteGeneral = true;
  }
  if (generalChar) applyCharacterEnhance(general, generalChar.id, profile);
  const list = [general];

  // 副将(ノーマル1体・大規模2体)を追加する。カード選択があれば選んだキャラクターの兵種で固定する
  const viceGeneralCount = mode.viceGeneralCount || 0;
  for (let i = 0; i < viceGeneralCount; i++) {
    const viceChar = viceGeneralCharacterIds[i] ? findCharacterCard(viceGeneralCharacterIds[i]) : null;
    const viceSquad = createSquad({ ownerId, type: viceChar ? viceChar.type : randomUnitType(), isViceGeneral: true, count: commandCount });
    if (viceChar) applyCharacterEnhance(viceSquad, viceChar.id, profile);
    list.push(viceSquad);
  }

  // 一般部隊はランダムな兵種を振り分けた後、兵種ごとに合算した「総数」を1つの部隊として表示する
  // (100人ずつバラバラに配置するのではなく、まとまった総数から配置していく。1マスの上限500人は
  //  配置時にplaceSquad側で適用する)
  const counts = { [UNIT_TYPES.INFANTRY]: 0, [UNIT_TYPES.ARCHER]: 0, [UNIT_TYPES.CAVALRY]: 0 };
  for (let i = 1; i < mode.squadCount; i++) {
    counts[randomUnitType()] += INITIAL_SOLDIERS;
  }
  for (const type of Object.values(UNIT_TYPES)) {
    if (counts[type] > 0) {
      list.push(createSquad({ ownerId, type, isElite: Math.random() < ELITE_CHANCE, count: counts[type] }));
    }
  }
  return list;
}

function weightedType(ratios) {
  const r = Math.random();
  let cum = 0;
  for (const type of Object.values(UNIT_TYPES)) {
    cum += ratios[type] || 0;
    if (r <= cum) return type;
  }
  return UNIT_TYPES.INFANTRY;
}

// 兵種構成比率・総兵力から出撃部隊テンプレートを組み立てる(ストーリーモード専用の汎用ユーティリティ)
export function generateNationSquadTemplates(ownerId, totalTroops, compositionRatios, generalType, profile = null, viceGeneralCount = 0) {
  const commandCount = generalTroopCountFor(totalTroops);
  const general = createSquad({ ownerId, type: generalType, isGeneral: true, count: commandCount });
  if (profile?.unlockedGenerals?.includes(generalType)) {
    general.stats.rank += GENERAL_UPGRADE_BONUS;
    general.isEliteGeneral = true;
  }
  const list = [general];

  for (let i = 0; i < viceGeneralCount; i++) {
    list.push(createSquad({ ownerId, type: weightedType(compositionRatios), isViceGeneral: true, count: commandCount }));
  }

  const reservedForCommand = commandCount * (1 + viceGeneralCount);
  const remainingSteps = Math.max(0, Math.round((totalTroops - reservedForCommand) / INITIAL_SOLDIERS));
  const counts = { [UNIT_TYPES.INFANTRY]: 0, [UNIT_TYPES.ARCHER]: 0, [UNIT_TYPES.CAVALRY]: 0 };
  for (let i = 0; i < remainingSteps; i++) {
    counts[weightedType(compositionRatios)] += INITIAL_SOLDIERS;
  }
  for (const type of Object.values(UNIT_TYPES)) {
    if (counts[type] > 0) {
      list.push(createSquad({ ownerId, type, isElite: Math.random() < ELITE_CHANCE, count: counts[type] }));
    }
  }
  return list;
}

// generalCharacterId/viceGeneralCharacterIds: 通常CPU対戦で「カードあり」を選んだ時の武将カード指定(未指定なら従来通りランダム編成)
export function createGame(mode, profile = null, generalCharacterId = null, viceGeneralCharacterIds = []) {
  const grid = generateTerrain(mode.boardSize, mode.deployDepth);
  const generalChar = generalCharacterId ? findCharacterCard(generalCharacterId) : null;
  const playerHand = initialHand(profile?.unlockedCards);
  if (generalChar) playerHand.push(makeSkillCard(generalChar.skillName, generalChar.skillDesc, generalChar.skillEffect, 'general'));
  for (const charId of viceGeneralCharacterIds) {
    const char = findCharacterCard(charId);
    if (char) playerHand.push(makeSkillCard(char.skillName, char.skillDesc, char.skillEffect, char.type));
  }
  const state = {
    mode,
    size: mode.boardSize,
    grid,
    squads: [],
    players: {
      A: { id: 'A', name: generalChar ? generalChar.name : 'あなた', hand: playerHand },
      B: { id: 'B', name: 'CPU', hand: initialHand() },
    },
    deployQueue: {
      A: generateSquadTemplates(mode, 'A', profile, generalCharacterId, viceGeneralCharacterIds),
      B: generateSquadTemplates(mode, 'B'),
    },
    phase: 'deploy',
    currentPlayer: 'A',
    turnNumber: 1,
    winner: null,
    log: [],
    lastCombat: null,
  };
  return state;
}

export function deployZoneRows(state, playerId) {
  const { size, mode } = state;
  if (playerId === 'A') {
    return [size - mode.deployDepth, size - 1];
  }
  return [0, mode.deployDepth - 1];
}

export function isDeployTile(state, playerId, x, y) {
  const [lo, hi] = deployZoneRows(state, playerId);
  if (y < lo || y > hi) return false;
  const t = state.grid[y][x].terrain;
  return t === TERRAIN.PLAIN || t === TERRAIN.ROAD;
}

export function emptyDeployTiles(state, playerId) {
  const { size } = state;
  const tiles = [];
  const [lo, hi] = deployZoneRows(state, playerId);
  for (let y = lo; y <= hi; y++) {
    for (let x = 0; x < size; x++) {
      if (isDeployTile(state, playerId, x, y) && !squadAt(state.squads, x, y)) {
        tiles.push({ x, y });
      }
    }
  }
  return tiles;
}

// amount省略時は上限(500人)まで自動で切り出す。amount指定時はその人数だけ配置する
export function placeSquad(state, playerId, templateIndex, x, y, amount = null) {
  const queue = state.deployQueue[playerId];
  const template = queue[templateIndex];
  if (!template) return false;
  if (!isDeployTile(state, playerId, x, y)) return false;
  if (squadAt(state.squads, x, y)) return false;

  const placeAmount = amount != null ? Math.round(amount) : Math.min(template.count, MAX_SQUAD_SIZE);
  if (placeAmount <= 0 || placeAmount > template.count || placeAmount > MAX_SQUAD_SIZE) return false;

  if (placeAmount < template.count) {
    const placed = createSquad({ ownerId: playerId, type: template.type, isElite: template.isElite, x, y, count: placeAmount });
    state.squads.push(placed);
    template.count -= placeAmount;
    return true;
  }

  template.x = x;
  template.y = y;
  state.squads.push(template);
  queue.splice(templateIndex, 1);
  return true;
}

export function autoDeployRemaining(state, playerId) {
  const queue = state.deployQueue[playerId];
  while (queue.length) {
    const tiles = emptyDeployTiles(state, playerId);
    if (!tiles.length) break;
    const tile = tiles[Math.floor(Math.random() * tiles.length)];
    placeSquad(state, playerId, 0, tile.x, tile.y);
  }
}

// 配置済みの部隊を配置待ちキューに戻す(配置のやり直し)
export function returnSquadToQueue(state, playerId, squadId) {
  const squad = state.squads.find((s) => s.id === squadId && s.ownerId === playerId);
  if (!squad) return false;
  state.squads = state.squads.filter((s) => s.id !== squadId);
  const queue = state.deployQueue[playerId];
  if (!squad.isGeneral && !squad.isViceGeneral) {
    const existing = queue.find((t) => t.type === squad.type && !t.isGeneral && !t.isViceGeneral);
    if (existing) {
      existing.count += squad.count;
      return true;
    }
  }
  squad.x = -1;
  squad.y = -1;
  queue.unshift(squad);
  return true;
}

export function startBattle(state, firstPlayer = null) {
  state.phase = 'battle';
  state.currentPlayer = firstPlayer === 'A' || firstPlayer === 'B' ? firstPlayer : (Math.random() < 0.5 ? 'A' : 'B');
  state.log.push(`戦闘開始! ${state.players[state.currentPlayer].name}が先攻。`);
}

// --- 視認性(隠蔽)判定 ---
export function isConcealedFrom(state, squad, viewerId) {
  if (squad.ownerId === viewerId) return false;
  return state.grid[squad.y][squad.x].terrain === TERRAIN.FOREST;
}

export function getReachable(state, squad) {
  return computeReachable(state.grid, state.size, state.squads, squad, squad.tempMoveBonus || 0);
}

export function getMeleeTargets(state, squad) {
  const reachable = getReachable(state, squad);
  return computeMeleeTargets(state.grid, state.size, state.squads, squad, reachable);
}

export function getArcherTargets(state, squad) {
  return computeArcherTargets(state.grid, state.size, state.squads, squad);
}

function removeSquad(state, squad) {
  squad.alive = false;
  state.squads = state.squads.filter((s) => s.id !== squad.id);
}

function checkVictoryAfterCombat(state, attacker, defender, attackerDied, defenderDied) {
  const attackerGeneralDied = attackerDied && attacker.isGeneral;
  const defenderGeneralDied = defenderDied && defender.isGeneral;
  if (attackerGeneralDied && defenderGeneralDied) {
    state.phase = 'over';
    state.winner = 'draw';
    state.log.push('両軍の大将が相討ち……引き分け!');
  } else if (defenderGeneralDied) {
    state.phase = 'over';
    state.winner = attacker.ownerId;
    state.log.push(`${state.players[attacker.ownerId].name}の勝利!敵将を討ち取った!`);
  } else if (attackerGeneralDied) {
    state.phase = 'over';
    state.winner = defender.ownerId;
    state.log.push(`${state.players[defender.ownerId].name}の勝利!(反撃で大将討死)`);
  }
}

// 鉄壁カード: 防御側の損害を30%軽減する(1回消費)
function applyIronwall(result, targetSquad) {
  if (!targetSquad.tempIronwall) return result;
  const reduced = Math.round(result.defenderCasualties * 0.7);
  return { ...result, defenderCasualties: reduced, defenderRemaining: targetSquad.count - reduced };
}

export function meleeAttack(state, squad, targetSquad, fromTile) {
  const originTerrain = state.grid[squad.y][squad.x].terrain;
  if (squad.x !== fromTile.x || squad.y !== fromTile.y) {
    squad.x = fromTile.x;
    squad.y = fromTile.y;
  }
  let result = calcCombat({
    attacker: squad,
    defender: targetSquad,
    grid: state.grid,
    size: state.size,
    squads: state.squads,
    originTerrain,
    isRanged: false,
  });
  result = applyIronwall(result, targetSquad);
  if (result.ambushUsed) squad.usedAmbush = true;
  squad.fatigue += 1;
  squad.tempSnipe = false;
  targetSquad.count = result.defenderRemaining;
  squad.count = result.attackerRemaining;
  targetSquad.tempShield = false;
  targetSquad.tempIronwall = false;

  const defenderDied = targetSquad.count <= 0;
  const attackerDied = squad.count <= 0;
  if (defenderDied) removeSquad(state, targetSquad);
  if (attackerDied) {
    removeSquad(state, squad);
  } else {
    squad.actedThisTurn = true;
    if (defenderDied) {
      squad.x = targetSquad.x;
      squad.y = targetSquad.y;
    }
  }

  state.lastCombat = { ...result, attackerName: squadLabel(squad), defenderName: squadLabel(targetSquad), attackerDied, defenderDied };
  state.log.push(
    `${squadLabel(squad)}(${state.players[squad.ownerId].name})が${squadLabel(targetSquad)}(${state.players[targetSquad.ownerId].name})に突撃!`
  );
  checkVictoryAfterCombat(state, squad, targetSquad, attackerDied, defenderDied);
  maybeAutoEndTurn(state);
  return result;
}

export function rangedAttack(state, squad, targetSquad) {
  const originTerrain = state.grid[squad.y][squad.x].terrain;
  let result = calcCombat({
    attacker: squad,
    defender: targetSquad,
    grid: state.grid,
    size: state.size,
    squads: state.squads,
    originTerrain,
    isRanged: true,
  });
  result = applyIronwall(result, targetSquad);
  squad.fatigue += 1;
  squad.tempSnipe = false;
  targetSquad.count = result.defenderRemaining;
  targetSquad.tempShield = false;
  targetSquad.tempIronwall = false;
  const defenderDied = targetSquad.count <= 0;
  if (defenderDied) removeSquad(state, targetSquad);

  if (squad.pendingRapid) {
    squad.pendingRapid = false;
  } else {
    squad.actedThisTurn = true;
  }

  state.lastCombat = { ...result, attackerName: squadLabel(squad), defenderName: squadLabel(targetSquad), attackerDied: false, defenderDied };
  state.log.push(`${squadLabel(squad)}(${state.players[squad.ownerId].name})が${squadLabel(targetSquad)}(${state.players[targetSquad.ownerId].name})を射撃!`);
  checkVictoryAfterCombat(state, squad, targetSquad, false, defenderDied);
  maybeAutoEndTurn(state);
  return result;
}

export function moveSquad(state, squad, x, y) {
  const reachable = getReachable(state, squad);
  const key = `${x},${y}`;
  if (!reachable.has(key)) return false;
  squad.x = x;
  squad.y = y;
  squad.fatigue = Math.max(0, squad.fatigue - 1);
  squad.actedThisTurn = true;
  state.log.push(`${squadLabel(squad)}(${state.players[squad.ownerId].name})が移動`);
  maybeAutoEndTurn(state);
  return true;
}

export function splitSquad(state, squad, amount, destX, destY) {
  if (!canSplit(squad, amount)) return null;
  if (!isAdjacent(squad.x, squad.y, destX, destY, squad.type === UNIT_TYPES.CAVALRY)) return null;
  if (!inBounds(state.size, destX, destY)) return null;
  if (squadAt(state.squads, destX, destY)) return null;
  const terrain = state.grid[destY][destX].terrain;
  if (terrain === TERRAIN.WATER) return null;

  const newSquad = createSquad({ ownerId: squad.ownerId, type: squad.type, isElite: squad.isElite, x: destX, y: destY, count: amount });
  newSquad.actedThisTurn = true;
  squad.count -= amount;
  squad.actedThisTurn = true;
  state.squads.push(newSquad);
  state.log.push(`${squadLabel(squad)}が分隊(${amount}人)`);
  maybeAutoEndTurn(state);
  return newSquad;
}

export function mergeSquads(state, squadA, squadB) {
  if (!canMerge(squadA, squadB)) return false;
  if (!isAdjacent(squadA.x, squadA.y, squadB.x, squadB.y, squadA.type === UNIT_TYPES.CAVALRY)) return false;
  squadA.count += squadB.count;
  removeSquad(state, squadB);
  squadA.actedThisTurn = true;
  state.log.push(`${squadLabel(squadA)}が統合(計${squadA.count}人)`);
  maybeAutoEndTurn(state);
  return true;
}

export function playableCards(state, playerId, squad) {
  const hand = state.players[playerId].hand;
  const wantType = squad.isGeneral ? 'general' : squad.type;
  return hand.filter((c) => c.unitType === wantType);
}

export function playCard(state, playerId, squad, cardUid) {
  const hand = state.players[playerId].hand;
  const idx = hand.findIndex((c) => c.uid === cardUid);
  if (idx === -1) return false;
  const card = hand[idx];
  switch (card.effect) {
    case 'shield':
      squad.tempShield = true;
      squad.actedThisTurn = true;
      break;
    case 'charge':
      squad.tempMoveBonus = 2;
      break;
    case 'rapid':
      squad.pendingRapid = true;
      break;
    case 'inspire': {
      const neighbors = [
        { x: squad.x + 1, y: squad.y },
        { x: squad.x - 1, y: squad.y },
        { x: squad.x, y: squad.y + 1 },
        { x: squad.x, y: squad.y - 1 },
      ];
      for (const n of neighbors) {
        const ally = squadAt(state.squads, n.x, n.y);
        if (ally && ally.ownerId === squad.ownerId) ally.tempInspire = true;
      }
      squad.actedThisTurn = true;
      break;
    }
    case 'ironwall':
      squad.tempIronwall = true;
      squad.actedThisTurn = true;
      break;
    case 'snipe':
      squad.tempSnipe = true;
      break;
    case 'lightning':
      squad.tempMoveBonus = 3;
      squad.ambushOverride = true;
      break;
    case 'allout':
      for (const s of state.squads) {
        if (s.ownerId === squad.ownerId && s.id !== squad.id) s.tempInspire = true;
      }
      squad.actedThisTurn = true;
      break;
    default:
      return false;
  }
  hand.splice(idx, 1);
  state.log.push(`${squadLabel(squad)}が「${card.name}」を発動!`);
  maybeAutoEndTurn(state);
  return true;
}

function squadLabel(squad) {
  if (squad.isGeneral) return squad.isEliteGeneral ? '★名将' : '★大将';
  if (squad.isViceGeneral) return '☆副将';
  if (squad.isElite) return '精鋭' + squad.stats.label;
  return squad.stats.label;
}

export function canAct(state, squad) {
  if (squad.actedThisTurn) return false;
  if (getReachable(state, squad).size > 0) return true;
  if (getMeleeTargets(state, squad).length > 0) return true;
  if (squad.type === UNIT_TYPES.ARCHER && getArcherTargets(state, squad).length > 0) return true;
  return false;
}

export function maybeAutoEndTurn(state) {
  if (state.phase !== 'battle') return;
  const mySquads = state.squads.filter((s) => s.ownerId === state.currentPlayer);
  const anyActionable = mySquads.some((s) => !s.actedThisTurn);
  if (!anyActionable) {
    endTurn(state);
  }
}

export function endTurn(state) {
  if (state.phase !== 'battle') return;
  const finishing = state.currentPlayer;
  const next = other(finishing);

  for (const s of state.squads) {
    if (s.ownerId === finishing) {
      s.tempMoveBonus = 0;
      s.pendingRapid = false;
      s.ambushOverride = false;
    }
  }
  for (const s of state.squads) {
    if (s.ownerId === next) {
      s.actedThisTurn = false;
      s.tempShield = false;
      s.tempInspire = false;
      s.tempIronwall = false;
      s.tempSnipe = false;
    }
  }
  state.currentPlayer = next;
  if (next === 'A') state.turnNumber += 1;
  state.log.push(`--- ${state.players[next].name}のターン ---`);
}

export function surrender(state, playerId) {
  state.phase = 'over';
  state.winner = other(playerId);
  state.log.push(`${state.players[playerId].name}が降伏……${state.players[state.winner].name}の勝利!`);
}
