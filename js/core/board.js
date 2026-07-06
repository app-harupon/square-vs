import { MOVE_COST, isPassable } from './terrain.js';
import { UNIT_TYPES } from './units.js';

export function inBounds(size, x, y) {
  return x >= 0 && y >= 0 && x < size && y < size;
}

export function squadAt(squads, x, y) {
  return squads.find((s) => s.alive && s.x === x && s.y === y) || null;
}

const ORTHO = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const DIAGONAL = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

/**
 * squad が現在ターンで到達できるマスを Dijkstra で計算する。
 * 戻り値: Map<'x,y', {cost, x, y}>  (自分自身のマスは含まない)
 * ユニットのいるマスは通過も進入もできない(飛び越え不可)。
 */
export function computeReachable(grid, size, squads, squad, extraMove = 0) {
  const budget = squad.stats.move + extraMove;
  const allowDiagonal = squad.type === UNIT_TYPES.CAVALRY;
  const dist = new Map();
  const startKey = `${squad.x},${squad.y}`;
  dist.set(startKey, 0);
  const frontier = [{ x: squad.x, y: squad.y, cost: 0 }];

  while (frontier.length) {
    frontier.sort((a, b) => a.cost - b.cost);
    const cur = frontier.shift();
    const curKey = `${cur.x},${cur.y}`;
    if (dist.has(curKey) && dist.get(curKey) < cur.cost) continue;

    const steps = allowDiagonal ? [...ORTHO, ...DIAGONAL] : ORTHO;
    for (const [dx, dy] of steps) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      if (!inBounds(size, nx, ny)) continue;
      const tile = grid[ny][nx];
      if (!isPassable(tile.terrain)) continue;
      if (squadAt(squads, nx, ny)) continue; // 駒がいるマスは通過・進入不可
      const isDiag = dx !== 0 && dy !== 0;
      const stepCost = MOVE_COST[tile.terrain] * (isDiag ? 2 : 1);
      const newCost = cur.cost + stepCost;
      if (newCost > budget + 1e-9) continue;
      const key = `${nx},${ny}`;
      if (!dist.has(key) || newCost < dist.get(key) - 1e-9) {
        dist.set(key, newCost);
        frontier.push({ x: nx, y: ny, cost: newCost });
      }
    }
  }
  dist.delete(startKey);
  const result = new Map();
  for (const [key, cost] of dist) {
    const [x, y] = key.split(',').map(Number);
    result.set(key, { x, y, cost });
  }
  return result;
}

/**
 * 白兵部隊(歩兵・騎兵)の攻撃可能対象を求める。
 * 「隣接マスまで進んでから攻撃」というルールに従い、到達可能な隣接マス経由での攻撃を列挙する。
 */
export function computeMeleeTargets(grid, size, squads, squad, reachable) {
  const allowDiagonal = squad.type === UNIT_TYPES.CAVALRY;
  const steps = allowDiagonal ? [...ORTHO, ...DIAGONAL] : ORTHO;
  const candidateTiles = [{ x: squad.x, y: squad.y, cost: 0 }, ...reachable.values()];
  const targets = [];
  const seen = new Set();
  for (const tile of candidateTiles) {
    for (const [dx, dy] of steps) {
      const tx = tile.x + dx;
      const ty = tile.y + dy;
      if (!inBounds(size, tx, ty)) continue;
      const target = squadAt(squads, tx, ty);
      if (!target || target.ownerId === squad.ownerId) continue;
      const key = `${target.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      targets.push({ target, from: { x: tile.x, y: tile.y } });
    }
  }
  return targets;
}

/**
 * 弓兵の射撃対象(縦横直線・射程5・移動不要)
 */
export function computeArcherTargets(grid, size, squads, squad) {
  const targets = [];
  const dirs = ORTHO;
  for (const [dx, dy] of dirs) {
    for (let dist = 1; dist <= squad.stats.range; dist++) {
      const tx = squad.x + dx * dist;
      const ty = squad.y + dy * dist;
      if (!inBounds(size, tx, ty)) break;
      const target = squadAt(squads, tx, ty);
      if (target) {
        if (target.ownerId !== squad.ownerId) targets.push({ target, dist });
        break; // その方向はここで打ち止め(手前の駒までしか届かない)
      }
    }
  }
  return targets;
}

export function orthogonalNeighbors(size, x, y) {
  return ORTHO.map(([dx, dy]) => ({ x: x + dx, y: y + dy })).filter((p) =>
    inBounds(size, p.x, p.y)
  );
}

export function isAdjacent(x1, y1, x2, y2, allowDiagonal = false) {
  const dx = Math.abs(x1 - x2);
  const dy = Math.abs(y1 - y2);
  if (allowDiagonal) return dx <= 1 && dy <= 1 && dx + dy > 0;
  return dx + dy === 1;
}
