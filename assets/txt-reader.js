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
else {
  if(entry.bundled_path!==('books/'+String(entry.localIndex).padStart(4,'0')+'.txt'))throw Error('本站TXT映射不一致，请刷新');
  try{buffer=await getHttpBuffer(pathUrl(entry.bundled_path),entry,signal);}
  catch(localError){if(signal?.aborted)throw localError;throw Error('本站正文读取失败：'+localError.message+'。请核对完整网站是否已发布到主分支、本站正文文件是否存在。不会跳转到网盘。');}
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
 if(!opt.automatic){state.selected=null;state.paragraphs=[];state.nodes=[];state.activeIndex=null;state.matches=[];state.matchAt=-1;updateReadingTitle(entry);$('txt-paper').replaceChildren(makeNode('p','txt-placeholder','正在加载并校验所选正文……'));}
 status('txt-in-page-count','正在读取正文……');
 try{const text=await bookText(entry);
   if(my!==state.loading||(opt.automatic&&Number.isInteger(opt.expectedFlow)&&state.flow!==opt.expectedFlow))return false;
   state.selected=entry;state.paragraphs=paragraphsFromText(text);state.matches=[];state.matchAt=-1;state.activeIndex=null;
   renderParagraphs();updateReadingTitle(entry);if(!opt.automatic)activateSidePane('play');status('txt-in-page-count','共'+num(state.paragraphs.length)+'段；点击段落即可朗读。');
   const encoded=encodeURIComponent(entry.path);if(!opt.automatic&&location.protocol!=='file:'){try{history.replaceState({},'',location.pathname+'?book='+encoded);}catch{ /* about:blank/strict embed: do not lose the book */ }}
   if(!opt.automatic){for(const n of $('txt-list').querySelectorAll('button[data-id]'))n.dataset.selected=String(n.dataset.id===entry.id);}return true;
 }catch(e){if(my===state.loading){status('txt-in-page-count','文件打开失败：'+e.message);const paper=$('txt-paper');paper.replaceChildren(makeNode('p','txt-placeholder','无法显示该TXT：'+e.message));if(entry.source==='site'){const link=document.createElement('a');link.href=pathUrl(entry.bundled_path);link.textContent='检查本站原始TXT文件';link.target='_blank';link.rel='noopener noreferrer';paper.append(link);}}return false;}
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
  const title=makeNode('strong','',e.title),desc=makeNode('small','',e.category+' · '+e.folder.replace(/^改革宗心灵辅导资料\/?/,'')+' · '+num(e.bytes)+' 字节'),src=makeNode('em','',e.source==='local'?'本机导入':'本站完整正文');
  b.append(title,desc,src);frag.append(b);
  if(e.source==='site'){
    const a=document.createElement('a');a.href=pathUrl(e.bundled_path);a.target='_blank';a.rel='noopener noreferrer';
    a.className='txt-direct-file';a.textContent='直接打开TXT原文件';a.title='直接打开本站原始TXT正文';
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
   if(spec.sha256){const hash=await window.SiteRuntime.digest(new Uint8Array(buf));if(hash!==spec.sha256)throw Error('全文预筛索引校验失败');}
   state.bloom=new Uint8Array(buf);return state.bloom;
 }catch(e){status('txt-results-status','全文预筛索引暂不可用，将逐本核验（可能较慢）：'+e.message);return null;}
}
function cancelSearch(show=true){state.searchToken++;state.searchAbort?.abort();state.searchAbort=null;setBusy(false);if(show)status('txt-results-status','已停止全文检索，之前找到的结果仍保留。');}
async function searchContents(){const ts=queryTerms();if(!ts.length){showNames();return;}
 cancelSearch(false);const token=++state.searchToken;const controller=new AbortController();state.searchAbort=controller;setBusy(true);
 const base=baseEntries(),nameHits=base.filter(e=>nameHit(e,ts));state.visible=nameHits.slice();renderList();
 try{let bloom=await loadBloom();if(token!==state.searchToken)return;
  const tokens=Array.from(new Set(ts.flatMap(tokenList)));
  const candidates=base.filter(e=>!nameHit(e,ts)&&(!bloom||bloomContains(bloom,e,tokens)));
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
function refreshVoices(){const provider=$('txt-provider').value;
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
 status('txt-voice-summary','默认微软在线小雨（HsiaoYu／zh-TW-HsiaoYuNeural）。浏览器实际报告 '+source.length+' 个声音：微软 '+(counts.microsoft||0)+'、谷歌 '+(counts.google||0)+'、其他 '+(counts.other||0)+'。'+(decision.voice?'实际选中：'+decision.voice.name+'（'+(decision.voice.localService===true?'本机':'浏览器联网')+'）。':(decision.reason||'小雨暂不可用。'))+' 小雨缺席时使用实际存在且已明示名称的中文备选。');
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
  const value=state.paragraphs[i];const segments=typeof window.ReaderSpeechSegments==='function'?window.ReaderSpeechSegments(value,240):[];
  for(let j=0;j<segments.length;j++){const seg=segments[j];rows.push({text:seg.text,id:state.selected.id+':'+i+':'+j,pauseAfterMs:seg.pauseAfterMs,
      element:state.nodes[i],paragraphIndex:i,persist:true});}
  // TXT段落之间不追加毫秒级人为停顿。
  if(rows.length>30000)throw Error('单篇短句超过30000段，建议将这个文件分成若干TXT后再读；没有截断播放。');
 }
 return rows;
}
function voiceCheck(){if(!state.engine){status('txt-tts-status','当前浏览器没有朗读接口，无法开始TTS。');return false;}
 setVoiceFromChoice();if(!state.engine.voice){status('txt-tts-status','当前未检测到可播放的中文声音，请刷新声音列表。联网声音已默认启用，可取消。');return false;}
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
 $('txt-remote').checked=true;state.engine.allowRemote=true;refreshVoices();window.speechSynthesis.addEventListener?.('voiceschanged',refreshVoices);
 window.setTimeout(refreshVoices,350);window.setTimeout(refreshVoices,1400);
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
async function readCatalog(){try{const payload=await window.SiteRuntime.json('/TXT/index.json');
 if(!payload||!Array.isArray(payload.entries)||payload.schema!=='messiah-txt-3')throw Error('索引结构错误，请重新生成目录');
 if(payload.entries.length!==payload.count||payload.count!==1360)throw Error('索引数量不符');
 if(payload.bundled!==true||payload.remote_only!==false)throw Error('当前版本不是完整内置书库');
 state.catalog=payload;state.site=payload.entries.map((e,i)=>({...e,id:'site:'+e.id,localIndex:e.id,source:'site'}));
 if(state.site.some(e=>e.bundled_path!==('books/'+String(e.localIndex).padStart(4,'0')+'.txt')))throw Error('本站正文路径与编号不一致');
 status('txt-index-summary','已加载本站完整TXT '+num(state.site.length)+' 份；直接读取本站正文。');
 }catch(e){state.site=[];status('txt-index-summary','本站书库尚未完整发布：'+e.message+'。请核对主分支和正式网站版本，不会转用网盘。');throw e;}
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
 $('txt-clear-local').addEventListener('click',()=>{if(state.session?.docs?.some(e=>e.source==='local'))stopPlayback('本机文件列表已改变，已安全停止播放');if(state.selected?.source==='local'){stopPlayback('本机文件列表已清除');state.selected=null;state.paragraphs=[];state.nodes=[];$('txt-paper').replaceChildren(makeNode('p','txt-placeholder','请从网站文件列表打开TXT，或重新选择本机文件夹。'));updateReadingTitle(null);}
  state.local=[];state.bookCache.clear();$('txt-folder-picker').value='';rebuildEntries();status('txt-index-summary','已清除本机文件列表；网站TXT仍有 '+num(state.site.length)+' 份。');});
 $('txt-paper').addEventListener('click',e=>{const p=e.target.closest('.txt-paragraph');if(p)startFromParagraph(Number(p.dataset.paragraph));});
 $('txt-paper').addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('.txt-paragraph')){e.preventDefault();startFromParagraph(Number(e.target.dataset.paragraph));}});
 $('txt-in-page-find').addEventListener('click',inPageFind);$('txt-in-page-next').addEventListener('click',nextInPage);
 $('txt-in-page').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();inPageFind();}});
 const watched=['txt-theme','txt-leading','txt-font-family','txt-width','txt-font','txt-rate','txt-volume','txt-follow'];
 for(const id of watched)$(id).addEventListener(id==='txt-font'||id==='txt-rate'||id==='txt-volume'?'input':'change',applyAppearance);
}
function activateSidePane(pane){
 for(const id of ['library','play','display']){
  const active=id===pane,tab=$('txt-tab-'+id),panel=$('txt-pane-'+id);
  if(!tab||!panel)continue;
  tab.classList.toggle('is-active',active);tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;panel.hidden=!active;
 }
}
function installDualPane(){
 document.querySelectorAll('.txt-side-tabs button[data-pane]').forEach(button=>button.addEventListener('click',()=>activateSidePane(button.dataset.pane)));
 const map={'txt-quick-play':'txt-play','txt-quick-pause':'txt-pause','txt-quick-stop':'txt-stop'};
 for(const [quick,control] of Object.entries(map))$(quick)?.addEventListener('click',()=>$(control)?.click());
 $('txt-quick-controls')?.addEventListener('click',()=>activateSidePane('play'));
 document.querySelector('#txt-list')?.addEventListener('click',e=>{if(e.target.closest('button[data-id]'))activateSidePane('play');});
 activateSidePane('library');
}
async function init(){restoreSettings();installEvents();installSpeech();installDualPane();await readCatalog();
 const query=new URL(location.href).searchParams,book=query.get('book'),id=query.get('id');let initial=state.entries.find(x=>x.source==='site'&&(x.path===book||(id!==null&&x.id==='site:'+id)));
 if(initial)await selectEntry(initial);else status('txt-results-status','已加载1,360份完整书目；选择书名即可直接阅读与朗读，也可以搜索全文。');
}
init().catch(err=>status('txt-index-summary','TXT阅读器初始化失败：'+err.message));
})();
