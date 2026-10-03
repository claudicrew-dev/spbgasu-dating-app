import { loadConfig } from './config.mjs';
import { telegramCall } from './bot.mjs';
try{
 const config=loadConfig();const me=await telegramCall(config,'getMe');
 if(me.username?.toLowerCase()!==config.botUsername.toLowerCase())throw new Error(`Токен принадлежит @${me.username}, ожидается @${config.botUsername}`);
 if(process.argv.includes('--check')){const info=await telegramCall(config,'getWebhookInfo');const button=await telegramCall(config,'getChatMenuButton');console.log(JSON.stringify({bot:`@${me.username}`,webhook:info.url,pendingUpdates:info.pending_update_count,lastError:info.last_error_message||null,menu:button},null,2));}
 else{
  const health=await fetch(`${config.publicUrl}/health`,{signal:AbortSignal.timeout(10000)});if(!health.ok||(await health.json()).ok!==true)throw new Error('Сначала запустите сервер и проверьте HTTPS-адрес /health');
  await telegramCall(config,'setChatMenuButton',{menu_button:{type:'web_app',text:'Знакомства ♥',web_app:{url:config.publicUrl}}});
  await telegramCall(config,'setMyCommands',{commands:[{command:'start',description:'Открыть знакомства СПБГАСУ'},{command:'help',description:'Как пользоваться приложением'},{command:'stop',description:'Отключить уведомления'},{command:'id',description:'Узнать свой Telegram ID'}]});
  await telegramCall(config,'setWebhook',{url:`${config.publicUrl}/telegram/webhook`,secret_token:config.webhookSecret,allowed_updates:['message'],max_connections:10});
  console.log(`Кнопка меню и webhook @${me.username} настроены. Отправьте боту /start. Main Mini App дополнительно включите в @BotFather.`);
 }
}catch(e){console.error(e.message);process.exit(1);}
