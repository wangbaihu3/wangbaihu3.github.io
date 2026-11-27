/* 公开课程经文只链接到对应整章；私人输入不参与处理。 */
(()=>{'use strict';
 const aliases=window.BibleReferences?.aliases;if(!aliases)return;
 const chapters=[50,40,27,36,34,24,21,4,31,24,22,25,29,36,10,13,10,42,150,31,12,8,66,52,5,48,12,14,3,9,1,4,7,3,3,3,2,14,4,28,16,24,21,28,16,16,13,6,6,4,4,5,3,6,4,3,1,13,5,5,3,5,1,1,1,22];
 const map=new Map();aliases.forEach((row,i)=>row.split(' ').forEach(a=>map.set(a.toLowerCase(),i+1)));
 const tokens=[...map.keys()].sort((a,b)=>b.length-a.length).map(x=>x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
 const pattern=new RegExp('('+tokens.join('|')+')\\s*(\\d+)','gi');
 function add(root){for(const node of root.querySelectorAll('.scripture:not([data-chapter-links]),.scriptures:not([data-chapter-links])')){
  node.dataset.chapterLinks='true';const found=new Map();for(const m of node.textContent.matchAll(pattern)){const book=map.get(m[1].toLowerCase()),chapter=Number(m[2]);if(chapter>=1&&chapter<=chapters[book-1])found.set(book+':'+chapter,{book,chapter,label:m[1]+' '+chapter+'章'});}
  if(!found.size)continue;const links=document.createElement('span');links.className='reference-links';links.append('查阅上下文（本站译注本）：');for(const x of found.values()){const a=document.createElement('a');a.href='/bible/?book='+x.book+'&chapter='+x.chapter;a.textContent=x.label;links.append(a);}node.append(links);
 }}
 const root=document.querySelector('main')||document.body;add(root);new MutationObserver(()=>add(root)).observe(root,{childList:true,subtree:true});
})();
