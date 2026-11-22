/* TXT 目录、全文检索及连续朗读。依赖 tts.js 导出的 ReaderSpeech/ReaderSpeechSegments。 */
(function(){'use strict';
const $=id=>document.getElementById(id), BASE='/TXT/';
const REMOTE_ROOT='/电子书/中文/王百虎/改革宗心灵辅导TXT电子书';
const HTTP_SOURCES=Object.freeze([
 {id:'primary',origin:'http://103.143.81.181',name:'网盘一（主线路）'},
 {id:'backup',origin:'http://85.189.89.208',name:'网盘二（备用线路）'}
]);
// 目录页 #drive 只用于浏览；实际 TXT 传输使用用户提供的 /api/file 接口。
// 保留两个层级，是因为服务器实际下载链接与现有书目索引有一层目录差异。
function filePathCandidates(entry){
 const rel=String(entry?.path||'').split('/');
 if(!rel.length||rel.some(x=>!x||x==='.'||x==='..'||x.includes('\\')||x.includes('\0'))||!String(entry?.path||'').toLowerCase().endsWith('.txt'))
   throw Error('无效的TXT路径');
 const full=REMOTE_ROOT+'/'+rel.join('/');
 const shorter=rel[0]==='改革宗心灵辅导资料'&&rel.length>1?REMOTE_ROOT+'/'+rel.slice(1).join('/'):full;
 return [...new Set([shorter,full])];
}
function randomRequestId(){
 // 仅用于网盘请求关联，不作为身份凭据。
 try{const a=new Uint8Array(16);crypto.getRandomValues(a);return Array.from(a,v=>v.toString(16).padStart(2,'0')).join('');}
 catch{return (Date.now().toString(16)+Math.random().toString(16).slice(2)).padEnd(32,'0').slice(0,32);}
}
function apiFileURL(origin,fullPath){
 if(!HTTP_SOURCES.some(x=>x.origin===origin))throw Error('不允许的TXT网盘地址');
 if(!fullPath.startsWith(REMOTE_ROOT+'/')||fullPath.split('/').some(x=>x==='.'||x==='..')||!fullPath.endsWith('.txt'))throw Error('无效的文件下载路径');
 const u=new URL('/api/file',origin);
 u.searchParams.set('path',fullPath);u.searchParams.set('download','1');u.searchParams.set('request_id',randomRequestId());
 return u.href;
}
function remoteFileLink(entry,backup=false,alternate=false){
 const source=HTTP_SOURCES[backup?1:0],paths=filePathCandidates(entry);
 return apiFileURL(source.origin,paths[alternate?paths.length-1:0]);
}
function remoteDirectoryLink(entry,backup=false){
 const source=HTTP_SOURCES[backup?1:0];
 return source.origin+'/#drive?path='+encodeURIComponent(REMOTE_ROOT+'/'+entry.path);
}
function supportedTarget(origin){return location.protocol!=='https:'||origin.startsWith('https:')||origin===location.origin;}
let workingGateways=[];
async function probeGateway(){
 // GitHub Pages 是静态网站，不存在可凭空调用的代理；只探测同源已部署服务。
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),1600);
 try{
  const r=await fetch(location.origin+'/api/txt/capabilities',{signal:controller.signal,cache:'no-store',credentials:'omit',mode:'cors',redirect:'error'});
  if(!r.ok||!/(?:\/json|\+json)/i.test(r.headers.get('content-type')||''))return false;
  const caps=await r.json();
  if(caps?.service==='messiah-txt-bridge-v1'&&caps.online_read===true){workingGateways=[{name:'本站同源HTTPS中转',url:location.origin+'/api/txt'}];return true;}
 }catch{}finally{clearTimeout(timer);}
 return false;
}
async function getHttpBuffer(url,entry,signal){
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),7500);
 const abort=()=>controller.abort();
 if(signal){if(signal.aborted)abort();else signal.addEventListener('abort',abort,{once:true});}
 try{
  const response=await fetch(url,{signal:controller.signal,mode:'cors',credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer'});
  if(!response.ok)throw Error('HTTP '+response.status);
  if(response.type==='opaque'||response.redirected)throw Error('文件接口返回不可读取的结果');
  const type=(response.headers.get('content-type')||'').toLowerCase();
  if(/text\/html|application\/xhtml\+xml/.test(type))throw Error('返回网盘页面而非TXT正文');
  if(Number(response.headers.get('content-length'))>20_000_000)throw Error('文件超过20MB');
  const buffer=await response.arrayBuffer();
  if(buffer.byteLength>20_000_000)throw Error('文件超过20MB');
  if(entry.bytes>0&&buffer.byteLength!==entry.bytes)throw Error('TXT字节数与目录不一致');
  const bytes=new Uint8Array(buffer);
  if(bytes.length>=5&&new TextDecoder('utf-8').decode(bytes.slice(0,128)).trimStart().match(/^<!doctype html|^<html[\s>]/i))
    throw Error('文件接口返回HTML页面，不是TXT正文');
  if(entry.sha256){
   const digest=window.SiteRuntime?.digest;
   if(typeof digest!=='function')throw Error('网站文件校验模块未加载');
   if(await digest(bytes)!==entry.sha256)throw Error('TXT的SHA-256与书目不一致，已拒绝使用');
  }
  return buffer;
 }finally{clearTimeout(timeout);signal?.removeEventListener('abort',abort);}
}
async function remoteBookBuffer(entry,signal){
 const paths=filePathCandidates(entry),errors=[];
 // 优先使用已经独立部署的同源代理；仅凭静态仓库不能产生这个接口。
 for(const gate of workingGateways){
  for(const path of paths){
   if(signal?.aborted)throw Object.assign(Error('请求取消'),{name:'AbortError'});
   try{return await getHttpBuffer(gate.url+'/read?path='+encodeURIComponent(path),entry,signal);}
   catch(e){if(signal?.aborted)throw e;errors.push(gate.name+'：'+e.message);}
  }
 }
 if(location.protocol==='https:')throw Error('当前网页为HTTPS，不能用脚本读取HTTP网盘。可使用下方真实 /api/file 下载链接；若要站内直接朗读，需部署同源HTTPS文件代理。');
 // 主服务器先尝试两种真实路径，失败再尝试备用服务器，避免双倍下载。
 for(const source of HTTP_SOURCES){
  for(const path of paths){
   if(signal?.aborted)throw Object.assign(Error('请求取消'),{name:'AbortError'});
   try{return await getHttpBuffer(apiFileURL(source.origin,path),entry,signal);}
   catch(e){if(signal?.aborted)throw e;errors.push(source.name+'：'+(e.name==='TypeError'?'网络或跨域访问受到阻止':e.name==='AbortError'?'连接超时':e.message));}
  }
 }
 throw Error('已尝试网盘 /api/file 主备线路和两种目录路径，尚未取得符合校验的TXT正文。'+errors.join('；').slice(0,290));
}
function appendRealFileLinks(paper,entry){
 const notice=document.createElement('p');
 notice.className='txt-placeholder';
 notice.textContent='该文件可从真实网盘接口直接打开或下载。下载后在上方选择“打开刚下载的单份TXT”，即可在本站阅读和朗读。';
 paper.append(notice);
 for(let backup=0;backup<2;backup++){
  const source=HTTP_SOURCES[backup],paths=filePathCandidates(entry);
  for(let i=0;i<paths.length;i++){
   const a=document.createElement('a');a.href=apiFileURL(source.origin,paths[i]);a.target='_blank';a.rel='noopener noreferrer';
   a.textContent=source.name+(i?'（另一种目录路径）':'')+'：直接打开TXT文件';a.className='button secondary';
   paper.append(a,document.createTextNode('　'));
  }
 }
}


const state={entries:[],site:[],local:[],visible:[],listed:0,selected:null,paragraphs:[],nodes:[],matches:[],matchAt:-1,
  catalog:null,remoteOnly:false,bloom:null,bloomTried:false,bookCache:new Map(),session:null,flow:0,searchToken:0,searchAbort:null,loading:0,
  voices:new Map(),lastVoice:'',engine:null,voiceReady:false};
const normalize=s=>String(s||'').normalize('NFKC').toLowerCase().trim();
const byId=new Map();
const status=(id,text)=>{const e=$(id);if(e)e.textContent=text;};
const num=n=>Number(n||0).toLocaleString('zh-CN');
const isTxt=f=>f&&/\.txt$/i.test(f.name||'');
const pathUrl=p=>{const parts=String(p).split('/');if(parts.some(x=>!x||x==='.'||x==='..'||x.includes('\\')))throw Error('TXT路径无效');return BASE+parts.map(x=>encodeURIComponent(x)).join('/');};
const escapeId=id=>String(id||'');
function setBusy(b){$('txt-cancel-search').hidden=!b;$('txt-search-form').querySelector('button[type="submit"]').disabled=b;}
function cacheGet(entry){const k=entry.id;const v=state.bookCache.get(k);if(v){state.bookCache.delete(k);state.bookCache.set(k,v);}return v;}
function cachePut(entry,content){state.bookCache.delete(entry.id);state.bookCache.set(entry.id,content);while(state.bookCache.size>4)state.bookCache.delete(state.bookCache.keys().next().value);}
function decodeBuffer(buffer,encoding){const data=new Uint8Array(buffer);let enc=encoding||'utf-8';
 if(data.length>1&&((data[0]===255&&data[1]===254)||(data[0]===254&&data[1]===255)))enc='utf-16';
 else if(data.length>2&&data[0]===239&&data[1]===187&&data[2]===191)enc='utf-8';
 try{return new TextDecoder(enc,{fatal:true}).decode(buffer).replace(/^\uFEFF/,'');}
 catch {try{return new TextDecoder('gb18030',{fatal:true}).decode(buffer).replace(/^\uFEFF/,'');}
 catch(e){throw Error('该TXT编码无法识别，请先转换为UTF-8');}}
}
async function bookText(entry,signal){const cached=cacheGet(entry);if(cached!==undefined)return cached;
 if(entry.bytes>20_000_000)throw Error('本文件超过20 MB，建议先拆分后再阅读');

let buffer;
if(entry.source==='local')buffer=await entry.file.arrayBuffer();
else if(state.remoteOnly){buffer=await remoteBookBuffer(entry,signal);}
else {
  const response=await fetch(pathUrl(entry.path),{signal,cache:'default',credentials:'omit'});
  if(!response.ok)throw Error('文件读取失败（'+response.status+'）：'+entry.title);
  if(Number(response.headers.get('content-length'))>20_000_000)throw Error('远程文件超过20MB');
  buffer=await response.arrayBuffer();
}
if(buffer.byteLength>20_000_000)throw Error('文件超过20MB');
if(entry.bytes>0&&buffer.byteLength!==entry.bytes)throw Error('文件大小与目录不一致，请重新生成TXT目录索引');
if(entry.source==='site'&&entry.sha256){
  const digest=window.SiteRuntime?.digest;
  if(typeof digest!=='function')throw Error('SHA-256校验模块缺失');
  const hash=await digest(new Uint8Array(buffer));
  if(hash!==entry.sha256)throw Error('文件与书目校验值不同，已阻止混版阅读');
}
 const text=decodeBuffer(buffer,entry.encoding);cachePut(entry,text);return text;
}
function paragraphsFromText(text){const lines=String(text).replace(/\r\n?/g,'\n').split('\n');const parts=[],joined=[];
 const flush=()=>{if(!joined.length)return;const block=joined.join('\n');joined.length=0;
   if(block.length<=4200){parts.push(block);return;}
   let remaining=block;while(remaining.length>4200){const tail=remaining.slice(2100,4200);let idx=Math.max(tail.lastIndexOf('。'),tail.lastIndexOf('！'),tail.lastIndexOf('？'),tail.lastIndexOf('\n'));
     const len=idx>=0?2100+idx+1:4200;parts.push(remaining.slice(0,len));remaining=remaining.slice(len);}
   if(remaining)parts.push(remaining);
 };
 for(const line of lines){if(!line.trim()){flush();continue;}joined.push(line);}
 flush();return parts;
}
function makeNode(tag,cls,txt){const x=document.createElement(tag);if(cls)x.className=cls;if(txt!==undefined)x.textContent=txt;return x;}
function renderParagraphs(){const paper=$('txt-paper');paper.replaceChildren();state.nodes=[];
 if(!state.paragraphs.length){paper.append(makeNode('p','txt-placeholder','该TXT没有可显示的正文内容。'));return;}
 const frag=document.createDocumentFragment();for(let i=0;i<state.paragraphs.length;i++){
   const p=makeNode('p','txt-paragraph',state.paragraphs[i]);p.dataset.paragraph=String(i);p.tabIndex=0;p.setAttribute('role','button');p.setAttribute('aria-label','点击朗读第'+(i+1)+'段');frag.append(p);state.nodes.push(p);
 }paper.append(frag);
}
function highlight(i,scroll){const previous=state.nodes[state.activeIndex];if(previous)previous.removeAttribute('aria-current');state.activeIndex=i;
 const node=state.nodes[i];if(!node)return;node.setAttribute('aria-current','true');
 if(scroll&&$('txt-follow').checked)node.scrollIntoView({block:'center',behavior:'auto'});
}
function updateReadingTitle(entry){status('txt-current-title',entry?entry.title+'（'+entry.category+' · '+num(entry.bytes)+' 字节）':'先从左侧选择一份TXT电子书');}
async function selectEntry(entry,opt={}){
 if(!entry)return false;const my=++state.loading; if(!opt.automatic)stopPlayback('已切换文件，朗读停止');
 if(state.remoteOnly&&entry.source==='site'&&location.protocol==='https:'&&!workingGateways.length){
   if(my===state.loading){
    updateReadingTitle(entry);
    status('txt-in-page-count','该网页为HTTPS，不能直接读取HTTP网盘；下方提供真正的文件下载接口。');
    const paper=$('txt-paper');paper.replaceChildren();appendRealFileLinks(paper,entry);
    // 只有用户主动点击书名时才打开下载，不对自动续播执行弹窗。
    if(!opt.automatic){try{window.open(remoteFileLink(entry),'_blank','noopener,noreferrer');}catch{}}
   }
   return false;
 }
 status('txt-in-page-count','正在读取正文……');
 try{const text=await bookText(entry);
   if(my!==state.loading||(opt.automatic&&Number.isInteger(opt.expectedFlow)&&state.flow!==opt.expectedFlow))return false;
   state.selected=entry;state.paragraphs=paragraphsFromText(text);state.matches=[];state.matchAt=-1;state.activeIndex=null;
   renderParagraphs();updateReadingTitle(entry);status('txt-in-page-count','共'+num(state.paragraphs.length)+'段；点击段落即可朗读。');
   const encoded=encodeURIComponent(entry.path);if(!opt.automatic&&location.protocol!=='file:'){try{history.replaceState({},'',location.pathname+'?book='+encoded);}catch{ /* about:blank/strict embed: do not lose the book */ }}
   if(!opt.automatic){for(const n of $('txt-list').querySelectorAll('button[data-id]'))n.dataset.selected=String(n.dataset.id===entry.id);}return true;
 }catch(e){if(my===state.loading){status('txt-in-page-count','文件打开失败：'+e.message);const paper=$('txt-paper');paper.replaceChildren(makeNode('p','txt-placeholder','无法显示该TXT：'+e.message));if(state.remoteOnly&&entry.source==='site')appendRealFileLinks(paper,entry);}return false;}
}
function baseEntries(){let docs=state.entries.slice();const source=$('txt-origin').value,cat=$('txt-category').value,folder=$('txt-folder').value;
 return docs.filter(e=>(source==='all'||e.source===source)&&(!cat||e.category===cat)&&(!folder||e.folder===folder||e.folder.startsWith(folder+'/')));
}
function nameHit(entry,terms){const hay=normalize(entry.title+' '+entry.folder+' '+entry.category);return terms.every(t=>hay.includes(t));}
function queryTerms(){return normalize($('txt-search').value).split(/\s+/u).filter(Boolean);}
function updateFilterOptions(){let c=$('txt-category').value,f=$('txt-folder').value;
 const cats=Array.from(new Set(state.entries.map(x=>x.category))).sort((a,b)=>a.localeCompare(b,'zh-CN'));
 $('txt-category').replaceChildren(new Option('全部分类',''));for(const x of cats){const n=state.entries.filter(e=>e.category===x).length;$('txt-category').append(new Option(x+'（'+n+'）',x));}
 if(cats.includes(c))$('txt-category').value=c;
 const folders=new Set();for(const entry of state.entries){let path=entry.folder||'';while(path){folders.add(path);const cut=path.lastIndexOf('/');path=cut>=0?path.slice(0,cut):'';}}let sorted=Array.from(folders).sort((a,b)=>a.localeCompare(b,'zh-CN'));
 $('txt-folder').replaceChildren(new Option('全部文件夹（递归）',''));
 for(const folder of sorted){const display=folder.replace(/^改革宗心灵辅导资料\/?/,'');const numDepth=folder.split('/').length;
   $('txt-folder').append(new Option('　'.repeat(Math.min(3,numDepth-1))+(display||folder),folder));}
 if(folders.has(f))$('txt-folder').value=f;
}
function renderList(reset=true){if(reset){$('txt-list').replaceChildren();state.listed=0;}
 let slice=state.visible.slice(state.listed,state.listed+50),frag=document.createDocumentFragment();
 for(const e of slice){let b=makeNode('button','txt-file-item');b.type='button';b.dataset.id=e.id;b.dataset.selected=String(state.selected?.id===e.id);
  const title=makeNode('strong','',e.title),desc=makeNode('small','',e.category+' · '+e.folder.replace(/^改革宗心灵辅导资料\/?/,'')+' · '+num(e.bytes)+' 字节'),src=makeNode('em','',e.source==='local'?'本机文件':'网站文件');
  b.append(title,desc,src);frag.append(b);
  if(state.remoteOnly&&e.source==='site'){
    const a=document.createElement('a');a.href=remoteFileLink(e);a.target='_blank';a.rel='noopener noreferrer';
    a.className='txt-direct-file';a.textContent='直接打开TXT原文件';a.title='使用网盘真实 /api/file 接口，非目录导航';
    frag.append(a);
  }
 }
 $('txt-list').append(frag);state.listed+=slice.length;$('txt-more').hidden=state.listed>=state.visible.length;
}
function showNames(){cancelSearch(false);let ts=queryTerms();state.visible=baseEntries().filter(e=>nameHit(e,ts));renderList();
 status('txt-results-status','符合筛选的 TXT：'+num(state.visible.length)+' 份（共 '+num(state.entries.length)+' 份）');
}
function tokenList(value){const set=new Set();for(const m of normalize(value).matchAll(/[\u3400-\u9fff]+|[a-z0-9]+/g)){
 const s=m[0];if(s.charCodeAt(0)>=0x3400){if(s.length===1)set.add('c:'+s);else for(let i=0;i<s.length-1;i++)set.add('b:'+s.slice(i,i+2));}
 else if(s.length>1&&s.length<=64)set.add('w:'+s);
}return Array.from(set);}
function bloomContains(buffer,entry,tokens){const bytes=state.catalog?.search_bloom?.bytes_per_entry||0,rounds=state.catalog?.search_bloom?.hashes||4;
 if(!bytes||entry.source!=='site')return true;const offset=entry.localIndex*bytes;if(offset+bytes>buffer.length)return true;
 for(const t of tokens){let a=2166136261>>>0,b=0x9e3779b9>>>0;
  for(let i=0;i<t.length;i++){let c=t.charCodeAt(i);a=Math.imul(a^c,16777619)>>>0;b=Math.imul(b+c,2246822519)>>>0;}
  b=(b|1)>>>0;for(let k=0;k<rounds;k++){let bit=(a+Math.imul(k,b))&(bytes*8-1);if(!(buffer[offset+(bit>>>3)]&(1<<(bit&7))))return false;}
 }return true;
}
async function loadBloom(){if(state.bloomTried)return state.bloom;state.bloomTried=true;
 const spec=state.catalog?.search_bloom;if(!spec||!Number.isInteger(spec.bytes_per_entry))return null;
 try{const r=await fetch(BASE+encodeURIComponent(spec.file),{cache:'default'});if(!r.ok)throw Error(String(r.status));const buf=await r.arrayBuffer();
   if(buf.byteLength!==state.site.length*spec.bytes_per_entry)throw Error('索引与目录不一致');
   if(spec.sha256 && window.crypto?.subtle){const raw=new Uint8Array(await crypto.subtle.digest('SHA-256',buf));
     const hash=Array.from(raw,x=>x.toString(16).padStart(2,'0')).join('');if(hash!==spec.sha256)throw Error('全文预筛索引校验失败');}
   state.bloom=new Uint8Array(buf);return state.bloom;
 }catch(e){status('txt-results-status','全文预筛索引暂不可用，将逐本核验（可能较慢）：'+e.message);return null;}
}
function cancelSearch(show=true){state.searchToken++;state.searchAbort?.abort();state.searchAbort=null;setBusy(false);if(show)status('txt-results-status','已停止全文检索，之前找到的结果仍保留。');}
async function searchContents(){const ts=queryTerms();if(!ts.length){showNames();return;}
 cancelSearch(false);const token=++state.searchToken;const controller=new AbortController();state.searchAbort=controller;setBusy(true);
 const base=baseEntries(),nameHits=base.filter(e=>nameHit(e,ts));state.visible=nameHits.slice();renderList();
 try{if(state.remoteOnly&&base.some(x=>x.source==='site'))status('txt-results-status','TXT全库在线全文检索需要网盘提供全文索引；本网当前保留1360份书目搜索和已加载本机文件的全文搜索。');let bloom=state.remoteOnly?null:await loadBloom();if(token!==state.searchToken)return;
  const tokens=Array.from(new Set(ts.flatMap(tokenList)));
  const candidates=base.filter(e=>(!state.remoteOnly||e.source==='local')&&!nameHit(e,ts)&&(!bloom||bloomContains(bloom,e,tokens)));
  const lower=ts.map(normalize);let checked=0;const cap=120;
  for(const e of candidates){if(token!==state.searchToken||controller.signal.aborted)return;
    try{const content=await bookText(e,controller.signal);if(lower.every(t=>normalize(content).includes(t)))state.visible.push(e);}catch(err){if(err.name==='AbortError')return;}
    checked++;
    if(checked%8===0){renderList();status('txt-results-status','全文检索中：已核对 '+num(checked)+'／'+num(candidates.length)+' 个候选；找到 '+num(state.visible.length)+' 份');await new Promise(resolve=>setTimeout(resolve,0));}
    if(state.visible.length>=cap)break;
  }
  if(token!==state.searchToken)return;
  renderList();status('txt-results-status','全文核实 '+num(checked)+'／'+num(candidates.length)+' 个候选，检出 '+num(state.visible.length)+' 份'+(state.visible.length>=cap?'（最多显示前120份，可缩小关键词再查）':'')+'。标题命中单独保留。');
 }catch(e){if(token===state.searchToken)status('txt-results-status','全文检索失败：'+e.message);}
 finally{if(token===state.searchToken){state.searchAbort=null;setBusy(false);}}
}
function inPageFind(){const q=normalize($('txt-in-page').value);state.matches=[];state.matchAt=-1;
 for(const n of state.nodes)n.classList.remove('txt-match');
 if(!q){status('txt-in-page-count','共'+num(state.paragraphs.length)+'段；可点击段落朗读。');return;}
 for(let i=0;i<state.paragraphs.length;i++)if(normalize(state.paragraphs[i]).includes(q)){state.matches.push(i);state.nodes[i]?.classList.add('txt-match');}
 status('txt-in-page-count','当前文稿找到 '+num(state.matches.length)+' 个含有该词的段落（显示段落数，而非词频）。');
 if(state.matches.length)nextInPage();
}
function nextInPage(){if(!state.matches.length){status('txt-in-page-count','请先在当前书中查找。');return;}
 state.matchAt=(state.matchAt+1)%state.matches.length;const i=state.matches[state.matchAt];const node=state.nodes[i];node?.scrollIntoView({block:'center',behavior:'auto'});node?.focus({preventScroll:true});
 status('txt-in-page-count','第 '+(state.matchAt+1)+'／'+state.matches.length+' 个匹配段落（第'+(i+1)+'段）；点击该段可朗读。');
}
function saveSettings(){const settings={theme:$('txt-theme').value,font:$('txt-font').value,leading:$('txt-leading').value,width:$('txt-width').value,family:$('txt-font-family').value,rate:$('txt-rate').value,volume:$('txt-volume').value,scope:$('txt-scope').value,follow:$('txt-follow').checked};
 try{localStorage.setItem('messiah-txt-settings-v1',JSON.stringify(settings));}catch{}}
function applyAppearance(){const p=$('txt-reading-zone');p.dataset.theme=$('txt-theme').value;p.dataset.font=$('txt-font').value;
 p.dataset.leading=$('txt-leading').value;p.dataset.width=$('txt-width').value;p.dataset.family=$('txt-font-family').value;
 $('txt-font-value').textContent=$('txt-font').value;$('txt-rate-value').textContent=Number($('txt-rate').value).toFixed(1);
 if(state.engine){state.engine.rate=Number($('txt-rate').value);state.engine.volume=Number($('txt-volume').value);}
 saveSettings();}
function restoreSettings(){let settings;try{settings=JSON.parse(localStorage.getItem('messiah-txt-settings-v1')||'null');}catch{}
 if(settings&&typeof settings==='object'){
  for(const [id,key] of [['txt-theme','theme'],['txt-leading','leading'],['txt-width','width'],['txt-font-family','family'],['txt-scope','scope']]){
   if(settings[key]!=null&&Array.from($(id).options).some(o=>o.value===String(settings[key])))$(id).value=String(settings[key]);}
  for(const [id,key,min,max] of [['txt-font','font',16,36],['txt-rate','rate',0.5,2],['txt-volume','volume',0,1]]){
   let v=Number(settings[key]);if(Number.isFinite(v)&&v>=min&&v<=max)$(id).value=String(v);}
  if(typeof settings.follow==='boolean')$('txt-follow').checked=settings.follow;
 }applyAppearance();
}
function voiceProvider(v){return window.SpeechVoicePolicy?.classify(v)||'other';}
function voiceKey(v){return window.SpeechVoicePolicy?.voiceKey(v)||JSON.stringify([v.voiceURI||'',v.lang||'',v.name||'',v.localService===true]);}
function setVoiceFromChoice(){const voice=state.voices.get($('txt-voice').value);
 state.engine?.setVoice(voice&&(voice.localService===true||$('txt-remote').checked)?voice:null);state.engine&&(state.engine.allowRemote=$('txt-remote').checked);}
function refreshVoices(){const previous=$('txt-voice').value,provider=$('txt-provider').value;
 if(!state.engine){status('txt-voice-summary','当前浏览器没有可用的朗读接口。TXT阅读、检索仍能正常使用。');return;}
 const source=speechSynthesis.getVoices()||[],unique=new Map();for(const v of source)unique.set(voiceKey(v),v);
 state.voices=new Map();const select=$('txt-voice');select.replaceChildren(new Option('请选择声音',''));
 const candidates=[...unique.values()].filter(v=>provider==='all'||voiceProvider(v)===provider);
 const pool=window.SpeechVoicePolicy?.sorted(candidates)||candidates;
 const names={microsoft:'微软',google:'谷歌',other:'系统／其他'},counts={microsoft:0,google:0,other:0};for(const v of source)counts[voiceProvider(v)]++;
 for(const groupId of ['microsoft','google','other']){const list=pool.filter(v=>voiceProvider(v)===groupId);if(!list.length)continue;
  const group=document.createElement('optgroup');group.label=names[groupId];for(const voice of list){const id=voiceKey(voice),permitted=voice.localService===true||$('txt-remote').checked;
   const option=new Option(voice.name+' · '+voice.lang+' · '+(voice.localService===true?'本机':permitted?'联网许可已开启':'需允许联网'),id);option.disabled=!permitted;group.append(option);state.voices.set(id,voice);
  }select.append(group);
 }
 const decision=window.SpeechVoicePolicy?.choose(pool,$('txt-remote').checked)||{voice:null,reason:'小雨默认规则尚未加载'};
 select.value=decision.voice?voiceKey(decision.voice):'';setVoiceFromChoice();
 status('txt-voice-summary','默认微软在线小雨（HsiaoYu／zh-TW-HsiaoYuNeural）。浏览器实际报告 '+source.length+' 个声音：微软 '+(counts.microsoft||0)+'、谷歌 '+(counts.google||0)+'、其他 '+(counts.other||0)+'。'+(decision.reason||'已匹配实际选中的声音。')+' 不擅自换成其他声音。');
}
function stopPlayback(message){state.flow++;state.session=null;if(state.engine)state.engine.stop();
 if(message)status('txt-tts-status',message);
}
function selectedDocs(scope,entry){if(scope==='paragraph'||scope==='file')return [entry];
 if(scope==='results'){const view=state.visible.slice();if(!view.some(x=>x.id===entry.id))view.unshift(entry);return view;}
 if(scope==='category')return state.entries.filter(e=>e.category===entry.category);
 if(scope==='folder'){const folder=entry.folder;return state.entries.filter(e=>e.folder===folder||(folder&&e.folder.startsWith(folder+'/')));}
 return state.entries.slice();
}
function speechItems(fromIndex,onlyOne){let rows=[];
 const from=Math.max(0,Math.min(fromIndex,state.paragraphs.length-1));const end=onlyOne?from+1:state.paragraphs.length;
 for(let i=from;i<end;i++){
  const value=state.paragraphs[i];const segments=typeof window.ReaderSpeechSegments==='function'?window.ReaderSpeechSegments(value,360):[];
  for(let j=0;j<segments.length;j++){const seg=segments[j];rows.push({text:seg.text,id:state.selected.id+':'+i+':'+j,pauseAfterMs:seg.pauseAfterMs,
      element:state.nodes[i],paragraphIndex:i,persist:true});}
  // TXT段落之间不追加毫秒级人为停顿。
  if(rows.length>30000)throw Error('单篇短句超过30000段，建议将这个文件分成若干TXT后再读；没有截断播放。');
 }
 return rows;
}
function voiceCheck(){if(!state.engine){status('txt-tts-status','当前浏览器没有朗读接口，无法开始TTS。');return false;}
 setVoiceFromChoice();if(!state.engine.voice){status('txt-tts-status','请先选择可用的中文发音人；联网声音需要明确勾选许可。');return false;}
 return true;}
async function playLoaded(plan,para){if(!state.engine||!voiceCheck())return false;
 if(plan.deadline!==null&&Date.now()>=plan.deadline){stopPlayback('达到定时停止时间，朗读已结束。');return false;}
 const rows=speechItems(para,plan.scope==='paragraph');if(!rows.length){stopPlayback('本文件没有可朗读的正文内容，已停止，未擅自跳过。');return false;}
 state.engine.setItems(rows,0);const ok=state.engine.play(0);
 if(ok&&plan.deadline!==null)state.engine.setTimer(Math.max(0.001,(plan.deadline-Date.now())/60000));
 return ok;
}
function startFromParagraph(index,restorePlan=null){if(!state.selected||!state.paragraphs.length){status('txt-tts-status','请先打开有正文的TXT文件。');return;}
 if(!voiceCheck())return;let start=Math.max(0,Math.min(Number(index)||0,state.paragraphs.length-1));
 stopPlayback();let scope=restorePlan?.scope||$('txt-scope').value;
 let docs=selectedDocs(scope,state.selected);let docPos=docs.findIndex(x=>x.id===state.selected.id);if(docPos<0){docs.unshift(state.selected);docPos=0;}
 const minutes=Number($('txt-timer').value);const now=Date.now();
 const plan={scope,docs,docPos,paragraph:start,loop:restorePlan?.loop??$('txt-loop').checked,
   deadline:Number.isFinite(minutes)&&minutes>0?now+minutes*60000:null,token:state.flow};
 state.session=plan;highlight(start,true);
 playLoaded(plan,start).catch(e=>stopPlayback('无法朗读：'+e.message));
}
function endSession(msg){state.session=null;status('txt-tts-status',msg||'朗读范围已结束，未开启循环。');}
async function handleDocumentEnd(plan,token){if(state.flow!==token||state.session!==plan||!plan)return;
 if(plan.deadline!==null&&Date.now()>=plan.deadline){stopPlayback('已到定时停止时间。');return;}
 if(plan.scope==='paragraph'||plan.scope==='file'){
  if(!plan.loop){endSession('所选段落／文件朗读结束。');return;}
  // loop: next iteration always resumes at the beginning of the chosen range.
  try{await playLoaded(plan,plan.scope==='paragraph'?plan.paragraph:0);}catch(e){stopPlayback('循环播放失败：'+e.message);}return;
 }
 let next=plan.docPos+1;if(next>=plan.docs.length){if(!plan.loop){endSession('所选分类／列表／全库全部朗读完成。');return;}next=0;}
 const entry=plan.docs[next];status('txt-tts-status','正在连续载入下一份 TXT：'+entry.title);
 let success=await selectEntry(entry,{automatic:true,expectedFlow:token});if(state.flow!==token||state.session!==plan)return;
 if(!success){stopPlayback('下一份TXT加载失败，已停止以避免遗漏：'+entry.title);return;}
 plan.docPos=next;try{await playLoaded(plan,0);}catch(e){stopPlayback('连续朗读失败：'+e.message);}
}
function installSpeech(){if(typeof window.ReaderSpeech!=='function'||!('speechSynthesis' in window)||!('SpeechSynthesisUtterance' in window)){
 status('txt-tts-status','当前浏览器不提供TTS朗读，文字阅读仍可使用。');for(const id of ['txt-play','txt-pause','txt-next','txt-prev','txt-stop','txt-restore'])$(id).disabled=true;return;}
 state.engine=new window.ReaderSpeech(window.speechSynthesis,window.SpeechSynthesisUtterance,{
  onState(s){const e=$('txt-tts-status');if(e){const title=state.selected?.title||'';e.textContent=(title?title+'｜':'')+s.message+(s.total?'（短句 '+Math.min(s.index+1,s.total)+'／'+s.total+'）':'');}
   if(s.state==='ended'&&state.session){const plan=state.session,token=state.flow;Promise.resolve().then(()=>handleDocumentEnd(plan,token));}
   $('txt-pause').disabled=!['playing','paused'].includes(s.state);
  },
  onSegment(item){const i=item.paragraphIndex;if(Number.isInteger(i)){
    highlight(i,true);
    try{localStorage.setItem('messiah-txt-last-position',JSON.stringify({path:state.selected?.path,source:state.selected?.source,sha256:state.selected?.sha256||null,paragraph:i,saved:Date.now(),scope:state.session?.scope,loop:state.session?.loop}));}catch{}
   }}
 });
 state.engine.rate=Number($('txt-rate').value);state.engine.volume=Number($('txt-volume').value);
 $('txt-remote').checked=false;refreshVoices();window.speechSynthesis.addEventListener?.('voiceschanged',refreshVoices);
 $('txt-provider').addEventListener('change',()=>{stopPlayback('声音来源已改变，请选择发音人后重新开始。');refreshVoices();});
 $('txt-voice').addEventListener('change',()=>{stopPlayback('发音人已更换，点击开始以使用新声音。');const v=state.voices.get($('txt-voice').value);if(v)window.SpeechVoicePolicy?.save(v);setVoiceFromChoice();});
 $('txt-remote').addEventListener('change',()=>{stopPlayback('声音联网许可已变更。');refreshVoices();});
 $('txt-refresh-voices').addEventListener('click',refreshVoices);
 $('txt-default')?.addEventListener('click',()=>{window.SpeechVoicePolicy?.reset();$('txt-provider').value='all';refreshVoices();});
 $('txt-play').addEventListener('click',()=>startFromParagraph(state.activeIndex??0));
 $('txt-pause').addEventListener('click',()=>state.engine.pauseResume());
 $('txt-stop').addEventListener('click',()=>stopPlayback('已手动停止朗读。'));
 $('txt-prev').addEventListener('click',()=>startFromParagraph(Math.max(0,(state.activeIndex??0)-1)));
 $('txt-next').addEventListener('click',()=>startFromParagraph(Math.min(state.paragraphs.length-1,(state.activeIndex??0)+1)));
 $('txt-scope').addEventListener('change',()=>{stopPlayback('朗读范围已变更，请点击开始重新播放。');saveSettings();});
 $('txt-loop').addEventListener('change',()=>{if(state.session)state.session.loop=$('txt-loop').checked;});
 $('txt-timer').addEventListener('change',()=>{if(state.session){const t=Number($('txt-timer').value);state.session.deadline=t>0?Date.now()+t*60000:null;state.engine.setTimer(t);}});
 $('txt-restore').addEventListener('click',async()=>{let saved;try{saved=JSON.parse(localStorage.getItem('messiah-txt-last-position')||'null');}catch{}
   if(!saved?.path){status('txt-tts-status','没有保存的朗读位置。');return;}
   const entry=state.entries.find(e=>e.path===saved.path&&e.source===saved.source);if(!entry){status('txt-tts-status','原来的文件当前不在目录，请先重新选择对应的本机文件夹。');return;}
   if(saved.sha256&&entry.sha256!==saved.sha256){status('txt-tts-status','文件已修订，不能盲目沿用旧段落位置；请重新定位。');return;}
   const ok=await selectEntry(entry);if(!ok)return;
   if(saved.scope&&Array.from($('txt-scope').options).some(o=>o.value===saved.scope))$('txt-scope').value=saved.scope;
   $('txt-loop').checked=!!saved.loop;startFromParagraph(saved.paragraph||0);
 });
 window.addEventListener('pagehide',()=>stopPlayback());
}
async function readCatalog(){try{const response=await fetch(BASE+'index.json',{cache:'no-store'});
 if(!response.ok)throw Error('状态码 '+response.status);
 const payload=await response.json();if(!payload||!Array.isArray(payload.entries)||payload.schema!=='messiah-txt-3')throw Error('索引结构错误，请重新生成目录');
 if(payload.entries.length!==payload.count)throw Error('索引数量不符');
 state.catalog=payload;state.remoteOnly=payload.remote_only===true;state.site=payload.entries.map((e,i)=>({...e,id:'site:'+e.id,localIndex:i,source:'site'}));
 if(state.remoteOnly){gatewayReady=await probeGateway();}
 status('txt-index-summary',state.remoteOnly?'已加载网盘书目 '+num(state.site.length)+' 份、'+num(payload.categories.length)+' 个分类。当前网站访问方式：'+location.protocol.replace(':','').toUpperCase()+'。'+(gatewayReady?'已发现实际HTTP TXT读取接口；点击书名将进行正文校验。':'采用真实 /api/file 接口及主备服务器；当前HTTPS浏览器只可直接打开下载链接，HTTP站内读取仍取决于跨域许可。'):'已加载网站TXT '+num(state.site.length)+' 份（按需打开）。');
 }catch(e){state.site=[];status('txt-index-summary','网站TXT目录目前无法读取（'+e.message+'）。可直接选择本机文件夹阅读；网站部署后请核对TXT/index.json是否存在。');}
 rebuildEntries();
}
function rebuildEntries(){state.entries=[...state.site,...state.local];byId.clear();for(const e of state.entries)byId.set(e.id,e);
 state.entries.sort((a,b)=>a.category.localeCompare(b.category,'zh-CN')||a.folder.localeCompare(b.folder,'zh-CN')||a.title.localeCompare(b.title,'zh-CN'));
 updateFilterOptions();showNames();
}
async function addLocalFiles(fileList){if(!fileList||!fileList.length)return;
 if(state.selected?.source==='local'||state.session?.docs?.some(x=>x.source==='local')){stopPlayback('已切换本机文件夹，旧播放计划停止');state.selected=null;state.paragraphs=[];state.nodes=[];updateReadingTitle(null);$('txt-paper').replaceChildren(makeNode('p','txt-placeholder','本机文件夹已改变，请重新选择文件阅读。'));}
 const docs=[],seen=new Set();let bad=0;
 for(const f of Array.from(fileList)){if(!isTxt(f))continue;
  const raw=String(f.webkitRelativePath||f.name).replace(/\\/g,'/');const bits=raw.split('/').filter(Boolean);if(!bits.length)continue;
  const rel=bits.length>1?bits.slice(1).join('/'):bits[0];
  if(!rel||rel.split('/').some(x=>x==='..')||seen.has(rel.toLowerCase()))continue;seen.add(rel.toLowerCase());
  if(f.size>20_000_000){bad++;continue;}
  const relParts=rel.split('/'),folder=relParts.slice(0,-1).join('/'),category=relParts.length>1?relParts[0]:'未分类';
  docs.push({id:'local:'+rel,title:f.name.replace(/\.txt$/i,''),path:rel,folder,category,bytes:f.size,encoding:'utf-8',source:'local',file:f,sha256:null});
 }
 state.local=docs;state.bookCache.clear();$('txt-origin').value='all';rebuildEntries();
 status('txt-index-summary','已加载网站 '+num(state.site.length)+' 份及本机 '+num(state.local.length)+' 份。'+(bad?'跳过 '+num(bad)+' 份超过20MB的文本。':'')+' 本机文件不会上传网站。');
}
function installEvents(){
 $('txt-search-form').addEventListener('submit',async e=>{e.preventDefault();if($('txt-search-mode').value==='contents')await searchContents();else showNames();});
 $('txt-cancel-search').addEventListener('click',()=>cancelSearch(true));
 $('txt-search').addEventListener('input',()=>{if($('txt-search-mode').value==='names')showNames();});
 $('txt-search-mode').addEventListener('change',()=>{if($('txt-search-mode').value==='names')showNames();});
 for(const id of ['txt-origin','txt-category','txt-folder'])$(id).addEventListener('change',showNames);
 $('txt-reset').addEventListener('click',()=>{$('txt-search').value='';$('txt-search-mode').value='names';$('txt-origin').value='all';$('txt-category').value='';$('txt-folder').value='';showNames();});
 $('txt-list').addEventListener('click',e=>{const b=e.target.closest('button[data-id]');if(!b)return;
  const doc=byId.get(b.dataset.id);if(doc)selectEntry(doc);});
 $('txt-more').addEventListener('click',()=>renderList(false));
 $('txt-folder-picker').addEventListener('change',e=>{addLocalFiles(e.target.files).catch(err=>status('txt-index-summary','无法打开本机文件夹：'+err.message));});
 $('txt-single-picker')?.addEventListener('change',async e=>{try{await addLocalFiles(e.target.files);if(state.local[0])await selectEntry(state.local[0]);}catch(err){status('txt-index-summary','无法打开本机TXT：'+err.message);}});
 $('txt-test-remote')?.addEventListener('click',async()=>{const doc=state.site.find(x=>x.path.includes('5【被拒之惧】'))||state.site[0];if(!doc){status('txt-remote-status','在线目录尚未加载。');return;}
  if(location.protocol==='https:'&&!workingGateways.length){status('txt-remote-status','当前页面为HTTPS：无法跨协议读取HTTP正文。可点击书名，通过真实 /api/file 地址直接打开；站内阅读需要同源HTTPS代理。');return;}
  status('txt-remote-status','正在通过真实 /api/file 接口测试主备服务器，并核对字节数与SHA-256……');
  try{const buf=await remoteBookBuffer(doc);cachePut(doc,decodeBuffer(buf,doc.encoding));status('txt-remote-status','校验成功：已从真实文件接口读取 '+num(buf.byteLength)+' 字节，现在可以点击书名阅读和朗读。');}
  catch(e){status('txt-remote-status','读取测试未通过：'+e.message);}});
 $('txt-clear-local').addEventListener('click',()=>{if(state.session?.docs?.some(e=>e.source==='local'))stopPlayback('本机文件列表已改变，已安全停止播放');if(state.selected?.source==='local'){stopPlayback('本机文件列表已清除');state.selected=null;state.paragraphs=[];state.nodes=[];$('txt-paper').replaceChildren(makeNode('p','txt-placeholder','请从网站文件列表打开TXT，或重新选择本机文件夹。'));updateReadingTitle(null);}
  state.local=[];state.bookCache.clear();$('txt-folder-picker').value='';rebuildEntries();status('txt-index-summary','已清除本机文件列表；网站TXT仍有 '+num(state.site.length)+' 份。');});
 $('txt-paper').addEventListener('click',e=>{const p=e.target.closest('.txt-paragraph');if(p)startFromParagraph(Number(p.dataset.paragraph));});
 $('txt-paper').addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('.txt-paragraph')){e.preventDefault();startFromParagraph(Number(e.target.dataset.paragraph));}});
 $('txt-in-page-find').addEventListener('click',inPageFind);$('txt-in-page-next').addEventListener('click',nextInPage);
 $('txt-in-page').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();inPageFind();}});
 const watched=['txt-theme','txt-leading','txt-font-family','txt-width','txt-font','txt-rate','txt-volume','txt-follow'];
 for(const id of watched)$(id).addEventListener(id==='txt-font'||id==='txt-rate'||id==='txt-volume'?'input':'change',applyAppearance);
}
async function init(){restoreSettings();installEvents();installSpeech();await readCatalog();
 const book=new URL(location.href).searchParams.get('book');let initial=state.entries.find(x=>x.path===book&&x.source==='site');
 if(!initial)initial=state.local[0]||(!state.remoteOnly?state.site[0]:null);if(initial&&!(state.remoteOnly&&initial.source==='site'))await selectEntry(initial);else status('txt-results-status','已加载1360份网盘书目：可点击书名直接从真实文件接口打开；若浏览器阻止内嵌读取，可下载后用“打开刚下载的单份TXT”继续听读。');
}
init().catch(err=>status('txt-index-summary','TXT阅读器初始化失败：'+err.message));
})();
