const CACHE_NAME = 'warchess-cache-v25';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/main.js',
  './js/core/terrain.js',
  './js/core/units.js',
  './js/core/modes.js',
  './js/core/board.js',
  './js/core/combat.js',
  './js/core/squad.js',
  './js/core/rules.js',
  './js/core/ai.js',
  './js/core/profile.js',
  './js/core/story.js',
  './js/core/storyBattle.js',
  './js/core/worldMap.js',
  './js/ui/render3d.js',
  './js/ui/input.js',
  './js/net/client.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

// CDN(外部オリジン)から取得するアセットは、失敗してもインストール全体を失敗させないよう
// ASSETSとは別に、ベストエフォートでキャッシュしておく
const CDN_ASSETS = ['https://unpkg.com/three@0.160.0/build/three.module.js'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        cache.addAll(ASSETS).then(() =>
          Promise.all(CDN_ASSETS.map((url) => cache.add(url).catch(() => {})))
        )
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  // ネットワーク優先(常に最新のゲームコードを反映し、オフライン時のみキャッシュにフォールバック)
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
