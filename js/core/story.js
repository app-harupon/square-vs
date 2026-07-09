// ストーリーモード(『黎明の大地』国盗り合戦キャンペーン)の国家データ定義。
// プレイヤーは黎明の国(君主ノア)からスタートし、隣接する国を自由に攻略・同盟していく。
// 各国の世界地図上での領土マス数は totalTroops から動的に算出する(worldMap.js参照)。

import { UNIT_TYPES } from './units.js';

// 難易度(下からソフト・イージー・ノーマル・ハード・ヘル)。
// scoreMultiplier: 敵兵力(1マスあたりの駐留軍規模)にかかる倍率。
// worldEvent: 背景シミュレーションでの大国同士の動き方('ally_and_crush'|'infighting'|null)
export const STORY_DIFFICULTIES = [
  { id: 'soft', name: 'ソフト', scoreMultiplier: 0.5, worldEvent: 'infighting', desc: '大国同士が争い合い、その隙にどんどん攻め込める。敵兵力も控えめ。' },
  { id: 'easy', name: 'イージー', scoreMultiplier: 0.8, worldEvent: null, desc: '敵兵力は控えめ。世界情勢も比較的穏やか。' },
  { id: 'normal', name: 'ノーマル', scoreMultiplier: 1.0, worldEvent: null, desc: '標準的な難易度。' },
  { id: 'hard', name: 'ハード', scoreMultiplier: 1.3, worldEvent: null, desc: '敵兵力が強化される。油断は禁物。' },
  { id: 'hell', name: 'ヘル', scoreMultiplier: 1.7, worldEvent: 'ally_and_crush', desc: '大国同士が同盟を組み、弱小国をどんどん飲み込んでいく。敵兵力も凶悪。' },
];

export function findDifficulty(id) {
  return STORY_DIFFICULTIES.find((d) => d.id === id) || STORY_DIFFICULTIES[2];
}

// 領土の戦闘を5回終えるごとに、世界中の国の兵力が10%ずつ強化されていく
// (静かに待つより、どんどん攻め込んで戦況を動かした方が強い意味は持たせない。世界全体が変化していく演出)
const WORLD_BOOST_BATTLES_PER_STEP = 5;
const WORLD_BOOST_PER_STEP = 0.1;

export function worldBoostFactor(profile) {
  const battles = profile?.storyBattlesCompleted || 0;
  return 1 + Math.floor(battles / WORLD_BOOST_BATTLES_PER_STEP) * WORLD_BOOST_PER_STEP;
}

// 戦闘回数が今まさに5の倍数を跨いだかどうか(1戦闘終了ごとに呼び、通知を出すタイミング判定に使う)
export function justCrossedWorldBoostThreshold(battlesCompletedAfter) {
  return battlesCompletedAfter > 0 && battlesCompletedAfter % WORLD_BOOST_BATTLES_PER_STEP === 0;
}

// 世界情勢による強化を反映した、その国の実効兵力
export function effectiveNationTroops(nation, profile) {
  return nation.totalTroops * worldBoostFactor(profile);
}

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

// プレイヤーが大将・副将として選べるキャラクター一覧。それぞれ固有スキル(カード)を持つ。
// skillEffectは既存のカード効果を再利用し、キャラごとに名前・説明だけ変えて演出している。
export const PLAYER_CHARACTERS = [
  {
    id: 'noa', name: 'ノア', title: '黎明の主将', type: UNIT_TYPES.INFANTRY,
    desc: '黎明の国を率いる若き主将。仲間を鼓舞する統率力に長ける。',
    skillName: '不屈の号令', skillDesc: '味方全部隊に密集陣形ボーナス+2を付与する(次の相手ターンまで)', skillEffect: 'allout',
  },
  {
    id: 'rio', name: 'リオ', title: '風読みの弓手', type: UNIT_TYPES.ARCHER,
    desc: '風向きを読んで矢を放つ、狙撃の達人。',
    skillName: '百発百中', skillDesc: '次の射撃だけ、相手の地形防御と密集陣形ボーナスを無視する', skillEffect: 'snipe',
  },
  {
    id: 'gai', name: 'ガイ', title: '疾風の騎士', type: UNIT_TYPES.CAVALRY,
    desc: '一陣の風のごとく戦場を駆け抜ける猛将。',
    skillName: '疾風怒濤', skillDesc: 'このターンだけ移動力+3。奇襲を使用済みでも発動できる', skillEffect: 'lightning',
  },
  {
    id: 'sera', name: 'セラ', title: '不動の盾', type: UNIT_TYPES.INFANTRY,
    desc: 'どんな猛攻にも揺るがない、鉄壁の守りを誇る女武将。',
    skillName: '金剛の盾', skillDesc: 'この部隊が次に防御する戦闘だけ、受ける損害を30%軽減する', skillEffect: 'ironwall',
  },
];

export function findPlayerCharacter(id) {
  return PLAYER_CHARACTERS.find((c) => c.id === id) || recruitableCharacterFor(id) || PLAYER_CHARACTERS[0];
}

// 拠点防衛戦で大将・副将に付与する追加ランクボーナス(通常の合戦より守備側が少し有利になる)。
// 数値は暫定値であり、後日調整する前提のプレースホルダー。
export const DEFENSE_BATTLE_RANK_BONUS = 2;

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
    skillName: '欺瞞の罠', skillDesc: 'この部隊が次に防御する戦闘だけ、受ける損害を30%軽減する', skillEffect: 'ironwall',
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
    skillName: '剛拳の号令', skillDesc: '味方全部隊に密集陣形ボーナス+2を付与する(次の相手ターンまで)', skillEffect: 'allout',
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
    skillName: '神弓の一斉射', skillDesc: '次の射撃だけ、相手の地形防御と密集陣形ボーナスを無視する', skillEffect: 'snipe',
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
    skillName: '不動の陣', skillDesc: 'この部隊が次に防御する戦闘だけ、受ける損害を30%軽減する', skillEffect: 'ironwall',
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
    skillName: '疾風の夜駆け', skillDesc: 'このターンだけ移動力+3。奇襲を使用済みでも発動できる', skillEffect: 'lightning',
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
    skillName: '龍穿の一撃', skillDesc: '次の射撃だけ、相手の地形防御と密集陣形ボーナスを無視する', skillEffect: 'snipe',
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
    skillName: '深謀の采配', skillDesc: '味方全部隊に密集陣形ボーナス+2を付与する(次の相手ターンまで)', skillEffect: 'allout',
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
    skillName: '紅蓮の疾走', skillDesc: 'このターンだけ移動力+3。奇襲を使用済みでも発動できる', skillEffect: 'lightning',
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
    skillName: '幻影の盾', skillDesc: 'この部隊が次に防御する戦闘だけ、受ける損害を30%軽減する', skillEffect: 'ironwall',
  },
];

export function findNation(nationId) {
  if (nationId === PLAYER_NATION.id) return PLAYER_NATION;
  return STORY_NATIONS.find((n) => n.id === nationId) || null;
}

// ---------- 物語の軸・セリフ集 ----------

// プロローグ(新規キャンペーン開始時、難易度選択の直後に1回だけ表示)
export const PROLOGUE_TEXT = `かつて黎明の国は、この大陸で名の知れた大国だった。

だが数十年前、覇牙の国ガロウの侵攻によって、黎明の版図は無残に切り取られ、多くの民と土地を失った。以来、黎明は総兵力500——大陸に散らばる国々の中でも、最も小さく、最も弱い国として、細々と命脈を保ってきた。

主将ノアは、その黎明の若き主将。奪われた土地を、奪われた誇りを、いつか必ず取り戻す——その一心で、リオ、ガイ、セラという僅かな仲間と共に、大陸統一という無謀な旗を掲げる。

相手は自分たちの何十倍もの兵を持つ国ばかり。それでも、ノアは前を向く。「奪われたものは、奪い返せばいい」——その単純で、しかし重い覚悟こそが、この物語の始まりである。`;

// 各国君主のセリフ集(開戦時・スキル発動時・煽り・敗北時・仲間になる時)。
// 表示は各国の「首都(王都)タイル」を攻める・防衛する戦闘に限定する(自由侵攻・小競り合いでは出さない)。
// joinが無い国(覇牙、およびハード/ヘル限定のhaitetsu_wall)は仲間にならない。
export const NATION_DIALOGUE = {
  haitetsu: {
    battleStart: '誰も奪わせやしない……お前がその覚悟を持っているか、この手で確かめさせてもらう',
    skillActivate: '甘いな……罠に嵌まったのはお前の方だ!',
    taunt: 'この程度で息が上がるようじゃ、覇牙には指一本触れられんぞ!',
    defeat: '……負けたな。だが不思議と、悔しさより安堵がある。お前になら、託せる気がした',
    join: 'よし、決まりだ。俺の力、お前の理想に貸してやる。今度こそ、誰も奪わせない',
  },
  // ハード/ヘル限定: 廃鉄の国は超大国化し、物語終盤の最大の壁になる(仲間にはならない)
  haitetsu_wall: {
    battleStart: '守るために強くなった。その果てがこの姿だというなら、誰も俺を止めるな',
    skillActivate: 'これが、俺の積み上げてきた力だ……受けてみろ!',
    taunt: '力とはこういうものだ……お前にはまだ、その覚悟が足りん!',
    defeat: '……そうか。俺は、守り方を間違えていたのかもしれないな',
  },
  haga: {
    battleStart: '弱者が束になったところで、この物量の前では塵に等しい。かかってこい、黎明の若造',
    skillActivate: '見よ、これが物量の暴力というものだ!全軍、押し潰せ!',
    taunt: '数を揃えたところで、この一撃で全て灰にしてくれるわ!',
    defeat: '馬鹿な……この俺が、かつて踏み潰した国の末裔に……',
  },
  kyogan: {
    battleStart: '小僧、貴様も覇牙と同じ穴の狢か。それとも……試す価値があるか',
    skillActivate: 'この盾、そう容易く割れるものではないぞ',
    taunt: 'この城壁、そう容易くは崩せんぞ。無駄な足掻きだ',
    defeat: 'ふん……この城壁を崩すか。悪くない。せいぜい覇牙を潰す時まで生き延びるがいい',
    join: '悪くない太刀筋だ……よかろう、覇牙を叩き潰すその日まで、貴様に付き合ってやる',
  },
  shinkyu: {
    battleStart: '粗野な力にはうんざりしているの。貴方がそれと同類でないことを、その矢筋で示しなさい',
    skillActivate: '防御など無意味……この一斉射、避けられるものなら避けてみせなさい',
    taunt: '無粋な接近戦など、この矢の前では意味を成さないわ',
    defeat: '……見事。品格ある敗北というものを、久方ぶりに味わったわ',
    join: '貴方の品格、しかと見届けたわ。この弓、貴方の大義に添えましょう',
  },
  inrou: {
    battleStart: '悪いが俺は強い方につくだけだ。今のところ、それはお前じゃなさそうだがな',
    skillActivate: '見てから避けようなど、遅すぎるぞ!',
    taunt: '見えない一撃に怯えるがいい、正面から挑むだけが戦じゃない',
    defeat: 'チッ……読み違えたか。まあいい、次はお前の側につくとしよう',
    join: '読み違えは俺の性分でな。だが今回ばかりは、賭けてみるとするか',
  },
  ryusen: {
    battleStart: '俺の穿つ一撃、覇牙の犬と侮るなよ……もっとも、その侮蔑は間違っちゃいないがな',
    skillActivate: 'その守り、俺の槍には通用しない!',
    taunt: '甘い一手だ、その隙、俺の槍が見逃さん',
    defeat: '……償いにもならんが、これで少しは軽くなったかもしれん',
    join: '償いになるかは分からんが……この槍、お前の理想に貸してやる',
  },
  fuin: {
    battleStart: 'あら、盤面をひっくり返しに来たのね。……悪くない一手だと思っていたの、貴方は',
    skillActivate: 'もう詰んでいるのよ、貴方たちは',
    taunt: '盤面はもう、私の手のひらの上よ',
    defeat: '読み違えたわね……いいえ、これも計算のうちだったと思っておくわ',
    join: '面白い……この采配、しばらく貴方に預けてみましょうか',
  },
  rekka: {
    battleStart: '理屈はいらない。強いか弱いか、それだけだ。かかってこい!',
    skillActivate: '本陣一直線だ、ついてこれるもんならついてこい!',
    taunt: 'もっと本気で来い!じゃなきゃ張り合いがないだろ!',
    defeat: 'くそっ……!でも認めるしかないな、お前の方が強い',
    join: 'よし決めた、お前について行く!強い方が正義ってやつだ、細けぇ理屈はナシな!',
  },
  soukai: {
    battleStart: '小国同士、潰し合うのは本意じゃないんだがな……お互い、生き延びるためだ',
    skillActivate: '何が本物か、最後まで分からせてやらないさ',
    taunt: '何が来るか読めない、それが俺たちの強みだ',
    defeat: 'はは……小国が小国に負けるとはな。恨みはしないさ、次はお前が生き延びる番だ',
    join: '弱小国同士、手を組むのも悪くないだろ。お前になら、賭けてみるさ',
  },
};

// ジェネス(廃鉄の国)を除いた8ヶ国は、首都タイルでの勝利によって全員が戦闘参加キャラとして仲間になる。
// ジェネスも通常は仲間になるが、ハード/ヘル限定で最終の壁(仲間にならない)へ役割反転する。覇牙は常に仲間にならない
const NEVER_RECRUITABLE_NATION_IDS = ['haga'];

export function isRecruitable(nationId, difficultyId) {
  if (NEVER_RECRUITABLE_NATION_IDS.includes(nationId)) return false;
  if (nationId === 'haitetsu' && (difficultyId === 'hard' || difficultyId === 'hell')) return false;
  return true;
}

export function dialogueSetFor(nationId, difficultyId) {
  if (nationId === 'haitetsu' && (difficultyId === 'hard' || difficultyId === 'hell')) {
    return NATION_DIALOGUE.haitetsu_wall;
  }
  return NATION_DIALOGUE[nationId] || null;
}

// ハード/ヘル限定: 廃鉄の国が力を求めすぎて超大国化する特別スケーリング。
// 通常の難易度倍率(scoreMultiplier)とは別枠。数値は暫定値であり、後日調整する前提のプレースホルダー。
const HAITETSU_WALL_OVERRIDE = { totalTroops: 22000, aiTrait: 'fortress' };

export function getNationForDifficulty(nationId, difficultyId) {
  const nation = findNation(nationId);
  if (!nation) return null;
  if (nation.id === 'haitetsu' && (difficultyId === 'hard' || difficultyId === 'hell')) {
    return { ...nation, ...HAITETSU_WALL_OVERRIDE };
  }
  return nation;
}

function dominantNationType(ratios) {
  return Object.values(UNIT_TYPES).reduce((best, type) =>
    (ratios[type] || 0) > (ratios[best] || 0) ? type : best
  , UNIT_TYPES.INFANTRY);
}

// 首都タイルでの勝利によって仲間になった国の君主を、大将・副将選択で使えるキャラクター形に組み立てる
// (国データ(STORY_NATIONS)から都度導出するので、データを二重管理しない)
export function recruitableCharacterFor(nationId) {
  const nation = STORY_NATIONS.find((n) => n.id === nationId);
  if (!nation) return null;
  return {
    id: nation.id,
    name: nation.monarch,
    title: `${nation.name}の君主(仲間)`,
    type: dominantNationType(nation.composition),
    desc: nation.desc,
    skillName: nation.skillName,
    skillDesc: nation.skillDesc,
    skillEffect: nation.skillEffect,
  };
}

// 武将ガチャ用の拡張キャラクターロースター(☆1〜☆5、46人)は core/characters.js を参照。
// (story.jsはストーリーモード自体のデータに専念させ、ガチャの拡張ロースターは分離している)
