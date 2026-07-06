// ストーリーモード(『黎明の大地』)専用のゲーム開始・戦後処理ロジック。
// core/rules.js の汎用部品を使いつつ、国家データ(story.js)と組み合わせる橋渡し役。
import { generateTerrain } from './terrain.js';
import { UNIT_TYPES, initialHand } from './units.js';
import { generateNationSquadTemplates } from './rules.js';
import { createSquad } from './squad.js';
import { PLAYER_NATION } from './story.js';

const STORY_BOARD_SIZE = 30;
const STORY_DEPLOY_DEPTH = 3;

function dominantType(ratios) {
  return Object.values(UNIT_TYPES).reduce((best, type) =>
    (ratios[type] || 0) > (ratios[best] || 0) ? type : best
  , UNIT_TYPES.INFANTRY);
}

// 合戦の規模(駐留軍の人数)に応じて副将の数を決める。大規模な合戦ほど武将の数が増える
function viceGeneralCountFor(tileTroopCount) {
  if (tileTroopCount >= 4000) return 3;
  if (tileTroopCount >= 2500) return 2;
  if (tileTroopCount >= 1200) return 1;
  return 0;
}

function generatePlayerSquadTemplates(ownerId, profile) {
  const reserve = profile?.storyReserve || {};
  const hasReserve = Object.values(reserve).some((v) => v > 0);
  if (!hasReserve) {
    return generateNationSquadTemplates(ownerId, PLAYER_NATION.totalTroops, PLAYER_NATION.composition, UNIT_TYPES.INFANTRY, profile);
  }
  // 予備兵力ストックから編成する(将軍はノアの持ち兵種である歩兵で固定)
  const general = createSquad({ ownerId, type: UNIT_TYPES.INFANTRY, isGeneral: true });
  if (profile?.unlockedGenerals?.includes(UNIT_TYPES.INFANTRY)) general.isEliteGeneral = true;
  const list = [general];
  for (const type of Object.values(UNIT_TYPES)) {
    if (reserve[type] > 0) list.push(createSquad({ ownerId, type, count: reserve[type] }));
  }
  return list;
}

// tileTroopCount: このマス(領土1つ分、およそ2000人の駐留軍)を守る敵兵力。
// 国の総兵力をそのまま使うのではなく、マス単位の駐留軍规模で1回の合戦を構成する。
export function createStoryGame(nation, tileTroopCount, profile = null) {
  const grid = generateTerrain(STORY_BOARD_SIZE, STORY_DEPLOY_DEPTH);
  const state = {
    mode: { id: 'story', name: 'ストーリーモード', boardSize: STORY_BOARD_SIZE, deployDepth: STORY_DEPLOY_DEPTH },
    size: STORY_BOARD_SIZE,
    grid,
    squads: [],
    players: {
      A: { id: 'A', name: 'ノア', hand: initialHand(profile?.unlockedCards) },
      B: { id: 'B', name: nation.monarch, hand: initialHand() },
    },
    deployQueue: {
      A: generatePlayerSquadTemplates('A', profile),
      B: generateNationSquadTemplates('B', tileTroopCount, nation.composition, dominantType(nation.composition), profile, viceGeneralCountFor(tileTroopCount)),
    },
    phase: 'deploy',
    currentPlayer: 'A',
    turnNumber: 1,
    winner: null,
    log: [],
    lastCombat: null,
    isStory: true,
    storyNation: nation,
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
