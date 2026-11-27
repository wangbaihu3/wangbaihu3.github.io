/* TXT 目录、全文检索及连续朗读。依赖 tts.js 导出的 ReaderSpeech/ReaderSpeechSegments。 */
(function(){'use strict';
const $=id=>document.getElementById(id), BASE='/TXT/';
async function getHttpBuffer(url,entry,signal){
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),45000);
 const abort=()=>controller.abort();
 if(signal){if(signal.aborted)abort();else signal.addEventListener('abort',abort,{once:true});}
 try{
  const response=await fetch(url,{signal:controller.signal,mode:'cors',credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer'});
  if(!response.ok)throw Error('HTTP '+response.status);
  if(response.type==='opaque'||response.redirected)throw Error('文件接口返回不可读取的结果');
  const type=(response.headers.get('content-type')||'').toLowerCase();
  if(/text\/html|application\/xhtml\+xml/.test(type))throw Error('返回网页而非TXT正文');
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
const state={entries:[],site:[],local:[],visible:[],listed:0,selected:null,paragraphs:[],nodes:[],matches:[],matchAt:-1,
  catalog:null,bloom:null,bloomTried:false,bookCache:new Map(),session:null,flow:0,searchToken:0,searchAbort:null,loading:0,
  voices:new Map(),lastVoice:'',engine:null,voiceReady:false,loadAbort:null,pendingEntry:null,pendingAutomatic:false,sections:[],readSaveTimer:null,filterScroll:0};
const normalize=s=>String(s||'').normalize('NFKC').toLowerCase().trim();
const byId=new Map();
const status=(id,text)=>{const e=$(id);if(e)e.textContent=text;};
const num=n=>Number(n||0).toLocaleString('zh-CN');
const isTxt=f=>f&&/\.txt$/i.test(f.name||'');
const pathUrl=p=>{const parts=String(p).split('/');if(parts.some(x=>!x||x==='.'||x==='..'||x.includes('\\')))throw Error('TXT路径无效');return BASE+parts.map(x=>encodeURIComponent(x)).join('/');};
function setBusy(b){$('txt-cancel-search').hidden=!b;$('txt-search-form').querySelector('button[type="submit"]').disabled=b;}
function cacheGet(entry){const k=entry.id;const v=state.bookCache.get(k);if(v){state.bookCache.delete(k);state.bookCache.set(k,v);}return v;}
function cachePut(entry,content){state.bookCache.delete(entry.id);state.bookCache.set(entry.id,content);while(state.bookCache.size>4)state.bookCache.delete(state.bookCache.keys().next().value);}
function decodeBuffer(buffer,encoding){const data=new Uint8Array(buffer);let enc=encoding||'utf-8';
 if(data.length>1&&data[0]===255&&data[1]===254)enc='utf-16le';
 else if(data.length>1&&data[0]===254&&data[1]===255)enc='utf-16be';
 else if(data.length>2&&data[0]===239&&data[1]===187&&data[2]===191)enc='utf-8';
 try{return new TextDecoder(enc,{fatal:true}).decode(buffer).replace(/^\uFEFF/,'');}
 catch {try{return new TextDecoder('gb18030',{fatal:true}).decode(buffer).replace(/^\uFEFF/,'');}
 catch(e){throw Error('该TXT编码无法识别，请先转换为UTF-8');}}
}
async function bookText(entry,signal){if(signal?.aborted)throw Object.assign(Error('请求已取消'),{name:'AbortError'});const cached=cacheGet(entry);if(cached!==undefined)return cached;
 if(entry.bytes>20_000_000)throw Error('本文件超过20 MB，建议先拆分后再阅读');

let buffer;
if(entry.source==='local')buffer=await entry.file.arrayBuffer();
else {
  if(entry.bundled_path!==('books/'+String(entry.localIndex).padStart(4,'0')+'.txt'))throw Error('本站TXT映射不一致，请刷新');
  try{buffer=await getHttpBuffer(pathUrl(entry.bundled_path),entry,signal);}
  catch(localError){if(signal?.aborted)throw localError;throw Error('本站正文读取失败：'+localError.message+'。该原文可能尚未提供；可以在本页选择本机TXT继续阅读。');}
}
if(buffer.byteLength>20_000_000)throw Error('文件超过20MB');
if(entry.bytes>0&&buffer.byteLength!==entry.bytes)throw Error('文件大小与目录不一致，请重新生成TXT目录索引');
if(entry.source==='site'&&entry.sha256){
  const digest=window.SiteRuntime?.digest;
  if(typeof digest!=='function')throw Error('SHA-256校验模块缺失');
  const hash=await digest(new Uint8Array(buffer));
  if(hash!==entry.sha256)throw Error('文件与书目校验值不同，已阻止混版阅读');
}
 if(signal?.aborted)throw Object.assign(Error('请求已取消'),{name:'AbortError'});
 const text=decodeBuffer(buffer,entry.encoding);cachePut(entry,text);return text;
}
function paragraphsFromText(text){const lines=String(text).replace(/\r\n?/g,'\n').split('\n');const parts=[],joined=[];
 const flush=()=>{if(!joined.length)return;const block=joined.join('\n');joined.length=0;
   if(block.length<=4200){parts.push(block);return;}
   let remaining=block;while(remaining.length>4200){const tail=remaining.slice(2100,4200);let idx=Math.max(tail.lastIndexOf('。'),tail.lastIndexOf('！'),tail.lastIndexOf('？'),tail.lastIndexOf('\n'));
     let len=idx>=0?2100+idx+1:4200;const code=remaining.charCodeAt(len-1);if(code>=0xd800&&code<=0xdbff)len--;while(len<remaining.length&&/[\p{Mark}\uFE0E\uFE0F]/u.test(remaining[len]))len++;parts.push(remaining.slice(0,len));remaining=remaining.slice(len);}
   if(remaining)parts.push(remaining);
 };
 for(const line of lines){if(!line.trim()){flush();continue;}joined.push(line);}
 flush();return parts;
}
function makeNode(tag,cls,txt){const x=document.createElement(tag);if(cls)x.className=cls;if(txt!==undefined)x.textContent=txt;return x;}
function invalidateBookLoad(){state.loading++;state.loadAbort?.abort();state.loadAbort=null;state.pendingAutomatic=false;}
function updateReadingAvailability(){
 const loaded=!!state.selected&&state.paragraphs.length>0,active=['playing','paused'].includes(state.engine?.state),canSpeak=loaded&&!!state.engine;
 for(const id of ['txt-play','txt-prev','txt-next','txt-quick-play'])$(id).disabled=!canSpeak;
 for(const id of ['txt-pause','txt-quick-pause']){$(id).disabled=!active;$(id).textContent=state.engine?.state==='paused'?'继续朗读':'暂停';}
 for(const id of ['txt-stop','txt-quick-stop'])$(id).disabled=!active&&!state.session;
 $('txt-restore').disabled=!state.engine;
 $('txt-paragraph-jump').disabled=!loaded;$('txt-jump-button').disabled=!loaded;
 $('txt-in-page-find').disabled=!loaded;$('txt-in-page-next').disabled=!loaded||!state.matches.length;$('txt-in-page-prev').disabled=!loaded||!state.matches.length;
 updateReadingProgress();
}
function clearReading(message,entry=null){
 state.selected=null;state.paragraphs=[];state.nodes=[];state.activeIndex=null;state.matches=[];state.matchAt=-1;state.sections=[];
 $('txt-paper').replaceChildren(makeNode('p','txt-placeholder',message));$('txt-scrollport').scrollTop=0;
 $('txt-section').replaceChildren(new Option('尚未打开正文',''));$('txt-section').disabled=true;
 $('txt-in-page').value='';$('txt-paragraph-jump').value='1';$('txt-paragraph-jump').removeAttribute('max');
 updateReadingTitle(entry);status('txt-in-page-count',message);status('txt-section-note','目录只采用正文中实际识别到的标题；可按段落号定位全文。');updateReadingAvailability();
}
function renderParagraphs(){const paper=$('txt-paper');paper.replaceChildren();state.nodes=[];
 if(!state.paragraphs.length){paper.append(makeNode('p','txt-placeholder','该文本没有可显示的正文内容。'));return;}
 const frag=document.createDocumentFragment();for(let i=0;i<state.paragraphs.length;i++){
   const p=makeNode('p','txt-paragraph',state.paragraphs[i]);p.dataset.paragraph=String(i);p.id='txt-paragraph-'+(i+1);p.tabIndex=-1;frag.append(p);state.nodes.push(p);
 }paper.append(frag);buildDocumentIndex();
}
function buildDocumentIndex(){
 const select=$('txt-section');select.replaceChildren(new Option('选择正文中的标题',''));state.sections=[];
 const heading=/^(第[〇零一二三四五六七八九十百千万两0-9]{1,12}[卷编篇部章讲课节]|(?:序言|序论|前言|引言|导言|绪论|结语|结论|附录|后记|跋)(?:[\s：:一二三四五六七八九十0-9]|$))/;
 for(let i=0;i<state.paragraphs.length;i++){const title=state.paragraphs[i].split('\n',1)[0].trim();if(title.length<=80&&heading.test(title)){state.sections.push({index:i,title});select.append(new Option(title,String(i)));}}
 select.disabled=!state.sections.length;$('txt-paragraph-jump').max=String(state.paragraphs.length);
 status('txt-section-note',state.sections.length?'从正文识别到 '+num(state.sections.length)+' 个标题；标题后的内容与原文件一致。':'未识别到独立标题；仍可用段落号定位完整正文。');
}
function readingAnchor(){
 const port=$('txt-scrollport');if(!state.nodes.length)return {index:0,offset:0};
 const top=port.getBoundingClientRect().top+port.clientTop;let lo=0,hi=state.nodes.length-1;
 while(lo<hi){const mid=Math.floor((lo+hi)/2);if(state.nodes[mid].getBoundingClientRect().bottom<=top+4)lo=mid+1;else hi=mid;}
 return {index:lo,offset:Math.max(0,top-state.nodes[lo].getBoundingClientRect().top)};
}
function scrollToParagraph(index,opt={}){
 const i=Math.max(0,Math.min(state.nodes.length-1,Number(index)||0)),node=state.nodes[i],port=$('txt-scrollport');if(!node)return;
 const top=port.scrollTop+node.getBoundingClientRect().top-port.getBoundingClientRect().top-port.clientTop;
 port.scrollTo({top:Math.max(0,top+(Number(opt.offset)||0)-(Object.hasOwn(opt,'offset')?0:12)),behavior:'auto'});
 if(opt.focus)node.focus({preventScroll:true});
 if(opt.mark){state.nodes[state.activeIndex]?.removeAttribute('aria-current');state.activeIndex=i;node.setAttribute('aria-current','true');}
 $('txt-paragraph-jump').value=String(i+1);updateReadingProgress();
}
function highlight(i,scroll){state.nodes[state.activeIndex]?.removeAttribute('aria-current');state.activeIndex=i;
 const node=state.nodes[i];if(!node)return;node.setAttribute('aria-current','true');
 if(scroll&&$('txt-follow').checked){const r=node.getBoundingClientRect(),p=$('txt-scrollport').getBoundingClientRect();if(r.top<p.top+12||r.top>p.bottom-48)scrollToParagraph(i);}
}
function updateReadingProgress(){
 const port=$('txt-scrollport'),loaded=!!state.selected&&!!state.nodes.length,max=Math.max(0,port.scrollHeight-port.clientHeight);
 $('txt-page-up').disabled=!loaded||port.scrollTop<=1;$('txt-page-down').disabled=!loaded||port.scrollTop>=max-1;
 if(!loaded){status('txt-reading-progress',state.loadAbort?'正在加载正文':'尚未打开正文');return;}
 const anchor=readingAnchor(),percent=max>0?Math.min(100,Math.round(port.scrollTop/max*100)):100;
 status('txt-reading-progress','第 '+num(anchor.index+1)+'／'+num(state.nodes.length)+' 段 · '+percent+'%');
}
function turnScreen(direction){const port=$('txt-scrollport');if(!state.nodes.length)return;
 const line=parseFloat(getComputedStyle($('txt-paper')).lineHeight)||40;
 port.scrollBy({top:direction*Math.max(40,port.clientHeight-Math.min(line*1.5,port.clientHeight*.2)),behavior:'auto'});updateReadingProgress();
}
function entryMatchesRecord(entry,saved){
 if(!entry||!saved||entry.source!==saved.source||entry.path!==saved.path)return false;
 if(entry.source==='site')return !!saved.sha256&&entry.sha256===saved.sha256;
 return Number(saved.bytes)===entry.bytes&&Number(saved.lastModified)===Number(entry.file?.lastModified)&&saved.schema===2;
}
function saveReadingPosition(){if(!state.selected||!state.nodes.length)return;const at=readingAnchor();
 const e=state.selected,record={schema:2,path:e.path,source:e.source,sha256:e.sha256||null,bytes:e.bytes,lastModified:e.file?.lastModified||null,paragraph:at.index,offset:at.offset,saved:Date.now()};
 try{localStorage.setItem('messiah-txt-reading-position',JSON.stringify(record));}catch{}
}
function savedReading(){try{return JSON.parse(localStorage.getItem('messiah-txt-reading-position')||'null');}catch{return null;}}
async function resumeReading(){const saved=savedReading();if(!saved?.path){status('txt-workspace-status','尚未保存阅读位置。打开正文并阅读后会自动记录。');return;}
 const entry=state.entries.find(e=>entryMatchesRecord(e,saved));if(!entry){status('txt-workspace-status',saved.source==='local'?'请重新选择原来的本机文件。需要文件大小和修改时间一致，才恢复旧位置。':'原书不在当前目录，或内容已修订；请重新选择书籍。');showSidePane('library');return;}
 if(await selectEntry(entry,{restore:saved}))status('txt-workspace-status','已恢复《'+entry.title+'》第 '+num(saved.paragraph+1)+' 段附近的阅读位置。');
}
function updateReadingTitle(entry){
 status('txt-current-title',entry?entry.title+'（'+entry.category+' · '+num(entry.bytes)+' 字节）':'先选择一本书或本机文本');
 status('txt-book-heading',entry?entry.title:'开始阅读');
 status('txt-book-meta',entry?(entry.source==='local'?'本机文件':'本站书目')+' · '+entry.category+' · '+num(entry.bytes)+' 字节':'可选择本站书目，或直接打开自己的文本文件。');
}
function updateBookUrl(entry,opt={}){if(location.protocol==='file:'||opt.history===false)return;
 try{const u=new URL(location.href);u.searchParams.delete('book');u.searchParams.delete('p');if(entry.source==='site')u.searchParams.set('id',String(entry.localIndex));else u.searchParams.delete('id');
 const action=opt.replace||u.href===location.href?'replaceState':'pushState';history[action]({},'',u);}catch{}
}
async function selectEntry(entry,opt={}){
 if(!entry)return false;saveReadingPosition();if(!opt.automatic)stopPlayback('已切换文件，朗读停止');
 invalidateBookLoad();const my=state.loading,controller=new AbortController();state.loadAbort=controller;state.pendingEntry=entry;state.pendingAutomatic=!!opt.automatic;
 clearReading('正在加载并校验所选正文……',entry);$('txt-paper').setAttribute('aria-busy','true');updateBookUrl(entry,{history:opt.history,replace:opt.automatic});
 for(const n of $('txt-list').querySelectorAll('button[data-id]')){n.dataset.selected='false';n.setAttribute('aria-pressed','false');}
 const current=()=>my===state.loading&&(!opt.automatic||!Number.isInteger(opt.expectedFlow)||state.flow===opt.expectedFlow);
 try{const text=await bookText(entry,controller.signal);if(!current())return false;
   state.selected=entry;state.pendingEntry=null;state.paragraphs=paragraphsFromText(text);state.matches=[];state.matchAt=-1;state.activeIndex=null;
   renderParagraphs();updateReadingTitle(entry);status('txt-in-page-count','共 '+num(state.paragraphs.length)+' 段；可查找文字、按标题或段落定位。');
   $('txt-scrollport').scrollTop=0;
   if(opt.restore&&entryMatchesRecord(entry,opt.restore))scrollToParagraph(opt.restore.paragraph,{offset:opt.restore.offset});
   else if(Number.isInteger(opt.paragraph))scrollToParagraph(opt.paragraph,{mark:true});
   updateBookUrl(entry,{history:opt.history,replace:opt.automatic});
   for(const n of $('txt-list').querySelectorAll('button[data-id]')){const selected=n.dataset.id===entry.id;n.dataset.selected=String(selected);n.setAttribute('aria-pressed',String(selected));}
   if(!opt.automatic){if(window.matchMedia('(max-width:760px)').matches)setSideOpen(false);$('txt-book-heading').focus({preventScroll:true});revealReader();}
   status('txt-workspace-status','已打开《'+entry.title+'》。书目筛选已保留，可随时返回选书。');updateReadingAvailability();return true;
 }catch(e){if(!current())return false;
   state.selected=null;state.paragraphs=[];state.nodes=[];state.activeIndex=null;
   const paper=$('txt-paper');paper.replaceChildren(makeNode('p','txt-error-title','正文未能打开'),makeNode('p','txt-placeholder',e.name==='AbortError'?'读取已取消或超时，可以重试。':e.message));
   const actions=makeNode('div','actions'),retry=makeNode('button','secondary','重新读取本书'),choose=makeNode('button','secondary','选择其他书籍或本机文件');retry.type=choose.type='button';retry.dataset.readerAction='retry';choose.dataset.readerAction='library';actions.append(retry,choose);paper.append(actions);
   status('txt-in-page-count','当前没有已加载正文。');status('txt-workspace-status','《'+entry.title+'》未能打开，可重试或选择本机文本。');
   if(!opt.automatic){if(window.matchMedia('(max-width:760px)').matches)setSideOpen(false);revealReader();$('txt-book-heading').focus({preventScroll:true});}
   updateReadingAvailability();return false;
 }finally{if(my===state.loading){state.loadAbort=null;state.pendingAutomatic=false;$('txt-paper').setAttribute('aria-busy','false');updateWorkspaceSize();updateReadingAvailability();}}
}
function baseEntries(){let docs=state.entries.slice();const source=$('txt-origin').value,cat=$('txt-category').value,folder=$('txt-folder').value;
 return docs.filter(e=>(source==='all'||e.source===source)&&(!cat||e.category===cat)&&(!folder||e.folder===folder||e.folder.startsWith(folder+'/')));
}
function nameHit(entry,terms){const hay=normalize(entry.title+' '+entry.folder+' '+entry.category);return terms.every(t=>hay.includes(t));}
function queryTerms(){return normalize($('txt-search').value).split(/\s+/u).filter(Boolean);}
function updateFilterOptions(){const oldCategory=$('txt-category').value,oldFolder=$('txt-folder').value,origin=$('txt-origin').value;
 const source=state.entries.filter(e=>origin==='all'||e.source===origin),counts=new Map();for(const e of source)counts.set(e.category,(counts.get(e.category)||0)+1);
 const cats=[...counts.keys()].sort((a,b)=>a.localeCompare(b,'zh-CN'));
 $('txt-category').replaceChildren(new Option('全部分类',''));for(const x of cats)$('txt-category').append(new Option(x+'（'+num(counts.get(x))+'）',x));
 if(cats.includes(oldCategory))$('txt-category').value=oldCategory;
 const category=$('txt-category').value,folders=new Set();for(const entry of source){if(category&&entry.category!==category)continue;let path=entry.folder||'';while(path){folders.add(path);const cut=path.lastIndexOf('/');path=cut>=0?path.slice(0,cut):'';}}
 $('txt-folder').replaceChildren(new Option('全部文件夹（含子文件夹）',''));
 for(const folder of [...folders].sort((a,b)=>a.localeCompare(b,'zh-CN'))){const display=folder.replace(/^改革宗心灵辅导资料\/?/,'');$('txt-folder').append(new Option(display||folder,folder));}
 if(folders.has(oldFolder))$('txt-folder').value=oldFolder;
}
function saveFilters(){const value={query:$('txt-search').value,mode:$('txt-search-mode').value,origin:$('txt-origin').value,category:$('txt-category').value,folder:$('txt-folder').value};try{sessionStorage.setItem('messiah-txt-filters-v1',JSON.stringify(value));}catch{}}
function restoreFilters(){let saved;try{saved=JSON.parse(sessionStorage.getItem('messiah-txt-filters-v1')||'null');}catch{}if(!saved||typeof saved!=='object')return;
 $('txt-search').value=String(saved.query||'').slice(0,120);
 if(['names','contents'].includes(saved.mode))$('txt-search-mode').value=saved.mode;
 if(['all','site','local'].includes(saved.origin))$('txt-origin').value=saved.origin==='local'&&!state.local.length?'all':saved.origin;
 updateFilterOptions();if([...$('txt-category').options].some(o=>o.value===saved.category))$('txt-category').value=saved.category;updateFilterOptions();if([...$('txt-folder').options].some(o=>o.value===saved.folder))$('txt-folder').value=saved.folder;
 showNames();if($('txt-search-mode').value==='contents'&&queryTerms().length)status('txt-results-status','已恢复筛选。当前显示书名命中；点击搜索后重新核对正文，不会自动下载全文。');
}
function renderList(reset=true){if(reset){$('txt-list').replaceChildren();state.listed=0;}
 const slice=state.visible.slice(state.listed,state.listed+50),frag=document.createDocumentFragment();
 for(const e of slice){const card=makeNode('div','txt-file-card');card.setAttribute('role','listitem');const b=makeNode('button','txt-file-item');b.type='button';b.dataset.id=e.id;b.dataset.selected=String(state.selected?.id===e.id);b.setAttribute('aria-pressed',b.dataset.selected);
  const title=makeNode('strong','',e.title),folder=e.folder.replace(/^改革宗心灵辅导资料\/?/,''),desc=makeNode('small','',e.category+(folder?' · '+folder:'')+' · '+num(e.bytes)+' 字节'),src=makeNode('em','',e.source==='local'?'本机文件':'本站书目');b.append(title,desc,src);card.append(b);
  if(e.source==='site'){const a=document.createElement('a');a.href=pathUrl(e.bundled_path);a.target='_blank';a.rel='noopener noreferrer';a.className='txt-direct-file';a.textContent='打开原文文件';a.setAttribute('aria-label','在新窗口打开《'+e.title+'》的原文文件');card.append(a);}
  frag.append(card);
 }
 $('txt-list').append(frag);state.listed+=slice.length;$('txt-more').hidden=state.listed>=state.visible.length;$('txt-empty-results').hidden=state.visible.length>0;
}
function showNames(){cancelSearch(false);const ts=queryTerms();state.visible=baseEntries().filter(e=>nameHit(e,ts));renderList();saveFilters();
 status('txt-results-status','符合当前筛选的书目：'+num(state.visible.length)+' 份（共 '+num(state.entries.length)+' 份）'+($('txt-search-mode').value==='contents'&&ts.length?'。目前按书名预览；点击搜索核对正文。':'。'));
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
   if(spec.sha256){const hash=await window.SiteRuntime.digest(new Uint8Array(buf));if(hash!==spec.sha256)throw Error('全文预筛索引校验失败');}
   state.bloom=new Uint8Array(buf);return state.bloom;
 }catch(e){state.bloomTried=false;status('txt-results-status','全文预筛索引暂不可用，将逐本核验（可能较慢）：'+e.message);return null;}
}
function cancelSearch(show=true){state.searchToken++;state.searchAbort?.abort();state.searchAbort=null;setBusy(false);if(show)status('txt-results-status','已停止全文检索，之前找到的结果仍保留。');}
async function searchContents(){saveFilters();const ts=queryTerms();if(!ts.length){showNames();return;}
 cancelSearch(false);const token=++state.searchToken;const controller=new AbortController();state.searchAbort=controller;setBusy(true);
 const base=baseEntries(),nameHits=base.filter(e=>nameHit(e,ts));state.visible=nameHits.slice();renderList();
 try{const bloom=await loadBloom();if(token!==state.searchToken)return;
  const tokens=Array.from(new Set(ts.flatMap(tokenList)));
  const candidates=base.filter(e=>!nameHit(e,ts)&&(!bloom||bloomContains(bloom,e,tokens)));
  const lower=ts.map(normalize);let checked=0,failed=0,skipped=0,consecutiveSiteFailures=0,skipSite=false,fullMatches=0,attempted=0;const cap=120;
  for(const e of candidates){
    if(token!==state.searchToken||controller.signal.aborted)return;
    if(skipSite&&e.source==='site'){skipped++;continue;}
    attempted++;
    try{const content=await bookText(e,controller.signal);if(token!==state.searchToken||controller.signal.aborted)return;checked++;if(e.source==='site')consecutiveSiteFailures=0;
      if(lower.every(t=>normalize(content).includes(t))){state.visible.push(e);fullMatches++;}
    }catch(err){if(token!==state.searchToken||controller.signal.aborted||err.name==='AbortError')return;
      failed++;if(e.source==='site'&&++consecutiveSiteFailures>=3)skipSite=true;
    }
    if(attempted%8===0){renderList();status('txt-results-status','全文检索中：已成功读取 '+num(checked)+' 份，失败 '+num(failed)+' 份；全文命中 '+num(fullMatches)+' 份。');await new Promise(resolve=>setTimeout(resolve,0));}
    if(fullMatches>=cap)break;
  }
  if(token!==state.searchToken)return;
  const unvisited=Math.max(0,candidates.length-checked-failed-skipped);
  renderList();status('txt-results-status','书名命中 '+num(nameHits.length)+' 份；正文成功核对 '+num(checked)+' 份、全文命中 '+num(fullMatches)+' 份。'+
    (failed||skipped?'读取失败 '+num(failed)+' 份，跳过 '+num(skipped)+' 份。结果不完整，未读原文不能视为没有命中。可选择本机文件继续检索。':'')+
    (unvisited?'另有 '+num(unvisited)+' 份未核对；请缩小范围继续检索。':'')+
    (skipSite?'连续三份本站原文读取失败，已停止该来源的批量请求，本机文件仍照常检索。':''));
 }catch(e){if(token===state.searchToken)status('txt-results-status','全文检索失败：'+e.message);}
 finally{if(token===state.searchToken){state.searchAbort=null;setBusy(false);}}
}

function inPageFind(){const q=normalize($('txt-in-page').value);state.matches=[];state.matchAt=-1;
 for(const n of state.nodes)n.classList.remove('txt-match');
 if(!state.selected){status('txt-in-page-count','请先打开有正文的书籍。');return;}
 if(!q){status('txt-in-page-count','共 '+num(state.paragraphs.length)+' 段。');updateReadingAvailability();return;}
 for(let i=0;i<state.paragraphs.length;i++)if(normalize(state.paragraphs[i]).includes(q)){state.matches.push(i);state.nodes[i]?.classList.add('txt-match');}
 status('txt-in-page-count','本书找到 '+num(state.matches.length)+' 个匹配段落（段落数，不是词频）。');updateReadingAvailability();
 if(state.matches.length)nextInPage(1);
}
function nextInPage(direction=1){if(!state.matches.length){status('txt-in-page-count','请先在当前书中查找。');return;}
 state.matchAt=(state.matchAt+direction+state.matches.length)%state.matches.length;const i=state.matches[state.matchAt];
 $('txt-document-tools').open=false;scrollToParagraph(i,{focus:true,mark:true});
 status('txt-in-page-count','第 '+num(state.matchAt+1)+'／'+num(state.matches.length)+' 个匹配段落（第 '+num(i+1)+' 段）。');
 status('txt-workspace-status','已定位本书第 '+num(state.matchAt+1)+'／'+num(state.matches.length)+' 处匹配，可再次展开查找查看其他结果。');
}
function saveSettings(){const settings={theme:$('txt-theme').value,font:$('txt-font').value,leading:$('txt-leading').value,width:$('txt-width').value,family:$('txt-font-family').value,rate:$('txt-rate').value,volume:$('txt-volume').value,scope:$('txt-scope').value,follow:$('txt-follow').checked,remote:$('txt-remote').checked,provider:$('txt-provider').value,loop:$('txt-loop').checked};
 try{localStorage.setItem('messiah-txt-settings-v1',JSON.stringify(settings));}catch{}}
function applyAppearance(){const anchor=state.selected?readingAnchor():null,p=$('txt-reading-zone');p.dataset.theme=$('txt-theme').value;p.dataset.font=$('txt-font').value;
 p.dataset.leading=$('txt-leading').value;p.dataset.width=$('txt-width').value;p.dataset.family=$('txt-font-family').value;
 $('txt-font-value').textContent=$('txt-font').value;$('txt-rate-value').textContent=Number($('txt-rate').value).toFixed(1);
 if(state.engine){state.engine.rate=Number($('txt-rate').value);state.engine.volume=Number($('txt-volume').value);}
 if(anchor)scrollToParagraph(anchor.index,{offset:anchor.offset});saveSettings();updateReadingProgress();}
function restoreSettings(){let settings;try{settings=JSON.parse(localStorage.getItem('messiah-txt-settings-v1')||'null');}catch{}
 if(settings&&typeof settings==='object'){
  for(const [id,key] of [['txt-theme','theme'],['txt-leading','leading'],['txt-width','width'],['txt-font-family','family'],['txt-scope','scope'],['txt-provider','provider']]){
   if(settings[key]!=null&&Array.from($(id).options).some(o=>o.value===String(settings[key])))$(id).value=String(settings[key]);}
  for(const [id,key,min,max] of [['txt-font','font',16,36],['txt-rate','rate',0.5,2],['txt-volume','volume',0,1]]){const v=Number(settings[key]);if(settings[key]!=null&&Number.isFinite(v)&&v>=min&&v<=max)$(id).value=String(v);}
  for(const [id,key] of [['txt-follow','follow'],['txt-remote','remote'],['txt-loop','loop']])if(typeof settings[key]==='boolean')$(id).checked=settings[key];
 }applyAppearance();
}
function voiceProvider(v){return window.SpeechVoicePolicy?.classify(v)||'other';}
function voiceKey(v){return window.SpeechVoicePolicy?.voiceKey(v)||JSON.stringify([v.voiceURI||'',v.lang||'',v.name||'',v.localService===true]);}
function setVoiceFromChoice(){const voice=state.voices.get($('txt-voice').value);
 state.engine?.setVoice(voice&&(voice.localService===true||$('txt-remote').checked)?voice:null);state.engine&&(state.engine.allowRemote=$('txt-remote').checked);}
function refreshVoices(){const provider=$('txt-provider').value,previous=state.engine?.voice;
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
 const prior=previous&&state.voices.get(voiceKey(previous));if(prior&&(prior.localService===true||$('txt-remote').checked))decision.voice=prior;
 if(previous&&(!decision.voice||voiceKey(previous)!==voiceKey(decision.voice))&&(state.session||['playing','paused'].includes(state.engine.state)))stopPlayback('声音目录已改变，请确认发音人后重新开始。');
 select.value=decision.voice?voiceKey(decision.voice):'';setVoiceFromChoice();updateReadingAvailability();
 status('txt-voice-summary','默认微软在线小雨（HsiaoYu／zh-TW-HsiaoYuNeural）。浏览器实际报告 '+source.length+' 个声音：微软 '+(counts.microsoft||0)+'、谷歌 '+(counts.google||0)+'、其他 '+(counts.other||0)+'。'+(decision.voice?'实际选中：'+decision.voice.name+'（'+(decision.voice.localService===true?'本机':'浏览器联网')+'）。':(decision.reason||'小雨暂不可用。'))+' 小雨缺席时使用实际存在且已明示名称的中文备选。');
}
function stopPlayback(message){state.flow++;state.session=null;if(state.engine)state.engine.stop();
 if(state.pendingAutomatic){invalidateBookLoad();const paper=$('txt-paper');paper.setAttribute('aria-busy','false');const retry=makeNode('button','secondary','重新读取本书');retry.type='button';retry.dataset.readerAction='retry';paper.replaceChildren(makeNode('p','txt-placeholder','已停止连续读取。可以重新读取本书，或选择其他书籍。'),retry);status('txt-in-page-count','连续读取已停止。');}
 if(message)status('txt-tts-status',message);updateReadingAvailability();
}
function selectedDocs(scope,entry){if(scope==='paragraph'||scope==='file')return [entry];
 if(scope==='results'){const view=state.visible.slice();if(!view.some(x=>x.id===entry.id))view.unshift(entry);return view;}
 if(scope==='category')return state.entries.filter(e=>e.category===entry.category);
 if(scope==='folder'){const folder=entry.folder;return state.entries.filter(e=>e.folder===folder||(folder&&e.folder.startsWith(folder+'/')));}
 return state.entries.slice();
}
async function speechItems(fromIndex,onlyOne,token){let rows=[];
 const from=Math.max(0,Math.min(fromIndex,state.paragraphs.length-1));const end=onlyOne?from+1:state.paragraphs.length;
 for(let i=from;i<end;i++){
  if(token!==state.flow||!state.selected)return null;
  const value=state.paragraphs[i];const segments=typeof window.ReaderSpeechSegments==='function'?window.ReaderSpeechSegments(value,240):[];
  for(let j=0;j<segments.length;j++){const seg=segments[j];rows.push({text:seg.text,id:state.selected.id+':'+i+':'+j,pauseAfterMs:seg.pauseAfterMs,
      element:state.nodes[i],paragraphIndex:i,persist:true});}
  // TXT段落之间不追加毫秒级人为停顿。
  if(rows.length>30000)throw Error('单篇短句超过30000段，建议将这个文件分成若干TXT后再读；没有截断播放。');
  if((i-from)%24===0)await new Promise(resolve=>setTimeout(resolve,0));
 }
 return rows;
}
function voiceCheck(){if(!state.engine){status('txt-tts-status','当前浏览器没有朗读接口，文字阅读仍可使用。');return false;}
 setVoiceFromChoice();if(!state.engine.voice){status('txt-tts-status','尚未选择可播放的声音，请检查声音列表及联网许可。');return false;}
 return true;}
async function playLoaded(plan,para){if(!state.engine||!voiceCheck()){if(state.session===plan)state.session=null;updateReadingAvailability();return false;}
 if(plan.deadline!==null&&Date.now()>=plan.deadline){stopPlayback('达到定时停止时间，朗读已结束。');return false;}
 status('txt-tts-status','正在准备朗读，可随时停止……');
 const rows=await speechItems(para,plan.scope==='paragraph',plan.token);if(!rows||plan.token!==state.flow||state.session!==plan)return false;
 if(plan.deadline!==null&&Date.now()>=plan.deadline){stopPlayback('达到定时停止时间，未开始下一段。');return false;}
 if(!rows.length){stopPlayback('本文件没有可朗读的正文内容，已停止，未擅自跳过。');return false;}
 state.engine.setItems(rows,0);const ok=state.engine.play(0);
 if(ok&&plan.deadline!==null)state.engine.setTimer(Math.max(0.001,(plan.deadline-Date.now())/60000));
 if(!ok&&state.session===plan)state.session=null;updateReadingAvailability();return ok;
}
function startFromParagraph(index,restorePlan=null){if(!state.selected||!state.paragraphs.length){status('txt-tts-status','请先打开有正文的TXT文件。');return;}
 if(!voiceCheck())return;let start=Math.max(0,Math.min(Number(index)||0,state.paragraphs.length-1));
 stopPlayback();let scope=restorePlan?.scope||$('txt-scope').value;
 let docs=restorePlan?.docs?.slice()||selectedDocs(scope,state.selected);let docPos=docs.findIndex(x=>x.id===state.selected.id);if(docPos<0){docs.unshift(state.selected);docPos=0;}
 const minutes=Number($('txt-timer').value);const now=Date.now();
 const plan={scope,docs,docPos,paragraph:start,loop:restorePlan?.loop??$('txt-loop').checked,
   deadline:restorePlan&&Object.hasOwn(restorePlan,'deadline')?restorePlan.deadline:Number.isFinite(minutes)&&minutes>0?now+minutes*60000:null,token:state.flow};
 state.session=plan;highlight(start,true);updateReadingAvailability();
 playLoaded(plan,start).catch(e=>{if(state.session===plan&&state.flow===plan.token)stopPlayback('无法朗读：'+e.message);});
}
function endSession(msg){state.session=null;status('txt-tts-status',msg||'朗读范围已结束，未开启循环。');updateReadingAvailability();}
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
 status('txt-tts-status','当前浏览器不提供朗读接口，文字阅读、查找与翻屏仍可使用。');updateReadingAvailability();return;}
 state.engine=new window.ReaderSpeech(window.speechSynthesis,window.SpeechSynthesisUtterance,{
  onState(s){const e=$('txt-tts-status');if(e){const title=state.selected?.title||'';e.textContent=(title?title+'｜':'')+s.message+(s.total?'（短句 '+Math.min(s.index+1,s.total)+'／'+s.total+'）':'');}
   if(s.state==='ended'&&state.session){const plan=state.session,token=state.flow;Promise.resolve().then(()=>handleDocumentEnd(plan,token));}
   if(s.state==='error'){state.flow++;state.session=null;}
   if(s.state==='idle'&&state.session?.deadline!==null&&state.session&&Date.now()>=state.session.deadline){state.flow++;state.session=null;status('txt-tts-status','达到定时停止时间，朗读已停止。');}
   updateReadingAvailability();
  },
  onSegment(item){const i=item.paragraphIndex;if(Number.isInteger(i)){
    highlight(i,true);
    try{localStorage.setItem('messiah-txt-last-position',JSON.stringify({schema:2,path:state.selected?.path,source:state.selected?.source,sha256:state.selected?.sha256||null,bytes:state.selected?.bytes,lastModified:state.selected?.file?.lastModified||null,paragraph:i,saved:Date.now(),scope:state.session?.scope,loop:state.session?.loop}));}catch{}
   }}
 });
 state.engine.rate=Number($('txt-rate').value);state.engine.volume=Number($('txt-volume').value);
 state.engine.allowRemote=$('txt-remote').checked;refreshVoices();window.speechSynthesis.addEventListener?.('voiceschanged',refreshVoices);
 window.setTimeout(refreshVoices,350);window.setTimeout(refreshVoices,1400);
 $('txt-provider').addEventListener('change',()=>{stopPlayback('声音来源已改变，请选择发音人后重新开始。');refreshVoices();saveSettings();});
 $('txt-voice').addEventListener('change',()=>{stopPlayback('发音人已更换，点击开始以使用新声音。');const v=state.voices.get($('txt-voice').value);if(v)window.SpeechVoicePolicy?.save(v);setVoiceFromChoice();});
 $('txt-remote').addEventListener('change',()=>{stopPlayback('声音联网许可已变更。');refreshVoices();saveSettings();});
 $('txt-refresh-voices').addEventListener('click',refreshVoices);
 $('txt-default')?.addEventListener('click',()=>{window.SpeechVoicePolicy?.reset();$('txt-provider').value='all';refreshVoices();saveSettings();});
 $('txt-play').addEventListener('click',()=>startFromParagraph(state.activeIndex??readingAnchor().index));
 $('txt-pause').addEventListener('click',()=>state.engine.pauseResume());
 $('txt-stop').addEventListener('click',()=>stopPlayback('已手动停止朗读。'));
 $('txt-prev').addEventListener('click',()=>startFromParagraph(Math.max(0,(state.activeIndex??readingAnchor().index)-1),state.session));
 $('txt-next').addEventListener('click',()=>startFromParagraph(Math.min(state.paragraphs.length-1,(state.activeIndex??readingAnchor().index)+1),state.session));
 $('txt-scope').addEventListener('change',()=>{stopPlayback('朗读范围已变更，请点击开始重新播放。');saveSettings();});
 $('txt-loop').addEventListener('change',()=>{if(state.session)state.session.loop=$('txt-loop').checked;saveSettings();});
 $('txt-timer').addEventListener('change',()=>{if(state.session){const t=Number($('txt-timer').value);state.session.deadline=t>0?Date.now()+t*60000:null;state.engine.setTimer(t);}});
 $('txt-restore').addEventListener('click',async()=>{let saved;try{saved=JSON.parse(localStorage.getItem('messiah-txt-last-position')||'null');}catch{}
   if(!saved?.path){status('txt-tts-status','没有保存的朗读位置。');return;}
   const entry=state.entries.find(e=>e.path===saved.path&&e.source===saved.source);if(!entry){status('txt-tts-status','原来的文件当前不在目录，请先重新选择对应的本机文件夹。');return;}
   if(!entryMatchesRecord(entry,saved)){status('txt-tts-status','无法确认原文件内容与记录一致；请重新打开文件定位。');return;}
   const ok=await selectEntry(entry);if(!ok)return;
   if(saved.scope&&Array.from($('txt-scope').options).some(o=>o.value===saved.scope))$('txt-scope').value=saved.scope;
   $('txt-loop').checked=!!saved.loop;startFromParagraph(saved.paragraph||0);
 });
}
async function readCatalog(){const retry=$('txt-retry-catalog');retry.disabled=true;status('txt-index-summary','正在读取并核对本站书目……');let success=false;
 try{const payload=await window.SiteRuntime.json('/TXT/index.json');
  if(!payload||!Array.isArray(payload.entries)||payload.schema!=='messiah-txt-3')throw Error('索引结构错误，请重新生成目录');
  if(payload.entries.length!==payload.count||payload.count!==1360)throw Error('索引数量不符');
  if(payload.bundled!==true||payload.remote_only!==false)throw Error('书目缺少已知的本站正文映射');
  const entries=payload.entries.map(e=>({...e,id:'site:'+e.id,localIndex:e.id,source:'site'}));
  if(new Set(entries.map(e=>e.id)).size!==entries.length||entries.some(e=>!Number.isInteger(e.localIndex)||e.localIndex<0||typeof e.title!=='string'||typeof e.path!=='string'||typeof e.category!=='string'||typeof e.folder!=='string'||e.bundled_path!==('books/'+String(e.localIndex).padStart(4,'0')+'.txt')))throw Error('本站书目编号、字段或正文路径不一致');
  state.catalog=payload;state.site=entries;state.bloom=null;state.bloomTried=false;success=true;
  status('txt-index-summary','已核对 '+num(state.site.length)+' 条本站书目。原文按需读取；未提供的正文可用本机文件阅读。');retry.hidden=true;
 }catch(e){status('txt-index-summary','本站书目暂未读取成功：'+e.message+'。可重试，也可直接打开本机文本。');retry.hidden=false;
 }finally{retry.disabled=false;rebuildEntries();}return success;
}
function rebuildEntries(){state.entries=[...state.site,...state.local];byId.clear();for(const e of state.entries)byId.set(e.id,e);
 state.entries.sort((a,b)=>a.category.localeCompare(b.category,'zh-CN')||a.folder.localeCompare(b.folder,'zh-CN')||a.title.localeCompare(b.title,'zh-CN'));
 updateFilterOptions();showNames();
}
function resetLocalReader(message){
 if(state.selected?.source==='local'||state.pendingEntry?.source==='local'){
  saveReadingPosition();invalidateBookLoad();stopPlayback(message);state.pendingEntry=null;clearReading(message);$('txt-paper').setAttribute('aria-busy','false');
 }else if(state.session?.docs?.some(x=>x.source==='local'))stopPlayback(message);
 for(const key of state.bookCache.keys())if(key.startsWith('local:'))state.bookCache.delete(key);
}
async function addLocalFiles(fileList,opt={}){if(!fileList||!fileList.length)return [];
 const docs=[],seen=new Set();let oversized=0,ignored=0,duplicate=0;
 for(const f of Array.from(fileList)){if(!isTxt(f)){ignored++;continue;}
  const raw=String(f.webkitRelativePath||f.name).replace(/\\/g,'/'),bits=raw.split('/').filter(Boolean);if(!bits.length)continue;
  const rel=bits.length>1?bits.slice(1).join('/'):bits[0];
  if(!rel||rel.split('/').some(x=>x==='..'||x==='.')||seen.has(rel)){duplicate++;continue;}seen.add(rel);
  if(f.size>20_000_000){oversized++;continue;}
  const parts=rel.split('/'),folder=parts.slice(0,-1).join('/'),category=parts.length>1?parts[0]:'未分类';
  docs.push({id:'local:'+rel,title:f.name.replace(/\.txt$/i,''),path:rel,folder,category,bytes:f.size,encoding:'utf-8',source:'local',file:f,sha256:null});
 }
 if(!docs.length){status('txt-index-summary','所选内容没有可读取的文本。'+(oversized?'有 '+num(oversized)+' 份超过20兆字节。':'')+'原来的本机列表已保留。');return [];}
 resetLocalReader('本机文件列表已改变，请重新选择正文。');
 if(opt.append){const merged=new Map(state.local.map(e=>[e.id,e]));for(const e of docs)merged.set(e.id,e);state.local=[...merged.values()];}else state.local=docs;
 $('txt-origin').value='local';$('txt-category').value='';$('txt-folder').value='';$('txt-search').value='';$('txt-search-mode').value='names';rebuildEntries();
 status('txt-index-summary','本站 '+num(state.site.length)+' 条书目；本机 '+num(state.local.length)+' 份文本。'+(oversized?'跳过 '+num(oversized)+' 份超过20兆字节的文件。':'')+(ignored?'忽略 '+num(ignored)+' 份非文本文件。':'')+(duplicate?'忽略 '+num(duplicate)+' 个重复或无效路径。':'')+'文件只在本页读取，不会上传。');
 status('txt-workspace-status','本机文件已载入，已切换到本机列表并清除旧筛选。');return docs;
}
function installEvents(){
 $('txt-search-form').addEventListener('submit',async e=>{e.preventDefault();if($('txt-search-mode').value==='contents')await searchContents();else showNames();});
 $('txt-cancel-search').addEventListener('click',()=>cancelSearch(true));
 $('txt-search').addEventListener('input',showNames);
 $('txt-search-mode').addEventListener('change',showNames);
 $('txt-origin').addEventListener('change',()=>{$('txt-category').value='';$('txt-folder').value='';updateFilterOptions();showNames();});
 $('txt-category').addEventListener('change',()=>{$('txt-folder').value='';updateFilterOptions();showNames();});
 $('txt-folder').addEventListener('change',showNames);
 $('txt-reset').addEventListener('click',()=>{$('txt-search').value='';$('txt-search-mode').value='names';$('txt-origin').value='all';$('txt-category').value='';$('txt-folder').value='';updateFilterOptions();showNames();$('txt-search').focus();});
 $('txt-list').addEventListener('click',e=>{const b=e.target.closest('button[data-id]');if(!b)return;const doc=byId.get(b.dataset.id);if(doc)selectEntry(doc);});
 $('txt-more').addEventListener('click',()=>renderList(false));
 $('txt-retry-catalog').addEventListener('click',async()=>{const filters={query:$('txt-search').value,origin:$('txt-origin').value,category:$('txt-category').value,folder:$('txt-folder').value,mode:$('txt-search-mode').value};await readCatalog();try{sessionStorage.setItem('messiah-txt-filters-v1',JSON.stringify(filters));}catch{}restoreFilters();});
 $('txt-folder-picker').addEventListener('change',async e=>{try{const added=await addLocalFiles(e.target.files);if(added.length){showSidePane('library');$('txt-pane-library').scrollTop=$('txt-search-form').offsetTop-$('txt-pane-library').offsetTop;}}catch(err){status('txt-index-summary','无法打开本机文件夹：'+err.message);}finally{e.target.value='';}});
 $('txt-single-picker').addEventListener('change',async e=>{try{const added=await addLocalFiles(e.target.files,{append:true});if(added[0])await selectEntry(added[0]);}catch(err){status('txt-index-summary','无法打开本机文本：'+err.message);}finally{e.target.value='';}});
 $('txt-clear-local').addEventListener('click',()=>{resetLocalReader('本机文件列表已清除；可选择本站书籍或重新打开本机文件。');state.local=[];$('txt-folder-picker').value='';$('txt-single-picker').value='';if($('txt-origin').value==='local')$('txt-origin').value='all';rebuildEntries();status('txt-index-summary','已清除本机文件列表；本站书目仍有 '+num(state.site.length)+' 条。');});
 $('txt-paper').addEventListener('click',e=>{const action=e.target.closest('[data-reader-action]');if(action){if(action.dataset.readerAction==='library')showSidePane('library');if(action.dataset.readerAction==='retry'&&state.pendingEntry)selectEntry(state.pendingEntry);return;}
  const p=e.target.closest('.txt-paragraph');if(p&&window.getSelection()?.isCollapsed!==false)startFromParagraph(Number(p.dataset.paragraph));});
 $('txt-paper').addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('.txt-paragraph')){e.preventDefault();startFromParagraph(Number(e.target.dataset.paragraph));}});
 $('txt-in-page-find').addEventListener('click',inPageFind);$('txt-in-page-next').addEventListener('click',()=>nextInPage(1));$('txt-in-page-prev').addEventListener('click',()=>nextInPage(-1));
 $('txt-in-page').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();inPageFind();}});
 $('txt-in-page').addEventListener('input',()=>{state.matches=[];state.matchAt=-1;for(const n of state.nodes)n.classList.remove('txt-match');updateReadingAvailability();status('txt-in-page-count',$('txt-in-page').value?'点击查找，重新核对本书中的文字。':'请输入文字以查找本书。');});
 $('txt-section').addEventListener('change',()=>{if($('txt-section').value==='')return;const i=Number($('txt-section').value);$('txt-document-tools').open=false;scrollToParagraph(i,{focus:true,mark:true});saveReadingPosition();});
 $('txt-jump-form').addEventListener('submit',e=>{e.preventDefault();const n=Number($('txt-paragraph-jump').value);if(!Number.isInteger(n)||n<1||n>state.nodes.length){status('txt-in-page-count','请输入 1 至 '+num(state.nodes.length)+' 之间的段落号。');return;}$('txt-document-tools').open=false;scrollToParagraph(n-1,{focus:true,mark:true});saveReadingPosition();});
 $('txt-page-up').addEventListener('click',()=>turnScreen(-1));$('txt-page-down').addEventListener('click',()=>turnScreen(1));
 $('txt-scrollport').addEventListener('keydown',e=>{if(e.target!==$('txt-scrollport'))return;if(e.altKey||e.ctrlKey||e.metaKey)return;
  if(e.key==='PageDown'||e.key==='PageUp'){e.preventDefault();turnScreen(e.key==='PageDown'?1:-1);}else if(e.key==='Home'||e.key==='End'){e.preventDefault();$('txt-scrollport').scrollTo({top:e.key==='Home'?0:$('txt-scrollport').scrollHeight,behavior:'auto'});}});
 $('txt-scrollport').addEventListener('scroll',()=>{updateReadingProgress();clearTimeout(state.readSaveTimer);state.readSaveTimer=setTimeout(saveReadingPosition,250);},{passive:true});
 $('txt-document-tools').addEventListener('toggle',updateWorkspaceSize);
 $('txt-resume-reading').addEventListener('click',resumeReading);
 const watched=['txt-theme','txt-leading','txt-font-family','txt-width','txt-font','txt-rate','txt-volume','txt-follow'];
 for(const id of watched)$(id).addEventListener(['txt-font','txt-rate','txt-volume'].includes(id)?'input':'change',applyAppearance);
 $('txt-reset-appearance').addEventListener('click',()=>{for(const [id,value] of [['txt-theme','paper'],['txt-font','20'],['txt-leading','21'],['txt-font-family','serif'],['txt-width','820']])$(id).value=value;applyAppearance();status('txt-workspace-status','已恢复浅底黑字、20号字、宽松行距与舒适宽度；阅读位置和朗读设置保留。');});
 window.addEventListener('pagehide',()=>{saveReadingPosition();cancelSearch(false);invalidateBookLoad();stopPlayback();});
 window.addEventListener('popstate',()=>{loadFromUrl().catch(err=>status('txt-workspace-status','无法恢复链接中的书籍：'+err.message));});
 window.addEventListener('resize',updateWorkspaceSize);window.addEventListener('scroll',updateWorkspaceSize,{passive:true});window.visualViewport?.addEventListener('resize',updateWorkspaceSize);
 if(typeof ResizeObserver==='function')new ResizeObserver(updateReadingProgress).observe($('txt-scrollport'));
}
function activateSidePane(pane){
 if(!$('txt-pane-library').hidden)state.filterScroll=$('txt-pane-library').scrollTop;
 for(const id of ['library','play','display']){const active=id===pane,tab=$('txt-tab-'+id),panel=$('txt-pane-'+id);tab.classList.toggle('is-active',active);tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;panel.hidden=!active;}
 if(pane==='library')$('txt-pane-library').scrollTop=state.filterScroll;
}
function setSideOpen(open){document.querySelector('.txt-layout').dataset.panelOpen=String(open);$('txt-toggle-side').setAttribute('aria-expanded',String(open));$('txt-toggle-side').textContent=open?'收起书目与设置':'书目与设置';updateWorkspaceSize();}
function showSidePane(pane){setSideOpen(true);activateSidePane(pane);$('txt-tab-'+pane).focus({preventScroll:true});
 if(window.matchMedia('(max-width:760px)').matches)$('txt-side').scrollIntoView({block:'start',behavior:'auto'});
}
function revealReader(){if(window.matchMedia('(max-width:760px)').matches)$('txt-reading-zone').scrollIntoView({block:'start',behavior:'auto'});}
function updateWorkspaceSize(){
 const layout=document.querySelector('.txt-layout'),main=document.querySelector('.txt-main');if(!layout||!main)return;
 const mobile=window.matchMedia('(max-width:760px)').matches,sideOpen=layout.dataset.panelOpen==='true';
 const top=Math.max(12,Math.round((mobile?main:layout).getBoundingClientRect().top));
 const viewport=window.visualViewport?.height||window.innerHeight;
 const available=Math.max(Math.min(440,viewport-24),Math.round(viewport-top-12));
 layout.style.setProperty('--txt-workspace-height',available+'px');
 const zone=$('txt-reading-zone'),chrome=['.txt-book-header','.txt-reader-toolbar','.txt-page-controls','.txt-reader-help'].reduce((sum,selector)=>sum+(zone.querySelector(selector)?.getBoundingClientRect().height||0),2);
 const toolsHeight=Math.max(44,Math.min(available*.3,available-chrome-200));
 layout.style.setProperty('--txt-tools-height',Math.floor(toolsHeight)+'px');
 if(!mobile||!sideOpen)updateReadingProgress();
}
function installDualPane(){
 const tabs=[...document.querySelectorAll('.txt-side-tabs button[data-pane]')];for(const button of tabs){button.addEventListener('click',()=>activateSidePane(button.dataset.pane));button.addEventListener('keydown',e=>{let i=tabs.indexOf(button);if(e.key==='ArrowRight')i=(i+1)%tabs.length;else if(e.key==='ArrowLeft')i=(i+tabs.length-1)%tabs.length;else if(e.key==='Home')i=0;else if(e.key==='End')i=tabs.length-1;else return;e.preventDefault();activateSidePane(tabs[i].dataset.pane);tabs[i].focus();});}
 for(const [quick,control] of Object.entries({'txt-quick-play':'txt-play','txt-quick-pause':'txt-pause','txt-quick-stop':'txt-stop'}))$(quick).addEventListener('click',()=>$(control).click());
 $('txt-quick-controls').addEventListener('click',()=>showSidePane('play'));$('txt-quick-display').addEventListener('click',()=>showSidePane('display'));$('txt-show-library').addEventListener('click',()=>showSidePane('library'));
 $('txt-toggle-side').addEventListener('click',()=>{const open=$('txt-toggle-side').getAttribute('aria-expanded')!=='true';setSideOpen(open);if(open){const tab=tabs.find(t=>t.getAttribute('aria-selected')==='true')||tabs[0];tab.focus({preventScroll:true});if(window.matchMedia('(max-width:760px)').matches)$('txt-side').scrollIntoView({block:'start',behavior:'auto'});}else{$('txt-scrollport').focus({preventScroll:true});revealReader();}});
 const media=window.matchMedia('(max-width:760px)');setSideOpen(!media.matches);media.addEventListener?.('change',()=>setSideOpen(!media.matches));activateSidePane('library');updateWorkspaceSize();
}
async function loadFromUrl(){const query=new URL(location.href).searchParams,book=query.get('book'),id=query.get('id'),p=query.get('p');
 const initial=state.entries.find(x=>x.source==='site'&&(x.path===book||(id!==null&&x.id==='site:'+id)));
 if(initial){const n=Number(p);return selectEntry(initial,{history:false,paragraph:p!==null&&Number.isInteger(n)&&n>0?n-1:undefined});}
 if(book!==null||id!==null){saveReadingPosition();invalidateBookLoad();stopPlayback();state.pendingEntry=null;clearReading('链接中的书籍不在当前目录，请重新选择书目。');status('txt-workspace-status','该书籍链接没有匹配的本站书目。');}
 else if(state.selected?.source==='site'||state.pendingEntry?.source==='site'){saveReadingPosition();invalidateBookLoad();stopPlayback();state.pendingEntry=null;clearReading('已返回书库，可选择书籍继续阅读。');}
 return false;
}
async function init(){let previousFilters;try{previousFilters=sessionStorage.getItem('messiah-txt-filters-v1');}catch{}restoreSettings();installEvents();installSpeech();installDualPane();await readCatalog();if(previousFilters)try{sessionStorage.setItem('messiah-txt-filters-v1',previousFilters);}catch{}restoreFilters();updateReadingAvailability();await loadFromUrl();}
init().catch(err=>{status('txt-index-summary','阅读器初始化失败：'+err.message);$('txt-retry-catalog').hidden=false;});
})();
