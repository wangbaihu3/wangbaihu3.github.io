/* 真实声音目录与小雨优先规则。只匹配浏览器实际报告的声音，不伪造云端发音人。 */
(function(root){'use strict';
const DEFAULT={name:'HsiaoYu',locale:'zh-TW',voiceId:'zh-TW-HsiaoYuNeural',preferredProvider:'edge-online'};
const KEY='messiah-tts-voice-preference-v2';
const voiceKey=v=>JSON.stringify([v.voiceURI||'',v.lang||'',v.name||'',v.localService===true]);
const classify=v=>{let s=(String(v?.name||'')+' '+String(v?.voiceURI||'')).toLowerCase();
  return /microsoft|\bedge\b|hsiaoyu|azure/.test(s)?'microsoft':/google/.test(s)?'google':'other';};
const target=v=>!!v && /^zh[-_]tw$/i.test(String(v.lang||'').replace('_','-')) &&
  /hsiaoyu/i.test(String(v.name||'')+' '+String(v.voiceURI||'')) &&
  (v.localService===false || /neural|online|edge|microsoft/i.test(String(v.voiceURI||'')+' '+String(v.name||'')));
const groupRank=v=>/^zh[-_]tw/i.test(v.lang||'')?0:/^zh[-_]cn/i.test(v.lang||'')?1:/^zh[-_]hk|^zh[-_]yue/i.test(v.lang||'')?2:/^zh/i.test(v.lang||'')?3:/^en/i.test(v.lang||'')?4:5;
const sorted=voices=>[...voices].sort((a,b)=>groupRank(a)-groupRank(b)||Number(target(b))-Number(target(a))||String(a.name).localeCompare(String(b.name),'zh'));
function stored(){try{const v=JSON.parse(root.localStorage?.getItem(KEY)||'null');return v?.mode==='manual'&&typeof v.key==='string'?v:null;}catch{return null;}}
function save(voice){try{if(voice)root.localStorage?.setItem(KEY,JSON.stringify({mode:'manual',key:voiceKey(voice),saved:Date.now()}));}catch{}}
function reset(){try{root.localStorage?.removeItem(KEY);}catch{}}
function choose(voices,allowRemote=false,filter='all'){
 const list=voices.filter(v=>filter==='all'||classify(v)===filter);
 const pref=stored(), chosen=pref?list.find(v=>voiceKey(v)===pref.key):list.find(target);
 if(!chosen)return {voice:null,reason:pref?'所保存的发音人不在当前实际声音列表中；不会自行更换。':'默认小雨（HsiaoYu）不在当前浏览器的实际声音列表中；请检查 Edge 在线声音或配置合法的云端服务。'};
 if(chosen.localService!==true&&!allowRemote)return {voice:null,desired:chosen,reason:'已找到所选在线发音人；请先允许将文字交给在线语音服务。'};
 return {voice:chosen,reason:''};
}
const api={DEFAULT,voiceKey,classify,target,groupRank,sorted,choose,stored,save,reset};
root.SpeechVoicePolicy=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
