// One schema for Discord's editor, its channel messages and the existing importer.
export const categories = ['Ankündigung','Update','Info','Changelog','Wartung'];
// v1/v2 were embed messages. They stay importable; new posts use components v3.
export const discordNewsMarker = 'VeloCity News · v1';
export const discordNewsMarkerUrl = 'https://microminer.github.io/VeloCity/neuigkeiten.html#discord-news-v2';
export const discordNewsV3Url = 'https://microminer.github.io/VeloCity/neuigkeiten.html#discord-news-v3';
export const discordNewsFooter = 'VeloCity · Neuigkeiten & Changelog';
export const discordComponentsV2 = 1 << 15;
export const discordNewsImageLimit = 8 * 1024 * 1024;
// Discord limits a message to 4000 characters across all text components and a
// request to 25 MiB. The editor keeps room for title, header, footer and status.
export const discordNewsContentLimit = 3500;
export const discordNewsGalleryLimit = 6;
export const discordNewsUploadLimit = 24 * 1024 * 1024;
// Additional images are attached for the website only. Discord hides attachments
// in components messages unless a component references them; true shows a gallery.
export const discordNewsShowGallery = false;
const discordNewsIcons = {'Ankündigung':'📢',Update:'🔄',Info:'ℹ️',Changelog:'📝',Wartung:'🛠️'};
const discordNewsIds = {header:101,title:102,cover:103,content:104,footer:105,gallery:106};
const discordNewsSnowflake = value => /^\d{17,22}$/.test(String(value ?? ''));
export function discordImageUrl(value) {
  try {const url=new URL(value);return url.protocol==='https:'&&(!url.port||url.port==='443')&&!url.username&&!url.password&&['cdn.discordapp.com','media.discordapp.net'].includes(url.hostname)&&/^\/(?:ephemeral-attachments|attachments)\/\d+\/\d+\//.test(url.pathname)?url.href:null;}catch{return null;}
}
export function discordImageType(bytes) {
  if(bytes.length>3&&bytes[0]===255&&bytes[1]===216&&bytes.at(-2)===255&&bytes.at(-1)===217)return {type:'image/jpeg',extension:'jpg'};
  if(bytes.length>=8&&[137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b))return {type:'image/png',extension:'png'};
  const prefix=new TextDecoder().decode(bytes.subarray(0,12));
  if(/^GIF8[79]a/.test(prefix))return {type:'image/gif',extension:'gif'};
  if(prefix.startsWith('RIFF')&&prefix.slice(8,12)==='WEBP')return {type:'image/webp',extension:'webp'};
  return null;
}
export function validateDiscordNews(input,{contentLimit=4000}={}) {
  if(!input||typeof input.title!=='string'||!input.title.trim()||input.title.length>160)throw Error('Titel: 1 bis 160 Zeichen.');
  if(!categories.includes(input.category))throw Error('Bitte eine gültige Kategorie auswählen.');
  if(typeof input.content!=='string'||!input.content.trim()||input.content.length>contentLimit)throw Error(`Inhalt: 1 bis ${contentLimit} Zeichen.`);
  if(input.excerpt!=null&&(typeof input.excerpt!=='string'||input.excerpt.length>400))throw Error('Kurzbeschreibung: höchstens 400 Zeichen.');
  return {title:input.title.trim(),category:input.category,excerpt:(input.excerpt||'').trim(),content:input.content.trim()};
}
// Full-width components message: small category line, large title, separated body,
// display image below the text (as in the former embed) and a footer link.
// No container, so Discord uses the full width.
export function discordNewsComponents(input,{cover=null,gallery=[],preview=false}={}) {
  const data=validateDiscordNews(input),ids=discordNewsIds;
  const text=(id,content)=>({type:10,id,content}),line=()=>({type:14,divider:true,spacing:2});
  const media=(id,urls,description)=>({type:12,id,items:urls.map(url=>({media:{url},...(description?{description}:{})}))});
  return [
    text(ids.header,`-# ${discordNewsIcons[data.category]} VeloCity · ${data.category}`),
    text(ids.title,'# '+data.title),
    line(),
    text(ids.content,data.content),
    ...(cover?[media(ids.cover,[cover],data.title)]:[]),
    ...(gallery.length?[media(ids.gallery,gallery)]:[]),
    line(),
    text(ids.footer,`-# ${discordNewsFooter}${preview?' · Vorschau':''} · [Alle News auf der Website](${discordNewsV3Url})`),
  ];
}
export function discordTextLength(components) {
  let length=0;
  for(const component of components||[]){if(component.type===10)length+=String(component.content||'').length;if(component.components)length+=discordTextLength(component.components);}
  return length;
}
function discordNewsAttachment(attachment,pattern) {
  const match=pattern.exec(attachment?.filename||''),url=discordImageUrl(attachment?.url);
  if(!match||!url||!new URL(url).pathname.startsWith('/attachments/')||!discordNewsSnowflake(attachment.id))return null;
  return {url,attachmentId:String(attachment.id),extension:match.at(-1),order:Number(match[1])||0};
}
function discordNewsAttachments(message) {
  return Array.isArray(message.attachments)?message.attachments:message.attachments?.values?[...message.attachments.values()]:[];
}
function parseComponentsDiscordNews(message) {
  const found=new Map();
  (function visit(items){for(const item of items||[]){if(Number.isInteger(item?.id))found.set(item.id,item);if(item?.components)visit(item.components);}})(message.components);
  const get=(key,type)=>found.get(discordNewsIds[key])?.type===type?found.get(discordNewsIds[key]):null;
  const header=get('header',10),title=get('title',10),content=get('content',10),footer=get('footer',10);
  if(!header||!title||!content||!footer||!footer.content.startsWith('-# '+discordNewsFooter)||!footer.content.includes(discordNewsV3Url))return null;
  const category=/^-# \S+ VeloCity · (.+)$/.exec(header.content)?.[1];
  if(!title.content.startsWith('# '))return null;
  const data=validateDiscordNews({title:title.content.slice(2),category,content:content.content});
  const attachments=discordNewsAttachments(message);
  let image=attachments.map(a=>discordNewsAttachment(a,/^title-image\.(jpg|png|webp|gif)$/)).find(Boolean)||null;
  const cover=get('cover',12)?.items?.[0]?.media;
  if(!image&&cover){
    const url=discordImageUrl(cover.url),match=/^\/attachments\/\d{17,22}\/(\d{17,22})\/title-image\.(jpg|png|webp|gif)$/i.exec(url?new URL(url).pathname:'');
    if(match)image={url,attachmentId:match[1],extension:match[2].toLowerCase()};
  }
  if(cover&&!image)return null;
  const gallery=attachments.map(a=>discordNewsAttachment(a,/^gallery-(\d{1,2})\.(jpg|png|webp|gif)$/)).filter(Boolean).sort((a,b)=>a.order-b.order).slice(0,discordNewsGalleryLimit).map(({order,...item})=>item);
  return {...data,image:image?.url||null,imageAttachmentId:image?.attachmentId||null,imageExtension:image?.extension||null,gallery};
}
export function parseStructuredDiscordNews(message,trustedBotId) {
  if(!discordNewsSnowflake(trustedBotId)||message?.author?.bot!==true||String(message.author.id)!==trustedBotId||message.webhook_id)return null;
  if(Number(message.flags)&discordComponentsV2){try{return parseComponentsDiscordNews(message);}catch{return null;}}
  if(message.embeds?.length!==1)return null;
  const embed=message.embeds[0],legacy=embed.footer?.text===discordNewsMarker,modern=embed.url===discordNewsMarkerUrl&&embed.footer?.text===discordNewsFooter&&typeof embed.author?.name==='string'&&embed.author.name.startsWith('VeloCity · ');
  if(!legacy&&!modern)return null;
  try {
    const fields=embed.fields||[],category=modern?[{value:embed.author.name.slice('VeloCity · '.length)}]:fields.filter(f=>f.name==='Kategorie'),excerpt=fields.filter(f=>f.name==='Kurzbeschreibung');
    if(category.length!==1||excerpt.length>1)return null;
    const data=validateDiscordNews({title:embed.title,content:embed.description,category:category[0].value,excerpt:excerpt[0]?.value||''});
    let image=discordNewsAttachments(message).map(a=>discordNewsAttachment(a,/^title-image\.(jpg|png|webp|gif)$/)).find(Boolean)||null;
    // Discord can omit embed-consumed uploads from message.attachments. The
    // trusted bot's public embed image still contains the stable attachment ID.
    if(!image&&embed.image){
      const url=discordImageUrl(embed.image.url),path=url?new URL(url).pathname:'';
      const match=/^\/attachments\/\d{17,22}\/(\d{17,22})\/[^/]+\.(jpg|jpeg|png|webp|gif)$/i.exec(path);
      if(match)image={attachmentId:match[1],url,extension:match[2].toLowerCase()==='jpeg'?'jpg':match[2].toLowerCase()};
    }
    // Only public Discord CDN uploads; never external or ephemeral preview URLs.
    if(embed.image&&!image)return null;
    return {...data,image:image?.url||null,imageAttachmentId:image?.attachmentId||null,imageExtension:image?.extension||null,gallery:[]};
  } catch{return null;}
}
