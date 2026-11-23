(function(){'use strict';
const page=document.getElementById('hc-page'),base=document.getElementById('view');
function toggle(show){
 page.hidden=!show;base.hidden=show;
 document.querySelectorAll('[data-hc-nav]').forEach(el=>el.setAttribute('aria-current',show?'page':'false'));
 if(show){document.querySelectorAll('.topnav [data-route],.topnav [data-lie-nav]').forEach(el=>el.setAttribute('aria-current','false'));page.focus({preventScroll:true});page.scrollIntoView({block:'start',behavior:'instant'});}
}
document.addEventListener('click',function(event){const b=event.target.closest('button');if(!b)return;
 if(b.hasAttribute('data-hc-nav')){toggle(true);return;}
 if(b.hasAttribute('data-route')||b.hasAttribute('data-lie-nav'))toggle(false);
});
})();
