(function () {
  'use strict';
  SiteSearch.setMap(window.HAN_FOLD);
  const $ = id => document.getElementById(id), tts = mountReaderSpeech(), cache = new Map();
  let meta, active = null, chapterNo = 1, intent = 0, searchID = 0, controller, searchPromise, anchorPromise;
  let lastRoute = '', initialized = false, initialization = 0, previous = null, pendingTarget = null, focusNext = false;
  const announce = (name, detail) => document.dispatchEvent(new CustomEvent('bible:' + name, {detail}));
  const flow = {active:false, pending:false, epoch:0, scope:'chapter', loop:false, sessionKey:''};
  const playScope = () => $('bible-tts-scope')?.value || 'chapter';
  const playLoop = () => !!$('bible-tts-loop')?.checked;
  function flowMessage(text) { const node=$('bible-tts-flow-status'); if (node) node.textContent=text;announce('flow',{active:flow.active,pending:flow.pending,message:text}); }
  function flowStop(text='朗读计划已停止。') {
    flow.active=false; flow.pending=false; ++flow.epoch;
    flowMessage(text);
  }
  function inRange(book,scope){ return scope==='old' ? book<=39 : scope==='new' ? book>=40 : true; }
  function firstPosition(scope,currentBook,currentChapter) {
    if(scope==='old') return {book:1,chapter:1};
    if(scope==='new') return {book:40,chapter:1};
    if(scope==='book') return {book:currentBook,chapter:1};
    if(scope==='chapter') return {book:currentBook,chapter:currentChapter};
    return {book:1,chapter:1};
  }
  function nextChapter(book,chapter) {
    if(!meta || book<1 || book>66)return null;
    const count=meta.books[book-1].chapters;
    if(chapter<count)return {book,chapter:chapter+1};
    if(book<66)return {book:book+1,chapter:1};
    return null;
  }
  function flowNext() {
    const here={book:active?.id,chapter:chapterNo};
    if(!flow.active || !here.book)return null;
    const candidate=nextChapter(here.book,here.chapter);
    if(flow.scope==='chapter') return flow.loop?here:null;
    if(flow.scope==='book') {
      return candidate?.book===here.book ? candidate : flow.loop?firstPosition('book',here.book,here.chapter):null;
    }
    if(flow.scope==='old') {
      return candidate?.book<=39 ? candidate : flow.loop?firstPosition('old',here.book,here.chapter):null;
    }
    if(flow.scope==='new') {
      return candidate?.book>=40 ? candidate : flow.loop?firstPosition('new',here.book,here.chapter):null;
    }
    return candidate || (flow.loop?firstPosition('all',here.book,here.chapter):null);
  }
  async function startPlan({resume=false,saved=null}={}) {
    flowStop('准备朗读范围……');
    if(!meta || !active){flowMessage('圣经正文尚未加载，不能开始朗读。');return false;}
    const epoch=flow.epoch;
    let seek=null;
    if(resume) {
      const m=/^bible:([a-f0-9]{64}):(\d+):(\d+):body$/.exec(String(saved?.context||''));
      if(!m || ![4,5].includes(saved?.schema) || m[1]!==meta.version.source_sha256){flowMessage('旧听读记录不属于当前第181版正文，不能强制套用。');return false;}
      seek={book:Number(m[2]),chapter:Number(m[3])};
      if(!meta.books[seek.book-1] || seek.chapter>meta.books[seek.book-1].chapters || seek.chapter<1){flowMessage('保存章节越界，未恢复');return false;}
    }
    let scope=playScope(),loop=playLoop();
    if(resume){
      try {const plan=JSON.parse(localStorage.getItem('messiah-bible-audio-plan')||'null');
        if(plan?.source===meta.version.source_sha256 && ['chapter','book','old','new','all'].includes(plan.scope)){
          scope=plan.scope;loop=!!plan.loop;$('bible-tts-scope').value=scope;$('bible-tts-loop').checked=loop;
        }
      }catch{}
    }
    if(!['chapter','book','old','new','all'].includes(scope))scope='chapter';
    const target=seek || (!inRange(active.id,scope)?firstPosition(scope,active.id,chapterNo):null);
    flow.pending=true;flowMessage('正在准备朗读起点，可随时停止。');
    if(target && (target.book!==active.id || target.chapter!==chapterNo)) {
      const ok=await load(target.book,target.chapter,null,'push');
      if(flow.epoch!==epoch)return false;
      if(!ok) {flowStop('指定范围的起点没有成功载入，已取消播放。');return false;}
    }
    if(flow.epoch!==epoch || !active)return false;
    flow.active=true;flow.pending=false;flow.scope=scope;flow.loop=loop;
    flow.sessionKey=meta.version.source_sha256;
    try {localStorage.setItem('messiah-bible-audio-plan',JSON.stringify({source:flow.sessionKey,scope,loop}));}catch{}
    flowMessage('朗读范围已准备：'+active.name+'第'+chapterNo+'章；范围 '+({chapter:'本章',book:'本卷',old:'旧约',new:'新约',all:'全本圣经'}[scope])+(loop?'，循环':'，读至范围末尾停止'));
    return true;
  }
  async function advancePlan() {
    if(!flow.active || !meta || !active)return;
    const next=flowNext(),ticket=flow.epoch;
    if(!next) {flowStop('所选朗读范围已完成。');return;}
    flow.pending=true;
    flowMessage('正在连接下一章：'+meta.books[next.book-1].name+'第'+next.chapter+'章……');
    // Uses the normal checked Bible loader; source validation and URL navigation remain intact.
    const ok=await load(next.book,next.chapter,null,'replace');
    if(ticket!==flow.epoch || !flow.active)return;
    if(!ok){flowStop('下一章加载或校验失败，已停止；不会跳过缺失的经文。');return;}
    const continued=await tts.playCurrent();
    if(ticket!==flow.epoch || !flow.active)return;
    flow.pending=false;
    if(!continued)flowStop('下一章语音未能启动，已停止连续朗读。');
    else flowMessage('连续朗读：'+active.name+'第'+chapterNo+'章'+(flow.loop?'（范围循环已启用）':''));
  }
  tts?.setFlowHooks({
    beforeStart:startPlan,
    onChapterEnd:advancePlan,
    onStop:()=>flowStop('已停止朗读；连续计划已结束。'),
    onError:message=>flowStop('语音出现错误，已停止连续计划：'+message)
  });
  for(const control of ['bible-tts-scope','bible-tts-loop'])
    $(control)?.addEventListener('change',()=>{tts?.stop();flowStop('朗读范围已更改，请重新点击开始朗读。');});

  try { previous = JSON.parse(localStorage.getItem('messiah-bible-position') || 'null'); } catch {}
  const json = (url, options) => SiteRuntime.json(url, options);
  const yieldUI = () => new Promise(resolve => setTimeout(resolve, 0));
  function el(tag, text, cls) { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; }
  function setBusy(value) {
    $('bible-content').setAttribute('aria-busy', String(value));
    for (const id of ['bible-book','bible-chapter','prev-chapter','next-chapter','copy-location']) $(id).disabled = value || !meta;
    if (!value) {
      $('bible-chapter').disabled = !active;
      $('copy-location').disabled = !active;
      $('prev-chapter').disabled = !active || (active.id === 1 && chapterNo === 1);
      $('next-chapter').disabled = !active || (active.id === 66 && chapterNo === active.chapters.length);
    }
    $('retry-reader').disabled = value;
    announce('busy', {busy:value, ready:!!active});
  }
  function invalidate() { active = null; tts?.setProvider(() => [], () => 'bible:not-ready'); $('bible-content').replaceChildren(); $('bible-notes').replaceChildren(); }
  function startNavigation() {
    ++intent; controller?.abort(); controller = new AbortController(); invalidate(); setBusy(true);
    $('retry-reader').hidden = true;
    $('reader-status').textContent = '正在加载并校验经文……'; return intent;
  }
  function anchorList() {
    anchorPromise ||= json('/data/bible/anchors.json').catch(e => { anchorPromise = null; throw e; }); return anchorPromise;
  }
  const refs = new Map();
  function noteButton(id) {
    const count = (refs.get(id) || 0) + 1; refs.set(id,count);
    const a = el('a','〔注' + id + '〕','note-link'); a.href = '#note-' + id;
    a.id = 'note-ref-' + id + (count === 1 ? '' : '-' + count);
    a.setAttribute('aria-label','查看母稿原注标识 ' + id);
    a.addEventListener('click', event => {
      event.preventDefault(); $('show-notes').checked = true; $('bible-notes').hidden = false;
      const url=new URL(location.href);url.hash='note-'+id;history.pushState(history.state,'',url);
      focusAnchor('note-'+id);
    }); return a;
  }
  function renderRuns(parent, block) {
    for (const t of block.runs || []) {
      if (t.anchor) { const a=el('span',undefined,'anchor'); a.id=t.anchor; parent.append(a); continue; }
      if (t.note) { parent.append(noteButton(t.note)); continue; }
      if (t.text === undefined) continue;
      let span=el('span',t.text); span.dir='auto';
      if (['single','double'].includes(t.u)) span.classList.add('u-'+t.u);
      if (t.b) span.classList.add('source-bold'); if (t.i) span.classList.add('source-italic');
      if (t.vertical==='superscript') span.classList.add('verse-number');
      if (t.link) { const a=el('a'); a.href='/bible/?anchor='+encodeURIComponent(t.link); a.append(span); span=a; }
      parent.append(span);
    }
  }
  function display(chapter) {
    refs.clear(); const h=el('h2',active.name+' · '+chapter.heading.text);
    for(const heading of [active.heading,chapter.heading]) for(const name of heading.anchors||[]) { const a=el('span',undefined,'anchor');a.id=name;h.append(a); }
    $('bible-content').replaceChildren(h); $('bible-notes').replaceChildren();
    const spoken=[],noteSpoken=[];
    for (const block of chapter.paragraphs) {
      const p=el('p',undefined,block.style==='Verse'?'verse':block.style);p.dataset.sourceP=String(block.source_p);renderRuns(p,block);
      const anchors=(block.anchors||[]).filter(a=>/^verse_/.test(a));
      if(anchors.length>1) { const hint=el('span','（传统节号 '+anchors.slice(1).map(a=>a.split('_')[3]).join('、')+' 见本段原注）','note-only');hint.dataset.editorial='true';p.append(hint);
        for (const name of anchors.slice(1)) { const a=p.querySelector('[id="'+name+'"]');if(a)a.dataset.noteOnly='true'; }
      }
      // Reading text comes only from actual Scripture text runs. Superscript verse numbers
      // and note markers are markup and must never be sent to the voice provider.
      const spokenText=(block.runs||[]).filter(run => run.text!==undefined &&
        !(block.style==='Verse' && run.vertical==='superscript'))
        .map(run=>run.text).join('');
      if(['Verse','PsalmSuperscription'].includes(block.style) && spokenText.trim())
        spoken.push({text:spokenText,element:p,id:anchors[0]||'p'+block.source_p});
      $('bible-content').append(p);
    }
    const ids=Object.keys(chapter.notes);$('bible-notes').append(el('h2','本章原注（'+ids.length+'）'));
    for(const id of ids) {
      const section=el('article',undefined,'note');section.id='note-'+id;section.append(el('strong','母稿原注标识 '+id));
      chapter.notes[id].forEach((block,i)=>{const p=el('p');renderRuns(p,block);section.append(p);noteSpoken.push({text:block.text,element:p,id:'note-'+id+'-paragraph-'+i});});
      const back=el('a','返回正文','note-back');back.href='#note-ref-'+id;
      back.addEventListener('click',event=>{event.preventDefault();const url=new URL(location.href);url.hash='note-ref-'+id;history.pushState(history.state,'',url);focusAnchor('note-ref-'+id);});
      section.append(back);$('bible-notes').append(section);
    }
    $('bible-notes').hidden=!$('show-notes').checked;
    const bookID=active.id;
    tts?.setProvider(() => spoken,
      () => `bible:${meta.version.source_sha256}:${bookID}:${chapter.number}:body`);
    // Prefetch only a next book that is part of the active plan; integrity checked as normal.
    // Failure is ignored here, but will be surfaced by the real chapter loader at transition.
    if(flow.active && active && chapter.number===active.chapters.length){
      const position=flowNext();
      if(position && position.book!==bookID && !cache.has(position.book)) {
        json('/data/bible/books/'+position.book+'.json').then(data=>{
          const expected=meta.books[position.book-1];
          if(data.id===position.book && data.name===expected.name && data.chapters?.length===expected.chapters){
            cache.set(position.book,data);
            if(cache.size>4)cache.delete(cache.keys().next().value);
          }
        }).catch(()=>{});
      }
    }
    $('reader-status').textContent=active.name+'第'+chapter.number+'章 · 原注 '+ids.length+' 条。';
    try{localStorage.setItem('messiah-bible-position',JSON.stringify({book:bookID,chapter:chapter.number,source:meta.version.source_sha256}));}catch{}
  }
  function focusAnchor(name) {
    if(!name)return false;
    let target=document.getElementById(name);
    if(!target||!($('bible-content').contains(target)||$('bible-notes').contains(target)))return false;
    for(const e of document.querySelectorAll('#bible-content .selected,#bible-notes .selected'))e.classList.remove('selected');
    if(target.dataset.noteOnly==='true') {
      const a=target.nextElementSibling;
      if(a?.classList.contains('note-link')) { const note=document.getElementById(a.hash.slice(1)); if(note)target=note; }
      $('reader-status').textContent='该传统节号保留在母稿原注中，已展开原注；没有补造成正文。';
    }
    if(target.closest('#bible-notes')){$('show-notes').checked=true;$('bible-notes').hidden=false;}
    (target.closest('p,article')||target).classList.add('selected');
    const focusTarget=target.textContent.trim()?target:(target.closest('p,article')||target);
    focusTarget.setAttribute('tabindex','-1');focusTarget.focus({preventScroll:true});
    const scroller=$('reader-scroll');
    if(scroller){const marker=target.closest('p,article')||target;scroller.scrollTop+=marker.getBoundingClientRect().top-scroller.getBoundingClientRect().top-20;}
    else target.scrollIntoView({block:'center'});
    announce('anchor',{name});return true;
  }
  async function load(bookID,chapter=1,anchor=null,mode='push',ticket,restore=null,fragment='') {
    pendingTarget={book:bookID,chapter,anchor,mode,restore,fragment};
    const focus=focusNext;focusNext=false;
    const seq=ticket??startNavigation();
    try {
      const book=meta.books.find(b=>b.id===bookID);
      if(!book||!BibleReferences.validChapter(chapter,book.chapters))throw Error('经卷或章节编号无效；没有改读其他章节');
      let data=cache.get(bookID);
      if(!data){data=await json('/data/bible/books/'+bookID+'.json',{signal:controller.signal});if(seq!==intent)return false;
        if(data.id!==bookID||data.name!==book.name||data.chapters?.length!==book.chapters)throw Error('经卷资料身份或章节数量不一致');
        cache.set(bookID,data);if(cache.size>4)cache.delete(cache.keys().next().value);
      }else {cache.delete(bookID);cache.set(bookID,data);}
      if(seq!==intent)return false;
      const targetChapter=data.chapters[chapter-1];
      if(anchor&&anchor!=='book_'+bookID&&anchor!=='chapter_'+bookID+'_'+chapter && !targetChapter.paragraphs.some(p=>(p.anchors||[]).includes(anchor)))
        throw Error('指定书签不属于此章；未擅自改读其他节文');
      active=data;chapterNo=chapter;$('bible-book').value=String(bookID);$('bible-chapter').replaceChildren();
      for(let i=1;i<=book.chapters;i++){const o=el('option','第 '+i+' 章');o.value=i;$('bible-chapter').append(o);}
      $('bible-chapter').value=chapter;display(targetChapter);
      if(mode){const url='/bible/?book='+bookID+'&chapter='+chapter+(anchor?'&anchor='+encodeURIComponent(anchor):'')+(!anchor?fragment:'');history[mode==='replace'?'replaceState':'pushState'](restore?{biblePosition:restore}:null,'',url);}
      lastRoute=location.search;
      $('reader-scroll').scrollTop=0;
      $('reader-location').textContent=active.name+' · 第 '+chapter+' 章';
      document.title=active.name+'第'+chapter+'章｜圣经阅读｜弥赛亚';
      announce('loaded',{book:bookID,chapter,name:active.name,count:active.chapters.length,source:meta.version.source_sha256,restore,anchor,focus});
      const hash=SiteRuntime.decodeFragment(location.hash);
      if(anchor)focusAnchor(anchor);
      else if(hash===null)$('reader-status').textContent+=' 网址片段编码无效，已忽略片段；正文没有改变。';
      else if(hash&&!focusAnchor(hash))$('reader-status').textContent+=' 本章没有此片段书签，未自动改读其他经文。';
      return true;
    }catch(error){if(seq!==intent)return false;invalidate();$('reader-location').textContent='经文未载入';$('reader-status').textContent='经文未载入：'+error.message+'。';$('retry-reader').hidden=false;announce('error',{message:error.message});return false;}
    finally{if(seq===intent)setBusy(false);}
  }
  async function route() {
    const restore=history.state?.biblePosition||null,fragment=location.hash;pendingTarget=null;
    const seq=startNavigation(),p=new URLSearchParams(location.search);let book=p.has('book')?Number(p.get('book')):1,chapter=p.has('chapter')?Number(p.get('chapter')):1;
    const anchor=p.get('anchor');
    try {
      if(anchor){
        const h=/^(book|chapter)_(\d+)(?:_(\d+))?$/.exec(anchor);
        if(h&&((h[1]==='book'&&!h[3])||(h[1]==='chapter'&&h[3]))){book=Number(h[2]);chapter=h[3]?Number(h[3]):1;}
        else {
          const all=await anchorList();if(seq!==intent)return;
          if(Object.hasOwn(all,anchor)){book=all[anchor].book;chapter=all[anchor].chapter;}
          else {
            if(anchor.startsWith('verse_'))throw Error('本版没有该节号书签，未跳转或补造经文');
            invalidate();$('reader-status').replaceChildren(el('span','此书签不在经文目录中。'));
            const a=el('a','查看母稿序言、凡例与附录');a.href='/bible/about/#'+encodeURIComponent(anchor);$('reader-status').append(a);setBusy(false);return;
          }
        }
      }
      if(seq===intent)await load(book,chapter,anchor,'replace',seq,restore,fragment);
    }catch(e){if(seq===intent){invalidate();$('reader-status').textContent='定位未完成：'+e.message;$('retry-reader').hidden=false;announce('error',{message:e.message});setBusy(false);}}
  }
  function navigate(fn,{clearSearch=true}={}){
    announce('leaving',{});
    tts?.stop();flowStop('手动切换经文，连续朗读已停止。');
    if(clearSearch){++searchID;$('bible-search-results').replaceChildren();}
    focusNext=true;return fn();
  }
  $('bible-book').addEventListener('change',()=>navigate(()=>load(Number($('bible-book').value),1)));
  $('bible-chapter').addEventListener('change',()=>{if(active){const id=active.id;navigate(()=>load(id,Number($('bible-chapter').value)));}});
  $('prev-chapter').addEventListener('click',()=>{if(!active)return;const id=active.id;navigate(()=>chapterNo>1?load(id,chapterNo-1):id>1&&load(id-1,meta.books[id-2].chapters));});
  $('next-chapter').addEventListener('click',()=>{if(!active)return;const id=active.id,total=active.chapters.length;navigate(()=>chapterNo<total?load(id,chapterNo+1):id<66&&load(id+1,1));});
  $('show-notes').addEventListener('change',()=>{$('bible-notes').hidden=!$('show-notes').checked;});

  $('resume-reading').addEventListener('click',()=>{if(!meta||!previous){$('reader-status').textContent='本机没有上一次阅读位置。';return;}if(previous.source!==meta.version.source_sha256){$('reader-status').textContent='记录属于另一母稿快照，未套用旧定位。';return;}navigate(()=>load(previous.book,previous.chapter,null,'push',undefined,previous));});
  window.addEventListener('storage',event=>{if(event.key===null||event.key==='messiah-bible-position'){try{previous=JSON.parse(event.newValue||'null');}catch{previous=null;}}});
  $('copy-location').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(location.href);$('reader-status').textContent='本章链接已复制。';}catch{$('reader-status').textContent='无法自动复制，请复制地址栏。';}});
  function fullIndex(){
    if(!searchPromise)searchPromise=json('/data/bible/search.json').then(async rows=>{
      if(!Array.isArray(rows))throw Error('索引结构不符');
      for(let i=0;i<rows.length;i++){rows[i].normalized=SiteSearch.normalize(rows[i].text);if(i%256===0)await yieldUI();}return rows;
    }).catch(e=>{searchPromise=null;throw e;});return searchPromise;
  }
  $('bible-query').addEventListener('input',()=>{++searchID;$('bible-search-results').replaceChildren();});
  $('bible-search-form').addEventListener('submit',async event=>{
    event.preventDefault();const seq=++searchID,q=$('bible-query').value.trim().slice(0,240),box=$('bible-search-results');
    if(!meta){box.textContent='版本目录尚未载入，请重试加载。';return;}
    if(!SiteSearch.normalize(q)){box.replaceChildren();return;}
    const ref=BibleReferences.parse(q,meta.books);
    if(ref?.error){box.textContent=ref.error;return;}
    if(ref){
      const anchor=ref.verse===null?null:`verse_${ref.book}_${ref.chapter}_${ref.verse}`;
      try{if(anchor){const all=await anchorList();if(seq!==searchID)return;if(!Object.hasOwn(all,anchor)){box.textContent='本版没有该节号书签；未跳转、未补造经文。';return;}}
        if(seq!==searchID)return;const task=navigate(()=>load(ref.book,ref.chapter,anchor),{clearSearch:false}),ticket=intent,ok=await task;
        if(seq===searchID&&ticket===intent)box.textContent=ok?'已定位到对应正文或原注宿主。':'定位未完成，请查看加载提示。';
      }catch(e){if(seq===searchID)box.textContent='节号索引未载入：'+e.message;}return;
    }
    box.textContent='正在加载、校验并检索本版正文索引……';
    try {
      const rows=await fullIndex();if(seq!==searchID)return;const terms=SiteSearch.normalize(q).split(/\s+/).filter(Boolean),matches=[];
      for(let i=0;i<rows.length;i++){if(terms.every(t=>rows[i].normalized.includes(t)))matches.push(rows[i]);if(i%500===0){await yieldUI();if(seq!==searchID)return;}}
      if(seq!==searchID)return;box.replaceChildren(el('p','找到 '+matches.length+' 个经文段落；显示前 80 项。仅检索正文，不自动改写或解释经文。'));
      for(const x of matches.slice(0,80)){const row=el('div',undefined,'search-result'),a=el('a',meta.books[x.book-1].name+' '+x.chapter+':'+x.verse);a.href='/bible/?book='+x.book+'&chapter='+x.chapter+'&anchor='+encodeURIComponent(x.anchor);
        a.addEventListener('click',event=>{if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||event.button!==0)return;event.preventDefault();navigate(()=>load(x.book,x.chapter,x.anchor),{clearSearch:false});});
        row.append(a,el('p',x.text));box.append(row);}
    }catch(e){if(seq===searchID)box.textContent='全文索引未加载：'+e.message+'。可重新提交查询。';}
  });
  window.addEventListener('popstate',()=>{if(!meta)return;tts?.stop();++searchID;if(lastRoute!==location.search)route();else{const h=SiteRuntime.decodeFragment(location.hash);if(h)focusAnchor(h);else if(history.state?.biblePosition)announce('restore',history.state.biblePosition);else $('reader-scroll').scrollTop=0;}});
  window.addEventListener('hashchange',()=>{const h=SiteRuntime.decodeFragment(location.hash);if(h&&active)focusAnchor(h);});
  window.addEventListener('pagehide',()=>{++intent;++searchID;++initialization;initialized=false;controller?.abort();});
  window.addEventListener('pageshow',event=>{
    if(!event.persisted)return;
    tts?.stop();flowStop('已返回阅读页面；需要朗读时请重新开始。');
    if(meta)route();else initialize();
  });
  async function initialize(){
    if(initialized)return;initialized=true;setBusy(true);$('retry-reader').disabled=true;
    const token=++initialization;
    try{const m=await json('/data/bible/meta.json');
      if(token!==initialization)return;
      if(!Array.isArray(m.books)||m.books.length!==66||!m.books.every((b,i)=>b.id===i+1&&Number.isInteger(b.chapters))||!m.version?.source_sha256)throw Error('版本目录结构不符');
      meta=m;$('bible-book').replaceChildren();for(const book of m.books){const o=el('option',book.name);o.value=book.id;$('bible-book').append(o);}
      $('bible-meta').textContent=m.version.snapshot_date+' · 正式母稿第 '+m.version.source_revision+' 版快照 · '+m.version.book_count+' 卷 / '+m.version.chapter_count+' 章 / '+m.version.footnotes+' 条真实原注。不是全书终审声明。';
      await route();
    }catch(e){if(token!==initialization)return;invalidate();$('reader-status').textContent='版本信息未加载：'+e.message;$('retry-reader').hidden=false;announce('error',{message:e.message});setBusy(false);}
    finally{if(token===initialization){initialized=false;$('retry-reader').disabled=false;}}
  }
  window.BibleReader={
    current:()=>active?{book:active.id,chapter:chapterNo,name:active.name,count:active.chapters.length,source:meta.version.source_sha256}:null,
    saved:()=>previous,meta:()=>meta,speech:()=>tts,plan:()=>({active:flow.active,pending:flow.pending}),
    go:(book,chapter,anchor=null)=>navigate(()=>load(book,chapter,anchor)),focusAnchor
  };
  $('retry-reader').addEventListener('click',()=>{if(meta&&pendingTarget){const p={...pendingTarget};navigate(()=>load(p.book,p.chapter,p.anchor,p.mode,undefined,p.restore,p.fragment));}else if(meta)route();else initialize();});initialize();
})();
