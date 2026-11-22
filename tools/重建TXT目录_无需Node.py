#!/usr/bin/env python3
# -*- coding:utf-8 -*-
"""标准库简易索引：仍能递归分类、标题搜索和全文逐篇扫描；没有布隆预筛。"""
from pathlib import Path
import json,hashlib,collections
ROOT=Path(__file__).resolve().parent.parent; TXT=ROOT/'TXT'
files=sorted([f for f in TXT.rglob('*') if f.is_file() and f.suffix.lower()=='.txt'],key=lambda f:str(f.relative_to(TXT)).casefold())
entries=[];cats=collections.Counter();folders=collections.Counter();total=0
for i,f in enumerate(files):
 b=f.read_bytes()
 if len(b)>20_000_000:raise RuntimeError(f'TXT超过20MB：{f}')
 rel=f.relative_to(TXT).as_posix();parts=rel.split('/');folder='/'.join(parts[:-1]);cat=parts[1] if parts[0]=='改革宗心灵辅导资料' and len(parts)>2 else (parts[0] if len(parts)>1 else '未分类')
 try:b.decode('utf-8');enc='utf-8'
 except UnicodeDecodeError:
  try:b.decode('gb18030');enc='gb18030'
  except UnicodeDecodeError:raise RuntimeError(f'不支持的TXT编码：{rel}')
 entries.append({'id':i,'title':f.stem,'path':rel,'folder':folder,'category':cat,'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest(),'encoding':enc})
 cats[cat]+=1;total+=len(b)
 node=folder
 while node:folders[node]+=1;node=node.rpartition('/')[0]
manifest={'schema':'messiah-txt-3','generated':'2026-11-22','count':len(entries),'total_bytes':total,'search_bloom':None,
 'categories':[{'name':name,'count':n} for name,n in cats.most_common()],
 'folders':[{'path':p,'count':n} for p,n in sorted(folders.items())],'entries':entries}
(TXT/'index.json').write_text(json.dumps(manifest,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
(TXT/'bloom.bin').unlink(missing_ok=True)
(TXT/'index-stats.json').write_text(json.dumps({'txt_files':len(entries),'txt_bytes':total,'fallback_index':'无布隆预筛；全文逐篇核查'},ensure_ascii=False,indent=2),encoding='utf-8')
print(f'完成：{len(entries)}份TXT、{len(cats)}类、{len(folders)}个文件夹。没有布隆索引，全文搜索采用逐篇核查。')
