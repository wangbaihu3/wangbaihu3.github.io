/* 由处境进入到福音治理。没有自动罪名判决、隐藏动机算法、服务器个人日志或默默上传。 */
(() => {'use strict';
const $=id=>document.getElementById(id);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state={step:0,signal:null,issue:null,facts:'unknown',risk:'unknown',root:null,activeGroup:'C9',legacy:null};
let data=null;
const names=['识别处境','核实行为与责任','谨慎审视内心','以福音回应','治理与复核'];
const $stage=$('stage');
function issue(){return data.patterns.find(x=>x.id===state.issue)||null;}
function signal(){return data.signals.find(x=>x.id===state.signal)||null;}
function gName(id){return data.groups.find(x=>x.id===id)?.name||id;}
function sourceLink(x){const [book,idx]=x.lesson.split(':');return `/counseling/guide/?book=${encodeURIComponent(book)}&lesson=${encodeURIComponent(idx)}`;}
function options(name,list,current){return `<div class="simple-options" role="radiogroup" aria-label="${esc(name)}">${list.map(x=>`<label><input type="radio" name="${esc(name)}" value="${esc(x[0])}" ${x[0]===current?'checked':''}><span>${esc(x[1])}</span></label>`).join('')}</div>`;}
function signalStage(){return `<h3>先说清：你遇到的是什么事情？</h3><p>可以从一个表面线索开始，但这只是学习入口，<strong>不是罪的诊断</strong>。有危险或被迫认罪时，不需要先证明自己有错。</p><div class="choice-grid">${data.signals.map(s=>`<button type="button" class="choice" data-signal="${esc(s.id)}" aria-pressed="${s.id===state.signal}"><strong>${esc(s.label)}</strong><small>${esc(s.help)}</small></button>`).join('')}</div>${state.signal?`<div class="explain">已选择：${esc(signal().label)}。${esc(signal().help)}</div>`:''}`;}
function issueOptions(){const s=signal(),suggest=s?.suggest||[];const all=[...data.patterns];const related=all.filter(x=>suggest.includes(x.id));const elsewhere=all.filter(x=>!suggest.includes(x.id));return `<div class="field"><label for="issue-select">你是否要核查下面某项明确的行为？（可以不选）</label><select id="issue-select"><option value="">暂不选择——先了解处境</option>${related.length?`<optgroup label="与所选处境可能相关——不代表已犯罪">${related.map(x=>`<option value="${esc(x.id)}" ${state.issue===x.id?'selected':''}>${esc(x.title)}</option>`).join('')}</optgroup>`:''}<optgroup label="全部十诫主题下的具体行为候选">${elsewhere.map(x=>`<option value="${esc(x.id)}" ${state.issue===x.id?'selected':''}>${esc(gName(x.group))}：${esc(x.title)}</option>`).join('')}</optgroup></select></div>`;}
function factStage(){const p=issue();return `<h3>不先贴罪名，先核查行为与责任</h3><p>从行为、知情、证据与处境入手。真正的受试探、无意失误、受到胁迫和主动犯罪，需要区别。</p>${issueOptions()}
${p?`<div class="explain"><strong>${esc(p.title)}</strong>｜可观察行为例子：${esc(p.observed)}<p><strong>关键核查：</strong>${esc(p.verify)}</p><p><strong>可能推翻认定的反例：</strong>${esc(p.protect)}</p></div>`:''}
<p class="minititle">对于目前选定的行为，事实处于什么状态？</p>${options('facts',[['confirmed','我自愿承认自己有相应具体行为，事实比较明确'],['tempted','只是遇到诱惑，并未实施相应行为'],['unknown','不确定／有人指控但证据未充分查清'],['hurt','我是受到伤害或被迫的一方，不能以此当作我的罪']],state.facts)}
<p class="minititle">目前是否存在现实危险或被迫公开隐私？</p>${options('risk',[['yes','存在暴力、胁迫、自伤风险、被控制等紧急或严重安全问题'],['no','目前没有已知紧急安全问题'],['unknown','尚不确定；需要进一步了解']],state.risk)}
<div class="caution">若存在即时危险，优先联系当地紧急服务、可信赖的现实支持者或适当专业机构。网站不会用“问卷结果”替代安全评估、医学判断或法律事实调查。</div>${state.risk==='yes'?`<p class="actions"><a href="/counseling/#suicide">自伤危机帮助</a><a href="/counseling/#abuse">暴力与受害保护</a><a href="/counseling/#c6_threat">担心伤害他人</a></p>`:''}`;}
function rootStage(){
 const p=issue();
 const permitted=state.facts==='confirmed'&&state.risk==='no'&&!!p;
 if(!permitted){
  return `<h3>关于心的省察，可以暂时跳过</h3><div class="caution">只有本人确认了具体责任、没有当前危险，才建议进一步审慎省察自己的动机。对正在受害、只受试探、事实未明或存在现实危险的人，本页面不会要求选出“偶像”或隐藏罪名。</div><p>可直接继续到“福音与关怀”，了解此时适合的帮助路径。若以后找到新的事实，仍可以回来重新核对。</p>`;
 }
 return `<h3>从真实行为追问：我当时相信了什么？</h3><p>心的省察不是“测谎”，也不是让系统诊断隐藏偶像。请从本人已承认的行为和当时实际想法入手，用证据和圣经反复检验；可选“暂不确定”。</p>
 ${p?`<div class="explain">具体行为：<strong>${esc(p.title)}</strong><p>可供辨析、但尚不能作出结论的一种可能解释：${esc(p.heart)}</p></div>`:''}
 <div class="choice-grid">${data.roots.map(r=>`<button type="button" class="choice" data-root="${esc(r.id)}" aria-pressed="${state.root===r.id}"><strong>${esc(r.name)}</strong><small>${esc(r.question)}</small></button>`).join('')}</div>
 ${state.root?`<p class="explain"><strong>反证边界：</strong>${esc(data.roots.find(x=>x.id===state.root).limit)}</p>${heartStudy()}`:''}
 <p class="small">不必选择；请问自己：我实际做了什么？当时为了什么？是否还有更合理的解释？经文如何评价已证实的行为？</p>`;
}
function choosePath(){if(state.risk==='yes'||state.facts==='hurt')return 'care';if(state.risk==='unknown')return 'evidence';if(state.facts==='tempted')return 'temptation';if(state.facts==='confirmed'&&issue())return 'repentance';if(state.facts==='unknown'||!issue())return 'evidence';return 'support';}
function gospelStage(){const p=issue(),path=data.paths.find(x=>x.id===choosePath()),r=choosePath()==='repentance'?data.roots.find(x=>x.id===state.root):null;
 return `<h3>在基督里认识恩典与新的生活</h3>${gospelContent()}<p>本路径首先区分教义与个案：人在基督里称义是凭基督的救赎、借着信心，并非靠完成步骤。对于确有罪的人，圣灵使人真实悔改、学习积极顺服；对于受苦者，首先需要合宜帮助和真实盼望。</p>
 <div class="result-columns"><article><h3>此刻更适合的路径</h3><p><strong>${esc(path.label)}</strong></p><p>${esc(path.description)}</p><p class="muted">经文：${esc(path.bible)}</p></article><article><h3>应当谨守的三项区分</h3><ul><li>试探与实际犯罪不相同。</li><li>有罪的事实与隐藏动机是不同的命题。</li><li>救赎根基与悔改行为的果子不可颠倒。</li></ul></article>
 <article class="full"><h3>与当前主题相连的圣经教导</h3><p>${p?esc(`${gName(p.group)}；${p.bible}`):'罗马书8:1；加拉太书6:1—2；箴言18:13、17'}</p><p>若讨论“${esc(p?.title||'当前生活处境')}”，先读实际经文上下文，再判断它能否合理用于自己的具体处境。单一经节或情绪表现不足以证明完整因果链。</p>${r?`<p class="muted">自愿省察的可能倾向：${esc(r.name)}——${esc(r.question)}</p>`:''}</article></div>`;}
function renderChain(){
 const p=issue(),path=choosePath(),r=data.roots.find(x=>x.id===state.root);
 if(path!=='repentance'||!p)return '';
 const steps=[
 ['一｜事实行为',p.observed,'先核实本人实际做过什么、当时知道什么；不是从症状推断。'],
 ['二｜道德责任',gName(p.group),p.verify],
 ['三｜可能的内心解释',r?r.name:'尚未选定内心解释',r?r.question:'不必为了完成程序而假装知道隐藏动机。'],
 ['四｜用经文查验',p.bible,'要阅读上下文，区分命令、叙述和具体生活类推。'],
 ['五｜停止旧行为',p.putoff,'若伤害他人，必要时处理法律、财务或关系责任。'],
 ['六｜穿上新人',p.puton,'以基督的恩典为根基，而不是用行动换取称义。']];
 return `<section class="chain-panel"><h3>本次问题链：从行为到治理</h3><p class="small">这是依据你选择的事实绘出的<strong>研究与行动链</strong>，不是对灵魂的机器判决；第三区的推测可撤回。</p>
 <ol class="chain-list">${steps.map(([head,body,limit])=>`<li><strong>${esc(head)}</strong><p>${esc(body)}</p><small>${esc(limit)}</small></li>`).join('')}</ol>
 <p class="caution"><strong>反证提醒：</strong>${esc(p.protect)} 若这些情形成立，应重新评价本次判断。</p></section>`;
}
function renderGuideInAction(){
 const p=issue(),path=choosePath();if(!p||path!=='repentance')return '';
 const g=data.guides.find(x=>x.id===p.group);if(!g)return '';
 return `<section class="study-method"><h3>从十诫展开的专题治理：${esc(g.name)}</h3>
 <p class="scripture"><strong>经文范围：</strong>${esc(g.passages)}</p>
 <details open><summary>经文的意思与教义边界</summary><p>${esc(g.exegesis)}</p></details>
 <details><summary>复杂处境：怎样核实、怎样避免误判</summary><p>${esc(g.scenario)}</p></details>
 <details open><summary>实际行动：停止旧行为、修复、积极顺服</summary><p>${esc(g.practice)}</p></details>
 <details><summary>反例与原著来源边界</summary><p>${esc(g.boundaries)}</p></details>
 </section>`;
}
function renderMatchingMethods(){
 const path=choosePath();const ids=path==='repentance'?['heart','repentance','puton','relationships']:path==='temptation'?['temptation','puton']:path==='care'?['facts','relationships']:['facts','command'];
 return `<section class="study-method"><h3>适合当前处境的圣经辅导方法</h3><p>以下方法是根据实际原著章节作出的原创教学归纳，不是对某个人隐藏动机或救恩状态的裁定。</p>
 ${ids.map(id=>{const m=data.methods.find(x=>x.id===id);if(!m)return '';return `<details><summary>${esc(m.name)} · ${esc(m.bible)}</summary><p><strong>适用：</strong>${esc(m.when)}</p><ol>${m.steps.map(t=>`<li>${esc(t)}</li>`).join('')}</ol><p><strong>来源线索：</strong>${esc(m.source)}</p><p class="caution"><strong>不适用的推断：</strong>${esc(m.not_for)}</p></details>`}).join('')}</section>`;
}
function actionStage(){const p=issue(),path=choosePath(),r=data.roots.find(x=>x.id===state.root),source=p?.source,lesson=p?sourceLink(p):'/counseling/guide/';
let cards=[];
if(path==='care')cards=[['立即保护','在安全情况下离开当前危险、联系可信支持者或当地紧急援助；对虐待、暴力和严重心理危机寻求合适专业帮助。'],['保存事实','安全保留必要记录；不要被迫公开敏感经历，也不必先认罪才能获得保护。'],['在陪伴中受帮助','读诗篇34篇、加拉太书6:2；必要时暂缓一切罪责省察。']];
else if(path==='evidence')cards=[['把事实写清楚','区分确实发生、自己记得、他人声称、仍待核实四类；可以请可信者协助，但不必把私事上传网站。'],['暂不作罪责裁定','不从焦虑、睡眠、哭泣或被指控事实推论隐藏犯罪；如有客观过错，先作事实纠正。'],['观察并重新核对','对新证据保持开放；下次从真实已知的事实继续，而不是追求一次看穿所有隐秘动机。']];
else if(path==='temptation')cards=[['识别诱因','明确在何种时机容易陷入诱惑；与真正已发生的罪行分开。'],['警醒祷告','按马太福音26:41与欧文《论试探》学习守望、避开诱因和寻求支持。'],['积极选择','为下一次类似处境写下合宜替代行动；没有犯罪不需要强制认罪。']];
else if(path==='repentance')cards=[['停止旧行为',p.putoff],['诚实承认与修复',`若确实损害别人，按事实考虑道歉、撤回虚假陈述、返还或必要纠正；不让形式化认罪取代修复。`],['穿上新人',p.puton],['心与福音',`思考“${p.heart}”是否真与本人已知动机有关；这是假设而非判决。以基督救赎为根基，学习真实顺服。`]];
else cards=[['现实支持','按照处境寻求可信牧养、亲友支持或合适专业资源。'],['学习经文','从罗马书8章、以弗所书4章学习恩典中的盼望与责任。'],['生活复核','记录可观察的改变而非使用属灵积分或无穷的自我审问。']];
return `<h3>你的个人研习与治理路线</h3><p class="small">根据你主动选择的事实状态生成学习建议，不作自动个人诊断。结果仅保存在当前页面内存；关闭网页后不保留私人判断。</p><div class="result-columns">${cards.map(([h,t])=>`<article><h3>${esc(h)}</h3><p>${esc(t)}</p></article>`).join('')}
 <article class="full"><h3>复核与实际生活</h3><p><strong>今天：</strong>优先采取安全行动，或核清一个具体事实，再选择适用的一项行动。<strong>接下来几天：</strong>在适当支持下观察是否停止有害行为、纠正错误、保护他人。<strong>随后：</strong>复核事实及关系安全，有新证据应当修正先前判断。没有任何步骤可证明一个人已经得救。</p>
 ${p?`<p><strong>经文：</strong>${esc(p.bible)}；<strong>原著研究线索：</strong>${esc(source)}。此处为原创归纳，尚未完成逐章原著独立终审。</p>`:''}
 ${renderChain()}${p?`<p class="actions"><a href="/counseling/#${encodeURIComponent(p.id)}">阅读本题完整辅导</a><a href="/counseling/method/">查看七阶二十四问方法</a></p>`:''}${renderGuideInAction()}${renderMatchingMethods()}<div class="actions"><a class="secondary linklike" href="${esc(lesson)}">继续阅读相关完整课程</a><a class="secondary linklike" href="/bible/">打开圣经阅读器</a><button class="secondary" type="button" data-print="yes">打印本页</button><button class="secondary" type="button" data-reset="yes">重新开始</button></div></article></div>`;}
function render(){if(!data)return;const previous=document.activeElement;const focus=previous?.id?{id:previous.id}:previous?.name?{name:previous.name,value:previous.value}:previous?.dataset?.signal?{signal:previous.dataset.signal}:previous?.dataset?.root?{root:previous.dataset.root}:null;const pages=[signalStage,factStage,rootStage,gospelStage,actionStage];$stage.innerHTML=pages[state.step]();$('step-status').textContent=`${names[state.step]} · 第${state.step+1}／5步`;
 document.querySelectorAll('[data-go-step]').forEach((b,i)=>{b.classList.toggle('active',i===state.step);b.classList.toggle('finished',i<state.step);b.setAttribute('aria-current',i===state.step?'step':'false')});$('back').disabled=state.step===0;$('next').textContent=state.step===4?'重新开始':'继续下一步';$('next').disabled=state.step===0&&!state.signal;
 if(focus){const target=focus.id?$(focus.id):focus.name?document.querySelector('[name="'+CSS.escape(focus.name)+'"][value="'+CSS.escape(focus.value)+'"]'):document.querySelector('[data-'+(focus.signal?'signal':'root')+'="'+CSS.escape(focus.signal||focus.root)+'"]');target?.focus({preventScroll:true});}
}
function jump(step){if(!data)return;state.step=Math.min(4,Math.max(0,step));render();const heading=$stage.querySelector('h3');if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});}$('flow').scrollIntoView({block:'start',behavior:'auto'});}
function renderTopicGuide(g){
 if(!g)return '';
 return `<article class="topic-guide" id="topic-guide"><div class="section-head"><div><p class="eyebrow">专题深研｜教义、个案与具体行动</p><h3>${esc(g.name)}</h3></div></div>
 <p class="scripture"><strong>核心经文：</strong>${esc(g.passages)}</p>
 <div class="topic-grid"><section><h4>经文与教义：不能只贴罪名</h4><p>${esc(g.exegesis)}</p></section>
 <section><h4>现实处境：先查什么事实？</h4><p>${esc(g.scenario)}</p></section>
 <section><h4>治理方案：停止、修复、建立新人</h4><p>${esc(g.practice)}</p></section>
 <section><h4>反证、保护边界与原著出处</h4><p>${esc(g.boundaries)}</p></section></div></article>`;
}
function renderGroups(){
 const b=$('group-buttons');b.innerHTML=data.groups.map(g=>`<button type="button" data-group="${esc(g.id)}" class="${g.id===state.activeGroup?'active':''}" aria-pressed="${g.id===state.activeGroup}">${esc(g.name)}</button>`).join('');
 const group=data.guides.find(x=>x.id===state.activeGroup);
 $('group-guidance').innerHTML=renderTopicGuide(group);
 const items=data.patterns.filter(x=>x.group===state.activeGroup);
 $('group-issues').innerHTML=items.map(p=>`<article class="issue-card"><h3>${esc(p.title)}</h3><p><strong>可观察行为：</strong>${esc(p.observed)}</p><p><strong>应先核查：</strong>${esc(p.verify)}</p><p><strong>反证：</strong>${esc(p.protect)}</p><button type="button" data-pick="${esc(p.id)}">从这一行为进入实际辅导</button></article>`).join('');
}
function renderMethodLibrary(){
 const area=$('methods-content');if(!area)return;
 area.innerHTML=data.methods.map((m,i)=>`<details class="method-card" ${i===0?'open':''}><summary>${esc(m.name)}</summary><p><strong>适用：</strong>${esc(m.when)}</p><p><strong>经文：</strong>${esc(m.bible)}</p><ol>${m.steps.map(x=>`<li>${esc(x)}</li>`).join('')}</ol><p><strong>原著定位：</strong>${esc(m.source)}</p><p class="caution"><strong>不可越界：</strong>${esc(m.not_for)}</p></details>`).join('');
}
async function showResearch(){const a=$('research-area');a.hidden=!a.hidden;if(a.hidden)return;if(state.legacy){return renderResearch();}a.textContent='正在取得原始候选索引……';try{state.legacy=await window.SiteRuntime.json('/data/counseling/legacy-research-index.json');renderResearch();}catch(e){a.textContent='研究候选索引暂时无法读取：'+e.message;}}
function renderResearch(){const a=$('research-area'),d=state.legacy;a.innerHTML=`<p class="caution">此处仅供研究检索，共${d.total_records}条历史候选，${d.duplicate_identifiers}处重复标识；其中一些原稿将症状错误当作罪证，本工具不批准这种推断。</p><label class="field" for="legacy-q">仅查阅原研究条目名称<input type="search" id="legacy-q" placeholder="输入历史候选关键词"></label><div id="legacy-results" class="research-box"></div>`;renderResearchHits('');}
function renderResearchHits(term){const res=$('legacy-results');if(!res||!state.legacy)return;const q=term.trim().toLocaleLowerCase('zh-CN');const all=state.legacy.entries.filter(x=>(x.title+' '+x.category).toLowerCase().includes(q));res.innerHTML=`<p class="small">检索到${all.length}条历史候选，最多先显示40条；均未获个案诊断批准。</p>`+all.slice(0,40).map(x=>`<div class="research-row">${esc(x.record)} · ${esc(x.category)}｜${esc(x.title)}</div>`).join('');}
function bind(){document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const ds=b.dataset;
 if(ds.signal){state.signal=ds.signal;state.issue=null;state.root=null;state.facts='unknown';state.risk='unknown';render();}
 if(ds.root){if(state.facts==='confirmed'&&state.risk==='no'&&issue()){state.root=state.root===ds.root?null:ds.root;render();}}
 if(ds.group){state.activeGroup=ds.group;renderGroups();document.querySelector('[data-group="'+CSS.escape(state.activeGroup)+'"]')?.focus({preventScroll:true});}
 if(ds.pick){state.issue=ds.pick;state.signal=state.signal||'other';state.facts='unknown';state.root=null;if(state.risk!=='yes')state.risk='unknown';jump(1);}
 if(ds.goStep!==undefined)jump(Number(ds.goStep));
 if(ds.print)window.print();
 if(ds.reset){state.signal=null;state.issue=null;state.root=null;state.facts='unknown';state.risk='unknown';jump(0);}
 });
 document.addEventListener('change',e=>{const x=e.target;if(x.id==='issue-select'){state.issue=x.value||null;state.root=null;state.facts='unknown';if(state.risk!=='yes')state.risk='unknown';render();}if(x.name==='facts'){state.facts=x.value;if(x.value!=='confirmed')state.root=null;render();}if(x.name==='risk'){state.risk=x.value;if(x.value!=='no')state.root=null;render();}});
 document.addEventListener('input',e=>{if(e.target.id==='legacy-q')renderResearchHits(e.target.value);});
 $('start').addEventListener('click',()=>jump(0));$('show-groups').addEventListener('click',()=>$('commandments').scrollIntoView({block:'start'}));$('back').addEventListener('click',()=>jump(state.step-1));$('next').addEventListener('click',()=>{if(state.step===4){state.signal=null;state.issue=null;state.root=null;state.facts='unknown';state.risk='unknown';jump(0);}else jump(state.step+1)});$('research-toggle').addEventListener('click',showResearch);
}

const rootStudies={
 control:['“只要一切照我的计划，就不会失去安全。”','基督的主权使受造者可以履行本分，而不必取代神控制全部结果。信靠并不取消计划，却要求停止威胁、操纵和越过别人正当界限。','把下一次要求改成可以回应的请求；列出自己应做的事和别人有权决定的事。'],
 approval:['“只有他们满意，我才值得被接纳。”','加拉太书1:10在使徒忠于福音的语境中拒绝以讨人喜悦改变真理。基督的接纳使人可以诚实承认限制，仍然认真爱人，不能把拒绝讨好变成轻看邻舍。','对一项已知不实的承诺作具体更正，说明可以做到与做不到的范围。'],
 comfort:['“只要我不面对，问题就不会临到。”','提多书2:11—14把恩典与在现今生活中学习敬虔相连。恩典既体恤能力限制，也教人离弃明知故犯的逃避；休息和疾病需要另行理解。','把责任缩成今天能够完成的一小步，先联系受影响的人，再安排合理休息。'],
 profit:['“拥有更多，就能最终保证我的价值与安全。”','马太福音6:19—24把财宝、眼光和所事奉的主相连。基督呼召信徒在父的眷顾中作忠心管家，不用获利的目标批准欺诈或剥削。','核对一项交易或账目，停止不公手段，落实准确说明、归还或公正支付。'],
 revenge:['“只有对方也受伤，我的痛苦才得到承认。”','罗马书12:17—21禁止以恶报恶，把审判交给神，并要求在可能范围内与人和睦。这保留正当申诉与保护，不许复仇，也不要求掩盖事实。','停止一项报复性言行，把需要追究的事实交给适当、无利益冲突的渠道处理。'],
 status:['“承认这次错误，就证明我整个人毫无价值。”','腓立比书2:3—8把谦卑放在基督舍己的榜样中。基督里的身份使人能够具体认错，也能承认恩赐；无需靠贬低别人或维持完美形象站立。','在自己有责任的一件事上具体承认，不加“但是”，并接受必要的纠正。'],
 security:['“为了避免任何损失，使用不义手段也是必要的。”','诗篇56篇让惧怕中的人转向神，并没有说感到惧怕本身就是犯罪。信靠神让人一面寻求实际保护，一面拒绝把安全需要当作伤害无辜者的许可证。','分别写明合理保护措施和不义手段，保留前者，停止后者，并取得现实支持。'],
 avoidance:['“等我完全有把握、完全愿意时，才需要履行责任。”','雅各书1:22—25把听道与行道连起来，要求实际回应已经明白的真理。行动应按真实能力安排，不把身体限制算作懒惰，也不把难受本身当成免责证据。','明确一项本人确有能力承担的责任、完成时间与求助方式；若做不到，诚实说明并重新协商。']};
function heartStudy(){const v=rootStudies[state.root];if(!v)return '';return `<section class="study-method"><h4>查验这项可能的假应许</h4><p>${esc(v[0])}这只是一种待查解释；若不符合真实想法，可以撤回选择。</p><h4>真理怎样改变这条推理</h4><p>${esc(v[1])}</p><h4>具体替代行动</h4><p>${esc(v[2])}</p><p><a href="/counseling/method/#stage-2">深入阅读解释、欲望与理由的四阶查验</a></p></section>`;}
function gospelContent(){const path=choosePath();if(path!=='repentance')return `<section class="study-method"><h4>此刻可以领受的关怀</h4><p>${path==='care'?'先接受保护和陪伴。诗篇34篇向伤心的人显明神的临近；加拉太书6:2要求彼此担当重担。求助不是必须先证明自己无罪或先认罪才能获得的奖赏。':path==='temptation'?'希伯来书4:15—16宣告基督体恤人的软弱，并邀请人来到施恩宝座前求帮助。遭遇诱惑不等于已经同意犯罪；可以具体离开诱因、祷告并与可信者商量下一步。':'箴言18:13、17提醒人耐心听清；雅各书1:5鼓励缺少智慧的人求神帮助。事实未清时，可以暂不作道德定论，同时继续诚实、保护和照顾现实需要。'}</p><p>不需要为了获得安慰而编造认罪，也不需要先完成这份练习。可以返回专题关怀，或与可信牧者和合宜的现实支持者谈一件最迫切的事。</p></section>`;
return `<section class="study-method gospel-four"><h4>从基督认识改变的根基</h4><dl><dt>基督的属性</dt><dd>他真实、信实、公义，也怜悯软弱的人；我们可以向他求帮助，无须靠掩饰错误维持形象。</dd><dt>基督的救赎</dt><dd>罗马书3:21—26把称义的根据指向基督的救赎。道歉、赔偿和习惯不是支付给神的赦罪价格。</dd><dt>在基督里的身份</dt><dd>以弗所书2:8—10先讲恩典中因信得救，再讲被造为要行善。顺服是蒙恩后的回应，不能倒转成赚取接纳的条件。</dd><dt>基督的呼召</dt><dd>以弗所书4:22—32要求停止旧行为，心志更新，实行诚实、劳作、分享与造就人的言语。恩典使我们能够面对真实责任。</dd></dl><p><a href="/counseling/method/#stage-6">展开第六阶：恩典与新身份</a></p></section>`;}

let loading=false;
async function init(){
 if(loading)return;loading=true;$stage.setAttribute('aria-busy','true');$('next').disabled=true;$('back').disabled=true;
 try{
  if(!window.SiteRuntime?.json)throw Error('网站校验脚本尚未加载，请刷新网页');
  const incoming=await window.SiteRuntime.json('/data/counseling/governance.json');
  if(incoming.schema!=='guided-governance-v2'||!Array.isArray(incoming.groups)||incoming.groups.length!==10||!Array.isArray(incoming.patterns)||incoming.patterns.length!==32||!Array.isArray(incoming.methods)||incoming.methods.length!==8||!Array.isArray(incoming.guides)||incoming.guides.length!==10||!Array.isArray(incoming.signals)||incoming.signals.some(s=>!Array.isArray(s.suggest)))throw Error('数据格式或条目数量异常');
  data=incoming;const requested=new URLSearchParams(location.search).get('issue');if(data.patterns.some(p=>p.id===requested)){state.issue=requested;state.signal='other';state.step=1;}
  render();renderGroups();renderMethodLibrary();
 }catch(e){
  data=null;$stage.replaceChildren();const message=document.createElement('p');message.setAttribute('role','alert');message.textContent='辅导资料载入失败：'+e.message+'。';
  const retry=document.createElement('button');retry.type='button';retry.textContent='重新加载辅导资料';retry.addEventListener('click',init);
  const fallback=document.createElement('a');fallback.href='/counseling/method/';fallback.textContent='阅读完整七阶辅导方法';$stage.append(message,retry,document.createTextNode(' '),fallback);
 }finally{loading=false;$stage.setAttribute('aria-busy','false');}
}
bind();init();
})();
