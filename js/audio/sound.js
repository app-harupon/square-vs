// Web Audio APIによる完全プロシージャル生成の効果音エンジン(SEのみ、BGMは無し)。
// 外部音声ファイルは一切使わず、その場でオシレーターから波形を合成する
// (このプロジェクト全体の「アセットは全部コードで生成する」方針に合わせている)。

let ctx = null;
let masterGain = null;
let sfxGain = null;
let muted = false;
let unlocked = false;

function getCtx() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = ctx.createGain();
    masterGain.gain.value = muted ? 0 : 1;
    masterGain.connect(ctx.destination);
    sfxGain = ctx.createGain();
    sfxGain.gain.value = 0.5;
    sfxGain.connect(masterGain);
  }
  return ctx;
}

// ブラウザの自動再生制限を回避するため、最初のユーザー操作でAudioContextを起動する
export function unlockAudio() {
  if (unlocked) return;
  unlocked = true;
  const c = getCtx();
  if (c.state === 'suspended') c.resume().catch(() => {});
}

export function setMuted(value) {
  muted = value;
  if (masterGain) masterGain.gain.setTargetAtTime(muted ? 0 : 1, getCtx().currentTime, 0.05);
}
export function isMuted() {
  return muted;
}

// ---------- 効果音(短いオシレーター音の組み合わせ) ----------
function tone(freq, start, duration, { type = 'sine', gain = 0.3, sweepTo = null, attack = 0.005 } = {}) {
  const c = getCtx();
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (sweepTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, sweepTo), start + duration);
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(gain, start + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(g);
  g.connect(sfxGain);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

function noiseBurst(start, duration, { gain = 0.25, filterFreq = 1200 } = {}) {
  const c = getCtx();
  const bufferSize = Math.max(1, Math.floor(c.sampleRate * duration));
  const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  const src = c.createBufferSource();
  src.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = filterFreq;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, start);
  g.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  src.connect(filter);
  filter.connect(g);
  g.connect(sfxGain);
  src.start(start);
  src.stop(start + duration + 0.02);
}

const SFX = {
  tap: (c, t) => tone(660, t, 0.06, { type: 'triangle', gain: 0.18 }),
  deploy: (c, t) => {
    tone(300, t, 0.09, { type: 'sine', gain: 0.22, sweepTo: 460 });
  },
  move: (c, t) => {
    tone(420, t, 0.12, { type: 'sine', gain: 0.16, sweepTo: 260 });
  },
  melee: (c, t) => {
    noiseBurst(t, 0.12, { gain: 0.3, filterFreq: 900 });
    tone(140, t, 0.16, { type: 'square', gain: 0.22, sweepTo: 60 });
  },
  ranged: (c, t) => {
    tone(900, t, 0.14, { type: 'sawtooth', gain: 0.14, sweepTo: 1600 });
  },
  cardUse: (c, t) => {
    [880, 1108, 1318].forEach((f, i) => tone(f, t + i * 0.05, 0.16, { type: 'triangle', gain: 0.16 }));
  },
  capital: (c, t) => {
    [523, 659, 784, 1046].forEach((f, i) => tone(f, t + i * 0.09, 0.28, { type: 'triangle', gain: 0.2 }));
  },
  victory: (c, t) => {
    [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, t + i * 0.1, 0.35, { type: 'triangle', gain: 0.22 }));
  },
  defeat: (c, t) => {
    [440, 392, 349, 293].forEach((f, i) => tone(f, t + i * 0.16, 0.4, { type: 'sine', gain: 0.2 }));
  },
  error: (c, t) => {
    tone(180, t, 0.12, { type: 'square', gain: 0.15 });
  },
  select: (c, t) => tone(740, t, 0.05, { type: 'sine', gain: 0.14 }),
};

export function playSfx(name) {
  if (muted || !unlocked) return;
  const c = getCtx();
  const fn = SFX[name];
  if (!fn) return;
  try {
    fn(c, c.currentTime);
  } catch {
    // AudioContextが何らかの理由で使えない環境では何もしない
  }
}
