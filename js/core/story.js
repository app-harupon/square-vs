// ストーリーモード(『黎明の大地』国盗り合戦キャンペーン)の国家データ定義。
// プレイヤーは黎明の国(君主ノア)からスタートし、隣接する国を自由に攻略・同盟していく。
// 各国の世界地図上での領土マス数は totalTroops から動的に算出する(worldMap.js参照)。

import { UNIT_TYPES } from './units.js';

// プレイヤーの故国。最初の戦力構成の元になる(長槍歩兵のみの小さな軍)
export const PLAYER_NATION = {
  id: 'reimei',
  name: '黎明の国',
  monarch: 'ノア',
  color: '#7fb8ff',
  totalTroops: 500,
  composition: { [UNIT_TYPES.INFANTRY]: 1 },
  desc: 'ここから世界をひっくり返す成り上がりが始まる。',
};

// 兵種構成の割合表現(多め/少なめ等)を実際の比率に変換するための重み
const RATIO_WEIGHT = { dominant: 6, high: 3, even: 2, low: 1, minimal: 0.3, none: 0 };

function composition(infantry, cavalry, archer) {
  const weights = {
    [UNIT_TYPES.INFANTRY]: RATIO_WEIGHT[infantry],
    [UNIT_TYPES.CAVALRY]: RATIO_WEIGHT[cavalry],
    [UNIT_TYPES.ARCHER]: RATIO_WEIGHT[archer],
  };
  const sum = weights[UNIT_TYPES.INFANTRY] + weights[UNIT_TYPES.CAVALRY] + weights[UNIT_TYPES.ARCHER];
  return {
    [UNIT_TYPES.INFANTRY]: weights[UNIT_TYPES.INFANTRY] / sum,
    [UNIT_TYPES.CAVALRY]: weights[UNIT_TYPES.CAVALRY] / sum,
    [UNIT_TYPES.ARCHER]: weights[UNIT_TYPES.ARCHER] / sum,
  };
}

// aiTrait: ai.js のスコア計算に対する補正として使う、各国固有の戦術性向タグ
export const STORY_NATIONS = [
  {
    id: 'haitetsu',
    name: '廃鉄の国',
    monarch: 'ジェネス',
    color: '#8b7d6b',
    size: 'M',
    totalTroops: 3000,
    composition: composition('even', 'high', 'none'),
    desc: 'プレイヤーが最初にぶつかる強敵。罠やデバフで三すくみの相性を強引にひっくり返してくる。',
    aiTrait: 'trickery',
  },
  {
    id: 'haga',
    name: '覇牙の国',
    monarch: 'ガロウ',
    color: '#d9a441',
    size: 'XL',
    totalTroops: 30000,
    composition: composition('high', 'high', 'minimal'),
    desc: '大陸最大の超大国。圧倒的な物量とパワーで防衛陣形を強引にすり潰して突破する。',
    aiTrait: 'brute_force',
  },
  {
    id: 'shinkyu',
    name: '神弓の国',
    monarch: 'ホムラ',
    color: '#e0c589',
    size: 'L',
    totalTroops: 12000,
    composition: composition('low', 'minimal', 'high'),
    desc: '美と格式を重んじる国家。乱れのない陣形からの弓の斉射で敵の防御力を数ターン低下させる。',
    aiTrait: 'volley_debuff',
  },
  {
    id: 'kyogan',
    name: '巨岩の国',
    monarch: 'ドウザン',
    color: '#a79a8a',
    size: 'M',
    totalTroops: 20000,
    composition: composition('dominant', 'minimal', 'low'),
    desc: '重装甲と大盾で固めた歩兵の要塞。通常攻撃をほぼシャットアウトし、反撃でジワジワ削る耐久型。',
    aiTrait: 'fortress',
  },
  {
    id: 'inrou',
    name: '隠狼の国',
    monarch: 'ハヤテ',
    color: '#5b6b5b',
    size: 'L',
    totalTroops: 4000,
    composition: composition('low', 'high', 'minimal'),
    desc: '正面衝突を避け、しげみに潜んで奇襲を仕掛ける。他国が疲弊した隙を突くハイエナ戦術。',
    aiTrait: 'ambush',
  },
  {
    id: 'ryusen',
    name: '龍穿の国',
    monarch: 'レン',
    color: '#4f6fae',
    size: 'M',
    totalTroops: 6000,
    composition: composition('low', 'dominant', 'minimal'),
    desc: '孤立したユニットや手薄な防衛線を狙い澄まし、錐で穴をあけるように一撃で貫通してくる。',
    aiTrait: 'spearhead',
  },
  {
    id: 'fuin',
    name: '封印の国',
    monarch: 'シノノメ',
    color: '#5a4f6e',
    size: 'M',
    totalTroops: 8000,
    composition: composition('even', 'even', 'even'),
    desc: '底知れない知略で、あらゆる奇策と罠を繰り出す。盤面全体をチェスのようにコントロールする。',
    aiTrait: 'adaptive',
  },
  {
    id: 'rekka',
    name: '烈火の国',
    monarch: 'エマ',
    color: '#d64545',
    size: 'L',
    totalTroops: 5000,
    composition: composition('none', 'dominant', 'none'),
    desc: '防衛用の歩兵も弓兵も一切排除。1ターン目から敵の本陣だけをピンポイントで狙う超短期決戦型。',
    aiTrait: 'rush_general',
  },
  {
    id: 'soukai',
    name: '蒼海の国',
    monarch: 'ギンジ',
    color: '#3d8fae',
    size: 'S',
    totalTroops: 1500,
    composition: composition('low', 'low', 'low'),
    desc: '正面衝突の兵法を使わず、何をしてくるか読めない怪しげな戦術で手数の少なさを補う。',
    aiTrait: 'phantom',
  },
];

export function findNation(nationId) {
  if (nationId === PLAYER_NATION.id) return PLAYER_NATION;
  return STORY_NATIONS.find((n) => n.id === nationId) || null;
}
