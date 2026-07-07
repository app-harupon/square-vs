// プレイヤーのローカル進行データ管理(ジェム・ログインボーナス・ガチャ解放)
// 実際の決済処理は一切行わない、ローカル完結のシミュレーションです。

const STORAGE_KEY = 'warchess_profile_v1';

const DEFAULT_PROFILE = {
  gems: 300,
  lastLoginDate: null,
  loginStreak: 0,
  unlockedCards: [],
  unlockedGenerals: [],
  storyReserve: { infantry: 0, archer: 0, cavalry: 0 }, // 降伏兵を吸収した予備兵力ストック(兵種固定)
  storyMap: null, // { width, height, tiles: 国別の元々の領有国, owners } (キャンペーン開始時に1回だけ生成して固定)
  storyAlliances: [], // プレイヤーと同盟を結んだ国のID一覧
  storyDifficulty: null, // 選択した難易度ID(キャンペーン開始時に1回だけ選ぶ)
  tutorialSeen: false, // 初回チュートリアルを見た(またはスキップした)かどうか
  muted: false, // BGM・効果音をミュートしているか
  storyLastGeneral: null, // 直近で選んだ大将キャラクターID(次回のデフォルト選択に使う)
  storyLastViceGenerals: [], // 直近で選んだ副将キャラクターIDの配列
};

export function loadProfile() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PROFILE };
    return { ...DEFAULT_PROFILE, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_PROFILE };
  }
}

export function saveProfile(profile) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // localStorageが使えない環境では何もしない
  }
}

function todayStr(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function isYesterday(prevDateStr, todayDateStr) {
  const prev = new Date(prevDateStr + 'T00:00:00');
  const today = new Date(todayDateStr + 'T00:00:00');
  const diffDays = Math.round((today - prev) / 86400000);
  return diffDays === 1;
}

// 7日サイクルのログインボーナス(7日目にボーナス)
const DAILY_REWARDS = [50, 50, 50, 50, 50, 50, 200];

// その日の分をまだ受け取っていなければ付与する。既に受け取り済みならnullを返す。
export function checkLoginBonus(profile) {
  const today = todayStr();
  if (profile.lastLoginDate === today) return null;
  const isConsecutive = profile.lastLoginDate && isYesterday(profile.lastLoginDate, today);
  profile.loginStreak = isConsecutive ? (profile.loginStreak % 7) + 1 : 1;
  const reward = DAILY_REWARDS[profile.loginStreak - 1];
  profile.gems += reward;
  profile.lastLoginDate = today;
  saveProfile(profile);
  return { day: profile.loginStreak, reward, gems: profile.gems };
}

export function spendGems(profile, amount) {
  if (profile.gems < amount) return false;
  profile.gems -= amount;
  saveProfile(profile);
  return true;
}
