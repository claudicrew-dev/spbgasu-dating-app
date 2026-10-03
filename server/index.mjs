import { loadConfig } from './config.mjs';
import { createApp } from './app.mjs';
let app;
try{const config=loadConfig();app=createApp(config);app.server.listen(config.port,config.host,()=>console.log(`СПБГАСУ Знакомства: сервер запущен на порту ${config.port}`));}catch(e){console.error(e.message);process.exit(1);}
for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{const timeout=setTimeout(()=>process.exit(1),10000);timeout.unref();app.close().then(()=>process.exit(0));});
