import { transaction } from './database.mjs';
import { ApiError } from './auth.mjs';
export async function telegramCall(config,method,body={}) {
 let result;
 try {const response=await fetch(`https://api.telegram.org/bot${config.botToken}/${method}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(12000)});result=await response.json();}catch{throw new ApiError(502,'Telegram временно недоступен');}
 if(!result.ok){const e=new ApiError(502,'Telegram не принял запрос');e.telegramCode=result.error_code;e.retryAfter=result.parameters?.retry_after;throw e;}
 return result.result;
}
export function handleUpdate(service,update){
 if(!Number.isSafeInteger(update.update_id))return;
 transaction(service.db,()=>{
  if(!service.run('INSERT OR IGNORE INTO bot_updates VALUES(?,?)',update.update_id,Date.now()).changes)return;
  const message=update.message;
  if(!message||message.chat?.type!=='private'||!message.from||message.from.is_bot)return;
  if(service.get('SELECT banned FROM users WHERE telegram_id=?',String(message.from.id))?.banned)return;
  const u=service.register(message.from);
  service.run('UPDATE users SET bot_chat_id=? WHERE id=?',String(message.chat.id),u.id);
  const command=String(message.text||'').split(/\s/)[0].split('@')[0];
  if(command==='/stop'){service.run('UPDATE users SET push_enabled=0 WHERE id=?',u.id);service.run('INSERT INTO outbox(target,text,event,next_at,created_at) VALUES(?,?,?,?,?)',u.id,'Уведомления отключены. Включить их можно в настройках приложения.','system',Date.now(),Date.now());}
  else if(command==='/id'){service.run('INSERT INTO outbox(target,text,event,next_at,created_at) VALUES(?,?,?,?,?)',u.id,`Ваш Telegram ID: ${message.from.id}`,'system',Date.now(),Date.now());}
  else if(command==='/start'||command==='/help'){if(command==='/start')service.run('UPDATE users SET push_enabled=1 WHERE id=?',u.id);service.run('INSERT INTO outbox(target,text,event,next_at,created_at) VALUES(?,?,?,?,?)',u.id,'Привет! Здесь знакомятся студенты СПБГАСУ. Заполните анкету, найдите взаимную симпатию и начните разговор.\n\nОткройте приложение кнопкой ниже. Только для пользователей 18+.\n/stop — отключить уведомления.','system',Date.now(),Date.now());}
 });
}
export function startOutboxWorker(service,call=telegramCall){let running=false;async function tick(){if(running)return;running=true;try{
 const rows=service.all('SELECT o.*,u.bot_chat_id,u.push_enabled,u.banned FROM outbox o JOIN users u ON u.id=o.target WHERE next_at<=? ORDER BY id LIMIT 15',Date.now());
 for(const row of rows){
  if(row.banned||!row.bot_chat_id||(row.event!=='system'&&!row.push_enabled)||(row.actor&&service.blocked(row.target,row.actor))){service.run('DELETE FROM outbox WHERE id=?',row.id);continue;}
  try {await call(service.config,'sendMessage',{chat_id:row.bot_chat_id,text:row.text,reply_markup:{inline_keyboard:[[{text:'Открыть знакомства ♥',web_app:{url:service.config.publicUrl}}]]}});service.run('DELETE FROM outbox WHERE id=?',row.id);}
  catch(e){if(e.telegramCode===403){service.run('UPDATE users SET push_enabled=0,bot_chat_id=NULL WHERE id=?',row.target);service.run('DELETE FROM outbox WHERE target=?',row.target);}else if(row.attempts>=9){service.run('DELETE FROM outbox WHERE id=?',row.id);console.error('Уведомление не доставлено после 10 попыток');}else{const delay=Math.max((e.retryAfter||0)*1000,Math.min(3600000,2000*2**row.attempts));service.run('UPDATE outbox SET attempts=attempts+1,next_at=? WHERE id=?',Date.now()+delay,row.id);if(e.telegramCode===429)break;}}
 }
 }catch{console.error('Ошибка обработчика уведомлений');}finally{running=false;}}
 const interval=setInterval(tick,1500);interval.unref();return{stop:()=>clearInterval(interval),tick};
}
