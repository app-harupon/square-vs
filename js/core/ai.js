// シンプルなスコアリング型CPU AI(相性・撃破ボーナス・自部隊壊滅回避を考慮)
import { UNIT_TYPES } from './units.js';
import { getReachable, getMeleeTargets, getArcherTargets, moveSquad, meleeAttack, rangedAttack, endTurn } from './rules.js';
import { calcCombat } from './combat.js';

function manhattan(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function nearestEnemyDist(state, squad, fromX, fromY) {
  const enemies = state.squads.filter((s) => s.ownerId !== squad.ownerId);
  if (!enemies.length) return 999;
  return Math.min(...enemies.map((e) => manhattan({ x: fromX, y: fromY }, e)));
}

function simulateCombat(state, attacker, defender, fromX, fromY, isRanged) {
  const origX = attacker.x;
  const origY = attacker.y;
  const originTerrain = state.grid[origY][origX].terrain;
  attacker.x = fromX;
  attacker.y = fromY;
  const result = calcCombat({
    attacker,
    defender,
    grid: state.grid,
    size: state.size,
    squads: state.squads,
    originTerrain,
    isRanged,
  });
  attacker.x = origX;
  attacker.y = origY;
  return result;
}

// ストーリーモード国家の固有戦術性向を、既存のスコア計算への補正として近似実装したもの
// (デコイ・不可視攻撃・第三勢力乱入などの完全に新しいギミックは未実装)
function scoreAttack(state, result, defender, trait) {
  const defenderLossFrac = result.defenderCasualties / Math.max(1, defender.count);
  let attackerLossWeight = 13;
  let score = 0;
  if (trait === 'brute_force') attackerLossWeight = 6; // 損害を厭わず物量で押し切る
  else if (trait === 'fortress') attackerLossWeight = 20; // 無理攻めせず守りを固める
  const attackerLossFrac = result.attackerCasualties / 100;
  score += defenderLossFrac * 10 - attackerLossFrac * attackerLossWeight;
  if (defender.isGeneral) score += 8;
  else if (defender.isViceGeneral) score += 4;
  if (result.defenderRemaining <= 0) score += 10;
  if (result.attackerRemaining <= 0) score -= 15;

  if (trait === 'rush_general' && defender.isGeneral) score += 100; // 相性やリスクを度外視して大将だけを狙う
  if (trait === 'spearhead') {
    const nearbyAllies = state.squads.filter(
      (s) => s.ownerId === defender.ownerId && s.alive && s.id !== defender.id && manhattan(s, defender) <= 2
    ).length;
    if (defender.count <= 100 || nearbyAllies <= 1) score += 12; // 手薄・孤立した相手を狙い澄ます
  }
  if (trait === 'trickery' || trait === 'adaptive') score += 2; // やや積極的に仕掛ける
  if (trait === 'phantom') score += (Math.random() - 0.5) * 8; // 何をしてくるか読めない不規則さ

  return score;
}

function decideAction(state, squad) {
  const trait = state.storyNation?.aiTrait;
  const candidates = [];

  const meleeTargets = squad.type !== UNIT_TYPES.ARCHER ? getMeleeTargets(state, squad) : [];
  for (const { target, from } of meleeTargets) {
    const result = simulateCombat(state, squad, target, from.x, from.y, false);
    candidates.push({ type: 'melee', target, from, score: scoreAttack(state, result, target, trait) });
  }

  if (squad.type === UNIT_TYPES.ARCHER) {
    const archerTargets = getArcherTargets(state, squad);
    for (const { target } of archerTargets) {
      const result = simulateCombat(state, squad, target, squad.x, squad.y, true);
      const volleyBonus = trait === 'volley_debuff' ? 5 : 2; // 絢爛の弓: 積極的に斉射を放つ
      candidates.push({ type: 'ranged', target, score: scoreAttack(state, result, target, trait) + volleyBonus });
    }
  }

  const reachable = getReachable(state, squad);
  const curDist = nearestEnemyDist(state, squad, squad.x, squad.y);
  let bestMove = null;
  for (const tile of reachable.values()) {
    const dist = nearestEnemyDist(state, squad, tile.x, tile.y);
    let approachWeight = 0.5;
    if (trait === 'fortress') approachWeight = 0.1; // 不動要塞: 前に出過ぎない
    else if (trait === 'rush_general' || trait === 'brute_force' || trait === 'spearhead') approachWeight = 0.9; // 一直線に距離を詰める
    let score = (curDist - dist) * approachWeight;
    const terrain = state.grid[tile.y][tile.x].terrain;
    if (terrain === 'forest') score += trait === 'ambush' ? 1.5 : 0.3; // 隠密奇襲: しげみを最優先で確保する
    if (terrain === 'hill' || terrain === 'mountain') score += trait === 'fortress' ? 0.8 : 0.2;
    if (!bestMove || score > bestMove.score) bestMove = { type: 'move', x: tile.x, y: tile.y, score };
  }
  if (bestMove) candidates.push(bestMove);

  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0];
}

function executeAction(state, squad, action, renderer) {
  const fromX = squad.x;
  const fromY = squad.y;
  if (action.type === 'melee') {
    meleeAttack(state, squad, action.target, action.from);
  } else if (action.type === 'ranged') {
    rangedAttack(state, squad, action.target);
  } else if (action.type === 'move') {
    moveSquad(state, squad, action.x, action.y);
  }
  if (renderer && (squad.x !== fromX || squad.y !== fromY)) {
    renderer.animateMove(state, squad, fromX, fromY, squad.x, squad.y);
  }
}

// 一括でCPUのターンを終わらせる(アニメーション表示なしの一括処理。テスト等で使用)
export function cpuTakeTurn(state, playerId = 'B') {
  let safety = 0;
  while (state.phase === 'battle' && state.currentPlayer === playerId && safety < 1000) {
    safety++;
    const squad = state.squads.find((s) => s.ownerId === playerId && s.alive && !s.actedThisTurn);
    if (!squad) break;
    const action = decideAction(state, squad);
    if (!action || action.score < -8) {
      squad.actedThisTurn = true;
      continue;
    }
    executeAction(state, squad, action);
  }
  if (state.phase === 'battle' && state.currentPlayer === playerId) endTurn(state);
}

// CPUの行動を1つだけ実行する(呼び出し側でアニメーションを見せるための間隔を空けながら繰り返し呼ぶ)
// 戻り値: 'acted'(行動した) | 'passed'(行動できず1体スキップした) | 'ended'(ターンが終了した)
export function cpuStepTurn(state, renderer, playerId = 'B') {
  if (state.phase !== 'battle' || state.currentPlayer !== playerId) return 'ended';
  const squad = state.squads.find((s) => s.ownerId === playerId && s.alive && !s.actedThisTurn);
  if (!squad) {
    endTurn(state);
    return 'ended';
  }
  const action = decideAction(state, squad);
  if (!action || action.score < -8) {
    squad.actedThisTurn = true;
    return 'passed';
  }
  executeAction(state, squad, action, renderer);
  return 'acted';
}
