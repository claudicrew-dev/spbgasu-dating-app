import { DatabaseSync } from 'node:sqlite';
import { mkdirSync,chmodSync } from 'node:fs';
import { dirname } from 'node:path';
export function openDatabase(path) {
 if(path!==':memory:')mkdirSync(dirname(path),{recursive:true,mode:0o700});
 const db=new DatabaseSync(path);
 if(path!==':memory:')chmodSync(path,0o600);
 db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL;');
 const version=db.prepare('PRAGMA user_version').get().user_version;
 if(version>1)throw new Error('Версия базы новее сервера');
 if(version===0)db.exec(`BEGIN IMMEDIATE;
 CREATE TABLE users (
  id TEXT PRIMARY KEY, telegram_id TEXT NOT NULL UNIQUE, telegram_name TEXT NOT NULL DEFAULT '', username TEXT NOT NULL DEFAULT '',
  bot_chat_id TEXT, push_enabled INTEGER NOT NULL DEFAULT 1 CHECK(push_enabled IN(0,1)), banned INTEGER NOT NULL DEFAULT 0,
  visible INTEGER NOT NULL DEFAULT 1, name TEXT, gender TEXT CHECK(gender IN('man','woman')), age INTEGER CHECK(age BETWEEN 18 AND 100),
  course TEXT, faculty TEXT, direction TEXT, about TEXT, photo_id TEXT, consent_at INTEGER,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
 );
 CREATE TABLE sessions (token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires_at INTEGER NOT NULL);
 CREATE INDEX sessions_user ON sessions(user_id);
 CREATE TABLE photos (id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,mime TEXT NOT NULL,data BLOB NOT NULL,created_at INTEGER NOT NULL);
 CREATE TABLE likes(source TEXT REFERENCES users(id) ON DELETE CASCADE,target TEXT REFERENCES users(id) ON DELETE CASCADE,created_at INTEGER NOT NULL,PRIMARY KEY(source,target),CHECK(source<>target));
 CREATE INDEX likes_target ON likes(target);
 CREATE TABLE skips(source TEXT REFERENCES users(id) ON DELETE CASCADE,target TEXT REFERENCES users(id) ON DELETE CASCADE,PRIMARY KEY(source,target),CHECK(source<>target));
 CREATE TABLE follows(source TEXT REFERENCES users(id) ON DELETE CASCADE,target TEXT REFERENCES users(id) ON DELETE CASCADE,created_at INTEGER NOT NULL,PRIMARY KEY(source,target),CHECK(source<>target));
 CREATE INDEX follows_target ON follows(target);
 CREATE TABLE matches(id TEXT PRIMARY KEY,user_a TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,user_b TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,created_at INTEGER NOT NULL,UNIQUE(user_a,user_b),CHECK(user_a<user_b));
 CREATE INDEX matches_a ON matches(user_a); CREATE INDEX matches_b ON matches(user_b);
 CREATE TABLE messages(id INTEGER PRIMARY KEY AUTOINCREMENT,match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,sender TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,client_id TEXT NOT NULL,text TEXT NOT NULL CHECK(length(text) BETWEEN 1 AND 2000),created_at INTEGER NOT NULL,UNIQUE(match_id,sender,client_id));
 CREATE INDEX messages_match ON messages(match_id,id);
 CREATE TABLE chat_reads(match_id TEXT REFERENCES matches(id) ON DELETE CASCADE,user_id TEXT REFERENCES users(id) ON DELETE CASCADE,last_id INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(match_id,user_id));
 CREATE TABLE notifications(id INTEGER PRIMARY KEY AUTOINCREMENT,target TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,actor TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,type TEXT NOT NULL,text TEXT NOT NULL,created_at INTEGER NOT NULL,is_read INTEGER NOT NULL DEFAULT 0);
 CREATE INDEX notifications_target ON notifications(target,id);
 CREATE TABLE blocks(source TEXT REFERENCES users(id) ON DELETE CASCADE,target TEXT REFERENCES users(id) ON DELETE CASCADE,created_at INTEGER NOT NULL,PRIMARY KEY(source,target),CHECK(source<>target));
 CREATE TABLE reports(id INTEGER PRIMARY KEY AUTOINCREMENT,source TEXT REFERENCES users(id) ON DELETE SET NULL,target TEXT REFERENCES users(id) ON DELETE SET NULL,reason TEXT NOT NULL,created_at INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'open');
 CREATE TABLE bot_updates(id INTEGER PRIMARY KEY,created_at INTEGER NOT NULL);
 CREATE TABLE outbox(id INTEGER PRIMARY KEY AUTOINCREMENT,target TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,actor TEXT REFERENCES users(id) ON DELETE CASCADE,text TEXT NOT NULL,event TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,next_at INTEGER NOT NULL,created_at INTEGER NOT NULL);
 CREATE INDEX outbox_due ON outbox(next_at);
 PRAGMA user_version=1; COMMIT;`);
 return db;
}
export function transaction(db,fn){db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}}
