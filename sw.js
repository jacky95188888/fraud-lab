const CACHE = "fraud-lab-v2";
const CORE = ["./", "./index.html", "./fraud-premium.css"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || req.url.includes("/check")) return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.endsWith("/") || url.pathname.endsWith("/index.html")) {
    e.respondWith(fetch(req).then(async res => {
      if (!res.ok) return res;
      let html = await res.text();
      if (!html.includes("fraud-premium.css")) html = html.replace("</head>", '<link rel="stylesheet" href="./fraud-premium.css?v=2"></head>');
      return new Response(html, {status:res.status,statusText:res.statusText,headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-cache"}});
    }).catch(() => caches.match("./index.html")));
    return;
  }
  e.respondWith(fetch(req).then(res => {
    if (res.ok) { const copy=res.clone(); caches.open(CACHE).then(c=>c.put(req,copy)); }
    return res;
  }).catch(()=>caches.match(req)));
});