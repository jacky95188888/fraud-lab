const CACHE = "fraud-lab-v3";
const CORE = ["./", "./index.html", "./premium-v2.css", "./premium-v2.js"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function premiumResponse(req) {
  try {
    const res = await fetch(req, { cache: "no-store" });
    if (!res.ok) return res;
    const type = res.headers.get("content-type") || "";
    const url = new URL(req.url);
    if (type.includes("text/html") && (url.pathname.endsWith("/") || url.pathname.endsWith("/index.html"))) {
      let html = await res.text();
      if (!html.includes("premium-v2.js")) {
        html = html.replace("</head>", '<link rel="stylesheet" href="./premium-v2.css?v=20260821"></head>');
        html = html.replace("</body>", '<script src="./premium-v2.js?v=20260821" defer></script></body>');
      }
      return new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
    }
    if (new URL(req.url).origin === location.origin) {
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
  if (req.mode === "navigate" || url.pathname.endsWith("/index.html") || url.pathname.endsWith("/")) {
    e.respondWith(premiumResponse(req));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || premiumResponse(req)));
});
