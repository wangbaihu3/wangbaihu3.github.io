/* 重新生成网站版本校验清单。TXT全文本单独由TXT/index.json校验，不在主清单重复列1360条。 */
'use strict';const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=path.resolve(__dirname,'..');const ver=path.join(root,'version.json');
const manifest=JSON.parse(fs.readFileSync(ver,'utf8'));
function list(p){let all=[];for(const entry of fs.readdirSync(p,{withFileTypes:true})){
 if(entry.name==='.git'||entry.name==='.github'||(p===root&&entry.name==='tools'))continue;
 const f=path.join(p,entry.name);if(entry.isDirectory())all.push(...list(f));
 else if(entry.isFile()){const rel=path.relative(root,f).replace(/\\/g,'/');
   if(rel==='version.json'||(rel.startsWith('TXT/')&&/\.txt$/i.test(rel)))continue;
   all.push(rel);
 }
}return all;}
let entries={};for(const name of list(root).sort()){
 const b=fs.readFileSync(path.join(root,name));entries[name]={bytes:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex')};}
manifest.files=entries;manifest.file_count=Object.keys(entries).length+1;
const txt=JSON.parse(fs.readFileSync(path.join(root,'TXT/index.json'),'utf8'));
manifest.txt_module={route:'/TXT/',manifest:'/TXT/index.json',content_root:'/TXT/',index_style:'recursive-with-bloom-optional',txt_files:txt.count,txt_total_bytes:txt.total_bytes,text_files_are_validated_by_txt_manifest:true};
fs.writeFileSync(ver,JSON.stringify(manifest),'utf8');
const bytes=fs.statSync(ver).size;if(bytes>190000)throw Error('发布清单超过190KB，原站runtime限制200KB：'+bytes);
console.log('网站发布清单更新成功：',Object.keys(entries).length,'个核心与索引文件',bytes,'字节，圣经原有版本',manifest.build);
