import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { transaction, openDatabase } from './database.mjs';
import { Service, catalog } from './service.mjs';
import { ApiError,validateInitData,newToken,hashToken,cookieToken,safeEqual } from './auth.mjs';
import { handleUpdate,startOutboxWorker } from './bot.mjs';
const root=new URL('../',import.meta.url);
const STATIC={'/':['index.html','text/html; charset=utf-8'],'/index.html':['index.html','text/html; charset=utf-8'],'/style.css':['style.css','text/css; charset=utf-8'],'/script.js':['script.js','text/javascript; charset=utf-8'],'/logo.PNG':['logo.PNG','image/png'],'/privacy':['privacy.html','text/html; charset=utf-8']};
function json(res,status,obj){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(obj));}
async function body(req,limit=30000){if(!req.headers['content-type']?.startsWith('application/json'))throw new ApiError(415,'Ожидается JSON');let length=0;const chunks=[];await new Promise((resolve,reject)=>{let failed=false;req.on('data',chunk=>{length+=chunk.length;if(length>limit){if(!failed){failed=true;reject(new ApiError(413,'Запрос слишком большой'));}return;}chunks.push(chunk);});req.on('end',()=>{if(!failed)resolve();});req.on('error',()=>reject(new ApiError(400,'Запрос прерван')));});try{const parsed=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error();return parsed;}catch{throw new ApiError(400,'Некорректный JSON');}}
class Limits {constructor(){this.map=new Map();}take(key,max=120,window=60000){const time=Date.now();let slot=this.map.get(key);if(!slot||slot.until<=time){slot={n:0,until:time+window};this.map.set(key,slot);}slot.n++;if(this.map.size>20000)for(const[k,v]of this.map)if(v.until<=time)this.map.delete(k);if(slot.n>max)throw new ApiError(429,'Слишком много запросов. Попробуйте чуть позже');}}
export function createApp(config,{db=openDatabase(config.dbPath),botWorker=true,botCall}={}){
 const streams=new Map(),limits=new Limits();
 const publish=(id,type,data={})=>{for(const res of streams.get(id)||[])if(!res.destroyed)res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);};
 const service=new Service(db,config,publish);
 const session=req=>{const bearer=req.headers.authorization?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];const token=bearer||cookieToken(req);if(!token)throw new ApiError(401,'Откройте приложение заново из Telegram');const row=service.get('SELECT * FROM sessions WHERE token_hash=? AND expires_at>?',hashToken(token),Date.now());if(!row)throw new ApiError(401,'Сессия истекла. Откройте приложение заново');service.user(row.user_id);return row;};
 const cookie=(res,token,age)=>res.setHeader('Set-Cookie',`gasu_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${age}${config.production?'; Secure':''}`);
 const checkOrigin=req=>{if(req.headers.origin!==config.publicUrl)throw new ApiError(403,'Запрос с другого сайта запрещён');};
 const server=createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Cache-Control','no-store');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' https://telegram.org; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors https://web.telegram.org https://*.telegram.org; base-uri 'none'; form-action 'self'; object-src 'none'");
  const requestId=randomUUID();res.setHeader('X-Request-ID',requestId);
  try{
   const url=new URL(req.url,config.publicUrl),path=url.pathname,method=req.method;
   if(method==='GET'&&path==='/health'){service.get('SELECT 1');return json(res,200,{ok:true});}
   if(method==='GET'&&STATIC[path]){const[file,mime]=STATIC[path];res.setHeader('Content-Type',mime);if(file==='logo.PNG')res.setHeader('Cache-Control','public,max-age=86400');return res.end(readFileSync(new URL(file,root)));}
   if(method==='POST'&&path==='/telegram/webhook'){
    if(!safeEqual(req.headers['x-telegram-bot-api-secret-token'],config.webhookSecret))throw new ApiError(403,'Доступ запрещён');
    const data=await body(req,100000);handleUpdate(service,data);return json(res,200,{ok:true});
   }
   if(!path.startsWith('/api/'))throw new ApiError(404,'Не найдено');
   if(method!=='GET')checkOrigin(req);
   if(method==='POST'&&path==='/api/auth/telegram'){
    limits.take(`auth:${req.socket.remoteAddress}`,180);
    const data=await body(req,20000),tg=validateInitData(data.initData,config.botToken,config.initDataTTL);
    limits.take(`auth-user:${tg.id}`,20);
    const u=service.register(tg);
    if(tg.allows_write_to_pm===true)service.run('UPDATE users SET bot_chat_id=? WHERE id=?',String(tg.id),u.id);
    const token=newToken(),date=Date.now();service.run('INSERT INTO sessions VALUES(?,?,?)',hashToken(token),u.id,date+config.sessionTTL*1000);service.run('DELETE FROM sessions WHERE expires_at<?',date);
    // Keep the latest sessions for multi-device use; expired or revoked cookies cannot access APIs.
    service.run('DELETE FROM sessions WHERE user_id=? AND token_hash NOT IN (SELECT token_hash FROM sessions WHERE user_id=? ORDER BY expires_at DESC LIMIT 10)',u.id,u.id);
    cookie(res,token,config.sessionTTL);return json(res,200,{ok:true,telegramName:u.telegram_name,sessionToken:token});
   }
   const s=session(req),id=s.user_id;limits.take(`api:${id}`,360);
   if(method==='GET'&&path==='/api/catalog')return json(res,200,{...catalog,botUsername:config.botUsername,contactUrl:config.contactUrl,ownTelegramId:service.user(id).telegram_id,isAdmin:config.adminTelegramIds.includes(service.user(id).telegram_id)});
   if(method==='GET'&&path==='/api/state')return json(res,200,service.snapshot(id));
   if(method==='GET'&&path==='/api/search')return json(res,200,{people:service.search(id,url.searchParams.get('q')||'')});
   if(method==='GET'&&path==='/api/feed')return json(res,200,{people:service.feed(id,url.searchParams.get('gender')||'all',url.searchParams.get('faculty')||'all')});
   if(method==='GET'&&path==='/api/events'){
    const group=streams.get(id)||new Set();if(group.size>=3){const old=group.values().next().value;old.end();group.delete(old);}group.add(res);streams.set(id,group);
    res.writeHead(200,{'Content-Type':'text/event-stream','Connection':'keep-alive','X-Accel-Buffering':'no'});res.write('event: connected\ndata: {}\n\n');res.setTimeout(0);
    const interval=setInterval(()=>{if(s.expires_at<=Date.now()||!service.get('SELECT 1 FROM sessions ss JOIN users u ON u.id=ss.user_id WHERE ss.token_hash=? AND u.banned=0',s.token_hash)){res.write('event: expired\ndata: {}\n\n');res.end();}else res.write(': heartbeat\n\n');},25000);interval.unref();res.on('close',()=>{clearInterval(interval);group.delete(res);if(!group.size)streams.delete(id);});return;
   }
   let match;
   if(method==='GET'&&(match=path.match(/^\/api\/photos\/([a-f0-9-]{36})$/))){const p=service.photo(match[1],id);res.setHeader('Content-Type',p.mime);res.setHeader('Content-Length',p.data.length);return res.end(Buffer.from(p.data));}
   if(method==='POST'&&path==='/api/photos'){limits.take(`photos:${id}`,20,3600000);const data=await body(req,1300000);return json(res,201,service.uploadPhoto(id,data.photo));}
   if(method==='PUT'&&path==='/api/profile'){const data=await body(req);return json(res,200,service.updateProfile(id,data));}
   if(method==='GET'&&(match=path.match(/^\/api\/people\/([a-f0-9-]{36})$/)))return json(res,200,{person:service.profile(match[1],id)});
   if(method==='POST'&&path==='/api/skips/reset'){service.run('DELETE FROM skips WHERE source=?',id);return json(res,200,{ok:true});}
   if((match=path.match(/^\/api\/people\/([a-f0-9-]{36})\/(like|skip|follow|block|report)$/))){const target=match[1],action=match[2];if(method==='POST'){limits.take(`action:${id}`,100);if(action==='like')return json(res,200,service.like(id,target));if(action==='skip')return json(res,200,service.skip(id,target));if(action==='follow')return json(res,200,service.follow(id,target,true));if(action==='block')return json(res,200,service.block(id,target));if(action==='report'){const data=await body(req,3800000);return json(res,201,service.report(id,target,data.reason,data.category,data.screenshots));}}if(method==='DELETE'&&action==='follow')return json(res,200,service.follow(id,target,false));if(method==='DELETE'&&action==='block')return json(res,200,service.unblock(id,target));}
   if(method==='GET'&&path==='/api/blocks')return json(res,200,{people:service.blockedList(id)});
   if((match=path.match(/^\/api\/chats\/([a-f0-9-]{36})\/messages$/))){const target=match[1];if(method==='GET'){const before=url.searchParams.get('before');if(before&&!/^\d+$/.test(before))throw new ApiError(400,'Неверный номер сообщения');return json(res,200,{messages:service.chatMessages(id,target,before?Number(before):null)});}if(method==='POST'){limits.take(`messages:${id}`,45);const data=await body(req,16000);return json(res,201,service.sendMessage(id,target,data.text,data.clientId));}}
   if(method==='POST'&&(match=path.match(/^\/api\/chats\/([a-f0-9-]{36})\/read$/))){const data=await body(req);return json(res,200,service.readChat(id,match[1],data.lastId));}
   if(method==='POST'&&path==='/api/notifications/read'){const data=await body(req);return json(res,200,service.readNotifications(id,data.maxId));}
   if(method==='PUT'&&path==='/api/settings'){const data=await body(req);return json(res,200,service.settings(id,data));}
   if(method==='DELETE'&&path==='/api/account'){service.deleteUser(id);cookie(res,'',0);return json(res,200,{ok:true});}
   if(path.startsWith('/api/admin/')){
    if(!config.adminTelegramIds.includes(service.user(id).telegram_id))throw new ApiError(403,'Доступ администратора не предоставлен');
    if(method==='GET'&&path==='/api/admin/users'){const q=(url.searchParams.get('q')||'').toLowerCase();const offset=Number(url.searchParams.get('offset')||0);if(!Number.isSafeInteger(offset)||offset<0)throw new ApiError(400,'Неверная страница');const users=service.all('SELECT * FROM users ORDER BY created_at DESC').filter(u=>[u.name,u.telegram_id].some(v=>String(v||'').toLowerCase().includes(q)));return json(res,200,{total:users.length,users:users.slice(offset,offset+50).map(u=>({...service.publicProfile(u),telegramId:u.telegram_id,banned:!!u.banned,visible:!!u.visible}))});}
    if(method==='GET'&&(match=path.match(/^\/api\/admin\/evidence\/([a-f0-9-]{36})$/))){const p=service.get('SELECT * FROM report_evidence WHERE id=?',match[1]);if(!p)throw new ApiError(404,'Не найдено');res.setHeader('Content-Type',p.mime);return res.end(Buffer.from(p.data));}
    if(method==='GET'&&path==='/api/admin/reports')return json(res,200,{reports:service.all('SELECT r.*,u.name AS target_name,u.telegram_id AS target_telegram_id,u.banned AS target_banned FROM reports r LEFT JOIN users u ON u.id=r.target ORDER BY r.id DESC LIMIT 200').map(r=>({...r,evidence:service.all('SELECT id FROM report_evidence WHERE report_id=?',r.id)}))});
    if(method==='POST'&&path==='/api/admin/ban'){const data=await body(req);if(typeof data.banned!=='boolean')throw new ApiError(400,'Неверное значение');const u=service.get('SELECT * FROM users WHERE id=?',data.userId);if(!u)throw new ApiError(404,'Пользователь не найден');if(config.adminTelegramIds.includes(u.telegram_id))throw new ApiError(400,'Нельзя заблокировать администратора');service.run('UPDATE users SET banned=? WHERE id=?',Number(data.banned),u.id);service.run('DELETE FROM sessions WHERE user_id=?',u.id);publish(u.id,'deleted');return json(res,200,{ok:true});}
    if(method==='POST'&&path==='/api/admin/reports/resolve'){const data=await body(req);if(!Number.isSafeInteger(data.reportId))throw new ApiError(400,'Неверная жалоба');const status=data.status||'approved';if(!['reviewing','approved','rejected'].includes(status)||typeof (data.note||'')!=='string'||(data.note||'').length>1000)throw new ApiError(400,'Неверное решение');if(!service.get('SELECT 1 FROM reports WHERE id=?',data.reportId))throw new ApiError(404,'Жалоба не найдена');transaction(db,()=>{service.run('UPDATE reports SET status=?,reviewed_by=?,review_note=?,updated_at=? WHERE id=?',status,id,data.note||'',Date.now(),data.reportId);service.run('INSERT INTO moderation_log(admin_id,action,target,created_at) VALUES(?,?,?,?)',id,status,String(data.reportId),Date.now());});return json(res,200,{ok:true});}
   }
   throw new ApiError(404,'Не найдено');
  }catch(e){if(res.headersSent){res.end();return;}if(!(e instanceof ApiError))console.error(`Ошибка сервера ${requestId}`);json(res,e.status||500,{error:e instanceof ApiError?e.message:'Ошибка сервера. Попробуйте позже',requestId});}
 });
 server.requestTimeout=20000;server.headersTimeout=15000;server.maxRequestsPerSocket=1000;
 const worker=botWorker?startOutboxWorker(service,botCall):null;
 const cleanup=setInterval(()=>{service.run('DELETE FROM sessions WHERE expires_at<?',Date.now());service.run('DELETE FROM bot_updates WHERE created_at<?',Date.now()-30*86400000);service.run('DELETE FROM photos WHERE created_at<? AND id NOT IN(SELECT photo_id FROM users WHERE photo_id IS NOT NULL)',Date.now()-86400000);},3600000);cleanup.unref();
 return{server,service,db,publish,close:async()=>{worker?.stop();clearInterval(cleanup);for(const group of streams.values())for(const res of group)res.end();await new Promise(resolve=>server.close(resolve));db.close();}};
}
