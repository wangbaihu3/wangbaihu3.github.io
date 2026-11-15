(function () {
  'use strict';
  SiteSearch.setMap(window.HAN_FOLD);
  const $ = id => document.getElementById(id), tts = mountReaderSpeech(), cache = new Map();
  let meta, active = null, chapterNo = 1, intent = 0, searchID = 0, controller, searchPromise, anchorPromise;
  let lastRoute = '', initialized = false, previous = null;
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
  }
  function invalidate() { active = null; tts?.setProvider(() => [], () => 'bible:not-ready'); $('bible-content').replaceChildren(); $('bible-notes').replaceChildren(); }
  function startNavigation() {
    ++intent; controller?.abort(); controller = new AbortController(); invalidate(); setBusy(true);
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
    a.addEventListener('click', () => { $('show-notes').checked = true; $('bible-notes').hidden = false; }); return a;
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
      if(block.text.trim())spoken.push({text:block.style==='Verse'?block.text.replace(/^\s*\d+\s*/,''):block.text,element:p,id:anchors[0]||'p'+block.source_p});
      $('bible-content').append(p);
    }
    const ids=Object.keys(chapter.notes);$('bible-notes').append(el('h2','本章原注（'+ids.length+'）'));
    for(const id of ids) {
      const section=el('article',undefined,'note');section.id='note-'+id;section.append(el('strong','母稿原注标识 '+id));
      chapter.notes[id].forEach((block,i)=>{const p=el('p');renderRuns(p,block);section.append(p);noteSpoken.push({text:block.text,element:p,id:'note-'+id+'-paragraph-'+i});});
      const back=el('a','返回正文','note-back');back.href='#note-ref-'+id;section.append(back);$('bible-notes').append(section);
    }
    $('bible-notes').hidden=!$('show-notes').checked;
    const bookID=active.id;
    tts?.setProvider(()=>$('read-notes').checked?[...spoken,...noteSpoken]:spoken,
      ()=>`bible:${meta.version.source_sha256}:${bookID}:${chapter.number}:${$('read-notes').checked?'notes':'body'}`);
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
    target.setAttribute('tabindex','-1');target.focus({preventScroll:true});target.scrollIntoView({block:'center'});return true;
  }
  async function load(bookID,chapter=1,anchor=null,mode='push',ticket) {
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
      if(mode){const url='/bible/?book='+bookID+'&chapter='+chapter+(anchor?'&anchor='+encodeURIComponent(anchor):'');history[mode==='replace'?'replaceState':'pushState'](null,'',url);}
      lastRoute=location.search;
      const hash=SiteRuntime.decodeFragment(location.hash);
      if(anchor)focusAnchor(anchor);
      else if(hash===null)$('reader-status').textContent+=' 网址片段编码无效，已忽略片段；正文没有改变。';
      else if(hash&&!focusAnchor(hash))$('reader-status').textContent+=' 本章没有此片段书签，未自动改读其他经文。';
      return true;
    }catch(error){if(seq!==intent)return false;invalidate();$('reader-status').textContent='经文未载入：'+error.message+'。未保留旧章冒充新章。';return false;}
    finally{if(seq===intent)setBusy(false);}
  }
  async function route() {
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
      if(seq===intent)await load(book,chapter,anchor,'replace',seq);
    }catch(e){if(seq===intent){invalidate();$('reader-status').textContent='定位未完成：'+e.message;setBusy(false);}}
  }
  function navigate(fn){++searchID;$('bible-search-results').replaceChildren();fn();}
  $('bible-book').addEventListener('change',()=>navigate(()=>load(Number($('bible-book').value),1)));
  $('bible-chapter').addEventListener('change',()=>{if(active){const id=active.id;navigate(()=>load(id,Number($('bible-chapter').value)));}});
  $('prev-chapter').addEventListener('click',()=>{if(!active)return;const id=active.id;navigate(()=>chapterNo>1?load(id,chapterNo-1):id>1&&load(id-1,meta.books[id-2].chapters));});
  $('next-chapter').addEventListener('click',()=>{if(!active)return;const id=active.id,total=active.chapters.length;navigate(()=>chapterNo<total?load(id,chapterNo+1):id<66&&load(id+1,1));});
  $('show-notes').addEventListener('change',()=>{$('bible-notes').hidden=!$('show-notes').checked;});
  $('read-notes').addEventListener('change',()=>tts?.reset());
  $('reading-size').addEventListener('change',()=>{const v=$('reading-size').value;if(['20','24','28'].includes(v))document.documentElement.dataset.readingSize=v;});
  $('resume-reading').addEventListener('click',()=>{if(!meta||!previous){$('reader-status').textContent='本机没有上一次阅读位置。';return;}if(previous.source!==meta.version.source_sha256){$('reader-status').textContent='记录属于另一母稿快照，未套用旧定位。';return;}navigate(()=>load(previous.book,previous.chapter));});
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
        if(seq!==searchID)return;const task=load(ref.book,ref.chapter,anchor),ticket=intent,ok=await task;
        if(seq===searchID&&ticket===intent)box.textContent=ok?'已定位到对应正文或原注宿主。':'定位未完成，请查看加载提示。';
      }catch(e){if(seq===searchID)box.textContent='节号索引未载入：'+e.message;}return;
    }
    box.textContent='正在加载、校验并检索本版正文索引……';
    try {
      const rows=await fullIndex();if(seq!==searchID)return;const terms=SiteSearch.normalize(q).split(/\s+/).filter(Boolean),matches=[];
      for(let i=0;i<rows.length;i++){if(terms.every(t=>rows[i].normalized.includes(t)))matches.push(rows[i]);if(i%500===0){await yieldUI();if(seq!==searchID)return;}}
      if(seq!==searchID)return;box.replaceChildren(el('p','找到 '+matches.length+' 个经文段落；显示前 80 项。仅检索正文，不自动改写或解释经文。'));
      for(const x of matches.slice(0,80)){const row=el('div',undefined,'search-result'),a=el('a',meta.books[x.book-1].name+' '+x.chapter+':'+x.verse);a.href='/bible/?book='+x.book+'&chapter='+x.chapter+'&anchor='+encodeURIComponent(x.anchor);row.append(a,el('p',x.text));box.append(row);}
    }catch(e){if(seq===searchID)box.textContent='全文索引未加载：'+e.message+'。可重新提交查询。';}
  });
  window.addEventListener('popstate',()=>{if(!meta)return;++searchID;if(lastRoute!==location.search)route();else{const h=SiteRuntime.decodeFragment(location.hash);if(h)focusAnchor(h);}});
  window.addEventListener('hashchange',()=>{const h=SiteRuntime.decodeFragment(location.hash);if(h&&active)focusAnchor(h);});
  window.addEventListener('pagehide',()=>{++intent;++searchID;controller?.abort();});
  async function initialize(){
    if(initialized)return;initialized=true;setBusy(true);$('retry-reader').disabled=true;
    try{const m=await json('/data/bible/meta.json');
      if(!Array.isArray(m.books)||m.books.length!==66||!m.books.every((b,i)=>b.id===i+1&&Number.isInteger(b.chapters))||!m.version?.source_sha256)throw Error('版本目录结构不符');
      meta=m;$('bible-book').replaceChildren();for(const book of m.books){const o=el('option',book.name);o.value=book.id;$('bible-book').append(o);}
      $('bible-meta').textContent=m.version.snapshot_date+' · 正式母稿第 '+m.version.source_revision+' 版快照 · '+m.version.book_count+' 卷 / '+m.version.chapter_count+' 章 / '+m.version.footnotes+' 条真实原注。不是全书终审声明。';
      await route();
    }catch(e){invalidate();$('reader-status').textContent='版本信息未加载：'+e.message;setBusy(false);}
    finally{initialized=false;$('retry-reader').disabled=false;}
  }
  $('retry-reader').addEventListener('click',()=>{if(meta)route();else initialize();});initialize();
})();
