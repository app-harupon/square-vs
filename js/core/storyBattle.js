// ストーリーモード(『黎明の大地』)専用のゲーム開始・戦後処理ロジック。
// core/rules.js の汎用部品を使いつつ、国家データ(story.js)と組み合わせる橋渡し役。
import { generateTerrain } from './terrain.js';
import { UNIT_TYPES, initialHand, makeSkillCard, ELITE_CHANCE, INITIAL_SOLDIERS, generalTroopCountFor, randomFormation } from './units.js';
import { generateNationSquadTemplates } from './rules.js';
import { createSquad } from './squad.js';
import { PLAYER_NATION, findPlayerCharacter, DEFENSE_BATTLE_RANK_BONUS } from './story.js';

// 両軍合わせた兵力規模に応じて盤面サイズを決める(小規模な合戦を無駄に広い盤で戦わせないため)。
// 盤面は最大15x15までとする(30x30は操作しづらいため廃止)
function boardSizeFor(combinedTroops) {
  if (combinedTroops >= 10000) return { boardSize: 15, deployDepth: 2 };
  return { boardSize: 7, deployDepth: 1 };
}

export function getPlayerTotalTroops(profile) {
  const reserve = profile?.storyReserve || {};
  const hasReserve = Object.values(reserve).some((v) => v > 0);
  if (!hasReserve) return PLAYER_NATION.totalTroops;
  return Object.values(reserve).reduce((sum, v) => sum + v, 0) + 200; // +200は将軍自身の分
}

function dominantType(ratios) {
  return Object.values(UNIT_TYPES).reduce((best, type) =>
    (ratios[type] || 0) > (ratios[best] || 0) ? type : best
  , UNIT_TYPES.INFANTRY);
}

// 合戦の規模(駐留軍の人数)に応じて副将の数を決める。大規模な合戦ほど武将の数が増える
export function viceGeneralCountFor(tileTroopCount) {
  if (tileTroopCount >= 8000) return 3;
  if (tileTroopCount >= 5000) return 2;
  if (tileTroopCount >= 2400) return 1;
  return 0;
}

// 国盗りの難易度カーブ: 最初の5戦は自軍とほぼ同数(誤差10%以内)、5戦目以降は徐々に緩めて
// 誤差30%以内に抑える(strength自体=scoreMultiplier/戦術性向/構成比は一切変更しない、兵数だけを調整する)
export function balancedTileTroopCount(naturalCount, playerTotalTroops, battlesCompleted) {
  const t = Math.min(1, (battlesCompleted || 0) / 5);
  const tolerance = 0.10 + (0.30 - 0.10) * t;
  const min = playerTotalTroops * (1 - tolerance);
  const max = playerTotalTroops * (1 + tolerance);
  return Math.round(Math.min(max, Math.max(min, naturalCount)));
}

// 首都(王城)攻略戦は、通常マスのように総兵力を全マスへ均等配分するのではなく、
// その国が存亡をかけて主力を集結させたものとして、総兵力の約8割を駐留軍とする
// (この後さらにbalancedTileTroopCountで難易度カーブのクランプをかけるので、鬼畜化はしない)
export const CAPITAL_GARRISON_SHARE = 0.8;

function generatePlayerSquadTemplates(ownerId, profile, generalCharacterId, viceGeneralCharacterIds) {
  const generalChar = findPlayerCharacter(generalCharacterId);
  const reserve = { ...(profile?.storyReserve || {}) }; // ローカルコピー(副将の頭数分を差し引く計算用。プロフィール本体は変更しない)
  const hasReserve = Object.values(reserve).some((v) => v > 0);
  if (!hasReserve) {
    return generateNationSquadTemplates(ownerId, PLAYER_NATION.totalTroops, PLAYER_NATION.composition, generalChar.type, profile);
  }
  // 予備兵力ストックから編成する(将軍は選択したキャラクターの持ち兵種で固定)
  const commandCount = generalTroopCountFor(getPlayerTotalTroops(profile));
  const general = createSquad({ ownerId, type: generalChar.type, isGeneral: true, count: commandCount });
  if (profile?.unlockedGenerals?.includes(generalChar.type)) general.isEliteGeneral = true;
  const list = [general];
  for (const charId of viceGeneralCharacterIds || []) {
    const char = findPlayerCharacter(charId);
    list.push(createSquad({ ownerId, type: char.type, isViceGeneral: true, count: commandCount }));
    reserve[char.type] = Math.max(0, (reserve[char.type] || 0) - commandCount);
  }
  for (const type of Object.values(UNIT_TYPES)) {
    if (reserve[type] > 0) list.push(createSquad({ ownerId, type, isElite: Math.random() < ELITE_CHANCE, count: reserve[type] }));
  }
  return list;
}

// 選んだ大将・副将キャラクターの固有スキルカードを手札に加える
function grantCharacterSkills(hand, generalCharacterId, viceGeneralCharacterIds) {
  const generalChar = findPlayerCharacter(generalCharacterId);
  hand.push(makeSkillCard(generalChar.skillName, generalChar.skillDesc, generalChar.skillEffect, 'general'));
  for (const charId of viceGeneralCharacterIds || []) {
    const char = findPlayerCharacter(charId);
    hand.push(makeSkillCard(char.skillName, char.skillDesc, char.skillEffect, char.type));
  }
}

// tileTroopCount: このマス(領土1つ分、およそ2000人の駐留軍)を守る敵兵力。
// 国の総兵力をそのまま使うのではなく、マス単位の駐留軍规模で1回の合戦を構成する。
// generalCharacterId/viceGeneralCharacterIds: プレイヤーが選んだ大将・副将キャラクター(未指定ならノア単独)
export function createStoryGame(nation, tileTroopCount, profile = null, landmark = null, generalCharacterId = 'noa', viceGeneralCharacterIds = [], options = {}) {
  const combinedTroops = getPlayerTotalTroops(profile) + tileTroopCount;
  const { boardSize, deployDepth } = boardSizeFor(combinedTroops);
  const grid = generateTerrain(boardSize, deployDepth);
  const generalChar = findPlayerCharacter(generalCharacterId);
  const playerHand = initialHand(profile?.unlockedCards);
  grantCharacterSkills(playerHand, generalCharacterId, viceGeneralCharacterIds);
  const enemyHand = initialHand();
  if (nation.skillName) enemyHand.push(makeSkillCard(nation.skillName, nation.skillDesc, nation.skillEffect, 'general'));
  const isDefenseBattle = !!options.isDefenseBattle;
  const playerSquads = generatePlayerSquadTemplates('A', profile, generalCharacterId, viceGeneralCharacterIds);
  if (isDefenseBattle) {
    // 拠点防衛戦: 出陣した大将・副将に守備側ボーナスを加算する(盤面・配置ゾーンの反転はしない)
    for (const squad of playerSquads) {
      if (squad.isGeneral || squad.isViceGeneral) squad.stats.rank += DEFENSE_BATTLE_RANK_BONUS;
    }
  }
  const state = {
    mode: { id: isDefenseBattle ? 'story_defense' : 'story', name: 'ストーリーモード', boardSize, deployDepth },
    size: boardSize,
    grid,
    squads: [],
    players: {
      A: { id: 'A', name: generalChar.name, hand: playerHand },
      B: { id: 'B', name: nation.monarch, hand: enemyHand },
    },
    deployQueue: {
      A: playerSquads,
      B: generateNationSquadTemplates('B', tileTroopCount, nation.composition, dominantType(nation.composition), profile, viceGeneralCountFor(tileTroopCount)),
    },
    phase: 'deploy',
    currentPlayer: 'A',
    turnNumber: 1,
    winner: null,
    log: [],
    lastCombat: null,
    isStory: true,
    isDefenseBattle,
    storyNation: nation,
    landmark, // 'castle'(王城) | 'fortress'(砦) | null。B軍(敵)の陣地に城の装飾を立てる目印
    formations: { A: options.formation || null, B: randomFormation() },
  };
  return state;
}

// 大将撃破時の降伏・敗走・吸収ルール。生存している敵兵(兵種別)を集計し、
// 領土が残っていれば50%を、最後の領土なら100%をプレイヤーの予備兵力ストックへ加算する
export function applyStoryVictory(state, profile, isLastTerritory) {
  const survivorsByType = { infantry: 0, archer: 0, cavalry: 0 };
  for (const squad of state.squads) {
    if (squad.ownerId === 'B' && squad.alive) {
      survivorsByType[squad.type] = (survivorsByType[squad.type] || 0) + squad.count;
    }
  }
  const absorbRate = isLastTerritory ? 1 : 0.5;
  const absorbed = {};
  for (const type of Object.values(UNIT_TYPES)) {
    const gained = Math.round((survivorsByType[type] || 0) * absorbRate);
    if (gained > 0) {
      profile.storyReserve[type] = (profile.storyReserve[type] || 0) + gained;
      absorbed[type] = gained;
    }
  }
  return absorbed;
}
