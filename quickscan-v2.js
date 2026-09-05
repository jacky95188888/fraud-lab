(()=>{
'use strict';
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const OFFICIAL={
  '黑貓宅急便':['t-cat.com.tw'], '中華郵政':['post.gov.tw'], '政府機關':['gov.tw'],
  '蝦皮':['shopee.tw'], '7-ELEVEN':['7-11.com.tw'], '全家':['family.com.tw']
};
const BRAND_RE=/(宅急便|黑貓|t[- ]?cat|中華郵政|郵局|蝦皮|shopee|7[- ]?eleven|7-11|全家|政府|警政|165)/i;
const URL_RE=/(https?:\/\/[^\s<>"']+|(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s<>"']*)?)/ig;
const SHORT_RE=/(bit\.ly|reurl\.cc|lihi\d?\.(?:cc|io)|pse\.is|tinyurl\.com|cutt\.ly|is\.gd|t\.ly|goo\.su|myppt\.cc)/i;
const RISK_TLD_RE=/\.(xyz|top|cc|icu|buzz|click|vip|work|rest|cyou|shop|online|site|live|link)(?:[\/:?#]|$)/i;
const PAY_RE=/(運費|工本費|手續費|付款|支付|匯款|轉帳|刷卡|信用卡|繳費|保證金|驗證費)/i;
const FREE_RE=/(免費|贈送|送你|送我|送.{0,6}(釣竿|禮物|贈品|商品)|只要.{0,8}(運費|工本費)|領取|贈品)/i;
const SENSITIVE_RE=/(驗證碼|OTP|卡號|有效期限|背面三碼|CVV|網銀|帳號密碼|下載.{0,6}(APP|應用程式)|安裝.{0,6}(APP|應用程式))/i;
const PRESSURE_RE=/(立即|馬上|限時|24小時|逾期|最後通知|現在就)/i;
function hostOf(raw){try{let u=raw;if(!/^https?:\/\//i.test(u))u='https://'+u;return new URL(u).hostname.toLowerCase().replace(/^www\./,'')}catch{return ''}}
function isOfficialForBrand(host,text){
  if(/(宅急便|黑貓|t[- ]?cat)/i.test(text)) return host==='t-cat.com.tw'||host.endsWith('.t-cat.com.tw');
  if(/(中華郵政|郵局)/i.test(text)) return host==='post.gov.tw'||host.endsWith('.post.gov.tw');
  if(/(蝦皮|shopee)/i.test(text)) return host==='shopee.tw'||host.endsWith('.shopee.tw');
  if(/7[- ]?eleven|7-11/i.test(text)) return host==='7-11.com.tw'||host.endsWith('.7-11.com.tw');
  if(/全家/i.test(text)) return host==='family.com.tw'||host.endsWith('.family.com.tw');
  if(/(政府|警政|165)/i.test(text)) return host.endsWith('.gov.tw')||host==='gov.tw';
  return true;
}
function scan(raw){
  const text=String(raw||''); let score=0; const flags=[]; const add=(n,msg)=>{score+=n;if(msg&&!flags.includes(msg))flags.push(msg)};
  const urls=text.match(URL_RE)||[]; const hosts=urls.map(hostOf).filter(Boolean);
  if(FREE_RE.test(text)&&PAY_RE.test(text)){add(42,'出現「免費／贈送」後再要求支付小額運費或費用，符合常見誘導付款詐騙情境。')}
  if(urls.length&&PAY_RE.test(text)){add(18,'訊息同時包含外部連結與付款／運費要求，應先查證網址真偽，不要直接付款。')}
  for(const u of urls){const h=hostOf(u);if(!h)continue;
    if(SHORT_RE.test(u))add(20,'使用短網址隱藏真正目的地。');
    if(RISK_TLD_RE.test(h))add(20,`網址 ${h} 使用較需警戒的網域尾碼，不能只看網址裡是否有品牌名稱。`);
    if(BRAND_RE.test(text)&&!isOfficialForBrand(h,text))add(38,`訊息提到知名品牌／物流，但連結網域是 ${h}，與對應官方網域不一致，疑似品牌冒充或假物流頁。`);
  }
  if(SENSITIVE_RE.test(text))add(32,'要求提供驗證碼、卡片資料、密碼或安裝 APP，屬高風險操作。');
  if(PRESSURE_RE.test(text))add(12,'訊息帶有催促或限時壓力，可能是在降低你查證的時間。');
  if(/(匯款|轉帳).{0,15}(驗證碼|OTP)|驗證碼.{0,15}(匯款|轉帳)/i.test(text))add(35,'同時要求金流操作與驗證碼，風險極高。');
  score=Math.min(100,Math.round(score));
  let type='無明顯風險';
  if(score>=70)type=hosts.length?'高度可疑・疑似假網站／詐騙連結':'高度可疑';
  else if(score>=35)type='可疑・建議先查證';
  else if(score>0)type='有可疑跡象';
  return {score,type,flags:flags.slice(0,8),hosts};
}
function render(r){
  let cls='lv-safe',word='陰性',sub='NEGATIVE';
  if(r.score>=70){cls='';word='高風險';sub='HIGH RISK'} else if(r.score>=35){cls='lv-warn';word='可疑';sub='SUSPECT'} else if(r.score>0){cls='lv-warn';word='留意';sub='CAUTION'}
  const actions=r.score>=35?[
    '先不要點訊息裡的連結，也不要付款、輸入卡號或驗證碼。',
    '自己從搜尋引擎或官方 APP 找到該品牌／物流的官方網站，再核對網域與訂單。',
    '如果已輸入金融資料或驗證碼，立即聯絡銀行；仍不確定可撥 165 查證。'
  ]:[
    '目前未抓到足以判定高風險的組合，但不代表一定安全。',
    '只要對方要求付款、驗證碼、下載 APP 或登入陌生網站，就先停止操作。',
    '不確定時自行找官方管道確認，或撥 165。'
  ];
  const out=$('#qOut'); if(!out)return;
  out.innerHTML=`<div class="report"><div class="report-head"><b>快篩結果</b><span class="mono" style="font-size:12px">${esc(r.type)}</span></div><div class="report-body"><div class="seal ${cls}"><span class="sv">${word}</span><span class="ss">${sub}</span></div><div class="meter"><div class="mnum">${r.score}<span> / 100 詐騙風險</span></div><div class="bar"><i style="width:${r.score}%"></i></div></div>${r.flags.length?`<div class="sect"><h4>情境與網址風險</h4><ul class="flags">${r.flags.map(f=>`<li>${esc(f)}</li>`).join('')}</ul></div>`:`<div class="sect"><h4>比對結果</h4><p class="quote">目前沒有抓到明顯高風險組合；快篩不是官方黑名單查詢，也不能保證網站安全。</p></div>`}<div class="sect"><h4>建議做的事</h4><ol class="steps">${actions.map(a=>`<li>${esc(a)}</li>`).join('')}</ol></div><div class="upsell"><b>新版快篩：</b>除了話術，也會一起看「贈品＋小額費用＋外部網址」、品牌與網域不一致、短網址、敏感資料要求等組合。網址判斷是風險提示，不等於官方認定。</div><div class="row"><button class="btn sm ghost" id="qCopyV2">複製結果</button><a class="btn sm stamp" href="tel:165" style="text-decoration:none">撥 165</a></div></div></div>`;
  $('#qCopyV2')?.addEventListener('click',()=>navigator.clipboard?.writeText(`【反詐實驗室快篩】${word}｜風險 ${r.score}/100\n${r.type}\n${r.flags.join('\n')}`));
  out.scrollIntoView({behavior:'smooth',block:'start'});
}
function install(){const btn=$('#qBtn');if(!btn||btn.dataset.v2)return;btn.dataset.v2='1';btn.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();const ta=$('#qText');const text=ta?.value.trim()||'';if(!text){ta?.focus();return}render(scan(text));},true)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
})();
