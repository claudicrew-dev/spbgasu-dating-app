import { createHmac, timingSafeEqual, createHash, randomBytes } from 'node:crypto';
export class ApiError extends Error {constructor(status,message){super(message);this.status=status;}}
export function validateInitData(raw,botToken,maxAge=3600,now=Math.floor(Date.now()/1000)) {
 if(typeof raw!=='string'||raw.length>16384)throw new ApiError(401,'Откройте приложение из Telegram');
 const params=new URLSearchParams(raw),keys=[...params.keys()];
 if(new Set(keys).size!==keys.length)throw new ApiError(401,'Некорректные данные Telegram');
 const hash=params.get('hash');
 if(!/^[a-f0-9]{64}$/i.test(hash||''))throw new ApiError(401,'Некорректная подпись Telegram');
 params.delete('hash');
 const check=[...params].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>`${k}=${v}`).join('\n');
 const key=createHmac('sha256','WebAppData').update(botToken).digest();
 const expected=createHmac('sha256',key).update(check).digest();
 if(!timingSafeEqual(expected,Buffer.from(hash,'hex')))throw new ApiError(401,'Подпись Telegram не подтверждена');
 const date=Number(params.get('auth_date'));
 if(!Number.isInteger(date)||date>now+30||now-date>maxAge)throw new ApiError(401,'Сессия Telegram устарела. Закройте и откройте приложение заново');
 let user;try{user=JSON.parse(params.get('user')||'null');}catch{}
 if(!user||!Number.isSafeInteger(user.id)||user.id<=0||user.is_bot)throw new ApiError(401,'Пользователь Telegram не определён');
 return user;
}
export const hashToken=token=>createHash('sha256').update(token).digest('hex');
export const newToken=()=>randomBytes(32).toString('base64url');
export function safeEqual(a,b){if(typeof a!=='string'||typeof b!=='string')return false;const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);}
export function cookieToken(req){const cookie=req.headers.cookie||'';return cookie.split(';').map(x=>x.trim()).find(x=>x.startsWith('gasu_session='))?.slice(13)||'';}
