const CACHE = "fraud-lab-master-v19";
const CORE = ["./", "./index.html", "./master-v3.css?v=16", "./master-v3.js?v=16", "./quickscan-v2.js?v=19"];
self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
async function networkFirst(req){try{const res=await fetch(req,{cache:"no-store"});if(res.ok&&new URL(req.url).origin===location.origin)caches.open(CACHE).then(c=>c.put(req,res.clone()));return res}catch{return(await caches.match(req))||(await caches.match("./index.html"))}}
async function pageWithQuickScan(req){
  const res=await networkFirst(req);
  if(!res||!res.ok)return res;
  const type=res.headers.get("content-type")||"";
  if(!type.includes("text/html"))return res;
  let html=await res.clone().text();
  if(!html.includes("quickscan-v2.js"))html=html.replace("</body>",'<script src="./quickscan-v2.js?v=19"></script></body>');
  const headers=new Headers(res.headers);headers.delete("content-length");
  return new Response(html,{status:res.status,statusText:res.statusText,headers});
}
self.addEventListener("fetch",e=>{const req=e.request;if(req.method!=="GET"||req.url.includes("/check"))return;const url=new URL(req.url);if(req.mode==="navigate"||url.pathname.endsWith(".html")||url.pathname.endsWith("/"))return e.respondWith(pageWithQuickScan(req));if(/\/(master-v3\.(css|js)|quickscan-v2\.js|sw\.js)$/.test(url.pathname))return e.respondWith(networkFirst(req));e.respondWith(caches.match(req).then(hit=>hit||networkFirst(req)))});
