import {access,mkdir,writeFile,rename,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {discordImageUrl,discordImageType,discordNewsImageLimit} from '../shared/discord-news.mjs';

// Runs only inside the existing channel sync. Public Discord attachments are
// archived locally so signed CDN URLs cannot expire in older website posts.
export function cacheDiscordNewsImage(messageId,post,options={}){
 if(!post.image)return Promise.resolve(null);
 return cacheDiscordAttachment(messageId,{url:post.image,attachmentId:post.imageAttachmentId,extension:post.imageExtension},options);
}
// Additional website-only images use the same archive naming and checks.
export async function cacheDiscordAttachment(messageId,{url,attachmentId,extension},{root=process.cwd(),transport=fetch}={}){
 if(!/^\d{17,22}$/.test(String(messageId))||!/^\d{17,22}$/.test(attachmentId)||!['jpg','png','webp','gif'].includes(extension)||!discordImageUrl(url))throw Error('Ungültiger Discord-Bildanhang.');
 const directory=join(root,'assets/img/news'),name=`discord-${messageId}-${attachmentId}.${extension}`,file=join(directory,name),relative='assets/img/news/'+name;
 try{await access(file);return relative;}catch{}
 let response;try{response=await transport(url,{redirect:'error',signal:AbortSignal.timeout(15000)});}catch{throw Error('Discord-Titelbild konnte nicht heruntergeladen werden.');}
 if(!response.ok||Number(response.headers.get('Content-Length'))>discordNewsImageLimit)throw Error('Discord-Titelbild nicht erreichbar oder zu gross.');
 const reader=response.body?.getReader();if(!reader)throw Error('Discord-Titelbild fehlt.');
 let size=0;const chunks=[];
 for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>discordNewsImageLimit){await reader.cancel();throw Error('Discord-Titelbild zu gross.');}chunks.push(value);}
 const bytes=Buffer.concat(chunks),kind=discordImageType(bytes);
 if(!kind||kind.extension!==extension)throw Error('Ungültiger Discord-Bildinhalt.');
 await mkdir(directory,{recursive:true});const temporary=file+'.tmp';
 try{await writeFile(temporary,bytes);await rename(temporary,file);}catch{await unlink(temporary).catch(()=>{});throw Error('Discord-Titelbild konnte nicht gespeichert werden.');}
 return relative;
}
