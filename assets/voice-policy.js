/* 真实浏览器声音：优先小雨；缺席时显示实际中文备选，不制造虚假的在线发音人。 */
(function(root){'use strict';
const DEFAULT={name:'HsiaoYu',locale:'zh-TW',voiceId:'zh-TW-HsiaoYuNeural',preferredProvider:'edge-online'};
const KEY='messiah-tts-voice-preference-v3';
const voiceKey=v=>JSON.stringify([v.voiceURI||'',v.lang||'',v.name||'',v.localService===true]);
const classify=v=>{const s=(String(v?.name||'')+' '+String(v?.voiceURI||'')).toLowerCase();
 return /microsoft|\bedge\b|hsiaoyu|azure/.test(s)?'microsoft':/google/.test(s)?'google':'other';};
const target=v=>!!v&&/^zh[-_]tw$/i.test(String(v.lang||'').replace('_','-'))&&/hsiaoyu/i.test(String(v.name||'')+' '+String(v.voiceURI||''));
const chinese=v=>/^zh(?:[-_]|$)/i.test(String(v.lang||''));
const groupRank=v=>/^zh[-_]tw/i.test(v.lang||'')?0:/^zh[-_]cn/i.test(v.lang||'')?1:/^zh[-_]hk|^zh[-_]yue/i.test(v.lang||'')?2:/^zh/i.test(v.lang||'')?3:/^en/i.test(v.lang||'')?4:5;
const sorted=voices=>[...voices].sort((a,b)=>groupRank(a)-groupRank(b)||Number(target(b))-Number(target(a))||String(a.name).localeCompare(String(b.name),'zh'));
function stored(){try{const v=JSON.parse(root.localStorage?.getItem(KEY)||'null');return v?.mode==='manual'&&typeof v.key==='string'?v:null;}catch{return null;}}
function save(voice){try{if(voice)root.localStorage?.setItem(KEY,JSON.stringify({mode:'manual',key:voiceKey(voice),saved:Date.now()}));}catch{}}
function reset(){try{root.localStorage?.removeItem(KEY);}catch{}}
// Prefer actual HsiaoYu; otherwise nearby Chinese Mandarin voices from the actual browser list.
// Sorting is NOT a quality judgment: it is a deterministic fallback matching language and the requested vendor.
function fallbackRank(v){const s=classify(v),l=String(v.lang||'').toLowerCase();
 const locale=l.startsWith('zh-tw')?0:l.startsWith('zh-cn')?4:l.startsWith('zh-hk')?8:12;
 const vendor=s==='microsoft'?0:s==='google'?1:2;
 return locale+vendor+(v.localService===true?0.05:0);
}
function choose(voices,allowRemote=false,filter='all'){
 const list=voices.filter(v=>(filter==='all'||classify(v)===filter));
 const permitted=list.filter(v=>v.localService===true||allowRemote);
 const pref=stored();
 const explicit=pref?list.find(v=>voiceKey(v)===pref.key):null;
 const preferred=explicit || (!pref?list.find(target):null);
 if(preferred && (preferred.localService===true||allowRemote))return {voice:preferred,fallback:false,reason:target(preferred)?'微软小雨已在本浏览器声音列表中，已选中。':'已恢复你手动选择的声音：'+preferred.name+'。'};
 const alternatives=permitted.filter(chinese).sort((a,b)=>fallbackRank(a)-fallbackRank(b)||String(a.name).localeCompare(String(b.name),'zh'));
 const fallback=alternatives[0]||null;
 if(fallback){const first=pref?'先前手选的发音人当前不可用':preferred?'所选在线声音尚未获得联网许可':'浏览器当前未提供微软小雨 HsiaoYu';
  return {voice:fallback,fallback:true,reason:first+'；为避免“有声音却无法朗读”，现选用实际可用的“'+fallback.name+'”（'+fallback.lang+'）。这不是小雨，可随时改选。'};}
 if(preferred)return {voice:null,desired:preferred,reason:'已找到指定声音，但没有获得联网许可，且没有本机中文声音。'};
 return {voice:null,reason:'本浏览器当前未返回可播放的中文声音；请刷新声音列表或安装中文语音。'};
}
const api={DEFAULT,voiceKey,classify,target,chinese,groupRank,sorted,choose,stored,save,reset};
root.SpeechVoicePolicy=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
