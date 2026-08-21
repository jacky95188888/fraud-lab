const CACHE = "fraud-lab-master-v4";
const CORE = ["./", "./index.html", "./master-v3.css", "./master-v3.js"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

async function masterResponse(req) {
  try {
    const res = await fetch(req, { cache: "no-store" });
    if (!res.ok) return res;
    const type = res.headers.get("content-type") || "";
    const url = new URL(req.url);
    if (type.includes("text/html") && (url.pathname.endsWith("/") || url.pathname.endsWith("/index.html"))) {
      let html = await res.text();
      html = html.replace(/<link[^>]*premium-v2\.css[^>]*>/gi, "");
      html = html.replace(/<script[^>]*premium-v2\.js[^>]*><\/script>/gi, "");
      if (!html.includes("master-v3.css")) html = html.replace("</head>", '<link rel="stylesheet" href="./master-v3.css?v=20260821-master4"></head>');
      if (!html.includes("master-v3.js")) html = html.replace("</body>", '<script src="./master-v3.js?v=20260821-master4" defer></script></body>');
      return new Response(html, {status:200,headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store, max-age=0"}});
    }
    if (url.origin === location.origin) {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy));
    }
    return res;
  } catch {
    return (await caches.match(req)) || (await caches.match("./index.html"));
  }
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || req.url.includes("/check")) return;
  const url = new URL(req.url);
  if (req.mode === "navigate" || url.pathname.endsWith("/index.html") || url.pathname.endsWith("/")) return e.respondWith(masterResponse(req));
  e.respondWith(caches.match(req).then(hit => hit || masterResponse(req)));
});