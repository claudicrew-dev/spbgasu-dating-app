import { ApiError } from './auth.mjs';
export function validateJpeg(bytes){
 if(bytes.length<100||bytes.length>900000||bytes[0]!==0xff||bytes[1]!==0xd8||bytes.at(-2)!==0xff||bytes.at(-1)!==0xd9)throw new ApiError(400,'Фото повреждено или превышает 900 КБ');
 let offset=2,dimensions=null;
 while(offset<bytes.length-2){
  if(bytes[offset++]!==0xff)break;
  while(bytes[offset]===0xff)offset++;
  const marker=bytes[offset++];if(marker===0xd9)break;if(marker===0x01||(marker>=0xd0&&marker<=0xd7))continue;
  if(offset+2>bytes.length)break;const length=bytes.readUInt16BE(offset);if(length<2||offset+length>bytes.length)break;
  if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)){if(length<8)break;const height=bytes.readUInt16BE(offset+3),width=bytes.readUInt16BE(offset+5);if(!width||!height||width>4000||height>4000||width*height>16000000)throw new ApiError(400,'Фото слишком большое по размеру изображения');dimensions={width,height};}
  if(marker===0xda&&dimensions)return dimensions;
  offset+=length;
 }
 throw new ApiError(400,'Не удалось распознать JPEG-фото');
}
