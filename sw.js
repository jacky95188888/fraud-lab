const CACHE = "fraud-lab-master-v12";
const CORE = ["./", "./index.html", "./master-v3.css?v=12", "./master-v3.js?v=12"];
self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
async function networkFirst(req){try{const res=await fetch(req,{cache:"no-store"});if(res.ok&&new URL(req.url).origin===location.origin)caches.open(CACHE).then(c=>c.put(req,res.clone()));return res}catch{return(await caches.match(req))||(await caches.match("./index.html"))}}
self.addEventListener("fetch",e=>{const req=e.request;if(req.method!=="GET"||req.url.includes("/check"))return;const url=new URL(req.url);if(req.mode==="navigate"||url.pathname.endsWith("/index.html")||url.pathname.endsWith("/")||/\/(master-v3\.(css|js)|sw\.js)$/.test(url.pathname))return e.respondWith(networkFirst(req));e.respondWith(caches.match(req).then(hit=>hit||networkFirst(req)))});
