(function(){
  'use strict';
  const $=id=>document.getElementById(id),api=window.BibleReader;
  if(!api||!$('reader-workspace'))return;
  const workspace=$('reader-workspace'),side=$('bible-controls'),reader=$('reader-panel'),scroll=$('reader-scroll');
  const small=matchMedia('(max-width:760px)'),tabs=[...document.querySelectorAll('[data-reader-tab]')];
  const settingsKey='messiah-bible-reading-settings-v1';
  let controlsOpen=!small.matches,busy=true,current=null,saving=null,scrollFrame=null,focusMode=false,wasOpen=true;
  let prefs={size:'20',spacing:'2',notes:true,follow:false};
  try{const p=JSON.parse(localStorage.getItem(settingsKey)||'null');if(p&&typeof p==='object'){
    if(['20','24','28'].includes(p.size))prefs.size=p.size;
    if(['1.8','2','2.3'].includes(p.spacing))prefs.spacing=p.spacing;
    if(typeof p.notes==='boolean')prefs.notes=p.notes;
    if(typeof p.follow==='boolean')prefs.follow=p.follow;
  }}catch{}
  function applyPrefs(){
    $('reading-size').value=prefs.size;$('reading-spacing').value=prefs.spacing;
    $('show-notes').checked=prefs.notes;$('follow-audio').checked=prefs.follow;
    document.documentElement.dataset.readingSize=prefs.size;document.documentElement.dataset.readingSpacing=prefs.spacing;
    $('bible-notes').hidden=!prefs.notes;updateProgress();
  }
  function savePrefs(){try{localStorage.setItem(settingsKey,JSON.stringify(prefs));}catch{}}
  function sizeWorkspace(){
    workspace.style.setProperty('--reader-top',Math.max(0,workspace.getBoundingClientRect().top)+'px');
    updateProgress();
  }
  function showControls(open,{focus=false}={}){
    controlsOpen=!!open;side.hidden=!controlsOpen;workspace.dataset.controlsHidden=String(!controlsOpen);
    $('reader-controls-toggle').setAttribute('aria-expanded',String(controlsOpen));
    $('reader-controls-toggle').textContent=small.matches?'目录':controlsOpen?'收起面板':'展开面板';
    $('reader-controls-toggle').setAttribute('aria-label',small.matches?'打开目录与设置':$('reader-controls-toggle').textContent);
    reader.inert=small.matches&&controlsOpen;
    if(small.matches&&controlsOpen){side.setAttribute('role','dialog');side.setAttribute('aria-modal','true');side.setAttribute('aria-labelledby','controls-heading');}
    else{side.removeAttribute('role');side.removeAttribute('aria-modal');side.removeAttribute('aria-labelledby');}
    if(focus){if(controlsOpen){(side.querySelector('[role=tab][aria-selected=true]')||$('close-reader-controls')).focus();}else $('reader-controls-toggle').focus();}
    sizeWorkspace();
  }
  function selectTab(name,{focus=false}={}){
    tabs.forEach(tab=>{const selected=tab.dataset.readerTab===name;tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;$('reader-panel-'+tab.dataset.readerTab).hidden=!selected;if(selected&&focus)tab.focus();});
  }
  tabs.forEach((tab,index)=>{
    tab.addEventListener('click',()=>selectTab(tab.dataset.readerTab));
    tab.addEventListener('keydown',event=>{let n=index;if(event.key==='ArrowRight')n=(index+1)%tabs.length;else if(event.key==='ArrowLeft')n=(index+tabs.length-1)%tabs.length;else if(event.key==='Home')n=0;else if(event.key==='End')n=tabs.length-1;else return;event.preventDefault();selectTab(tabs[n].dataset.readerTab,{focus:true});});
  });
  $('reader-controls-toggle').addEventListener('click',()=>showControls(!controlsOpen,{focus:true}));
  $('close-reader-controls').addEventListener('click',()=>showControls(false,{focus:true}));
  $('reader-audio-settings').addEventListener('click',()=>{showControls(true);selectTab('audio',{focus:true});});
  function setFocusMode(on){
    focusMode=on;document.body.classList.toggle('reader-focus-mode',on);syncFocusButton();
    if(on){wasOpen=controlsOpen;showControls(false);}else showControls(!small.matches&&wasOpen);
    sizeWorkspace();
  }
  function syncFocusButton(){
    $('reader-focus').setAttribute('aria-pressed',String(focusMode));
    $('reader-focus').textContent=focusMode?'退出专注':small.matches?'专注':'专注阅读';
    $('reader-focus').setAttribute('aria-label',focusMode?'退出专注阅读':'进入专注阅读');
  }
  $('reader-focus').addEventListener('click',()=>setFocusMode(!focusMode));
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'){
      if(controlsOpen&&small.matches){event.preventDefault();showControls(false,{focus:true});}
      else if(focusMode){event.preventDefault();setFocusMode(false);$('reader-focus').focus();}
      return;
    }
    if(event.key!=='Tab'||!small.matches||!controlsOpen)return;
    const nodes=[...side.querySelectorAll('button:not([disabled]),select:not([disabled]),input:not([disabled]),a[href],summary,[tabindex="0"]')].filter(el=>el.getClientRects().length&&el.tabIndex>=0);
    const first=nodes[0],last=nodes.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
  });
  const onModeChange=()=>{
    const focused=document.activeElement,wasInSide=side.contains(focused);
    showControls(!small.matches&&!focusMode);syncFocusButton();syncAudio();
    if(wasInSide&&!controlsOpen)$('reader-controls-toggle').focus({preventScroll:true});
    else if(focused===$('close-reader-controls')&&!small.matches)(side.querySelector('[role=tab][aria-selected=true]')||$('reader-controls-toggle')).focus({preventScroll:true});
  };
  small.addEventListener?.('change',onModeChange);
  function updateProgress(){
    const range=Math.max(0,scroll.scrollHeight-scroll.clientHeight),position=scroll.scrollTop;
    $('reader-page-up').disabled=busy||!current||position<=1;
    $('reader-page-down').disabled=busy||!current||position>=range-1;
    $('reader-top').disabled=busy||!current||position<=1;
    $('reader-progress').value=range>0?Math.round(position/range*100)+'%':current?'100%':'0%';
  }
  function movePage(direction){if(!busy&&current)scroll.scrollBy({top:direction*Math.max(80,Math.round(scroll.clientHeight*.85)),behavior:'instant'});}
  $('reader-page-up').addEventListener('click',()=>movePage(-1));$('reader-page-down').addEventListener('click',()=>movePage(1));
  $('reader-top').addEventListener('click',()=>{scroll.scrollTop=0;scroll.focus({preventScroll:true});});
  scroll.addEventListener('keydown',event=>{
    if(event.altKey||event.ctrlKey||event.metaKey||event.shiftKey||event.isComposing||event.defaultPrevented)return;
    if(event.target!==scroll&&!event.target.closest('.reading,.note-section'))return;
    if(event.target.closest('input,select,textarea,button,a,[contenteditable=true]')||String(window.getSelection()||''))return;
    if(event.key==='ArrowLeft'||event.key==='ArrowRight'){
      event.preventDefault();if(event.repeat)return;$(event.key==='ArrowLeft'?'prev-chapter':'next-chapter').click();
    }else if(event.key==='PageUp'||event.key==='PageDown'){event.preventDefault();movePage(event.key==='PageUp'?-1:1);}
    else if(event.key==='Home'){event.preventDefault();scroll.scrollTop=0;}
    else if(event.key==='End'){event.preventDefault();scroll.scrollTop=scroll.scrollHeight;}
  });
  function capturePosition(){
    if(!current||busy)return null;
    const top=scroll.getBoundingClientRect().top;
    const paragraphs=[...$('bible-content').querySelectorAll('p[data-source-p]')];
    const paragraph=paragraphs.find(p=>p.getBoundingClientRect().bottom>top+5);
    const note=!paragraph&&!$('bible-notes').hidden?[...$('bible-notes').querySelectorAll('p[data-note-id]')].find(p=>p.getBoundingClientRect().bottom>top+5):null;
    const marker=paragraph||note;
    return {book:current.book,chapter:current.chapter,source:current.source,paragraph:paragraph?.dataset.sourceP||null,note:note?.dataset.noteId||null,noteParagraph:note?.dataset.noteParagraph||null,offset:marker?marker.getBoundingClientRect().top-top:0,scrollTop:scroll.scrollTop,saved:Date.now()};
  }
  function savePosition(){
    clearTimeout(saving);const position=capturePosition();if(!position)return;
    try{localStorage.setItem('messiah-bible-position',JSON.stringify(position));}catch{}
    try{history.replaceState({...history.state,biblePosition:position},'',location.href);}catch{}
  }
  function restorePosition(position){
    if(!position||!current||position.source!==current.source||position.book!==current.book||position.chapter!==current.chapter)return;
    const p=position.note&&!$('bible-notes').hidden?[...$('bible-notes').querySelectorAll('p[data-note-id]')].find(x=>x.dataset.noteId===String(position.note)&&x.dataset.noteParagraph===String(position.noteParagraph)):[...$('bible-content').querySelectorAll('p[data-source-p]')].find(x=>x.dataset.sourceP===String(position.paragraph));
    if(p&&Number.isFinite(position.offset))scroll.scrollTop+=p.getBoundingClientRect().top-scroll.getBoundingClientRect().top-position.offset;
    else if(Number.isFinite(position.scrollTop))scroll.scrollTop=Math.max(0,position.scrollTop);
    updateProgress();
  }
  scroll.addEventListener('scroll',()=>{
    if(scrollFrame===null)scrollFrame=requestAnimationFrame(()=>{scrollFrame=null;updateProgress();});
    clearTimeout(saving);saving=setTimeout(savePosition,180);
  },{passive:true});
  function showSaved(){
    const saved=api.saved(),meta=api.meta();
    const book=meta?.books.find(b=>b.id===saved?.book);
    const valid=book&&saved.source===meta.version.source_sha256&&Number.isInteger(saved.chapter)&&saved.chapter>=1&&saved.chapter<=book.chapters;
    $('saved-reading-label').textContent=valid?'上次：'+book.name+'第'+saved.chapter+'章'+(saved.note?'，可恢复原注位置。':saved.paragraph?'，可恢复段落位置。':'。'):'尚无当前版本的本机阅读记录。';
    $('resume-reading').disabled=!valid;
  }
  function chapterGrid(){
    const grid=$('chapter-grid');grid.replaceChildren();if(!current)return;
    $('chapter-grid-label').textContent=current.name+' · '+current.count+'章';
    for(let n=1;n<=current.count;n++){
      const button=document.createElement('button');button.type='button';button.textContent=n;button.setAttribute('aria-label',current.name+'第'+n+'章');
      if(n===current.chapter)button.setAttribute('aria-current','true');
      button.addEventListener('click',()=>{if(!busy&&current){const book=current.book;api.go(book,n);}});grid.append(button);
    }
  }
  function syncAudio(){
    const speech=api.speech(),engine=speech?.engine,state=engine?.state;
    const playing=state==='playing',paused=state==='paused';
    const plan=api.plan?.(),pending=!!plan?.pending||!!plan?.active&&!playing&&!paused,cancellable=playing||paused||pending;
    const unavailable=!engine?.voice;
    $('reader-audio-toggle').textContent=playing?(small.matches?'暂停':'暂停朗读'):paused?(small.matches?'继续':'继续朗读'):pending?(small.matches?'准备中':'正在准备朗读'):unavailable?'暂无声音':small.matches?'朗读':'开始朗读';
    $('reader-audio-toggle').setAttribute('aria-label',playing?'暂停朗读':paused?'继续朗读':pending?'正在准备朗读':unavailable?'当前没有可用的朗读声音':'开始朗读');
    $('reader-audio-toggle').title=unavailable?'可在目录中的朗读设置查看设备提供的声音。':'';
    $('reader-audio-toggle').disabled=busy||!current||!engine?.voice||pending;
    $('reader-audio-stop').textContent=small.matches?'停止':'停止朗读';$('reader-audio-stop').setAttribute('aria-label','停止朗读');$('reader-audio-stop').disabled=!cancellable;$('reader-audio-stop').dataset.active=String(cancellable);
    $('reader-audio-state').textContent=playing||paused?$('tts-status').textContent:pending?$('bible-tts-flow-status').textContent:'';
  }
  $('reader-audio-toggle').addEventListener('click',()=>{const engine=api.speech()?.engine;if(['playing','paused'].includes(engine?.state))$('tts-pause').click();else $('tts-play').click();});
  $('reader-audio-stop').addEventListener('click',()=>$('tts-stop').click());
  const audioObserver=new MutationObserver(syncAudio);audioObserver.observe($('tts-status'),{childList:true,characterData:true,subtree:true});audioObserver.observe($('tts-voice'),{childList:true,subtree:true});
  document.addEventListener('bible:flow',syncAudio);
  document.addEventListener('reader-speech-segment',event=>{
    if(!prefs.follow||!event.detail?.element||!scroll.contains(event.detail.element))return;
    const element=event.detail.element,box=scroll.getBoundingClientRect(),rect=element.getBoundingClientRect();
    if(rect.top<box.top+12||rect.bottom>box.bottom-12)scroll.scrollTop+=rect.top-box.top-24;
  });
  function changePrefs(){const old=capturePosition();prefs={size:$('reading-size').value,spacing:$('reading-spacing').value,notes:$('show-notes').checked,follow:$('follow-audio').checked};applyPrefs();savePrefs();restorePosition(old);}
  ['reading-size','reading-spacing','show-notes','follow-audio'].forEach(id=>$(id).addEventListener('change',changePrefs));
  $('reset-reading-settings').addEventListener('click',()=>{const old=capturePosition();prefs={size:'20',spacing:'2',notes:true,follow:false};applyPrefs();savePrefs();restorePosition(old);$('reader-status').textContent='阅读设置已恢复；阅读与听读记录保留。';});
  document.addEventListener('bible:busy',event=>{busy=event.detail.busy;if(busy){current=null;document.querySelector('.reader-feedback').dataset.error='false';$('reader-location').textContent='正在载入经文';}for(const b of $('chapter-grid').querySelectorAll('button'))b.disabled=busy;updateProgress();syncAudio();});
  document.addEventListener('bible:loaded',event=>{
    current=event.detail;chapterGrid();showSaved();
    if(current.focus){if(small.matches)showControls(false);scroll.focus({preventScroll:true});}
    restorePosition(current.restore);syncAudio();sizeWorkspace();
  });
  document.addEventListener('bible:error',()=>{current=null;document.querySelector('.reader-feedback').dataset.error='true';$('chapter-grid').replaceChildren();updateProgress();syncAudio();});
  document.addEventListener('bible:leaving',savePosition);
  document.addEventListener('bible:restore',event=>restorePosition(event.detail));
  document.addEventListener('bible:anchor',updateProgress);
  window.addEventListener('pagehide',savePosition);window.addEventListener('resize',sizeWorkspace);
  window.visualViewport?.addEventListener('resize',sizeWorkspace);
  const resize=new ResizeObserver(sizeWorkspace);for(const el of [document.querySelector('.site-header'),document.querySelector('.site-breadcrumb'),document.querySelector('.bible-titlebar')])if(el)resize.observe(el);
  applyPrefs();showControls(controlsOpen);syncFocusButton();showSaved();syncAudio();
  if(api.current()){current=api.current();busy=false;chapterGrid();updateProgress();}
})();
