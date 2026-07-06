// 地形の定義と盤面生成ロジック(フレームワーク非依存の純粋なJS)

export const TERRAIN = {
  PLAIN: 'plain',
  FOREST: 'forest',
  HILL: 'hill',
  MOUNTAIN: 'mountain',
  WATER: 'water',
  ROAD: 'road',
};

// 標高レベル(高低差ボーナス計算に使用)。水は通行不可なので標高は使わない。
export const ELEVATION = {
  [TERRAIN.PLAIN]: 0,
  [TERRAIN.ROAD]: 0,
  [TERRAIN.FOREST]: 0,
  [TERRAIN.HILL]: 1,
  [TERRAIN.MOUNTAIN]: 2,
  [TERRAIN.WATER]: 0,
};

// 移動コスト(合計移動力を超える先には進めない)
export const MOVE_COST = {
  [TERRAIN.PLAIN]: 1,
  [TERRAIN.ROAD]: 0.5,
  [TERRAIN.FOREST]: 1,
  [TERRAIN.HILL]: 1,
  [TERRAIN.MOUNTAIN]: 2,
  [TERRAIN.WATER]: Infinity,
};

// 防御側の地形防御ボーナス
export const TERRAIN_DEFENSE = {
  [TERRAIN.PLAIN]: 0,
  [TERRAIN.ROAD]: 0,
  [TERRAIN.FOREST]: 0,
  [TERRAIN.HILL]: 1,
  [TERRAIN.MOUNTAIN]: 2,
  [TERRAIN.WATER]: 0,
};

export function isPassable(terrain) {
  return terrain !== TERRAIN.WATER;
}

function rnd(n) {
  return Math.floor(Math.random() * n);
}

function inBounds(size, x, y) {
  return x >= 0 && y >= 0 && x < size && y < size;
}

/**
 * モードに応じて盤面地形をランダム生成する。
 * 出撃ゾーン(手前 deployDepth 行 / 奥 deployDepth 行)は必ず plain/road のみにする。
 */
export function generateTerrain(size, deployDepth) {
  const grid = [];
  for (let y = 0; y < size; y++) {
    const row = [];
    for (let x = 0; x < size; x++) row.push({ terrain: TERRAIN.PLAIN });
    grid.push(row);
  }

  const isDeployZone = (x, y) => y < deployDepth || y >= size - deployDepth;

  const setIfFree = (x, y, terrain) => {
    if (!inBounds(size, x, y)) return false;
    if (isDeployZone(x, y)) return false;
    if (grid[y][x].terrain !== TERRAIN.PLAIN) return false;
    grid[y][x].terrain = terrain;
    return true;
  };

  // --- 川 + 池 ---
  const riverCount = size < 10 ? 1 : size < 20 ? 1 : 2;
  for (let r = 0; r < riverCount; r++) {
    growRiver(grid, size, isDeployZone, setIfFree);
  }

  // --- 山脈 + 丘 ---
  const mountainClusters = Math.max(1, Math.floor(size / 10));
  for (let m = 0; m < mountainClusters; m++) {
    growMountainRange(size, isDeployZone, setIfFree);
  }

  // --- 森のまとまり ---
  const forestClusters = Math.max(1, Math.floor(size / 5));
  for (let f = 0; f < forestClusters; f++) {
    growBlob(size, isDeployZone, setIfFree, TERRAIN.FOREST, 3 + rnd(4));
  }

  // --- 道 (出撃ゾーン同士をゆるく繋ぐ) ---
  const roadCount = Math.max(1, Math.floor(size / 10));
  for (let r = 0; r < roadCount; r++) {
    drawRoad(grid, size, setIfFree);
  }

  removeIsolatedTiles(grid, size, isDeployZone);

  return grid;
}

function growRiver(grid, size, isDeployZone, setIfFree) {
  // 上下どちらかの端からジグザグに川を伸ばす
  let x = 2 + rnd(Math.max(1, size - 4));
  const path = [];
  for (let y = 0; y < size; y++) {
    path.push([x, y]);
    x += rnd(3) - 1;
    x = Math.max(1, Math.min(size - 2, x));
  }
  for (const [px, py] of path) {
    setIfFree(px, py, TERRAIN.WATER);
    // まれに池のふくらみ
    if (rnd(4) === 0) setIfFree(px + (rnd(2) ? 1 : -1), py, TERRAIN.WATER);
  }
}

function growMountainRange(size, isDeployZone, setIfFree) {
  const len = 2 + rnd(Math.max(2, Math.floor(size / 4)));
  let x = rnd(size);
  let y = rnd(size);
  const dir = rnd(2) === 0 ? [1, 0] : [0, 1];
  for (let i = 0; i < len; i++) {
    setIfFree(x, y, TERRAIN.MOUNTAIN);
    // 山の周囲に丘を配置
    const hillSpots = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
    for (const [hx, hy] of hillSpots) {
      if (rnd(2) === 0) setIfFree(hx, hy, TERRAIN.HILL);
    }
    x += dir[0] * (rnd(2) === 0 ? 1 : 0);
    y += dir[1] * (rnd(2) === 0 ? 1 : 0);
    x += rnd(3) - 1;
    y += rnd(3) - 1;
    x = Math.max(0, Math.min(size - 1, x));
    y = Math.max(0, Math.min(size - 1, y));
  }
}

function growBlob(size, isDeployZone, setIfFree, terrain, targetSize) {
  const startX = rnd(size);
  const startY = rnd(size);
  const frontier = [[startX, startY]];
  let placed = 0;
  const visited = new Set();
  while (frontier.length && placed < targetSize) {
    const idx = rnd(frontier.length);
    const [x, y] = frontier.splice(idx, 1)[0];
    const key = `${x},${y}`;
    if (visited.has(key)) continue;
    visited.add(key);
    if (setIfFree(x, y, terrain)) placed++;
    const neighbors = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
    for (const n of neighbors) frontier.push(n);
  }
}

function drawRoad(grid, size, setIfFree) {
  let x = rnd(size);
  for (let y = 0; y < size; y++) {
    setIfFree(x, y, TERRAIN.ROAD);
    x += rnd(3) - 1;
    x = Math.max(0, Math.min(size - 1, x));
  }
}

// 孤立した1マスの特殊地形(森/丘/山/水)を除去する。隣接する仲間がいなければ平地に戻す。
function removeIsolatedTiles(grid, size, isDeployZone) {
  const specials = [TERRAIN.FOREST, TERRAIN.HILL, TERRAIN.MOUNTAIN, TERRAIN.WATER];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const t = grid[y][x].terrain;
      if (!specials.includes(t)) continue;
      const neighbors = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
      const hasSame = neighbors.some(
        ([nx, ny]) => inBounds(size, nx, ny) && grid[ny][nx].terrain === t
      );
      if (!hasSame) {
        // 隣の平地を同じ地形に変えてペアを作れないか試す。ダメなら平地に戻す。
        let paired = false;
        for (const [nx, ny] of neighbors) {
          if (
            inBounds(size, nx, ny) &&
            !isDeployZone(nx, ny) &&
            grid[ny][nx].terrain === TERRAIN.PLAIN
          ) {
            grid[ny][nx].terrain = t;
            paired = true;
            break;
          }
        }
        if (!paired) grid[y][x].terrain = TERRAIN.PLAIN;
      }
    }
  }
}
