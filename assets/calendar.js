(function(root) {
  'use strict';
  const MIN='1600-01-01', MAX='2400-12-31';
  const MONTHS={Tishri:['提斯利月','תשרי'],Heshvan:['赫舍万月','חשון'],Kislev:['基斯流月','כסלו'],Tevet:['提别月','טבת'],Shevat:['细罢特月','שבט'],'Adar I':['亚达一月','אדר א׳'],'Adar II':['亚达二月','אדר ב׳'],Adar:['亚达月','אדר'],Nisan:['尼散月','ניסן'],Iyar:['以珥月','אייר'],Sivan:['西弯月','סיון'],Tamuz:['搭模斯月','תמוז'],Av:['埃波月','אב'],Elul:['以禄月','אלול']};
  const canonical = value => ({Tishrei:'Tishri',Cheshvan:'Heshvan',Tammuz:'Tamuz'})[value] || value;
  // Deterministic fixed Hebrew calendar. All arithmetic uses civil-day ordinals,
  // not host ICU Hebrew-calendar tables (which differed at 1799-09-25 in QA).
  // Mean lunation: 29 days + 13753/25920 day; 235 months per 19-year cycle.
  // The two postponement corrections enforce valid 353/354/355/383/384/385-day years.
  // Gregorian input is proleptic; it is not a historical Julian/calendar-reform claim.
  const RD_UNIX=719163, DAY_MS=86400000, starts=new Map(), monthCache=new Map();
  const leap=year=>((7*year+1)%19)<7;
  function meanStart(year) {
    const months=Math.floor((235*year-234)/19);
    let days=29*months+Math.floor((12084+13753*months)/25920);
    if((3*(days+1))%7<3)days++;
    return days;
  }
  function yearStart(year) {
    if(starts.has(year))return starts.get(year);
    const current=meanStart(year),previous=meanStart(year-1),next=meanStart(year+1);
    const correction=next-current===356?2:current-previous===382?1:0;
    const rd=-1373427+current+correction;starts.set(year,rd);return rd;
  }
  function civilMonths(year) {
    if(monthCache.has(year))return monthCache.get(year);
    const length=yearStart(year+1)-yearStart(year);
    const rows=[['Tishri',30],['Heshvan',length%10===5?30:29],['Kislev',length%10===3?29:30],['Tevet',29],['Shevat',30]];
    if(leap(year))rows.push(['Adar I',30],['Adar II',29]);else rows.push(['Adar',29]);
    rows.push(['Nisan',30],['Iyar',29],['Sivan',30],['Tamuz',29],['Av',30],['Elul',29]);
    monthCache.set(year,rows);return rows;
  }
  function parseDate(value) {
    if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw Error('请输入完整西历日期');
    const [y,m,d]=value.split('-').map(Number),date=new Date(Date.UTC(y,m-1,d,12));
    if(value<MIN||value>MAX||date.getUTCMonth()!==m-1||date.getUTCDate()!==d)throw Error('日期无效或不在 1600—2400 年范围内');
    return date;
  }
  const iso=date=>date.toISOString().slice(0,10);
  function hebrew(value,evening=false) {
    const date=parseDate(value),rd=Math.floor(date.getTime()/DAY_MS)+RD_UNIX+(evening?1:0);
    let year=date.getUTCFullYear()+3760;
    while(rd<yearStart(year))year--;
    while(rd>=yearStart(year+1))year++;
    let offset=rd-yearStart(year);
    for(const [month,length] of civilMonths(year)) {
      if(offset<length) {
        const day=offset+1;
        return {year,month,day,month_zh:MONTHS[month][0],hebrew:day+' '+MONTHS[month][1]+' '+year};
      }
      offset-=length;
    }
    throw Error('历法计算未得到有效日期，未显示推测结果');
  }
  function week(value,evening=false) {
    const date=parseDate(value),rows=[];date.setUTCDate(date.getUTCDate()-3);
    for(let i=0;i<7;i++,date.setUTCDate(date.getUTCDate()+1)) {
      const g=iso(date);if(g<MIN||g>MAX)continue;
      rows.push({date:g,weekday:new Intl.DateTimeFormat('zh-CN',{weekday:'long',timeZone:'UTC'}).format(date),...hebrew(g,evening)});
    }
    return rows;
  }
  function reverse(year,month,day) {
    year=Number(year);day=Number(day);month=canonical(month);
    if(!Number.isInteger(year)||year<hebrew(MIN).year||year>hebrew(MAX,true).year||!Number.isInteger(day)||day<1||day>30||!Object.hasOwn(MONTHS,month))throw Error('希伯来年、月份或日期无效');
    let offset=0;
    for(const [name,length] of civilMonths(year)) {
      if(name===month) {
        if(day>length)return null;
        const g=iso(new Date((yearStart(year)+offset+day-1-RD_UNIX)*DAY_MS));
        return g>=MIN&&g<=MAX?g:null;
      }
      offset+=length;
    }
    return null; // A leap-only month in an ordinary year is not silently renamed.
  }
  const API={hebrew,reverse,parseDate,MONTHS,week,canonical};root.HebrewCalendar=API;
  if(typeof module==='object'&&module.exports)module.exports=API;
  if(typeof document==='undefined'||!document.getElementById('calendar-form'))return;
  const $=id=>document.getElementById(id),text=(tag,value)=>{const e=document.createElement(tag);e.textContent=value;return e;};
  function render() {
    const out=$('calendar-result');
    try {
      const g=$('gregorian-date').value,evening=$('after-sunset').checked,h=hebrew(g,evening);
      const rows=week(g,evening);
      out.replaceChildren(text('p',h.year+' 年 · '+h.month_zh+' '+h.day+' 日'+(evening?'（日落后）':'')));
      const p=text('p',h.hebrew);p.lang='he';p.dir='rtl';p.className='hebrew';out.append(p);
      if(rows.length<7)out.append(text('p','已到工具日期边界，只列范围内的 '+rows.length+' 天；所选日期有效。'));
      $('calendar-week').replaceChildren();for(const h of rows){const row=document.createElement('tr');row.append(text('td',h.date),text('td',h.weekday),text('td',h.year+' 年 '+h.month_zh+' '+h.day+' 日'));$('calendar-week').append(row);}
      const q=new URLSearchParams({date:g,zone:$('calendar-zone').value});if(evening)q.set('evening','1');try{history.replaceState(null,'','?'+q.toString());}catch{out.append(text('p','浏览器不允许保存网址状态；换算结果仍可使用。'));}
    }catch(error){out.textContent=error.message;$('calendar-week').replaceChildren();}
  }
  function today() {
    try {
      const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:$('calendar-zone').value}).formatToParts(new Date()).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
      $('gregorian-date').value=parts.year+'-'+parts.month+'-'+parts.day;render();
    }catch(error){$('calendar-result').textContent='日期显示不可用：'+error.message;}
  }
  for(const [name,[cn]] of Object.entries(MONTHS)){const o=text('option',cn+' · '+name);o.value=name;$('hebrew-month').append(o);}
  $('hebrew-year').max='6161';
  $('calendar-form').addEventListener('submit',e=>{e.preventDefault();render();});
  $('calendar-today').addEventListener('click',today);$('after-sunset').addEventListener('change',render);
  $('calendar-zone').addEventListener('change',render);
  $('reverse-calendar').addEventListener('submit',e=>{e.preventDefault();try{const g=reverse($('hebrew-year').value,$('hebrew-month').value,$('hebrew-day').value);$('reverse-result').textContent=g?'西历白昼日期：'+g+'；该希伯来日从前一西历日的当地日落开始。':'在本工具西历范围内没有此日期；请检查闰月、天数或边界。';}catch(error){$('reverse-result').textContent=error.message;}});
  const q=new URLSearchParams(location.search);if([...$('calendar-zone').options].some(x=>x.value===q.get('zone')))$('calendar-zone').value=q.get('zone');
  if(q.has('date')){$('gregorian-date').value=q.get('date');$('after-sunset').checked=q.get('evening')==='1';render();}else today();
})(typeof window!=='undefined'?window:globalThis);
