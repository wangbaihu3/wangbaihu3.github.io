/*
 * 现代固定希伯来历 · 独立日期计算与节期展示
 * 无外部依赖、无网络请求。算法以平均朔望月与犹太历四项推迟规则为基础；
 * 来源参阅 Calendrical Calculations 与 Hebcal 文档；本文件为独立实现，不复制外部库。
 * 历史边界：采用回推格里历；不能声称精确重建古代观测历。
 */
(function (root) {
  'use strict';
  const HEBREW_EPOCH = -1373427;
  const MIN = '1600-01-01', MAX = '2400-12-31';
  const RD_UNIX = 719163, DAY_MS = 86400000;
  const DATA = {
    Tishri: {cn:'提斯利月', alias:'以他念月', he:'תִּשְׁרֵי', en:'Tishrei', note:'民用新年起点；吹角日、赎罪日和住棚节均在本月。'},
    Heshvan: {cn:'玛西班月',alias:'赫舍万月／布勒月',he:'חֶשְׁוָן',en:'Cheshvan',note:'有29或30日，取决于当年的年型。'},
    Kislev: {cn:'基斯流月',alias:'基斯娄月',he:'כִּסְלֵו',en:'Kislev',note:'有29或30日；修殿节从本月二十五日开始。'},
    Tevet: {cn:'提别月',alias:'提别／特贝特',he:'טֵבֵת',en:'Tevet',note:'29日；修殿节常延续到本月。'},
    Shevat: {cn:'细罢特月',alias:'示巴特月',he:'שְׁבָט',en:'Shevat',note:'30日；本月十五日有树木新年。'},
    'Adar I': {cn:'亚达一月',alias:'第一亚达月／闰亚达月',he:'אֲדָר א׳',en:'Adar I',note:'仅闰年出现，30日；主要普珥节在亚达二月。'},
    'Adar II': {cn:'亚达二月',alias:'第二亚达月',he:'אֲדָר ב׳',en:'Adar II',note:'仅闰年出现，29日；普珥节在本月十四日。'},
    Adar: {cn:'亚达月',alias:'亚达',he:'אֲדָר',en:'Adar',note:'仅平年采用本月名，29日；普珥节在十四日。'},
    Nisan: {cn:'尼散月',alias:'亚笔月',he:'נִיסָן',en:'Nisan',note:'宗教月份第一月，30日；逾越节及无酵节。'},
    Iyar: {cn:'以珥月',alias:'西弗月',he:'אִיָּר',en:'Iyar',note:'29日；补过逾越节与数俄梅珥第三十三日。'},
    Sivan: {cn:'西弯月',alias:'西汪月',he:'סִיוָן',en:'Sivan',note:'30日；七七节（五旬节）。'},
    Tamuz: {cn:'塔穆兹月',alias:'搭模斯月',he:'תַּמּוּז',en:'Tammuz',note:'29日；传统纪念塔穆兹月十七日的禁食。'},
    Av: {cn:'阿弗月',alias:'埃波月／阿布月',he:'אָב',en:'Av',note:'30日；传统纪念圣殿被毁的禁食日。'},
    Elul: {cn:'以禄月',alias:'以禄',he:'אֱלוּל',en:'Elul',note:'29日；民用新年前一个月。'}
  };
  const MONTHS=Object.fromEntries(Object.entries(DATA).map(([k,x])=>[k,[x.cn,x.he]]));
  const CANONICAL={Tishrei:'Tishri',Cheshvan:'Heshvan',Tammuz:'Tamuz','Adar 1':'Adar I','Adar 2':'Adar II'};
  const canonical = name => CANONICAL[name] || name;
  const starts=new Map(), monthCache=new Map();
  const leap=y=>((7*y+1)%19)<7;
  const isGregLeap=y=>y%4===0&&(y%100!==0||y%400===0);
  const gMonthLength=(y,m)=>[31,isGregLeap(y)?29:28,31,30,31,30,31,31,30,31,30,31][m-1]||0;
  function meanStart(year){
    const months=Math.floor((235*year-234)/19);
    let days=29*months+Math.floor((12084+13753*months)/25920);
    if((3*(days+1))%7<3)days++;
    return days;
  }
  function yearStart(year){
    if(!Number.isInteger(year)||year<1||year>12000)throw Error('希伯来年须为有效正整数');
    if(starts.has(year))return starts.get(year);
    const cur=meanStart(year),prev=meanStart(year-1),next=meanStart(year+1);
    const correction=next-cur===356?2:cur-prev===382?1:0;
    const rd=HEBREW_EPOCH+cur+correction;
    starts.set(year,rd);return rd;
  }
  function civilMonths(year){
    if(monthCache.has(year))return monthCache.get(year);
    const length=yearStart(year+1)-yearStart(year);
    const rows=[['Tishri',30],['Heshvan',length%10===5?30:29],['Kislev',length%10===3?29:30],['Tevet',29],['Shevat',30]];
    if(leap(year)) rows.push(['Adar I',30],['Adar II',29]);
    else rows.push(['Adar',29]);
    rows.push(['Nisan',30],['Iyar',29],['Sivan',30],['Tamuz',29],['Av',30],['Elul',29]);
    monthCache.set(year,rows);return rows;
  }
  function religiousMonths(year){const civil=civilMonths(year);return [...civil.slice(leap(year)?7:6),...civil.slice(0,leap(year)?7:6)];}
  function monthLength(year,month){const pair=civilMonths(year).find(([m])=>m===canonical(month));return pair?pair[1]:0;}
  function gToRD(year,month,day){
    if(!Number.isInteger(year)||year<1||year>9999||!Number.isInteger(month)||month<1||month>12||!Number.isInteger(day)||day<1||day>gMonthLength(year,month))throw Error('西历日期不存在');
    const prev=year-1;
    return 365*prev+Math.floor(prev/4)-Math.floor(prev/100)+Math.floor(prev/400)+Math.floor((367*month-362)/12)+(month<=2?0:isGregLeap(year)?-1:-2)+day;
  }
  function rdToG(rd){
    if(!Number.isInteger(rd)||rd<1||rd>3652059)throw Error('西历日期超出计算范围');
    let d0=rd-1,n400=Math.floor(d0/146097),d1=d0%146097,n100=Math.min(3,Math.floor(d1/36524)),d2=d1-n100*36524;
    let n4=Math.floor(d2/1461),d3=d2%1461,n1=Math.min(3,Math.floor(d3/365));
    const year=400*n400+100*n100+4*n4+n1+1;
    let n=rd-gToRD(year,1,1)+1,month=1;
    while(n>gMonthLength(year,month)){n-=gMonthLength(year,month);month++;}
    return {year,month,day:n};
  }
  const pad=n=>String(n).padStart(2,'0');
  const formatG=g=>String(g.year).padStart(4,'0')+'-'+pad(g.month)+'-'+pad(g.day);
  const rdISO=rd=>formatG(rdToG(rd));
  const parseDate=value=>{
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value)))throw Error('请输入完整公历日期，格式为四位年份-两位月份-两位日期');
    if(value<MIN||value>MAX)throw Error('目前支持公历1600—2400年；超出范围不推算');
    const [y,m,d]=value.split('-').map(Number);
    gToRD(y,m,d);
    return new Date(Date.UTC(y,m-1,d,12));
  };
  function hToRD(year,month,day){
    year=Number(year);day=Number(day);month=canonical(month);
    if(!Number.isInteger(year)||year<1||year>11999)throw Error('希伯来年份无效');
    if(!Number.isInteger(day)||day<1||day>monthLength(year,month))throw Error('该月份没有指定的日期，不能自动改为其他日期');
    let offset=0;
    for(const [name,length] of civilMonths(year)){
      if(name===month)return yearStart(year)+offset+day-1;
      offset+=length;
    }
    throw Error('指定的月份在该希伯来年不存在');
  }
  function rdToH(rd){
    let year=Math.floor((rd-HEBREW_EPOCH)/365.24682);
    year=Math.max(1,Math.min(11999,year));
    while(rd<yearStart(year))year--;
    while(rd>=yearStart(year+1))year++;
    let offset=rd-yearStart(year);
    for(const [month,length] of civilMonths(year)){
      if(offset<length){const day=offset+1;return {year,month,day,month_zh:DATA[month].cn,hebrew:day+' '+DATA[month].he+' '+year};}
      offset-=length;
    }
    throw Error('希伯来历换算失败');
  }
  function hebrew(value,evening=false){parseDate(value);const [y,m,d]=value.split('-').map(Number);return rdToH(gToRD(y,m,d)+(evening?1:0));}
  function reverse(year,month,day){const rd=hToRD(Number(year),canonical(month),Number(day));const g=rdISO(rd);return g>=MIN&&g<=MAX?g:null;}
  const weekday=rd=>rd%7; // 公元1年1月1日是星期一：星期日为0。
  const weekNames=['周日','周一','周二','周三','周四','周五','周六'];
  function week(value,evening=false){parseDate(value);const [y,m,d]=value.split('-').map(Number),rd=gToRD(y,m,d),rows=[];
    for(let i=-3;i<=3;i++){const x=rd+i,iso=rdISO(x);if(iso<MIN||iso>MAX)continue;const selectedEvening=Boolean(evening&&i===0);rows.push({date:iso,weekday:weekNames[weekday(x)],...rdToH(x+(selectedEvening?1:0)),selectedEvening});}
    return rows;
  }
  function nameH(h){return h.year+'年 '+DATA[h.month].cn+h.day+'日';}
  function kindLabel(k){return ({biblical:'律法节期',traditional:'后期传统',fast:'禁食纪念',month:'月朔'})[k]||k;}
  function holidayList(year,region='diaspora'){
    if(!Number.isInteger(year)||year<1||year>11999)throw Error('希伯来年无效');
    const isIsrael=region==='israel',events=[];
    const add=(month,day,title,kind,days=1,description='',dateBasis='fixed')=>{
      const start=hToRD(year,month,day);events.push({id:month+'-'+day+'-'+title,title,kind,days,start,end:start+days-1,description,dateBasis});
    };
    add('Tishri',1,'吹角日／犹太新年首日','biblical',1,'利未记23:24七月初一；首日属律法节期。');
    add('Tishri',2,'犹太新年次日','traditional',1,'两日犹太新年是现今犹太历传统，并非利未记另设的第二个吹角日。');
    add('Tishri',weekday(hToRD(year,'Tishri',3))===6?4:3,'基大利禁食日','fast',1,'若原定日期逢安息日则顺延。');
    add('Tishri',10,'赎罪日','biblical',1,'利未记16章、23章；宗教日从前一公历日日落起算。');
    add('Tishri',15,'住棚节','biblical',7,'七日节期；境内外的额外假日习俗可能不同。');
    add('Tishri',21,'和散那大日','traditional',1,'住棚节第七日的传统称谓。');
    add('Tishri',22,'严肃会','biblical',1,'利未记23:36；第八日严肃会；与后起的妥拉欢庆节分开标记。');
    add('Tishri',isIsrael?22:23,'妥拉欢庆节','traditional',1,isIsrael?'以色列境内与严肃会同日，但来源属于后期传统。':'以色列境外于提斯利月二十三日另行庆祝。');
    add('Kislev',25,'修殿节（八日）','traditional',8,'献殿纪念；横跨基斯流月与提别月，不能简单固定为提别月二日结束。');
    add('Tevet',10,'提别月十日禁食','fast',1,'传统纪念围城开始；通常从黎明至入夜。');
    add('Shevat',15,'树木新年','traditional',1,'犹太传统的树木新年。');
    const adar=leap(year)?'Adar II':'Adar';
    if(leap(year))add('Adar I',14,'小普珥节','traditional',1,'闰年的亚达一月十四日；不同于主要普珥节。');
    let esther=hToRD(year,adar,13);
    if(weekday(esther)===6) esther-=2; // 若十三日逢安息日，则提前至星期四。
    const estherH=rdToH(esther);
    add(estherH.month,estherH.day,'以斯帖禁食日','fast',1,'若十三日逢安息日，提前至星期四。');
    add(adar,14,'普珥节','traditional',1,'闰年主要普珥节在亚达二月。');
    add(adar,15,'书珊普珥节','traditional',1,'某些有城墙的城市遵守的普珥日期。');
    add('Nisan',14,'逾越节羊羔与预备日（十四日）','biblical',1,'出埃及记12:6及利未记23:5；十四日是逾越节礼仪日期，十五至二十一日另为七日无酵节。');
    add('Nisan',16,'初熟献摇祭（拉比传统定日）','biblical',1,'利未记23:10—16；初熟禾捆奉献的规定出于圣经，十六日的定日来自拉比对“安息日的次日”的解释；不可称为无争议的古代统一日期。','rabbinic');
    add('Nisan',15,'无酵节（七日）／现代逾越节节期','biblical',7,'利未记23:6规定十五日至二十一日七日无酵节；现代犹太节期通常将十五日起的庆祝统称逾越节。');
    if(!isIsrael)add('Nisan',22,'境外逾越节第八日','traditional',1,'现今以色列境外遵守额外一天；并非圣经另规定的第八个无酵节日。');
    add('Iyar',14,'补过逾越节','biblical',1,'民数记9:9—14；与主要逾越节不同。');
    add('Iyar',18,'数俄梅珥第33日','traditional',1,'传统纪念日；不是摩西律法另设的朝圣节。');
    add('Sivan',6,'七七节／五旬节','biblical',1,'利未记23:15—16规定从初熟禾捆开始数满五十日；西弯月六日是现代固定希伯来历依拉比传统计算的日期，不能说圣经直接指定每年都在六日。','rabbinic');
    if(!isIsrael)add('Sivan',7,'境外五旬节次日','traditional',1,'现今以色列境外增守一日，并非另一个圣经指定的七七节。');
    add('Tamuz',weekday(hToRD(year,'Tamuz',17))===6?18:17,'塔穆兹月十七日禁食','fast',1,'逢安息日通常顺延至十八日。');
    add('Av',weekday(hToRD(year,'Av',9))===6?10:9,'阿弗月九日禁食','fast',1,'传统纪念圣殿被毁；逢安息日顺延。');
    add('Av',15,'阿弗月十五日','traditional',1,'犹太传统的纪念日。');
    return events.sort((a,b)=>a.start-b.start||a.title.localeCompare(b.title,'zh'));
  }
  function roshChodesh(rd){
    const h=rdToH(rd);
    if(h.month==='Tishri' && h.day===1)return null; // 由犹太新年替代。
    if(h.day===1)return '月朔';
    if(h.day!==30)return null;
    const next=rdToH(rd+1);
    return next.day===1 && next.month!=='Tishri'?'月朔（两日制第一日）':null;
  }
  function eventsOn(rd,region='diaspora'){
    const h=rdToH(rd),annual=holidayList(h.year,region);
    // 希伯来年初之前的公历日期，年号由 rdToH 决定，所以本年节日覆盖完整。
    const events=annual.filter(e=>e.start<=rd&&rd<=e.end).map(e=>({...e,dayInFestival:rd-e.start+1}));
    const rc=roshChodesh(rd);
    if(rc)events.push({title:rc,kind:'month',start:rd,end:rd,days:1,dayInFestival:1,description:'现代固定希伯来历的月首纪念。'});
    return events;
  }

  // 城市参考日落：NOAA太阳赤纬／均时差公式；固定海平线、未校正当地地形、海拔和具体大气。
  // 日期比较仅在公历1900—2100年内开放；结果不作为点烛或礼仪时刻依据。
  const CITY_DATA=Object.freeze({
    shanghai:{name:'上海',lat:31.2304,lon:121.4737,tz:'Asia/Shanghai'},
    beijing:{name:'北京',lat:39.9042,lon:116.4074,tz:'Asia/Shanghai'},
    guangzhou:{name:'广州',lat:23.1291,lon:113.2644,tz:'Asia/Shanghai'},
    taipei:{name:'台北',lat:25.0330,lon:121.5654,tz:'Asia/Taipei'},
    hongkong:{name:'香港',lat:22.3193,lon:114.1694,tz:'Asia/Hong_Kong'},
    jerusalem:{name:'耶路撒冷',lat:31.7683,lon:35.2137,tz:'Asia/Jerusalem'},
    telaviv:{name:'特拉维夫',lat:32.0853,lon:34.7818,tz:'Asia/Jerusalem'},
    london:{name:'伦敦',lat:51.5074,lon:-0.1278,tz:'Europe/London'},
    newyork:{name:'纽约',lat:40.7128,lon:-74.0060,tz:'America/New_York'},
    losangeles:{name:'洛杉矶',lat:34.0522,lon:-118.2437,tz:'America/Los_Angeles'},
    tokyo:{name:'东京',lat:35.6762,lon:139.6503,tz:'Asia/Tokyo'},
    singapore:{name:'新加坡',lat:1.3521,lon:103.8198,tz:'Asia/Singapore'},
    sydney:{name:'悉尼',lat:-33.8688,lon:151.2093,tz:'Australia/Sydney'}
  });
  const deg=x=>x*Math.PI/180, rad=x=>x*180/Math.PI;
  function solarParams(jd){
    const t=(jd-2451545)/36525;
    const L=((280.46646+t*(36000.76983+0.0003032*t))%360+360)%360;
    const M=357.52911+t*(35999.05029-0.0001537*t);
    const e=0.016708634-t*(0.000042037+0.0000001267*t);
    const C=Math.sin(deg(M))*(1.914602-t*(0.004817+0.000014*t))
      +Math.sin(deg(2*M))*(0.019993-0.000101*t)+Math.sin(deg(3*M))*0.000289;
    const lambda=L+C-0.00569-0.00478*Math.sin(deg(125.04-1934.136*t));
    const obliq=23+(26+(21.448-t*(46.815+t*(0.00059-t*0.001813)))/60)/60
      +0.00256*Math.cos(deg(125.04-1934.136*t));
    const decl=Math.asin(Math.sin(deg(obliq))*Math.sin(deg(lambda)));
    const y=Math.tan(deg(obliq/2))**2;
    const E=4*rad(y*Math.sin(2*deg(L))-2*e*Math.sin(deg(M))
      +4*e*y*Math.sin(deg(M))*Math.cos(2*deg(L))
      -0.5*y*y*Math.sin(4*deg(L))-1.25*e*e*Math.sin(2*deg(M)));
    return {decl,eqMinutes:E};
  }
  function localClock(date,tz){
    const f=new Intl.DateTimeFormat('en-GB',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
    const o=Object.fromEntries(f.formatToParts(date).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
    return {date:o.year+'-'+o.month+'-'+o.day,time:o.hour+':'+o.minute};
  }
  function sunsetForCity(iso,cityKey){
    parseDate(iso);
    if(iso<'1900-01-01'||iso>'2100-12-31')throw Error('城市参考日落只开放1900—2100年；其他年份继续使用手动日落确认。');
    const city=CITY_DATA[cityKey];if(!city)throw Error('请选择受支持的城市。');
    const [Y,M,D]=iso.split('-').map(Number);
    const utcMidnight=Date.UTC(Y,M-1,D),jd=utcMidnight/86400000+2440587.5;
    let minutes=720-4*city.lon;
    for(let i=0;i<3;i++){
      const p=solarParams(jd+minutes/1440);
      const cosH=(Math.cos(deg(90.833))/(Math.cos(deg(city.lat))*Math.cos(p.decl)))
        -Math.tan(deg(city.lat))*Math.tan(p.decl);
      if(cosH>1||cosH< -1)return {city:city.name,tz:city.tz,date:iso,time:null,status:'no-sunset',reason:'该日没有通常意义上的日落；不能自动判断宗教日期。'};
      minutes=720-4*(city.lon-rad(Math.acos(cosH)))-p.eqMinutes;
    }
    const instant=new Date(utcMidnight+minutes*60000),clock=localClock(instant,city.tz);
    if(clock.date!==iso)return {city:city.name,tz:city.tz,date:iso,time:null,status:'zone-mismatch',reason:'城市当地日期与计算日期不一致，请人工确认。'};
    return {city:city.name,tz:city.tz,date:iso,time:clock.time,status:'estimated',utc:instant.toISOString(),latitude:city.lat,longitude:city.lon};
  }

  const API={hebrew,reverse,parseDate,CITY_DATA,sunsetForCity,MONTHS,canonical,week,leap,yearStart,civilMonths,religiousMonths,monthLength,gToRD,rdToG,rdISO,hToRD,rdToH,holidayList,eventsOn,roshChodesh,weekNames,DATA,MIN,MAX};
  root.HebrewCalendar=API;
  if(typeof module==='object'&&module.exports)module.exports=API;

  if(typeof document==='undefined'||!document.getElementById('calendar-form'))return;
  const $=id=>document.getElementById(id);
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const state={
    year:5787,month:'Kislev',gYear:2026,gMonth:11,view:'hebrew',order:'religious',region:'diaspora',
    selectedISO:'2026-11-23',afterSunset:false,holidayType:'all',zone:'Asia/Shanghai'
  };
  function selectMonth(year,month){state.year=year;state.month=month;}
  const minRD=gToRD(...MIN.split('-').map(Number)),maxRD=gToRD(...MAX.split('-').map(Number));
  function monthAllowed(year,month){const start=hToRD(year,month,1);return start<=maxRD&&start+monthLength(year,month)-1>=minRD;}
  function syncURL(push=false){
    const p=new URLSearchParams({date:state.selectedISO,zone:state.zone,region:state.region,view:state.view,order:state.order,hy:state.year,hm:state.month,gy:state.gYear,gm:state.gMonth});
    if(state.afterSunset)p.set('evening','1');
    if(state.holidayType!=='all')p.set('kind',state.holidayType);
    try{const next=location.pathname+'?'+p.toString();if(next!==location.pathname+location.search)history[push?'pushState':'replaceState'](null,'',next);}catch{/* 日期换算不依赖浏览器是否允许更新网址。 */}
  }
  function syncSelected(g){
    state.selectedISO=g;
    const h=hebrew(g,state.afterSunset);state.year=h.year;state.month=h.month;
    const [y,m]=g.split('-').map(Number);state.gYear=y;state.gMonth=m;
  }
  function selectedRD(){const [y,m,d]=state.selectedISO.split('-').map(Number);return gToRD(y,m,d)+(state.afterSunset?1:0);}
  function updateZone(){state.zone=$('calendar-zone').value;}
  function getTodayISO(){
    const f=new Intl.DateTimeFormat('en-US',{timeZone:state.zone,year:'numeric',month:'2-digit',day:'2-digit'});
    const v=Object.fromEntries(f.formatToParts(new Date()).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
    return v.year+'-'+v.month+'-'+v.day;
  }

  function updateSunsetContext(resetConfirmation=false){
    const city=CITY_DATA[$('calendar-sunset-city').value];
    const todayZone=$('calendar-zone').value;
    const warning=$('calendar-sunset-zone-warning');
    const box=$('calendar-location-confirm');
    if(resetConfirmation&&box)box.checked=false;
    if(!warning||!city)return;
    if(city.tz===todayZone){
      warning.textContent=`所选城市与“今天”的时区一致（${city.tz}）。输入的日期和时间仍须是该城市当地的。`;
    }else{
      warning.textContent=`注意：“今天”按 ${todayZone} 获取，但${city.name}日落按 ${city.tz} 计算。两处时区不同；请核对公历日期确属${city.name}当地，再明确勾选确认。`;
    }
  }
  function updateSunsetPreview(){
    updateSunsetContext();
    const out=$('calendar-sunset-result');if(!out)return;
    try{
      const r=sunsetForCity($('gregorian-date').value,$('calendar-sunset-city').value);
      if(r.status!=='estimated') {out.textContent='无法估算：'+r.reason;return;}
      out.textContent=`${r.city} · 公历${r.date} · 参考日落约 ${r.time}（${r.tz}当地时间；海平线估算，可能受地形及大气影响）。`;
    }catch(e){out.textContent='未提供估算：'+e.message;}
  }
  function applySunsetBoundary(){
    const out=$('calendar-sunset-result');
    try{
      const r=sunsetForCity($('gregorian-date').value,$('calendar-sunset-city').value);
      if(r.status!=='estimated')throw Error(r.reason);
      if(!$('calendar-location-confirm').checked)throw Error('未更改日期：请先确认公历日期及钟点都是所选城市的当地民用时间，不是其他城市或设备时区。');
      const val=$('calendar-local-time').value;
      if(!/^\d{2}:\d{2}$/.test(val)||Number(val.slice(0,2))>23||Number(val.slice(3))>59)throw Error('请输入有效的所选城市当地时间（时:分）。');
      const valueMin=Number(val.slice(0,2))*60+Number(val.slice(3));
      const sunMin=Number(r.time.slice(0,2))*60+Number(r.time.slice(3));
      const gap=valueMin-sunMin;
      if(Math.abs(gap)<=5){
        out.textContent=`参考日落约 ${r.time}；您输入的 ${val} 距日落不超过5分钟，模型误差可能改变结果。未更改日期，请自行根据当地实况确认。`;
        return;
      }
      $('after-sunset').checked=gap>0;
      renderByDate();
      out.textContent=`${r.city}：${r.date} 参考日落约 ${r.time}，输入当地 ${val}，相差${Math.abs(gap)}分钟。已按参考值切换为${gap>0?'日落后':'日落前'}；仅作民用日期对照，不用于精确礼仪或点烛计算。`;
    }catch(e){out.textContent='未能自动判断：'+e.message;}
  }

  function eventBadge(e,short=false){return `<span class="hc-badge hc-${esc(e.kind)}">${esc(short&&e.days>1?e.title.replace(/（.*?）/g,''):e.title)}</span>`;}
  function renderResult(){
    const out=$('calendar-result');
    try{
      const h=hebrew(state.selectedISO,state.afterSunset),rd=selectedRD(),events=eventsOn(rd,state.region);
      out.innerHTML=`<div class="hc-result-main"><div><span class="hc-small">公历 ${esc(state.selectedISO)} ${esc(weekNames[weekday(gToRD(...state.selectedISO.split('-').map(Number)))])}</span><div class="hc-result-date">希伯来历 ${esc(h.year)}年 · ${esc(DATA[h.month].cn)} ${h.day}日</div><span class="hc-rtl" lang="he" dir="rtl">${esc(h.day+' '+DATA[h.month].he+' '+h.year)}</span></div><div class="hc-result-info"><span>${leap(h.year)?'闰年 · 13个月':'平年 · 12个月'}</span><span>${state.afterSunset?'已勾选当地日落后：日期加一':'按公历白天日期换算'}</span></div></div>
      <div class="hc-result-events" aria-label="所选日期节期">${events.length?events.map(e=>eventBadge(e)).join(''):'<span class="hc-muted">所选日期没有列入本工具的主要节期。</span>'}</div>`;
      const rows=week(state.selectedISO,state.afterSunset);
      $('calendar-week').innerHTML=rows.map(x=>`<tr><td>${esc(x.date)}</td><td>${esc(x.weekday)}</td><td>${esc(nameH(x))}${x.selectedEvening?' <strong class="hc-evening-mark">（选定日·日落后）</strong>':''}</td></tr>`).join('');
    }catch(e){out.textContent=e.message;$('calendar-week').replaceChildren();}
  }
  function monthSequence(){return state.order==='religious'?religiousMonths(state.year):civilMonths(state.year);}
  function renderMonthPicker(){
    const rows=monthSequence();
    $('calendar-month-choice').innerHTML=rows.map(([m,len],idx)=>`<option value="${esc(m)}" ${m===state.month?'selected':''} ${monthAllowed(state.year,m)?'':'disabled'}>${idx+1}. ${esc(DATA[m].cn)}（${len}日）${monthAllowed(state.year,m)?'':' · 超出范围'}</option>`).join('');
    $('calendar-year-choice').value=state.year;
    $('calendar-year-label').textContent=`${state.year}年 · ${leap(state.year)?'闰年13个月':'平年12个月'} · 全年${yearStart(state.year+1)-yearStart(state.year)}日`;
  }
  function renderMonthCards(){
    const rows=monthSequence();
    $('calendar-months').innerHTML=rows.map(([name,len],idx)=>{
      const d=DATA[name],rd=hToRD(state.year,name,1),end=rd+len-1;
      return `<button class="hc-month-card ${state.month===name?'hc-active':''}" data-hc-select-month="${esc(name)}" type="button" ${monthAllowed(state.year,name)?'':'disabled'} aria-pressed="${state.month===name}"><span class="hc-month-label">${idx+1} · ${esc(d.cn)}</span><span class="hc-month-he" lang="he" dir="rtl">${esc(d.he)}</span><span class="hc-month-sub">${len}日 · ${esc(rdISO(rd))} 至 ${esc(rdISO(end))}</span><span class="hc-month-alias">${monthAllowed(state.year,name)?'又译：'+esc(d.alias):'超出支持日期范围'}</span></button>`;
    }).join('');
    const p=DATA[state.month];$('calendar-month-description').textContent=p.cn+' · '+p.en+' · '+p.alias+'。'+p.note;
  }
  function displayMonthStart(){
    if(state.view==='hebrew'){const start=hToRD(state.year,state.month,1),length=monthLength(state.year,state.month);return {start,length,title:`${state.year}年 · ${DATA[state.month].cn}`,sub:`${DATA[state.month].he} · ${DATA[state.month].en} · ${length}日`};}
    const start=gToRD(state.gYear,state.gMonth,1),length=gMonthLength(state.gYear,state.gMonth);
    return {start,length,title:`公历${state.gYear}年${state.gMonth}月`,sub:'格里高利历 · 每格下方显示相应的希伯来日'};
  }
  function dayCell(rd,isCurrent){
    const g=rdISO(rd),h=rdToH(rd),ev=eventsOn(rd,state.region),primary=ev.slice(0,2).map(x=>eventBadge(x,true)).join('');
    const isSelected=rd===(state.view==='gregorian'?gToRD(...state.selectedISO.split('-').map(Number)):selectedRD()),today=g===getTodayISO(),valid=g>=MIN&&g<=MAX;
    const label=`公历${g}；希伯来历${nameH(h)}${ev.length?'；节期'+ev.map(x=>x.title).join('、'):''}`;
    const first=state.view==='hebrew'?h.day:Number(g.slice(8,10)),second=state.view==='hebrew'?g.slice(5):DATA[h.month].cn+h.day+'日';
    return `<button type="button" data-hc-day="${esc(g)}" class="hc-day ${isCurrent?'':'hc-outside'} ${isSelected?'hc-selected':''} ${today?'hc-today':''}" ${valid?'':'disabled'} aria-label="${esc(label)}" aria-pressed="${isSelected}"><span class="hc-day-num">${first}</span><span class="hc-day-other">${esc(second)}</span>${ev.length?`<span class="hc-day-event-count" aria-hidden="true">${ev.length}项</span>`:''}${primary?`<span class="hc-day-events">${primary}${ev.length>2?`<span class="hc-badge hc-more">另${ev.length-2}项</span>`:''}</span>`:''}</button>`;
  }
  function renderGrid(){
    const info=displayMonthStart();
    $('calendar-grid-title').textContent=info.title;
    $('calendar-grid-subtitle').textContent=info.sub;
    const leading=weekday(info.start),total=Math.ceil((leading+info.length)/7)*7;
    let str='';for(let i=0;i<total;i++)str+=dayCell(info.start-leading+i,i>=leading&&i<leading+info.length);
    $('calendar-day-grid').innerHTML=str;
    const selected=hebrew(state.selectedISO,state.afterSunset),events=eventsOn(selectedRD(),state.region),detail=$('calendar-selected-detail');
    if(detail)detail.innerHTML=`<strong>所选日期：${esc(state.selectedISO)} · ${esc(nameH(selected))}${state.afterSunset?'（日落后）':''}</strong><p>${events.length?events.map(e=>esc(e.title)+(e.days>1?' · 第'+e.dayInFestival+'日':'')).join('；'):'本工具没有列入这一天的主要节期。'}</p><button type="button" class="hc-subaction" data-hc-details>查看上方换算详情</button>`;
    $('calendar-grid-prev').disabled=!monthTarget(-1);
    $('calendar-grid-next').disabled=!monthTarget(1);
    document.querySelectorAll('[data-hc-view]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.hcView===state.view)));
  }
  function renderHolidayList(){
    const events=holidayList(state.year,state.region).filter(e=>state.holidayType==='all'||e.kind===state.holidayType);
    $('calendar-holidays').innerHTML=events.map(e=>{
      const start=rdISO(e.start),end=rdISO(e.end),h=rdToH(e.start);
      const available=e.end>=minRD&&e.start<=maxRD,jump=rdISO(Math.max(minRD,e.start));
      return `<button type="button" class="hc-holiday-row" data-hc-jump="${esc(jump)}" ${available?'':'disabled'}><span class="hc-holiday-date">${esc(start)}${e.days>1?' — '+esc(end):''}${available?'':' · 超出范围'}</span><span class="hc-holiday-body"><strong>${esc(e.title)}</strong><small>${esc(h.day+' '+DATA[h.month].cn)} · ${esc(kindLabel(e.kind)+(e.dateBasis==='rabbinic'?'·日期按拉比传统':'') )}</small><span class="hc-holiday-detail">${esc(e.description)}</span></span><span class="hc-holiday-arrow" aria-hidden="true">查看</span></button>`;
    }).join('');
    $('calendar-holiday-count').textContent=`${events.length}项 · ${state.region==='israel'?'以色列惯例':'境外惯例'}`;
  }
  let reversePickerYear=null;
  function renderReverseMonthPicker(){
    const y=Number($('hebrew-year').value),safe=(Number.isInteger(y)&&y>=5000&&y<=6300)?y:state.year;
    const entries=state.order==='religious'?religiousMonths(safe):civilMonths(safe);
    let current=$('hebrew-month').value;
    if(!entries.some(([m])=>m===current)){
      if(current==='Adar')current='Adar II';
      else if(current==='Adar I'||current==='Adar II')current='Adar';
    }
    $('hebrew-month').innerHTML=entries.map(([m,len])=>`<option value="${esc(m)}" ${m===current?'selected':''}>${esc(DATA[m].cn)} · ${len}日</option>`).join('');
    reversePickerYear=safe;
  }
  function syncReverseYear(){
    const y=Number($('hebrew-year').value);
    if(!Number.isInteger(y)||y<5360||y>6161)return false;
    if(y!==reversePickerYear){renderReverseMonthPicker();$('reverse-result').textContent='';}
    return true;
  }
  function refreshAll(push=true){
    renderResult();renderMonthPicker();renderGrid();renderMonthCards();renderHolidayList();
    $('calendar-region').value=state.region;
    $('calendar-order').value=state.order;
    $('calendar-festival-filter').value=state.holidayType;
    syncURL(push);
  }
  function monthTarget(step){
    if(state.view==='gregorian'){
      const d=new Date(Date.UTC(state.gYear,state.gMonth-1+step,1,12));
      const y=d.getUTCFullYear(),m=d.getUTCMonth()+1;
      if(y<1600||y>2400)return null;
      const mid=rdToH(gToRD(y,m,1));return {gYear:y,gMonth:m,year:mid.year,month:mid.month};
    }else{
      const rows=civilMonths(state.year).map(([m])=>m);let i=rows.indexOf(state.month)+step,y=state.year;
      if(i<0){y--;if(y<1)return null;i=civilMonths(y).length-1;}
      if(i>=rows.length){y++;i=0;}
      const month=civilMonths(y)[i][0];if(!monthAllowed(y,month))return null;
      const g=rdToG(Math.max(minRD,hToRD(y,month,1)));return {year:y,month,gYear:g.year,gMonth:g.month};
    }
  }
  function goByMonth(step){
    const target=monthTarget(step);if(!target)return;Object.assign(state,target);refreshAll();
  }
  function renderByDate(push=true){
    try{const g=$('gregorian-date').value;parseDate(g);$('gregorian-date').removeAttribute('aria-invalid');state.afterSunset=$('after-sunset').checked;syncSelected(g);refreshAll(push);return true;
    }catch(e){$('gregorian-date').setAttribute('aria-invalid','true');$('after-sunset').checked=state.afterSunset;$('calendar-result').textContent='未换算：'+e.message+'。下方月历与所选日期仍保留上次已确认的 '+state.selectedISO+'，尚未采用本次输入。';$('calendar-week').replaceChildren();return false;}
  }
  $('calendar-form').addEventListener('submit',e=>{e.preventDefault();renderByDate();});
  $('calendar-today').addEventListener('click',()=>{updateZone();try{$('gregorian-date').value=getTodayISO();updateSunsetContext(true);renderByDate();updateSunsetPreview();}catch(e){$('calendar-result').textContent=e.message;}});
  $('after-sunset').addEventListener('change',renderByDate);
  $('calendar-sunset-city').addEventListener('change',()=>{updateSunsetContext(true);updateSunsetPreview();});
  $('calendar-sunset-apply').addEventListener('click',applySunsetBoundary);
  $('gregorian-date').addEventListener('change',()=>{updateSunsetContext(true);updateSunsetPreview();});
  $('calendar-zone').addEventListener('change',()=>{updateZone();updateSunsetContext(true);refreshAll();});
  $('calendar-region').addEventListener('change',()=>{state.region=$('calendar-region').value;refreshAll();});
  $('calendar-order').addEventListener('change',()=>{state.order=$('calendar-order').value;refreshAll();renderReverseMonthPicker();});
  $('calendar-festival-filter').addEventListener('change',()=>{state.holidayType=$('calendar-festival-filter').value;renderHolidayList();syncURL(true);});
  function chooseBrowseMonth(year,month){
    const allowed=civilMonths(year).filter(([m])=>monthAllowed(year,m)).map(([m])=>m);
    if(!allowed.length)return;
    const chosen=allowed.includes(month)?month:allowed[0];
    state.year=year;state.month=chosen;state.view='hebrew';
    const g=rdToG(Math.max(minRD,hToRD(year,chosen,1)));state.gYear=g.year;state.gMonth=g.month;
    $('calendar-navigation-status').textContent='';refreshAll();
  }
  $('calendar-year-choice').addEventListener('change',()=>{
    const y=Number($('calendar-year-choice').value);if(y<5360||y>6161||!Number.isInteger(y)){$('calendar-navigation-status').textContent='年份未更改：请输入5360—6161之间的完整希伯来年份。';$('calendar-year-choice').value=state.year;return;}
    const current=civilMonths(y).some(([m])=>m===state.month)?state.month:(state.month==='Adar'?'Adar II':'Adar');
    chooseBrowseMonth(y,current);
  });
  $('calendar-month-choice').addEventListener('change',()=>chooseBrowseMonth(state.year,$('calendar-month-choice').value));
  $('calendar-grid-selected')?.addEventListener('click',()=>{syncSelected(state.selectedISO);refreshAll();});
  $('calendar-grid-prev').addEventListener('click',()=>goByMonth(-1));
  $('calendar-grid-next').addEventListener('click',()=>goByMonth(1));
  document.addEventListener('click',e=>{
    const button=e.target.closest('button');if(!button)return;
    if(button.dataset.hcView){state.view=button.dataset.hcView;refreshAll();}
    if(button.dataset.hcSelectMonth){chooseBrowseMonth(state.year,button.dataset.hcSelectMonth);$('calendar-grid-title').focus({preventScroll:true});$('calendar-grid-title').scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});}
    if(button.dataset.hcDay){const day=button.dataset.hcDay;$('gregorian-date').value=day;$('after-sunset').checked=false;updateSunsetContext(true);renderByDate();updateSunsetPreview();document.querySelector('[data-hc-day="'+day+'"]')?.focus({preventScroll:true});}
    if(button.dataset.hcJump){$('gregorian-date').value=button.dataset.hcJump;$('after-sunset').checked=false;state.view='hebrew';updateSunsetContext(true);renderByDate();updateSunsetPreview();$('calendar-result').focus({preventScroll:true});$('calendar-result').scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});}
    if(button.dataset.hcDetails!==undefined){$('calendar-result').focus({preventScroll:true});$('calendar-result').scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});}
  });
  for(const event of ['input','change','blur'])$('hebrew-year').addEventListener(event,syncReverseYear);
  $('reverse-calendar').addEventListener('submit',e=>{
    e.preventDefault();syncReverseYear();const result=$('reverse-result');try{
      const y=Number($('hebrew-year').value),m=$('hebrew-month').value,d=Number($('hebrew-day').value),g=reverse(y,m,d);
      if(!g)throw Error('此日期在公历1600—2400年的可计算范围之外');
      const start=rdISO(hToRD(y,m,d)-1);
      result.textContent=`希伯来历${y}年${DATA[m].cn}${d}日：公历${g}（白天日期）。该宗教日通常由${start}当地日落开始，实际日落时刻取决于具体地理位置。`;
    }catch(error){result.textContent='不能换算：'+error.message;}
  });
  function restoreCalendarURL(){
    const q=new URLSearchParams(location.search);
    if([...$('calendar-zone').options].some(x=>x.value===q.get('zone')))$('calendar-zone').value=q.get('zone');
    updateZone();
    state.region=['israel','diaspora'].includes(q.get('region'))?q.get('region'):'diaspora';
    state.view=q.get('view')==='gregorian'?'gregorian':'hebrew';
    state.order=q.get('order')==='civil'?'civil':'religious';
    state.holidayType=['biblical','traditional','fast'].includes(q.get('kind'))?q.get('kind'):'all';
    state.afterSunset=q.get('evening')==='1';$('after-sunset').checked=state.afterSunset;
    let date=q.get('date')||getTodayISO();
    try{parseDate(date);$('calendar-navigation-status').textContent='';}catch{date=getTodayISO();$('calendar-navigation-status').textContent='链接中的日期无效，已显示今天；请重新选择日期。';}
    $('gregorian-date').value=date;$('gregorian-date').removeAttribute('aria-invalid');syncSelected(date);
    const hy=Number(q.get('hy')),hm=q.get('hm');
    if(Number.isInteger(hy)&&hy>=5360&&hy<=6161&&civilMonths(hy).some(([m])=>m===hm)&&monthAllowed(hy,hm)){state.year=hy;state.month=hm;}
    const gy=Number(q.get('gy')),gm=Number(q.get('gm'));
    if(Number.isInteger(gy)&&gy>=1600&&gy<=2400&&Number.isInteger(gm)&&gm>=1&&gm<=12){state.gYear=gy;state.gMonth=gm;}
    const h=hebrew(date,state.afterSunset);$('hebrew-year').value=h.year;renderReverseMonthPicker();$('hebrew-month').value=h.month;$('hebrew-day').value=h.day;
    refreshAll(false);updateSunsetContext(true);updateSunsetPreview();
  }
  window.addEventListener('popstate',restoreCalendarURL);
  restoreCalendarURL();
})(typeof window!=='undefined'?window:globalThis);
