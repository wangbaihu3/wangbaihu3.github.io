/* 静态网站 TXT 递归索引。只读取 TXT/ 下 .txt；不修改任何原书正文。Node 18+。 */
'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const ROOT=path.resolve(__dirname,'..'),TXT=path.join(ROOT,'TXT');
const MAX=20_000_000, BLOOM_BYTES=16384, BLOOM_HASHES=4;
function walk(dir){let out=[];for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
  const p=path.join(dir,entry.name);if(entry.isDirectory())out.push(...walk(p));
  else if(entry.isFile()&&entry.name.toLowerCase().endsWith('.txt'))out.push(p);
}return out;}
function encodingOf(buf){if(buf.length>=2&&((buf[0]===255&&buf[1]===254)||(buf[0]===254&&buf[1]===255)))return 'utf-16';
 try{new TextDecoder('utf-8',{fatal:true}).decode(buf);return 'utf-8';}catch{}
 try{new TextDecoder('gb18030',{fatal:true}).decode(buf);return 'gb18030';}catch{}
 throw new Error('编码无法识别。请先转为UTF-8。');}
function normalize(s){return s.normalize('NFKC').toLowerCase()}
function makeTerms(text){let terms=new Set();
  for(const m of normalize(text).matchAll(/[\u3400-\u9fff]+|[a-z0-9]+/g)){
    let s=m[0];if(s.charCodeAt(0)>=0x3400){for(const c of s)terms.add('c:'+c);
      for(let i=0;i<s.length-1;i++)terms.add('b:'+s.slice(i,i+2));}
    else if(s.length>1&&s.length<=64)terms.add('w:'+s);
  }return terms;
}

function addBloom(buffer, offset, token) {
  let a=2166136261>>>0,b=0x9e3779b9>>>0;
  for(let i=0;i<token.length;i++){let cp=token.charCodeAt(i);a=Math.imul(a^cp,16777619)>>>0;b=Math.imul(b+cp,2246822519)>>>0;}
  b=(b|1)>>>0;
  for(let k=0;k<BLOOM_HASHES;k++){let bit=(a+Math.imul(k,b))&(BLOOM_BYTES*8-1);buffer[offset+(bit>>>3)]|=(1<<(bit&7));}
}
function encodeIds(ids){let prev=0,out=[];for(let n of ids){let d=n-prev;prev=n;while(d>=128){out.push((d&127)|128);d>>>=7;}out.push(d);}return Buffer.from(out).toString('base64')}
function json(p,obj){fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,JSON.stringify(obj),'utf8')}
function build(){let files=walk(TXT).sort((a,b)=>a.localeCompare(b,'zh-CN'));if(files.length>65000)throw Error('最多65000份TXT');if(files.length===0)throw Error('当前为云端TXT目录模式：禁止根据空目录重建并清空已有1360条元数据');
  let docs=[], bloom=Buffer.alloc(files.length*BLOOM_BYTES),cats=new Map(),folders=new Map(),total=0,encs={}, start=Date.now();
  for(let n=0;n<files.length;n++){
    let p=files[n],rel=path.relative(TXT,p).split(path.sep).join('/'),bits=rel.split('/'),folder=bits.slice(0,-1).join('/');
    let cat=bits[0]==='改革宗心灵辅导资料'&&bits.length>2?bits[1]:bits.length>1?bits[0]:'未分类';
    let buf=fs.readFileSync(p);if(buf.length>MAX)throw Error('TXT文件超过20MB：'+rel);
    let enc=encodingOf(buf), content=new TextDecoder(enc).decode(buf),hash=crypto.createHash('sha256').update(buf).digest('hex');
    docs.push({id:n,title:path.basename(p,'.txt'),path:rel,folder,category:cat,bytes:buf.length,sha256:hash,encoding:enc});
    total+=buf.length;cats.set(cat,(cats.get(cat)||0)+1);encs[enc]=(encs[enc]||0)+1;
    let d=folder;while(d){folders.set(d,(folders.get(d)||0)+1);const i=d.lastIndexOf('/');d=i<0?'':d.slice(0,i);}
    for(const term of makeTerms(content))addBloom(bloom,n*BLOOM_BYTES,term);
    if((n+1)%250===0)console.log('已索引',n+1,'/',files.length,'用时',Math.round((Date.now()-start)/1000),'秒');
  }
  let manifest={schema:'messiah-txt-3',generated:new Date().toISOString(),count:docs.length,total_bytes:total,search_bloom:{file:'bloom.bin',bytes_per_entry:BLOOM_BYTES,hashes:BLOOM_HASHES,algorithm:'fnv32-double-hash-v1',sha256:crypto.createHash('sha256').update(bloom).digest('hex')},
    categories:Array.from(cats,( [name,count])=>({name,count})).sort((a,b)=>b.count-a.count),
    folders:Array.from(folders,([path,count])=>({path,count})).sort((a,b)=>a.path.localeCompare(b.path,'zh-CN')),
    entries:docs};
  json(path.join(TXT,'index.json'),manifest);
  fs.writeFileSync(path.join(TXT,'bloom.bin'),bloom);
  const stats={source:'用户提供的RAR资料',txt_files:docs.length,txt_bytes:total,category_count:cats.size,folder_count:folders.size,
    encodings:encs,filter_bits_per_file:BLOOM_BYTES*8,index_bytes:fs.statSync(path.join(TXT,'index.json')).size,
    bloom_bytes:bloom.length,elapsed_sec:+((Date.now()-start)/1000).toFixed(2)};
  json(path.join(TXT,'index-stats.json'),stats);console.log(JSON.stringify(stats,null,2));
}
if(require.main===module)build();module.exports={walk,makeTerms,encodeIds};
