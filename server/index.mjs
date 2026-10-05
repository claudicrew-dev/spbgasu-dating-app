import { readFileSync } from 'node:fs';
import { loadConfig } from './config.mjs';
import { createApp } from './app.mjs';
let app;
try{const config=loadConfig();if(process.env.RENDER){const mount=process.env.PERSISTENT_DATA_DIR||'/app/data';if(!config.dbPath.startsWith(mount+'/'))throw new Error('DB_PATH должен находиться на постоянном диске '+mount);const mounts=readFileSync('/proc/self/mountinfo','utf8').split('\n');if(!mounts.some(line=>line.split(' ')[4]===mount))throw new Error('Постоянный диск Render не подключён к '+mount+'. Подключите Disk перед запуском, иначе данные будут теряться.');}app=createApp(config);app.server.listen(config.port,config.host,()=>console.log(`СПБГАСУ Знакомства: сервер запущен на порту ${config.port}`));}catch(e){console.error(e.message);process.exit(1);}
for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{const timeout=setTimeout(()=>process.exit(1),10000);timeout.unref();app.close().then(()=>process.exit(0));});
