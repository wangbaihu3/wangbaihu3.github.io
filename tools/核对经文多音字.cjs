'use strict';const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');const rules=require('../assets/pronunciation-rules.js');
const meta=JSON.parse(fs.readFileSync(path.join(root,'data/bible/meta.json'),'utf8'));
const words=new Map(),examples=[],missing=new Map();let verses=0,allChars=0,matchedVerses=0;
const common=new Set('行长重乐藏恶背转看称给曾种将干中解露率会差省冠强仆舍难空载应教朝得着了觉数冲散结'.split(''));
for(let id=1;id<=66;id++){
 const doc=JSON.parse(fs.readFileSync(path.join(root,'data/bible/books',id+'.json'),'utf8'));
 for(const ch of doc.chapters){for(const para of ch.paragraphs||[]){if(para.style!=='Verse')continue;
  const text=(para.runs||[]).filter(r=>r.text&&!r.vertical&&!r.note).map(r=>r.text).join('');
  if(!text.trim())continue;verses++;allChars+=text.length;
  const got=rules.matches(text);if(got.length)matchedVerses++;
  for(const hit of got){words.set(hit.word,(words.get(hit.word)||0)+1);if(examples.length<60)examples.push({book:doc.name,chapter:ch.number,context:text.slice(Math.max(0,hit.start-7),hit.end+7),word:hit.word,pinyin:hit.pinyin});}
  for(const c of text){if(common.has(c))missing.set(c,(missing.get(c)||0)+1);}
 }}
}
const result={schema:'bible-tts-pronunciation-review-v1',source_bible:meta.version.source_sha256,source_revision:meta.version.source_revision,
 analyzed_verse_paragraphs:verses,characters_scanned:allChars,rule_count:Object.keys(rules.rules).length,
 verses_with_dictionary_hits:matchedVerses,matched_word_occurrences:[...words.values()].reduce((a,b)=>a+b,0),
 frequent_dictionary_words:[...words.entries()].sort((a,b)=>b[1]-a[1]).slice(0,100).map(([word,count])=>({word,pinyin:rules.rules[word],count})),
 high_frequency_polyphone_characters_to_review:[...missing.entries()].sort((a,b)=>b[1]-a[1]).slice(0,40).map(([character,count])=>({character,count})),
 examples,notes:['规则是词组匹配的审核候选，不保证每次遇到单字都完全消歧。','未取得和合本全本源数据，未宣称已完成两译本逐词联合核对。','普通浏览器 Web Speech API 不支持词语级拼音强制指定；Google Cloud 等确实支持音素标签的服务可在受授权后使用规则。','语音源文和呈现正文不修改。']};
fs.writeFileSync(path.join(root,'data/bible/pronunciation-review.json'),JSON.stringify(result));
console.log('经文多音字规则核对',JSON.stringify({verses,allChars,rules:result.rule_count,matchedVerses,hits:result.matched_word_occurrences}));
