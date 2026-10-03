import test from 'node:test';
import assert from 'node:assert/strict';
import {loadConfig} from '../server/config.mjs';
test('Render URL используется для Origin и настройки бота, явный URL имеет приоритет',()=>{
 const env={BOT_TOKEN:'123456:'+ 'a'.repeat(30),WEBHOOK_SECRET:'a'.repeat(64),RENDER_EXTERNAL_URL:'https://example.onrender.com',DB_PATH:'data/test.sqlite'};
 assert.equal(loadConfig(env).publicUrl,'https://example.onrender.com');
 assert.equal(loadConfig({...env,PUBLIC_URL:'https://dating.example.org'}).publicUrl,'https://dating.example.org');
});
