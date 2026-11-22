import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker from '../worker/worker.js';
import {TestD1} from './helpers/d1.mjs';
import {parseStructuredDiscordNews,discordNewsFooter,discordTextLength} from '../shared/discord-news.mjs';
const said=data=>data.content??(function texts(items){return (items||[]).flatMap(c=>c.type===10?[c.content]:texts(c.components)).join('\n');})(data.components);
const withText=data=>(data&&typeof data==='object'&&(data.text=said(data)),data);
const actions=message=>message.components.findLast(c=>c.type===1);
const APP='111111111111111111',GUILD='222222222222222222',CHANNEL='333333333333333333',USER='444444444444444444',ROLE='555555555555555555',ATTACHMENT='666666666666666666',MESSAGE='777777777777777777';
const png=readFileSync(new URL('../assets/images/favicon.png',import.meta.url));
async function setup(){
 const pair=await crypto.subtle.generateKey('Ed25519',true,['sign','verify']);
 const hex=data=>Array.from(new Uint8Array(data),b=>b.toString(16).padStart(2,'0')).join('');
 const env={NEWS_DB:new TestD1(),DISCORD_PUBLIC_KEY:hex(await crypto.subtle.exportKey('raw',pair.publicKey)),DISCORD_APPLICATION_ID:APP,DISCORD_GUILD_ID:GUILD,DISCORD_CHANNEL_ID:CHANNEL,DISCORD_BOT_TOKEN:'fake-bot-secret',DISCORD_NEWS_ADMIN_ROLE_IDS:ROLE,SITE_ORIGIN:'https://site.example',ADMIN_PASSWORD:'fake-admin'};
 let serial=900000000000000000n;const context={jobs:[],waitUntil(p){this.jobs.push(p);}};
 async function request(payload,{timestamp=String(Math.floor(Date.now()/1000)),tamper=false}={}){
  const raw=JSON.stringify(payload),signature=hex(await crypto.subtle.sign('Ed25519',pair.privateKey,new TextEncoder().encode(timestamp+raw)));
  return worker.fetch(new Request('https://worker/discord/interactions',{method:'POST',headers:{'X-Signature-Timestamp':timestamp,'X-Signature-Ed25519':signature},body:raw+(tamper?' ': '')}),env,context);
 }
 async function send(type,data,extra={}){const result=await (await request({id:String(serial++),application_id:APP,guild_id:GUILD,member:{user:{id:USER},roles:[ROLE]},token:'fake-interaction-token',type,data,...(type===3?{message:{flags:64}}:{}),...extra})).json();withText(result.data);return result;}
 const command=()=>send(2,{name:'news',options:[{name:'erstellen',type:1}]});
 const upload=(index)=>String(BigInt(ATTACHMENT)+BigInt(index));
 const fields=(custom_id,values={},image=false,gallery=0)=>{
  const attachments={};
  const imageIds=image?[ATTACHMENT]:[],galleryIds=Array.from({length:gallery},(_,index)=>upload(index+1));
  for(const id of [...imageIds,...galleryIds])attachments[id]={id,url:`https://cdn.discordapp.com/ephemeral-attachments/${CHANNEL}/${id}/image.png?ex=test`,content_type:'image/png',size:png.length};
  return {custom_id,components:[{type:18,component:{type:4,custom_id:'title',value:values.title??'Ein neuer Beitrag'}},{type:18,component:{type:3,custom_id:'category',values:[values.category??'Update']}},{type:18,component:{type:4,custom_id:'content',value:values.content??'## Inhalt\n\n- Erster Punkt\n- Zweiter Punkt'}},{type:18,component:{type:19,custom_id:'image',values:imageIds}},{type:18,component:{type:19,custom_id:'gallery',values:galleryIds}}],resolved:{attachments}};
 };
 const submit=(modal,values,image=false,gallery=0)=>send(5,fields(modal.data.custom_id,values,image,gallery));
 const button=(preview,index)=>actions(preview.data).components[index].custom_id;
 const state=async id=>JSON.parse((await env.NEWS_DB.prepare('SELECT value FROM news_state WHERE key=?').bind('discord-editor:'+id).first()).value);
 async function flush(){await Promise.all(context.jobs);context.jobs=[];}
 return {env,context,request,send,command,fields,submit,button,state,flush};
}
function transport({memberRoles=[ROLE],wrongGuild=false,rejectOnce=false,uncertain=false}={}){
 const calls=[],messages=[],patches=[],dispatches=[];let rejects=rejectOnce;
 const fetcher=async (input,options={})=>{
  assert.equal(options.redirect,'manual','Cloudflare-compatible redirect mode; never forward credentials to redirects');
  const url=new URL(input);calls.push({url:url.href,method:options.method||'GET'});
  if(url.hostname==='cdn.discordapp.com')return new Response(png,{headers:{'Content-Type':'image/png'}});
  if(url.hostname==='api.github.com'){dispatches.push({path:url.pathname,body:JSON.parse(options.body),auth:options.headers.Authorization});return new Response(null,{status:204});}
  if(url.pathname==='/api/v10/oauth2/applications/@me')return Response.json({id:APP});
  if(url.pathname===`/api/v10/channels/${CHANNEL}`)return Response.json({id:CHANNEL,guild_id:wrongGuild?'999999999999999999':GUILD,type:0});
  if(url.pathname.includes('/members/'))return Response.json({user:{id:USER},roles:memberRoles});
  if(url.pathname.startsWith('/api/v10/webhooks/')){patches.push(withText(JSON.parse(options.body)));return Response.json({id:'reply'});}
  if(url.pathname===`/api/v10/channels/${CHANNEL}/messages`){
   messages.push(options);if(uncertain)throw Error('Ambiguous connection failure');
   if(rejects){rejects=false;return Response.json({message:'forbidden'},{status:403});}
   return Response.json({id:MESSAGE,channel_id:CHANNEL});
  }
  throw Error('Unexpected test URL: '+url.href);
 };
 return {fetcher,calls,messages,patches,dispatches};
}
test('raw Ed25519 signature, PING without website credentials, timestamp/body tampering, size and guild/user/role restrictions',async()=>{
 const s=await setup();try{
  assert.equal((await worker.fetch(new Request('https://worker/discord/interactions',{method:'POST',body:'{}'}),s.env,s.context)).status,401);
  assert.equal((await worker.fetch(new Request('https://worker/discord/interactions'),s.env,s.context)).status,405);
  assert.equal((await worker.fetch(new Request('https://worker/discord/interactions',{method:'POST',body:'x'.repeat(65537)}),s.env,s.context)).status,413);
  assert.deepEqual(await (await s.request({type:1})).json(),{type:1});
  assert.equal((await s.request({type:1},{tamper:true})).status,401);
  assert.equal((await s.request({type:1},{timestamp:'1000000000'})).status,401);
  const denied=await s.send(2,{name:'news',options:[{name:'erstellen',type:1}]},{member:{user:{id:USER},roles:[]}});assert.equal(denied.data.flags,64);assert.match(denied.data.text,/nicht freigeschaltet/);
  assert.match((await s.send(2,{name:'news'},{guild_id:'999999999999999999'})).data.text,/nicht freigeschaltet/);
  assert.match((await s.send(2,{name:'news'},{application_id:'999999999999999999'})).data.text,/nicht freigeschaltet/);
  s.env.DISCORD_NEWS_ADMIN_USER_IDS=USER;
  assert.equal((await s.send(2,{name:'news',options:[{name:'erstellen',type:1}]},{member:{user:{id:USER},roles:[]}})).type,9);
  await s.flush();
 }finally{s.env.NEWS_DB.db.close();}
});
test('five modal fields without excerpt, limits, full-width private preview, prefilling/editing, stale revisions, other owners, expiry and cancellation without posting',async()=>{
 const s=await setup();const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('No network expected');};try{
  const modal=await s.command();assert.equal(modal.type,9);assert.equal(modal.data.components.length,5);assert.ok(modal.data.components.every(c=>c.type===18));assert.deepEqual(modal.data.components.map(c=>c.component.type),[4,3,4,19,19]);assert.deepEqual(modal.data.components.map(c=>c.component.custom_id),['title','category','content','image','gallery']);
  assert.ok(modal.data.title.length<=45&&modal.data.components.every(c=>c.label.length<=45&&(c.description||'').length<=100&&(c.component.placeholder||'').length<=100),'Discord modal text limits');assert.equal(modal.data.components[4].component.max_values,6);
  assert.equal(modal.data.components[1].component.options.length,5);
  assert.match((await s.submit(modal,{title:'x'.repeat(161)})).data.text,/Titel/);
  assert.match((await s.submit(modal,{content:'x'.repeat(3501)})).data.text,/Inhalt: 1 bis 3500/);
  assert.match((await s.submit(modal,{category:'Unknown'})).data.text,/Kategorie/);
  const invalid=s.fields(modal.data.custom_id,{},true);invalid.resolved.attachments[ATTACHMENT].url='https://evil.example/image.png';assert.match((await s.send(5,invalid)).data.text,/gültiges/);
  const values={title:'T'.repeat(160),content:'C'.repeat(3500),category:'Info'};
  const preview=await s.submit(modal,values,true,2);assert.equal(preview.type,4);assert.equal(preview.data.flags,64|32768);assert.equal(preview.data.content,undefined);assert.equal(preview.data.embeds,undefined);
  const byId=id=>preview.data.components.find(c=>c.id===id);
  assert.equal(byId(102).content,'# '+values.title);assert.equal(byId(104).content,values.content,'maximum content fits without shortening');assert.match(byId(101).content,/^-# ℹ️ VeloCity · Info$/);assert.equal(byId(103).type,12);
  assert.ok(!preview.data.components.some(c=>c.type===17),'no narrow container');assert.ok(discordTextLength(preview.data.components)<=4000);
  assert.match(preview.data.text,/2 weitere Bilder · nur auf der Website/);assert.equal(preview.data.components.filter(c=>c.type===12).at(-1).items.length,2);
  assert.equal(actions(preview.data).components.length,4);assert.deepEqual(preview.data.allowed_mentions,{parse:[]});
  const draft=await s.state(s.button(preview,0).split(':')[2]);assert.equal(draft.gallery.length,2);assert.equal(draft.excerpt,undefined);
  const edited=await s.send(3,{custom_id:s.button(preview,1)});assert.equal(edited.type,9);assert.equal(edited.data.components[0].component.value,values.title);assert.match(edited.data.components[4].description,/2 gewählt/);
  const next=await s.submit(edited,{title:'Bearbeitet'},false);assert.equal(next.data.components.find(c=>c.id===103)?.type,12,'previous image is retained when no new file is selected');assert.match(next.data.text,/2 weitere Bilder/,'previous website images are retained');
  assert.match((await s.submit(await s.send(3,{custom_id:s.button(next,1)}),{},false,7)).data.text,/höchstens 6 weitere Bilder/,'invalid selection leaves the draft unchanged');
  assert.match((await s.send(3,{custom_id:s.button(preview,0)})).data.text,/veraltet/);
  assert.match((await s.send(3,{custom_id:s.button(next,0)},{member:{user:{id:'888888888888888888'},roles:[ROLE]}})).data.text,/gehört nicht/);
  const cancelled=await s.send(3,{custom_id:s.button(next,2)});assert.equal(cancelled.type,7);assert.match(cancelled.data.text,/abgebrochen/);
  assert.match((await s.send(3,{custom_id:s.button(next,0)})).data.text,/abgebrochen/);
  const expiry=await s.command(),id=expiry.data.custom_id.split(':')[2],expired=await s.state(id);expired.expiresAt=Date.now()-1;await s.env.NEWS_DB.prepare('UPDATE news_state SET value=? WHERE key=?').bind(JSON.stringify(expired),'discord-editor:'+id).run();
  assert.match((await s.submit(expiry)).data.text,/abgelaufen/);
  assert.equal(calls,0);assert.equal((await s.env.NEWS_DB.prepare('SELECT COUNT(*) AS n FROM news_posts').first()).n,0);await s.flush();
 }finally{globalThis.fetch=original;s.env.NEWS_DB.db.close();}
});
test('explicit confirmation responds immediately, sends one public structured message/image, disables pings and never writes website posts',async()=>{
 const s=await setup(),t=transport(),original=globalThis.fetch;globalThis.fetch=t.fetcher;try{
  Object.assign(s.env,{GITHUB_TOKEN:'fake-github-token',GITHUB_OWNER:'MicroMiner',GITHUB_REPO:'VeloCity',GITHUB_BRANCH:'main'});
  const preview=await s.submit(await s.command(),{title:'@everyone Neue News',category:'Changelog'},true,1);
  const publish=s.button(preview,0);
  let unblock;const blocked=new Promise(resolve=>{unblock=resolve;});
  globalThis.fetch=async(url,options)=>{if(String(url).endsWith('/oauth2/applications/@me'))await blocked;return t.fetcher(url,options);};
  const concurrent=await Promise.all([s.send(3,{custom_id:publish}),s.send(3,{custom_id:publish})]);assert.equal(concurrent.filter(r=>r.type===7).length,1,'only one concurrent confirmation claims the draft');const first=concurrent.find(r=>r.type===7);assert.match(first.data.text,/Veröffentlichung wird geprüft/);assert.equal(t.messages.length,0,'HTTP callback must not wait for REST publication');
  const repeated=await s.send(3,{custom_id:publish});assert.match(repeated.data.text,/kein zweiter/);
  unblock();await s.flush();assert.equal(t.messages.length,1);
  const form=t.messages[0].body;assert.ok(form instanceof FormData);const payload=JSON.parse(form.get('payload_json'));assert.equal(payload.enforce_nonce,true);assert.ok(/^\d{17,22}$/.test(payload.nonce));assert.deepEqual(payload.allowed_mentions,{parse:[],replied_user:false});
  assert.equal(payload.flags,32768);assert.equal(payload.content,undefined);assert.equal(payload.embeds,undefined);assert.ok(discordTextLength(payload.components)<=4000);
  const part=id=>payload.components.find(c=>c.id===id);
  assert.equal(part(102).content,'# @everyone Neue News');assert.match(part(105).content,new RegExp('^-# '+discordNewsFooter));assert.equal(part(103).items[0].media.url,'attachment://title-image.png');
  assert.deepEqual(payload.attachments.map(a=>a.filename),['title-image.png','gallery-1.png']);assert.equal(form.get('files[0]').size,png.length);assert.equal(form.get('files[1]').name,'gallery-1.png');
  assert.ok(!JSON.stringify(payload.components).includes('gallery-1'),'website-only image is attached but not shown in Discord');
  assert.match(t.patches.at(-1).text,/in wenigen Minuten/);assert.equal(t.patches.at(-1).flags,32768);
  assert.deepEqual(t.dispatches,[{path:'/repos/MicroMiner/VeloCity/actions/workflows/sync-news.yml/dispatches',body:{ref:'main'},auth:'Bearer fake-github-token'}]);
  assert.match((await s.send(3,{custom_id:publish})).data.text,/Veröffentlicht/);assert.equal(t.messages.length,1);assert.equal(t.dispatches.length,1);
  const cdn=(id,name)=>`https://cdn.discordapp.com/attachments/${CHANNEL}/${id}/${name}?ex=signed`,GALLERY='666666666666666667';
  const message={id:MESSAGE,type:0,flags:32768,channel_id:CHANNEL,author:{id:APP,bot:true},content:'',embeds:[],components:payload.components.map(c=>c.id===103?{...c,items:[{media:{url:cdn(ATTACHMENT,'title-image.png'),attachment_id:ATTACHMENT}}]}:c),attachments:[{id:ATTACHMENT,filename:'title-image.png',url:cdn(ATTACHMENT,'title-image.png')},{id:GALLERY,filename:'gallery-1.png',url:cdn(GALLERY,'gallery-1.png')}],timestamp:new Date().toISOString()};
  const parsed=parseStructuredDiscordNews(message,APP);assert.equal(parsed.title,'@everyone Neue News');assert.equal(parsed.category,'Changelog');assert.equal(parsed.content,part(104).content);assert.equal(parsed.excerpt,'');assert.equal(parsed.imageAttachmentId,ATTACHMENT);assert.deepEqual(parsed.gallery,[{url:cdn(GALLERY,'gallery-1.png'),attachmentId:GALLERY,extension:'png'}]);
  assert.equal(parseStructuredDiscordNews({...message,components:message.components.filter(c=>c.id!==105)},APP),null,'footer marker is required');
  assert.equal(parseStructuredDiscordNews({...message,attachments:[]},APP).imageAttachmentId,ATTACHMENT,'cover falls back to the displayed attachment');
  assert.equal(parseStructuredDiscordNews({...message,author:{id:USER,bot:true}},APP),null);
  assert.equal((await s.env.NEWS_DB.prepare('SELECT COUNT(*) AS n FROM news_posts').first()).n,0,'the existing channel sync is the only new publication path to website posts');
  assert.ok(!JSON.stringify((await s.env.NEWS_DB.prepare('SELECT value FROM news_state').all()).results).includes('fake-interaction-token'));
 }finally{globalThis.fetch=original;s.env.NEWS_DB.db.close();}
});
test('revoked roles/wrong channel prevent publication; definitive rejection permits explicit retry; unknown send result never retries',async()=>{
 const original=globalThis.fetch;
 for(const options of [{memberRoles:[]},{wrongGuild:true},{rejectOnce:true},{uncertain:true}]){
  const s=await setup(),t=transport(options);globalThis.fetch=t.fetcher;try{
   const preview=await s.submit(await s.command()),button=s.button(preview,0),id=button.split(':')[2];
   assert.equal((await s.send(3,{custom_id:button})).type,7);await s.flush();const saved=await s.state(id);
   if(options.memberRoles||options.wrongGuild){assert.equal(t.messages.length,0);assert.equal(saved.status,'preview');}
   if(options.rejectOnce){assert.equal(saved.status,'preview');const next=actions(t.patches.at(-1)).components[0].custom_id;assert.equal((await s.send(3,{custom_id:next})).type,7);await s.flush();assert.equal((await s.state(id)).status,'published');assert.equal(t.messages.length,2,'first request was explicitly rejected, only second was published');}
   if(options.uncertain){assert.equal(saved.status,'uncertain');assert.match((await s.send(3,{custom_id:button})).data.text,/kein zweiter/);assert.equal(t.messages.length,1);}
  }finally{s.env.NEWS_DB.db.close();}
 }
 globalThis.fetch=original;
});
test('long error notices shorten only the private preview body to stay within Discord text limits',async()=>{
 const s=await setup(),t=transport({rejectOnce:true}),original=globalThis.fetch;globalThis.fetch=t.fetcher;
 try{
  const preview=await s.submit(await s.command(),{title:'T'.repeat(160),content:'C'.repeat(3500)},true,2);
  assert.equal((await s.send(3,{custom_id:s.button(preview,0)})).type,7);await s.flush();
  const reply=t.patches.at(-1);assert.match(reply.text,/Nicht veröffentlicht/);assert.match(reply.text,/Vorschau gekürzt/);assert.ok(discordTextLength(reply.components)<=4000);
  assert.equal((await s.state(s.button(preview,0).split(':')[2])).content,'C'.repeat(3500),'stored draft keeps the full text');
 }finally{globalThis.fetch=original;s.env.NEWS_DB.db.close();}
});
test('private reply failure remains recoverable; only private PATCH is retried; public POST is never duplicated',async()=>{
 const original=globalThis.fetch;
 for(const mode of ['replyForbidden','replyRace','sendForbidden']){
  const s=await setup(),t=transport();let patches=0;
  globalThis.fetch=async(url,options)=>{
   if(String(url).includes('/webhooks/')){patches++;if(mode!=='replyRace'||patches===1)return Response.json({code:mode==='replyRace'?10015:50013},{status:mode==='replyRace'?404:403});}
   if(mode==='sendForbidden'&&String(url).endsWith('/messages'))return Response.json({code:50013},{status:403});
   return t.fetcher(url,options);
  };
  try{
   const preview=await s.submit(await s.command()),publish=s.button(preview,0),progress=await s.send(3,{custom_id:publish});
   assert.equal(progress.type,7);const status=s.button(progress,0);await s.flush();
   const reply=await s.send(3,{custom_id:status});assert.equal(reply.type,7);
   if(mode==='sendForbidden'){assert.match(reply.data.text,/HTTP 403, Code 50013/);assert.equal(t.messages.length,0);assert.equal(actions(reply.data).components.length,4);}
   else {assert.match(reply.data.text,/Veröffentlicht/);assert.equal(t.messages.length,1);await s.send(3,{custom_id:publish});assert.equal(t.messages.length,1);}
   assert.equal(patches,mode==='replyRace'?2:1);
  }finally{s.env.NEWS_DB.db.close();}
 }
 globalThis.fetch=original;
});
test('interrupted publication becomes uncertain through read-only refresh without sending again',async()=>{
 const s=await setup(),original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('No request allowed');};
 try{
  const preview=await s.submit(await s.command()),id=s.button(preview,0).split(':')[2],draft=await s.state(id);
  Object.assign(draft,{status:'publishing',startedAt:Date.now()-60000});
  await s.env.NEWS_DB.prepare('UPDATE news_state SET value=? WHERE key=?').bind(JSON.stringify(draft),'discord-editor:'+id).run();
  const status=await s.send(3,{custom_id:`vn:status:${id}:1`});assert.match(status.data.text,/Status unklar|Veröffentlichungsstatus unklar/);assert.equal((await s.state(id)).status,'uncertain');assert.equal(calls,0);await s.flush();
 }finally{globalThis.fetch=original;s.env.NEWS_DB.db.close();}
});
test('existing v1 embed publications remain importable alongside components posts',()=>{
 const parsed=parseStructuredDiscordNews({author:{id:APP,bot:true},embeds:[{title:'Alter Beitrag',description:'Bestehender Inhalt',footer:{text:'VeloCity News · v1'},fields:[{name:'Kategorie',value:'Info'},{name:'Kurzbeschreibung',value:'Bestehende Einleitung'}]}]},APP);
 assert.equal(parsed.title,'Alter Beitrag');assert.equal(parsed.category,'Info');assert.equal(parsed.excerpt,'Bestehende Einleitung');
});

test('Discord redirects fail closed before public send without following Location',async()=>{
 const s=await setup(),original=globalThis.fetch;let calls=0;
 globalThis.fetch=async(url,options)=>{calls++;assert.equal(options.redirect,'manual');return new Response(null,{status:302,headers:{Location:'https://untrusted.example/'}});};
 try{const preview=await s.submit(await s.command()),publish=s.button(preview,0),progress=await s.send(3,{custom_id:publish});await s.flush();const state=await s.state(publish.split(':')[2]);assert.equal(state.status,'preview');assert.equal(state.lastError.stage,'application');assert.equal(state.lastError.httpStatus,302);assert.equal(calls,2);assert.match((await s.send(3,{custom_id:s.button(progress,0)})).data.text,/HTTP 302/);}
 finally{globalThis.fetch=original;s.env.NEWS_DB.db.close();}
});

test('formatting help is private, preserves the draft and opens the prefilled editor without network calls',async()=>{
 const s=await setup(),original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('No network allowed');};
 try{const preview=await s.submit(await s.command(),{content:'**Mein Inhalt**'}),id=s.button(preview,0).split(':')[2],before=await s.state(id);
 const help=await s.send(3,{custom_id:s.button(preview,3)});assert.equal(help.type,4);assert.equal(help.data.flags,64);assert.match(help.data.text,/Text formatieren/);assert.match(help.data.text,/## Zwischentitel/);assert.doesNotMatch(help.data.text,/Unterstrichen/);assert.deepEqual(await s.state(id),before);
 const modal=await s.send(3,{custom_id:s.button(help,0)});assert.equal(modal.type,9);assert.equal(modal.data.components[2].component.value,'**Mein Inhalt**');
 const denied=await s.send(3,{custom_id:s.button(preview,3)},{member:{user:{id:'888888888888888888'},roles:[ROLE]}});assert.match(denied.data.text,/gehört nicht/);assert.equal(calls,0);await s.flush();
 }finally{globalThis.fetch=original;s.env.NEWS_DB.db.close();}
});
