/* 读音纠错辅助词典 v1：只标注词组读音，不改正文；浏览器 SpeechSynthesis 不保证接纳音素指令。 */
(function(root){'use strict';
const raw={
'长子':'zhǎng zǐ','长女':'zhǎng nǚ','长老':'zhǎng lǎo','长大':'zhǎng dà','成长':'chéng zhǎng','长度':'cháng dù','长久':'cháng jiǔ','长袍':'cháng páo','长远':'cháng yuǎn','长年':'cháng nián','长兄':'zhǎng xiōng',
'行动':'xíng dòng','行走':'xíng zǒu','行为':'xíng wéi','遵行':'zūn xíng','行善':'xíng shàn','同行':'tóng xíng','行列':'háng liè','银行':'yín háng','行家':'háng jia','一行':'yì háng','行事':'xíng shì',
'数算':'shǔ suàn','数点':'shǔ diǎn','数目':'shù mù','数字':'shù zì','算数':'suàn shù','数不清':'shǔ bù qīng','数不胜数':'shǔ bù shèng shǔ',
'重新':'chóng xīn','重生':'chóng shēng','重来':'chóng lái','重复':'chóng fù','重建':'chóng jiàn','重担':'zhòng dàn','重要':'zhòng yào','沉重':'chén zhòng','尊重':'zūn zhòng','重视':'zhòng shì','重罪':'zhòng zuì',
'音乐':'yīn yuè','乐器':'yuè qì','乐曲':'yuè qǔ','喜乐':'xǐ lè','欢乐':'huān lè','快乐':'kuài lè','乐意':'lè yì','乐园':'lè yuán',
'看守':'kān shǒu','看护':'kān hù','看管':'kān guǎn','观看':'guān kàn','看见':'kàn jiàn','看望':'kàn wàng',
'差遣':'chāi qiǎn','差事':'chāi shi','差役':'chāi yì','差别':'chā bié','差异':'chā yì','偏差':'piān chā','相差':'xiāng chā','差不多':'chà bu duō',
'称为':'chēng wéi','称作':'chēng zuò','称颂':'chēng sòng','称赞':'chēng zàn','相称':'xiāng chèn','称心':'chèn xīn','称量':'chēng liáng','名称':'míng chēng',
'给人':'gěi rén','赐给':'cì gěi','交给':'jiāo gěi','给我':'gěi wǒ','给予':'jǐ yǔ','供给':'gōng jǐ','补给':'bǔ jǐ',
'种子':'zhǒng zi','各种':'gè zhǒng','种类':'zhǒng lèi','种植':'zhòng zhí','播种':'bō zhǒng','栽种':'zāi zhòng','耕种':'gēng zhòng',
'将来':'jiāng lái','将要':'jiāng yào','将近':'jiāng jìn','将军':'jiāng jūn','将领':'jiàng lǐng','大将':'dà jiàng',
'患难':'huàn nàn','灾难':'zāi nàn','艰难':'jiān nán','难处':'nán chù','难以':'nán yǐ','困难':'kùn nan',
'干净':'gān jìng','干旱':'gān hàn','干燥':'gān zào','干活':'gàn huó','树干':'shù gàn','干粮':'gān liáng',
'显露':'xiǎn lù','露出':'lù chū','露面':'lòu miàn','露脸':'lòu liǎn','露水':'lù shuǐ',
'背负':'bēi fù','背起':'bēi qǐ','背后':'bèi hòu','背弃':'bèi qì','背叛':'bèi pàn','脊背':'jǐ bèi',
'供奉':'gòng fèng','供应':'gōng yìng','供给':'gōng jǐ','供养':'gōng yǎng','供品':'gòng pǐn',
'应许':'yīng xǔ','应当':'yīng dāng','应有':'yīng yǒu','应允':'yīng yǔn','回应':'huí yìng','应答':'yìng dá','响应':'xiǎng yìng',
'朝着':'cháo zhe','朝向':'cháo xiàng','朝代':'cháo dài','朝拜':'cháo bài','早朝':'zǎo cháo','朝阳':'zhāo yáng',
'转身':'zhuǎn shēn','转回':'zhuǎn huí','转动':'zhuàn dòng','转圈':'zhuàn quān','旋转':'xuán zhuǎn',
'得以':'dé yǐ','得到':'dé dào','得救':'dé jiù','得胜':'dé shèng','不得':'bù dé','得罪':'dé zuì','记得':'jì de','觉得':'jué de',
'省察':'xǐng chá','反省':'fǎn xǐng','节省':'jié shěng','省份':'shěng fèn',
'仆人':'pú rén','仆役':'pú yì','前仆后继':'qián pū hòu jì','仆倒':'pū dǎo',
'率领':'shuài lǐng','统率':'tǒng shuài','比率':'bǐ lǜ','效率':'xiào lǜ',
'会众':'huì zhòng','聚会':'jù huì','会议':'huì yì','会计':'kuài jì','财会':'cái kuài',
'舍弃':'shě qì','舍不得':'shě bu de','房舍':'fáng shè','宿舍':'sù shè',
'行走':'xíng zǒu','配给':'pèi jǐ','施舍':'shī shě','惟独':'wéi dú',
'恶人':'è rén','邪恶':'xié è','罪恶':'zuì è','恶毒':'è dú','可恶':'kě wù','厌恶':'yàn wù','恶心':'ě xīn',
'钦定':'qīn dìng','圣经':'shèng jīng','祈求':'qí qiú',
'结合':'jié hé','结实':'jiē shí','结果子':'jiē guǒ zi','结果':'jié guǒ','结盟':'jié méng',
'教会':'jiào huì','教导':'jiào dǎo','教训':'jiào xun','教给':'jiāo gěi','教学':'jiào xué',
'藏匿':'cáng nì','隐藏':'yǐn cáng','西藏':'xī zàng','珍藏':'zhēn cáng',
'打量':'dǎ liang','计量':'jì liàng','重量':'zhòng liàng','数量':'shù liàng',
'发觉':'fā jué','觉察':'jué chá','睡觉':'shuì jiào','自觉':'zì jué',
'铺张':'pū zhāng','床铺':'chuáng pù','铺开':'pū kāi',
'宁可':'nìng kě','宁愿':'nìng yuàn','安宁':'ān níng',
'觉得':'jué de','空旷':'kōng kuàng','空地':'kòng dì','空闲':'kòng xián','空虚':'kōng xū',
'记载':'jì zǎi','载入':'zài rù','承载':'chéng zài','千载':'qiān zǎi','装载':'zhuāng zài',
'悔改':'huǐ gǎi','救赎':'jiù shú','赎罪':'shú zuì','祭司':'jì sī',
'死了':'sǐ le','了结':'liǎo jié','了解':'liǎo jiě','了不起':'liǎo bu qǐ',
'冲撞':'chōng zhuàng','冲突':'chōng tū','冲着':'chòng zhe',
'着火':'zháo huǒ','看着':'kàn zhe','着重':'zhuó zhòng','附着':'fù zhuó','着手':'zhuó shǒu',
'散开':'sàn kāi','散布':'sàn bù','散文':'sǎn wén','松散':'sōng sǎn',
'悄悄':'qiāo qiāo','悄然':'qiǎo rán',
'上帝':'shàng dì','基督':'jī dū','耶稣':'yē sū','耶和华':'yē hé huá','亚伯拉罕':'yà bó lā hǎn','弥赛亚':'mí sài yà'
};
const map=new Map(Object.entries(raw));const order=[...map.keys()].sort((a,b)=>b.length-a.length||a.localeCompare(b,'zh-CN'));
function matches(text){const s=String(text||''),hits=[];let index=0;while(index<s.length){let found=null;for(const k of order){if(s.startsWith(k,index)){found=k;break;}}if(found){hits.push({start:index,end:index+found.length,word:found,pinyin:map.get(found)});index+=found.length;}else index++;}return hits;}
function report(text){const hits=matches(text);return {wordCount:hits.length,words:hits.slice(0,40),version:'polyphone-20261123-v1',note:'语音标注规则供云端音素接口使用；浏览器原生朗读不支持强制指定每字读音。'};}
// 只有支持 pinyin 音素标记的云端引擎才能实用此结果；浏览器 SpeechSynthesis 只使用原文朗读。
function pinyinNumbered(t){
 const base={'ā':'a1','á':'a2','ǎ':'a3','à':'a4','ē':'e1','é':'e2','ě':'e3','è':'e4',
 'ī':'i1','í':'i2','ǐ':'i3','ì':'i4','ō':'o1','ó':'o2','ǒ':'o3','ò':'o4',
 'ū':'u1','ú':'u2','ǔ':'u3','ù':'u4','ǖ':'ü1','ǘ':'ü2','ǚ':'ü3','ǜ':'ü4'};
 return String(t).split(/\s+/).filter(Boolean).map(syllable=>{
   let tone='5',out='';for(const c of syllable.normalize('NFC')){const mapped=base[c];if(mapped){out+=mapped[0];tone=mapped.slice(1);}else out+=c;}
   return out+tone;
 }).join(' ');
}
const xmlEscape=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
function googleSSML(text){
 const content=String(text||''),found=matches(content);let result='',cursor=0;
 for(const m of found){result+=xmlEscape(content.slice(cursor,m.start));result+='<phoneme alphabet="pinyin" ph="'+xmlEscape(pinyinNumbered(m.pinyin))+'">'+xmlEscape(m.word)+'</phoneme>';cursor=m.end;}
 result+=xmlEscape(content.slice(cursor));
 return '<speak>'+result+'</speak>';
}
const api={version:'polyphone-20261123-v1',rules:raw,matches,report,pinyinNumbered,googleSSML};root.BiblePronunciationRules=api;
if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
