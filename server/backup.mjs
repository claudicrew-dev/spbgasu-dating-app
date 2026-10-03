import { DatabaseSync,backup } from 'node:sqlite';
import { mkdirSync,readdirSync,unlinkSync,chmodSync } from 'node:fs';
import { resolve,join } from 'node:path';
const dir=resolve(process.env.BACKUP_DIR||'data/backups');mkdirSync(dir,{recursive:true,mode:0o700});
const file=join(dir,`gasulv-${new Date().toISOString().replace(/[:.]/g,'-')}.sqlite`);
const db=new DatabaseSync(resolve(process.env.DB_PATH||'data/app.sqlite'),{readOnly:true});
try{await backup(db,file);chmodSync(file,0o600);const verify=new DatabaseSync(file,{readOnly:true});try{const result=verify.prepare('PRAGMA integrity_check').get();if(result.integrity_check!=='ok')throw new Error('Резервная копия не прошла проверку');}finally{verify.close();}
 const files=readdirSync(dir).filter(x=>/^gasulv-.*\.sqlite$/.test(x)).sort().reverse();for(const old of files.slice(7))unlinkSync(join(dir,old));console.log(`Резервная копия готова: ${file}`);
}finally{db.close();}
