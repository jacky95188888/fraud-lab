/**
 * 反詐實驗室 Cloudflare Worker
 * Secrets: GEMINI_KEY, ADMIN_KEY
 * Variable: ALLOW_ORIGIN=https://jacky95188888.github.io
 * KV binding: CODES
 */
const MODEL="gemini-2.5-flash";
const ALPHABET="ACDEFGHJKLMNPQRTUVWXY3479";
const SYSTEM=`你是台灣的資深反詐騙分析員，熟悉 165 打詐儀表板收錄的常見手法。
使用者會貼上一段可疑訊息，或上傳一張對話截圖，也可能兩者都有。請判斷這是不是詐騙。

若有圖片：先仔細讀出圖中所有可見文字（對話內容、發話者名稱、時間、網址、按鈕文字、帳號名稱），再據此判斷。若圖片模糊或資訊不足，明確說出看不清楚的部分。

判斷原則：
- 以台灣情境為準（LINE、蝦皮、中華郵政、健保署、國稅局、各家銀行、ATM 解除分期等）。
- 重點看行為模式：是否製造急迫、要求匯款或提供帳號密碼驗證碼、引導脫離官方管道、要求保密、要求下載非官方商店 APP。
- 資訊不足時說明還缺什麼，不要硬猜，分數可給中間值。
- 用字要讓長輩看得懂，白話、具體、不用專業術語。

只輸出一個 JSON 物件，不要 markdown 反引號或前言：
{"score":0,"type":"六字內分類","readout":"圖片文字摘要，無圖片留空","summary":"兩到三句判定","redFlags":["具體風險"],"goal":"對方最終目的","actions":["第一步","第二步","第三步"]}`;

const cors=origin=>({
  "Access-Control-Allow-Origin":origin||"*",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
  "Access-Control-Allow-Headers":"Content-Type, X-Admin-Key",
  "Access-Control-Max-Age":"86400",
  "Vary":"Origin",
});
const json=(obj,status=200,headers={})=>new Response(JSON.stringify(obj),{
  status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store",...headers},
});
const norm=code=>String(code||"").trim().toUpperCase().replace(/\s/g,"");
const kvKey=code=>"code:"+norm(code);

function newCode(){
  let value="";
  for(const byte of crypto.getRandomValues(new Uint8Array(8)))value+=ALPHABET[byte%ALPHABET.length];
  return `FL-${value.slice(0,4)}-${value.slice(4)}`;
}
function bindingError(env,name){
  if(env[name])return null;
  const label=name==="CODES"?"CODES KV":"GEMINI_KEY Secret";
  return `後端尚未設定 ${label}，請到 Cloudflare Worker 的 Settings → Bindings / Variables 新增。`;
}
async function loadCode(env,code){
  const normalized=norm(code);
  if(!/^FL-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(normalized))return{err:"兌換碼格式不對，請確認是 FL- 開頭的那一組。",status:400};
  const raw=await env.CODES.get(kvKey(normalized));
  if(!raw)return{err:"查不到這組兌換碼，請跟三寶爸再要一次。",status:401};
  let rec;
  try{rec=JSON.parse(raw)}catch{return{err:"兌換碼資料損壞，請跟三寶爸換一組。",status:500}}
  if(rec.revoked)return{err:"這組兌換碼已被停用。",status:403};
  if(rec.expiresAt&&Date.now()>Date.parse(rec.expiresAt))return{err:"這組兌換碼已過期。",status:410};
  return{rec};
}

const TRACK_EVENTS=new Set(["page_view","quick_check","tool_open","code_verify","ai_check","share","support_open"]);
const taipeiDay=(offset=0)=>{
  const date=new Date(Date.now()+offset*864e5);
  return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit"}).format(date);
};
const cleanMetric=value=>String(value||"").replace(/[^a-zA-Z0-9_\-./]/g,"").slice(0,80);
async function hashVisitor(value){
  const bytes=new TextEncoder().encode(String(value||"").slice(0,120));
  const digest=await crypto.subtle.digest("SHA-256",bytes);
  return [...new Uint8Array(digest)].slice(0,12).map(byte=>byte.toString(16).padStart(2,"0")).join("");
}
async function recordMetric(env,input={}){
  if(!env.CODES)return;
  const event=TRACK_EVENTS.has(input.event)?input.event:"";
  if(!event)return;
  const day=taipeiDay(),key="stats:day:"+day;
  let record={day,pageViews:0,visitors:0,events:{},pages:{}};
  const raw=await env.CODES.get(key);
  if(raw){try{record={...record,...JSON.parse(raw)}}catch{}}
  record.events=record.events&&typeof record.events==="object"?record.events:{};
  record.pages=record.pages&&typeof record.pages==="object"?record.pages:{};
  record.events[event]=(Number(record.events[event])||0)+1;
  if(event==="page_view"){
    record.pageViews=(Number(record.pageViews)||0)+1;
    const page=cleanMetric(input.page)||"/fraud-lab/";
    record.pages[page]=(Number(record.pages[page])||0)+1;
    if(input.visitorId){
      const visitorKey="stats:visitor:"+day+":"+await hashVisitor(input.visitorId);
      if(!await env.CODES.get(visitorKey)){
        record.visitors=(Number(record.visitors)||0)+1;
        await env.CODES.put(visitorKey,"1",{expirationTtl:172800});
      }
    }
  }
  await env.CODES.put(key,JSON.stringify(record),{expirationTtl:31968000});
}
async function analyticsSummary(env){
  const records=[];let cursor;
  do{
    const page=await env.CODES.list({prefix:"stats:day:",cursor,limit:1000});
    for(const key of page.keys){
      const raw=await env.CODES.get(key.name);
      if(raw){try{records.push(JSON.parse(raw))}catch{}}
    }
    cursor=page.list_complete?undefined:page.cursor;
  }while(cursor);
  const byDay=new Map(records.map(record=>[record.day,record]));
  const aggregate=days=>{
    const start=taipeiDay(-(days-1));
    return records.filter(record=>record.day>=start).reduce((out,record)=>{
      out.pageViews+=Number(record.pageViews)||0;out.visitors+=Number(record.visitors)||0;
      for(const [name,value] of Object.entries(record.events||{}))out.events[name]=(out.events[name]||0)+(Number(value)||0);
      for(const [name,value] of Object.entries(record.pages||{}))out.pages[name]=(out.pages[name]||0)+(Number(value)||0);
      return out;
    },{pageViews:0,visitors:0,events:{},pages:{}});
  };
  const total=records.reduce((out,record)=>{out.pageViews+=Number(record.pageViews)||0;out.visitors+=Number(record.visitors)||0;return out},{pageViews:0,visitors:0});
  const series=[];
  for(let offset=-6;offset<=0;offset++){const day=taipeiDay(offset),record=byDay.get(day)||{};series.push({day,pageViews:Number(record.pageViews)||0,visitors:Number(record.visitors)||0})}
  return{today:aggregate(1),week:aggregate(7),month:aggregate(30),total,series,startedAt:records.map(r=>r.day).sort()[0]||null};
}

export default{
  async fetch(request,env){
    const H=cors(env.ALLOW_ORIGIN||"*");
    try{return await handle(request,env,H)}catch(error){
      const message=error instanceof Error?error.message:String(error);
      console.error(JSON.stringify({event:"worker_error",message,stack:error?.stack||""}));
      const isAdmin=Boolean(env.ADMIN_KEY)&&request.headers.get("X-Admin-Key")===env.ADMIN_KEY;
      return json({error:isAdmin?`WORKER_ERROR: ${message}`:"後端服務發生錯誤，請稍後再試。"},500,H);
    }
  }
};

async function handle(request,env,H){
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers:H});
  if(request.method!=="POST")return json({error:"Not found"},404,H);
  const path=new URL(request.url).pathname.replace(/\/+$/,"");
  let body={};
  try{body=await request.json()}catch{}

  if(path==="/stats"){
    if(!env.CODES)return json({error:"統計服務尚未完成設定。"},503,H);
    const summary=await analyticsSummary(env);
    const safeGroup=group=>({pageViews:group.pageViews,visitors:group.visitors,events:group.events});
    return json({ok:true,today:safeGroup(summary.today),week:safeGroup(summary.week),month:safeGroup(summary.month),total:summary.total,series:summary.series,startedAt:summary.startedAt},200,H);
  }

  if(path==="/track"){
    const requestOrigin=request.headers.get("Origin");
    if(env.ALLOW_ORIGIN&&requestOrigin&&requestOrigin!==env.ALLOW_ORIGIN)return json({error:"Origin not allowed"},403,H);
    if(!env.CODES)return json({ok:false},202,H);
    await recordMetric(env,body);
    return json({ok:true},202,H);
  }

  if(path.startsWith("/admin/")){
    if(!env.ADMIN_KEY||request.headers.get("X-Admin-Key")!==env.ADMIN_KEY)return json({error:"管理密碼錯誤。"},401,H);
    const missing=bindingError(env,"CODES");
    if(missing)return json({error:missing},500,H);

    if(path==="/admin/stats")return json({ok:true,...await analyticsSummary(env)},200,H);

    if(path==="/admin/create"){
      const count=Math.min(50,Math.max(1,parseInt(body.count,10)||1));
      const limit=Math.min(500,Math.max(1,parseInt(body.limit,10)||5));
      const days=Math.min(365,Math.max(1,parseInt(body.days,10)||30));
      const note=String(body.note||"").slice(0,60);
      const createdAt=new Date().toISOString();
      const expiresAt=new Date(Date.now()+days*864e5).toISOString();
      const expirationTtl=days*86400+604800;
      const codes=[];
      for(let i=0;i<count;i++){
        let code;
        do{code=newCode()}while(await env.CODES.get(kvKey(code)));
        const record={code,limit,used:0,note,createdAt,expiresAt,revoked:false};
        await env.CODES.put(kvKey(code),JSON.stringify(record),{expirationTtl});
        codes.push(record);
      }
      return json({ok:true,codes},201,H);
    }

    if(path==="/admin/lookup"){
      const raw=await env.CODES.get(kvKey(body.code));
      if(!raw)return json({error:"查不到這組碼。"},404,H);
      return json({ok:true,record:JSON.parse(raw)},200,H);
    }

    if(path==="/admin/revoke"){
      const raw=await env.CODES.get(kvKey(body.code));
      if(!raw)return json({error:"查不到這組碼。"},404,H);
      const record=JSON.parse(raw);record.revoked=true;record.revokedAt=new Date().toISOString();
      const seconds=Math.max(60,Math.floor((Date.parse(record.expiresAt)-Date.now())/1000)+604800);
      await env.CODES.put(kvKey(record.code),JSON.stringify(record),{expirationTtl:seconds});
      return json({ok:true,record},200,H);
    }

    if(path==="/admin/list"){
      const codes=[];let cursor;
      do{
        const page=await env.CODES.list({prefix:"code:",cursor,limit:1000});
        for(const key of page.keys){
          const raw=await env.CODES.get(key.name);
          if(raw){try{codes.push(JSON.parse(raw))}catch{}}
        }
        cursor=page.list_complete?undefined:page.cursor;
      }while(cursor);
      codes.sort((a,b)=>(b.createdAt||"").localeCompare(a.createdAt||""));
      return json({ok:true,codes},200,H);
    }
    return json({error:"Not found"},404,H);
  }

  const missingCodes=bindingError(env,"CODES");
  if(missingCodes)return json({error:"兌換碼服務尚未完成設定，請聯絡三寶爸。"},503,H);

  if(path==="/verify"){
    const result=await loadCode(env,body.code);
    if(result.err)return json({error:result.err},result.status,H);
    return json({ok:true,code:result.rec.code,remaining:Math.max(0,result.rec.limit-result.rec.used),limit:result.rec.limit,expiresAt:result.rec.expiresAt},200,H);
  }

  if(path==="/check"){
    const missingGemini=bindingError(env,"GEMINI_KEY");
    if(missingGemini)return json({error:"AI 分析服務尚未完成設定，請聯絡三寶爸。"},503,H);
    const result=await loadCode(env,body.code);
    if(result.err)return json({error:result.err},result.status,H);
    const record=result.rec;
    if(record.used>=record.limit)return json({error:`這組碼的 ${record.limit} 次已用完，請跟三寶爸再要一組。`,remaining:0},429,H);
    const text=String(body.text||"").slice(0,6000),image=body.image,mime=body.mime||"image/jpeg";
    if(!text&&!image)return json({error:"沒有收到內容。"},400,H);
    const parts=[];
    if(text&&image)parts.push({text:`使用者收到的可疑內容如下，並附上一張截圖，請一起判讀：\n\n${text}`});
    else if(text)parts.push({text:`以下是使用者收到的可疑內容：\n\n${text}`});
    else parts.push({text:"使用者只提供了一張截圖，請先讀出圖中所有文字，再判斷是不是詐騙。"});
    if(image)parts.push({inline_data:{mime_type:mime,data:image}});

    record.used+=1;
    await env.CODES.put(kvKey(record.code),JSON.stringify(record));
    const remaining=Math.max(0,record.limit-record.used);
    const refund=async()=>{record.used=Math.max(0,record.used-1);await env.CODES.put(kvKey(record.code),JSON.stringify(record))};
    let response;
    try{
      response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${env.GEMINI_KEY}`,{
        method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
          system_instruction:{parts:[{text:SYSTEM}]},contents:[{role:"user",parts}],
          generationConfig:{temperature:.2,maxOutputTokens:1400,responseMimeType:"application/json"},
        }),
      });
    }catch{await refund();return json({error:"分析服務連線失敗，這次不扣次數，請再試一次。"},502,H)}
    if(!response.ok){await refund();return json({error:`分析服務回應異常（${response.status}），這次不扣次數。`},502,H)}
    const data=await response.json();
    const raw=data?.candidates?.[0]?.content?.parts?.map(part=>part.text||"").join("")||"";
    let output;
    try{output=JSON.parse(raw.replace(/```json|```/g,"").trim())}catch{await refund();return json({error:"分析結果讀取失敗，這次不扣次數，請重送一次。"},502,H)}
    await recordMetric(env,{event:"ai_check",page:"/fraud-lab/"});
    return json({
      score:Math.max(0,Math.min(100,parseInt(output.score,10)||0)),type:output.type||"未分類",
      readout:output.readout||"",summary:output.summary||"",redFlags:Array.isArray(output.redFlags)?output.redFlags.slice(0,8):[],
      goal:output.goal||"",actions:Array.isArray(output.actions)?output.actions.slice(0,5):[],remaining,
    },200,H);
  }
  return json({error:"Not found"},404,H);
}
