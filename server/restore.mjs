import {DatabaseSync,backup} from 'node:sqlite';
import {mkdirSync,existsSync,unlinkSync,renameSync,chmodSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
const source=process.argv[2];if(!source)throw new Error('Укажите путь к резервной копии. Приложение и процесс backup должны быть остановлены.');
const target=resolve(process.env.DB_PATH||'data/app.sqlite');if(resolve(source)===target)throw new Error('Исходный файл совпадает с действующей базой');
mkdirSync(dirname(target),{recursive:true,mode:0o700});
const input=new DatabaseSync(resolve(source),{readOnly:true});const temp=target+'.restoring';
try{
 if(input.prepare('PRAGMA integrity_check').get().integrity_check!=='ok'||input.prepare('PRAGMA user_version').get().user_version!==1&&input.prepare('PRAGMA user_version').get().user_version!==2)throw new Error('Копия повреждена или имеет неподдерживаемую версию');
 if(existsSync(target)){const current=new DatabaseSync(target,{readOnly:true});try{const dir=resolve(process.env.BACKUP_DIR||'data/backups');mkdirSync(dir,{recursive:true,mode:0o700});await backup(current,join(dir,`pre-restore-${Date.now()}.sqlite`));}finally{current.close();}}
 if(existsSync(temp))unlinkSync(temp);await backup(input,temp);chmodSync(temp,0o600);
 for(const suffix of ['-wal','-shm'])if(existsSync(target+suffix))unlinkSync(target+suffix);
 renameSync(temp,target);console.log('База восстановлена. Можно запускать приложение.');
}finally{input.close();}
