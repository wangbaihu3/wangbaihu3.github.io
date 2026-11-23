/* 《在真理中重塑生命》原创课程阅读器：课程全文检索、案例分流、朗读与键盘支持。 */
(() => {'use strict';
const el = document.getElementById('course-data'); if(!el) return;
let data;try{data=JSON.parse(el.textContent);}catch(e){document.getElementById('main-app').textContent='课程数据无法读取：请检查网页版本与数据格式。';return;}
const books=data.books||[], cases=data.cases||[], byId=new Map(books.map(x=>[x.id,x]));
const app=document.getElementById('main-app'), side=document.getElementById('course-sidebar'), status=document.getElementById('course-status');
const escapeHTML=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const qp=new URLSearchParams(location.search), startId=qp.get('book');
let selected=byId.has(startId)?startId:'A01';
let index=Math.max(0,Number.parseInt(qp.get('lesson')||'1',10)-1||0);
let caseIndex=Math.max(0,Math.min(cases.length-1,Number.parseInt(qp.get('case')||'1',10)-1||0));
let mode=qp.get('mode')==='cases'?'cases':'lessons', all=false,query='';
let reader=null, actualVoices=[];
if(window.ReaderSpeech && window.speechSynthesis && window.SpeechSynthesisUtterance){
 reader=new window.ReaderSpeech(window.speechSynthesis,window.SpeechSynthesisUtterance,{onState:x=>{
   const sp=document.getElementById('course-tts-status');
   if(sp)sp.textContent=x.message+(x.total?'（'+Math.min(x.index+1,x.total)+'／'+x.total+'）':'');
 }});
 reader.allowRemote=true;
}
const paras=(xs)=>!xs?.length?'':xs.map(s=>`<p>${escapeHTML(s)}</p>`).join('');
function heading(text,items){return items?.length?`<section class="study-panel"><h4>${escapeHTML(text)}</h4>${paras(items)}</section>`:'';}
function currentLesson(){const book=byId.get(selected);index=Math.min(Math.max(index,0),book.chapters.length-1);return book.chapters[index];}
function part(ch,i){
 // New in-depth chapters keep their three main passages in separately labelled exegesis/doctrine/practice fields;
 // do not repeat identical text under the brief introduction.
 const duplicate=ch.teaching?.length===3 && ch.exegesis?.[0]===ch.teaching[0] && ch.doctrine?.[0]===ch.teaching[1] && ch.practice_detail?.[0]===ch.teaching[2];
 return `<article class="lesson" id="lesson-${i+1}">
 <h3 tabindex="-1" class="lesson-heading">第${i+1}课｜${escapeHTML(ch.title)}</h3>
 <p class="scripture"><b>核心经文：</b>${escapeHTML(ch.scriptures)}</p>
 ${duplicate?'':heading('一、先理解事实与问题',ch.teaching)}
 ${heading(duplicate?'一、经文细读与论证':'二、经文细读与论证',ch.exegesis)}
 ${heading(duplicate?'二、福音与改革宗教义辨析':'三、福音与改革宗教义辨析',ch.doctrine)}
 ${heading(duplicate?'三、辅导实践与行动依据':'四、辅导实践与行动依据',ch.practice_detail)}
 <section class="study-panel"><h4>${duplicate?'四':'五'}、真实生活中的虚构案例</h4><p class="scenario">${escapeHTML(ch.case)}</p></section>
 <section class="study-panel"><h4>${duplicate?'五':'六'}、实际辅导步骤</h4><ol>${(ch.steps||[]).map(x=>`<li>${escapeHTML(x)}</li>`).join('')}</ol></section>
 <section class="study-panel"><h4>${duplicate?'六':'七'}、反思与反向检验</h4><ul>${(ch.questions||[]).map(x=>`<li>${escapeHTML(x)}</li>`).join('')}</ul>${ch.countercase?`<p class="critical">${escapeHTML(ch.countercase)}</p>`:''}</section>
 <section class="study-panel"><h4>${duplicate?'七':'八'}、需要保护的边界</h4><p class="safe">${escapeHTML(ch.boundary)}</p></section>
 <section class="study-panel"><h4>${duplicate?'八':'九'}、合宜的祷告参考</h4><p class="prayer">${escapeHTML(ch.prayer)}</p></section>
 ${ch.dialogue?.length?heading('辅导对话示范（虚构）',ch.dialogue):''}
 ${ch.evidence?.length?heading('经文、教义与原著证据线索',ch.evidence):''}
 ${ch.study_source?`<details class="source-detail"><summary>原著研究依据与发布状态（非原著译文）</summary><p>${escapeHTML(ch.study_source)}</p><p>这是原创中文教学材料。核读的原著与史料须按真实版本继续完成语义终审，不冒充任何作者逐章引文。</p></details>`:''}
 </article>`;
}
function normalized(s){return String(s??'').toLocaleLowerCase('zh-CN').normalize('NFKC');}
function hasTerms(haystack, rawQuery){
 // 多关键词必须全部命中；查询词可分布在题目、经文和段落中。
 // 单一中文关键词仍然使用子串匹配，不靠猜测用户的隐私或动机。
 const terms=normalized(rawQuery).split(/[\s，,；;、]+/).filter(Boolean);
 const body=normalized(haystack);
 return terms.every(t=>body.includes(t));
}
function matchLesson(ch,q){
 return hasTerms([ch.title,ch.scriptures,...(ch.teaching||[]),...(ch.exegesis||[]),...(ch.doctrine||[]),
 ...(ch.practice_detail||[]),ch.case,...(ch.steps||[]),...(ch.questions||[]),ch.boundary,ch.countercase,
 ...(ch.dialogue||[]),...(ch.evidence||[]),ch.study_source,ch.prayer].join(' '),q);
}
function matchCase(c,q){return hasTerms([c.title,c.facts,c.known,c.unknown,c.safety,c.care,c.scriptures,
 ...(c.analysis||[]),c.countercase,...(c.dialogue||[])].join(' '),q);}
function caseMatches(){const q=normalized(query);return cases.map((c,i)=>({c,i})).filter(x=>!q||matchCase(x.c,q));}
function renderSide(){const q=normalized(query);let rendered='',count=0;
 if(mode==='cases'){
  const found=caseMatches();
  side.innerHTML=found.length?found.map(x=>`<div class="subject-unit"><button type="button" class="subject" data-case="${x.i}" aria-current="${caseIndex===x.i}"><strong>${x.i+1}．${escapeHTML(x.c.title)}</strong><small>虚构教学案例 · 事实、未知与安全分别判断</small></button></div>`).join(''):'<p class="mini">没有找到匹配案例；请换一个关键词。</p>';
  if(status)status.textContent=q?`共检索到${found.length}个相关案例。`:`当前提供${cases.length}个复杂情境案例。`;
  return;
 }
 for(const book of books){
  const titleMatch=hasTerms(book.name+' '+book.id,q);
  const matches=book.chapters.map((ch,i)=>({ch,i})).filter(x=>!q||titleMatch||matchLesson(x.ch,q));
  if(!matches.length)continue;
  count+=matches.length;
  rendered+=`<div class="subject-unit"><button type="button" class="subject" data-book="${escapeHTML(book.id)}" aria-current="${mode==='lessons'&&book.id===selected}"><strong>${escapeHTML(book.name)}</strong><small>${book.chapters.length}课 · ${q?matches.length+'课符合检索':'进入课程'}</small></button>`;
  if(q || book.id===selected){rendered+=`<ol class="side-chapters">${matches.map(x=>`<li><button type="button" data-book="${escapeHTML(book.id)}" data-lesson="${x.i}">${x.i+1}．${escapeHTML(x.ch.title)}</button></li>`).join('')}</ol>`;}
  rendered+='</div>';
 }
 side.innerHTML=rendered||'<p class="mini">没有找到匹配课程；可以尝试经文、主题或更短关键词。</p>';
 if(status)status.textContent=q?`共检索到${count}课相关内容；只显示匹配课程。`:`当前提供${books.length}个研究主题、${books.reduce((n,b)=>n+b.chapters.length,0)}课原创教学及${cases.length}个独立案例。`;
}
function buttons(){return `<div class="actions lesson-actions"><button type="button" data-step="prev" ${index===0?'disabled':''}>上一课</button><button type="button" class="primary" data-step="next" ${index>=byId.get(selected).chapters.length-1?'disabled':''}>下一课</button><button type="button" data-all="${all?'no':'yes'}">${all?'只显示当前课':'完整展开本主题课程'}</button><button type="button" id="print-course">打印当前内容</button></div>`;}
function audioControls(scope='course'){return `<section class="audio-tools" aria-label="${scope==='case'?'案例朗读':'课程朗读'}"><h3>阅读与朗读</h3><p class="mini">优先选浏览器实际提供的微软小雨；缺席则明确显示选用的可用中文声音，不将其他声音冒称小雨。按你的要求，联网声音默认允许；点击播放后才会调用浏览器语音服务，正文可能被发送给语音服务商。</p><div class="actions"><label for="course-voice">声音 <select id="course-voice"><option value="">正在读取真实声音</option></select></label><button type="button" data-audio="refresh">刷新声音</button><button type="button" data-audio="play" ${reader?'':'disabled'}>${scope==='case'?'朗读本案例':'朗读本课'}</button><button type="button" data-audio="pause" ${reader?'':'disabled'}>暂停／继续</button><button type="button" data-audio="stop" ${reader?'':'disabled'}>停止</button><label for="course-rate">语速 <select id="course-rate"><option value="0.85">0.85倍</option><option value="1" selected>正常</option><option value="1.15">1.15倍</option><option value="1.35">1.35倍</option></select></label></div><p id="course-tts-status" class="mini" role="status" aria-live="polite">${reader?'尚未开始朗读。':'此浏览器没有提供朗读接口；文字阅读不受影响。'}</p></section>`;}
function renderLessons(){
 // 修复“查无结果仍显示上一次课程”及“筛选命中其它课、正文停留旧课”的误导。
 // 搜索时让正文与左栏结果同步，不清空查询文本，也不改变原始课程数据。
 if(query){
  const result=[];
  for(const b of books){
   const titleMatch=hasTerms(b.name+' '+b.id,query);
   b.chapters.forEach((c,i)=>{if(titleMatch||matchLesson(c,query))result.push({bid:b.id,i});});
  }
  if(!result.length){renderSide();app.innerHTML='<section class="content"><h2 tabindex="-1" id="reading-heading">没有匹配课程</h2><p>请修改关键词，或清除搜索条件。当前不显示与查询无关的旧正文。</p></section>';reader?.stop();return;}
  if(!result.some(x=>x.bid===selected&&x.i===index)){
   selected=result[0].bid;index=result[0].i;all=false;reader?.stop();
  }
 }
 const book=byId.get(selected);currentLesson();renderSide();
 const chapterButtons=book.chapters.length>1?`<div class="lesson-select" role="group" aria-label="本主题课程目录">${book.chapters.map((ch,i)=>`<button type="button" data-lesson="${i}" aria-pressed="${!all&&i===index}">${i+1}．${escapeHTML(ch.title)}</button>`).join('')}</div>`:'';
 app.innerHTML=`<section class="content"><p class="mini">原创中文研习课程 · 经文与教义论证 · 复杂处境 · 经核实的来源线索（尚待独立终审）</p><h2 tabindex="-1" id="reading-heading">${escapeHTML(book.name)}</h2><div class="section-intro">${escapeHTML(book.intro)}<p><strong>${book.chapters.length}课</strong>，内容与原著逐章翻译分别管理。</p></div>${chapterButtons}${audioControls()}${all?book.chapters.map(part).join(''):part(book.chapters[index],index)}${buttons()}<p class="source">使用界限：本课程是原创教学与一般辅导教育，不是专业医疗、法律、精神健康诊断或某个具体人的自动罪责裁决。涉及暴力、受虐、自伤、紧急医疗情况时，应优先寻求现实安全保护。原著研究线索不能冒充已批准的全文神学终审。教义对照：<a href="https://opc.org/wcf.html" target="_blank" rel="noopener noreferrer">信条</a>、<a href="https://opc.org/lc.html" target="_blank" rel="noopener noreferrer">大要理问答</a>。</p></section>`;
 populateVoices();
 const btn=document.querySelector('#mode-lessons');btn?.setAttribute('aria-pressed','true');document.querySelector('#mode-cases')?.setAttribute('aria-pressed','false');
}
function renderCases(){
 const found=caseMatches();
 if(found.length&&!found.some(x=>x.i===caseIndex))caseIndex=found[0].i;
 renderSide();
 if(!found.length){app.innerHTML='<section class="content"><h2 id="reading-heading" tabindex="-1">没有匹配案例</h2><p>请尝试缩短关键词、搜索不同的安全或行为用语，或清除搜索条件。</p></section>';return;}
 const c=cases[caseIndex];const where=found.findIndex(x=>x.i===caseIndex);
 app.innerHTML=`<section class="content cases"><p class="mini">虚构处境训练 · 不是针对某个人的诊断或判决</p>
 <h2 tabindex="-1" id="reading-heading">复杂处境辨析：${escapeHTML(c.title)}</h2>
 ${audioControls('case')}
 <div class="lesson-select" role="group" aria-label="切换案例">${found.map(x=>`<button type="button" data-case="${x.i}" aria-pressed="${caseIndex===x.i}">${x.i+1}．${escapeHTML(x.c.title)}</button>`).join('')}</div>
 <article class="lesson"><h3>案例事实</h3><p class="scenario">${escapeHTML(c.facts)}</p>
 <section class="study-panel"><h4>一、已经明确的事实</h4><p>${escapeHTML(c.known)}</p></section>
 <section class="study-panel"><h4>二、不可冒充已知的部分</h4><p>${escapeHTML(c.unknown)}</p></section>
 <section class="study-panel"><h4>三、必须优先考虑的安全与隐私</h4><p class="safe">${escapeHTML(c.safety)}</p></section>
 <section class="study-panel"><h4>四、合宜的辅导方向</h4><p>${escapeHTML(c.care)}</p></section>
 ${c.analysis?.length?heading('五、分层论证与反例检验',c.analysis):''}
 ${c.countercase?`<p class="critical">${escapeHTML(c.countercase)}</p>`:''}
 ${c.dialogue?.length?heading('六、模拟辅导对话',c.dialogue):''}
 <section class="study-panel"><h4>经文与研究入口</h4><p class="scripture">${escapeHTML(c.scriptures)}</p></section>
 <p class="mini">案例中的已知事实只是虚构设定；真实个案须重新核实。没有足够证据时不作自动定罪。</p></article>
 <div class="actions"><button type="button" data-case="${found[Math.max(0,where-1)].i}" ${where===0?'disabled':''}>上一案例</button>
 <button type="button" class="primary" data-case="${found[Math.min(found.length-1,where+1)].i}" ${where===found.length-1?'disabled':''}>下一案例</button></div></section>`;
 document.querySelector('#mode-lessons')?.setAttribute('aria-pressed','false');
 document.querySelector('#mode-cases')?.setAttribute('aria-pressed','true');
 populateVoices();
}
function render(){mode==='cases'?renderCases():renderLessons();}
function updateURL(push=true){try{const u=new URL(location.href);u.searchParams.set('mode',mode);u.searchParams.set('book',selected);u.searchParams.set('lesson',String(index+1));if(mode==='cases')u.searchParams.set('case',String(caseIndex+1));else u.searchParams.delete('case');history[push?'pushState':'replaceState'](null,'',u);}catch{}}
function restoreFromURL(){const u=new URLSearchParams(location.search);const id=u.get('book');selected=byId.has(id)?id:'A01';const i=Number.parseInt(u.get('lesson')||'1',10);index=Number.isFinite(i)?Math.max(0,Math.min(byId.get(selected).chapters.length-1,i-1)):0;const c=Number.parseInt(u.get('case')||'1',10);caseIndex=Number.isFinite(c)?Math.max(0,Math.min(cases.length-1,c-1)):0;mode=u.get('mode')==='cases'?'cases':'lessons';query='';all=false;const input=document.getElementById('course-search');if(input)input.value='';reader?.stop();render();}
function goto(kind,value,sub,preserveQuery=false){reader?.stop();all=false;if(!preserveQuery)query='';const search=document.getElementById('course-search');if(search&&!preserveQuery)search.value='';if(kind==='book'){selected=value;index=Math.max(0,sub||0);mode='lessons';}else if(kind==='lesson'){index=value;mode='lessons';}else if(kind==='case'){caseIndex=value;mode='cases';}else if(kind==='mode'){mode=value;}updateURL();render();document.getElementById('reading-heading')?.focus();document.getElementById('main-app')?.scrollIntoView({block:'start',behavior:'auto'});}
function populateVoices(){
 const selector=document.getElementById('course-voice');if(!selector||!window.speechSynthesis)return;
 const policy=window.SpeechVoicePolicy;const previous=selector.value;
 const unique=new Map();for(const v of window.speechSynthesis.getVoices())unique.set(policy?.voiceKey(v)||v.voiceURI,v);
 actualVoices=policy?.sorted([...unique.values()])||[...unique.values()];
 selector.replaceChildren();
 if(!actualVoices.length){const o=document.createElement('option');o.textContent='尚未取得真实声音';o.value='';selector.append(o);return;}
 for(const v of actualVoices){const o=document.createElement('option');o.value=policy?.voiceKey(v)||v.voiceURI;o.textContent=v.name+' · '+v.lang+(v.localService===true?' · 本机':' · 可能联网');selector.append(o);}
 const choice=policy?.choose(actualVoices,true,'all');
 const selectedKey=previous&&actualVoices.some(v=>(policy?.voiceKey(v)||v.voiceURI)===previous)?previous:(choice?.voice?(policy?.voiceKey(choice.voice)||choice.voice.voiceURI):selector.options[0].value);
 selector.value=selectedKey;
 const t=document.getElementById('course-tts-status');if(t&&reader?.state!=='playing')t.textContent='已检测 '+actualVoices.length+' 个真实声音，当前选择：'+(actualVoices.find(v=>(policy?.voiceKey(v)||v.voiceURI)===selectedKey)?.name||'未选择')+'。点击朗读后才调用语音服务。';
}
function speak(){if(!reader)return;
 let texts=[];
 if(mode==='cases'){
  const c=cases[caseIndex];
  if(!c)return;
  texts=[c.title,c.facts,c.known,c.unknown,c.safety,c.care,...(c.analysis||[]),c.countercase,...(c.dialogue||[]),c.scriptures].filter(Boolean);
 } else {
  const ch=currentLesson();
  // 与正文显示一致：保留论证、步骤、反例、反思、祷告及来源内容。
  const duplicate=ch.teaching?.length===3&&ch.exegesis?.[0]===ch.teaching[0]&&ch.doctrine?.[0]===ch.teaching[1]&&ch.practice_detail?.[0]===ch.teaching[2];
  texts=[ch.title,ch.scriptures,...(duplicate?[]:ch.teaching||[]),...(ch.exegesis||[]),...(ch.doctrine||[]),...(ch.practice_detail||[]),ch.case,...(ch.steps||[]),...(ch.questions||[]),ch.countercase,ch.boundary,ch.prayer,...(ch.dialogue||[]),...(ch.evidence||[])].filter(Boolean);
 }
 const splitter=window.ReaderSpeechSegments;
 const items=texts.flatMap((s,i)=>{const pieces=typeof splitter==='function'?splitter(s,280).map(x=>x.text):String(s).match(/[\s\S]{1,240}/g)||[];return pieces.map((text,j)=>({text,id:i+'-'+j}));});
 const policy=window.SpeechVoicePolicy;
 if(!actualVoices.length)populateVoices();
 const selector=document.getElementById('course-voice');
 const chosen=actualVoices.find(v=>(policy?.voiceKey(v)||v.voiceURI)===selector?.value)||policy?.choose(actualVoices,true,'all')?.voice;
 const t=document.getElementById('course-tts-status');if(!chosen){if(t)t.textContent='浏览器尚未提供可用中文声音；可先点击刷新声音，或在设备中安装中文发音人。';return;}
 reader.setItems(items,0);reader.setVoice(chosen);reader.rate=Number(document.getElementById('course-rate')?.value)||1;reader.allowRemote=true;
 if(t)t.textContent='实际选择：'+chosen.name+'（'+chosen.lang+'）。'+(policy?.target(chosen)?'当前真实声音是小雨。':'当前是其他真实声音，不冒称小雨。');
 reader.play(0);
}
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
 if(b.dataset.audio){if(b.dataset.audio==='play')speak();else if(b.dataset.audio==='refresh')populateVoices();else if(b.dataset.audio==='pause')reader?.pauseResume();else reader?.stop();return;}
 if(b.dataset.book && byId.has(b.dataset.book)){
  const book=byId.get(b.dataset.book);
  const titleMatch=hasTerms(book.name+' '+book.id,query);
  const first=book.chapters.findIndex(ch=>titleMatch||matchLesson(ch,query));
  const nextIndex=b.dataset.lesson!==undefined?Number(b.dataset.lesson):Math.max(0,first);
  goto('book',b.dataset.book,nextIndex,Boolean(query));return;
}
 if(b.dataset.lesson!==undefined){goto('lesson',Number(b.dataset.lesson),undefined,Boolean(query));return;}
 if(b.dataset.case!==undefined){goto('case',Number(b.dataset.case),undefined,Boolean(query)&&mode==='cases');return;}
 if(b.dataset.step){goto('lesson',Math.max(0,Math.min(byId.get(selected).chapters.length-1,index+(b.dataset.step==='next'?1:-1))));return;}
 if(b.dataset.mode){goto('mode',b.dataset.mode);return;}
 if(b.dataset.all){reader?.stop();all=b.dataset.all==='yes';render();document.getElementById('reading-heading')?.focus();return;}
 if(b.id==='print-course'){window.print();return;}
});
document.getElementById('course-search')?.addEventListener('input',e=>{query=e.target.value.trim();if(mode==='cases')renderCases();else renderLessons();});
document.addEventListener('change',e=>{if(e.target.id==='course-voice'){const policy=window.SpeechVoicePolicy;const v=actualVoices.find(x=>(policy?.voiceKey(x)||x.voiceURI)===e.target.value);if(v)policy?.save(v);}});
window.speechSynthesis?.addEventListener?.('voiceschanged',()=>populateVoices());
window.addEventListener('pagehide',()=>reader?.stop());
window.addEventListener('popstate',restoreFromURL);
render();
})();
