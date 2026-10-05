import { resolve } from 'node:path';
export function loadConfig(env=process.env) {
 const production=env.APP_ENV!=='development';
 const botToken=env.BOT_TOKEN||'';
 if(!/^\d+:[A-Za-z0-9_-]{20,}$/.test(botToken))throw new Error('Укажите BOT_TOKEN в серверном .env');
 const url=new URL(env.PUBLIC_URL||env.RENDER_EXTERNAL_URL||'http://localhost:3000');
 if(production&&url.protocol!=='https:')throw new Error('PUBLIC_URL должен использовать HTTPS');
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw new Error('PUBLIC_URL должен быть адресом корня приложения');
 const webhookSecret=env.WEBHOOK_SECRET||'';
 if(!/^[A-Za-z0-9_-]{32,128}$/.test(webhookSecret))throw new Error('WEBHOOK_SECRET: 32–128 случайных символов A-Z, a-z, 0-9, _ или -');
 const botUsername=(env.BOT_USERNAME||'gasulvbot').replace(/^@/,'');
 if(!/^[A-Za-z0-9_]{5,32}$/.test(botUsername))throw new Error('Неверный BOT_USERNAME');
 const port=Number(env.PORT||3000);if(!Number.isInteger(port)||port<1||port>65535)throw new Error('PORT должен быть числом от 1 до 65535');
 const adminTelegramIds=(['8042926236','1158925348','890336573',env.ADMIN_TELEGRAM_IDS||''].join(',')).split(',').map(x=>x.trim()).filter(Boolean);if(!adminTelegramIds.every(x=>/^\d+$/.test(x)))throw new Error('ADMIN_TELEGRAM_IDS должен содержать числовые Telegram ID через запятую');
 const contactUrl=env.CONTACT_URL||`https://t.me/${botUsername}`;if(new URL(contactUrl).protocol!=='https:')throw new Error('CONTACT_URL должен использовать HTTPS');
 return {production,botToken,botUsername,webhookSecret,publicUrl:url.origin,port,host:env.HOST||'0.0.0.0',dbPath:resolve(env.DB_PATH||'data/app.sqlite'),sessionTTL:86400*7,initDataTTL:3600,adminTelegramIds,contactUrl};
}
