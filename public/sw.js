// 설치(홈 화면 추가) 조건을 맞추기 위한 최소 서비스워커.
// 캐시는 하지 않는다 — 배포한 새 버전이 곧바로 보여야 하고, 사진·영상은 서버가 원본이다.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  e.respondWith(fetch(e.request));
});
