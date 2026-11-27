(function(){
  'use strict';
  const header=document.querySelector('.site-header'),nav=header?.querySelector('.site-main-nav');
  if(!header||!nav)return;
  const button=document.createElement('button');button.type='button';button.className='site-menu-toggle';button.textContent='网站导航';
  nav.id=nav.id||'site-primary-navigation';button.setAttribute('aria-controls',nav.id);button.setAttribute('aria-expanded','false');
  nav.before(button);
  const narrow=matchMedia('(max-width:700px)');let open=false;
  function render(){
    button.hidden=!narrow.matches;nav.hidden=narrow.matches&&!open;button.setAttribute('aria-expanded',String(!nav.hidden));
    button.textContent=open?'收起导航':'网站导航';header.dataset.menuReady='true';
  }
  button.addEventListener('click',()=>{open=!open;render();});
  header.addEventListener('keydown',event=>{if(event.key==='Escape'&&narrow.matches&&open){event.preventDefault();open=false;render();button.focus();}});
  narrow.addEventListener?.('change',()=>{
    const focused=document.activeElement,wasInMenu=nav.contains(focused),wasToggle=focused===button;
    open=false;render();
    if(narrow.matches&&wasInMenu)button.focus({preventScroll:true});
    else if(!narrow.matches&&wasToggle)(nav.querySelector('[aria-current="page"]')||nav.querySelector('a'))?.focus({preventScroll:true});
  });render();
})();
