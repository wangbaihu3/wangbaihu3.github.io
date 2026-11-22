#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""静态TXT目录与检索索引：递归检索 TXT/ 下所有 TXT，其他原网站数据一律不改。仅Python标准库。"""
from pathlib import Path
import sys,os,json,re,base64,hashlib,time,unicodedata,collections
from array import array

ROOT=Path(__file__).resolve().parent.parent
TXT=ROOT/'TXT'
SHARDS=32
MAX_FILE=20_000_000
TAG=re.compile(r'[\u3400-\u9fff]+|[a-z0-9]+')

def words(s):
  norm=unicodedata.normalize('NFKC',s).lower()
  for m in TAG.finditer(norm):
    run=m.group()
    if '\u3400'<=run[0]<='\u9fff':
      yield from ('c:'+ch for ch in set(run))
      yield from ('b:'+run[i:i+2] for i in range(len(run)-1))
    elif len(run)>1:
      yield 'w:'+run

def varints(ids):
  prev=0; result=bytearray()
  for n in ids:
    d=n-prev;prev=n
    while d>=128:
      result.append((d & 127)|128); d>>=7
    result.append(d)
  return base64.b64encode(result).decode('ascii')

def detect_encoding(data):
  if data.startswith((b'\xff\xfe',b'\xfe\xff')):return 'utf-16'
  if data.startswith(b'\xef\xbb\xbf'):return 'utf-8-sig'
  try:data.decode('utf-8');return 'utf-8'
  except UnicodeDecodeError:
    try:data.decode('gb18030');return 'gb18030'
    except UnicodeDecodeError:return 'utf-8' # 页面仍可报告异常替代字符

def write_json(path,obj):
  path.parent.mkdir(parents=True,exist_ok=True)
  tmp=path.with_suffix(path.suffix+'.tmp')
  with tmp.open('w',encoding='utf-8',newline='\n') as f:json.dump(obj,f,ensure_ascii=False,separators=(',',':'))
  tmp.replace(path)

def build():
  start=time.time()
  files=sorted((p for p in TXT.rglob('*') if p.is_file() and p.suffix.lower()=='.txt'), key=lambda p: str(p.relative_to(TXT)).casefold())
  if len(files)>65000:raise RuntimeError('TXT文件超过65000个，请分库')
  entries=[]; inverted={};categories=collections.Counter();folders=collections.Counter();enc=collections.Counter();total=0
  for n,p in enumerate(files):
    if p.stat().st_size>MAX_FILE:raise RuntimeError('超过20MB的单个TXT，请拆分：'+str(p))
    rel=p.relative_to(TXT).as_posix();parts=rel.split('/'); folder='/'.join(parts[:-1]); category=parts[1] if parts[0]=='改革宗心灵辅导资料' and len(parts)>2 else (parts[0] if len(parts)>1 else '未分类')
    data=p.read_bytes();size=len(data);total+=size
    encoding=detect_encoding(data);enc[encoding]+=1
    try:content=data.decode(encoding)
    except UnicodeDecodeError:raise RuntimeError('不可解码：'+rel)
    entries.append({'id':n,'title':p.stem,'path':rel,'folder':folder,'category':category,'bytes':size,'sha256':hashlib.sha256(data).hexdigest(),'encoding':encoding})
    categories[category]+=1
    node=folder
    while node:
      folders[node]+=1
      node=node.rpartition('/')[0]
    for term in set(words(content)):
      ids=inverted.get(term)
      if ids is None:inverted[term]=array('H',[n])
      else:ids.append(n)
    if (n+1)%200==0: print('已索引',n+1,'/',len(files),'关键词',len(inverted),flush=True)
  manifest={'schema':'messiah-txt-2','generated':'2026-11-22','count':len(entries),'total_bytes':total,'search_shards':SHARDS,
    'categories':[{'name':k,'count':v} for k,v in categories.most_common()],
    'folders':[{'path':k,'count':v} for k,v in sorted(folders.items())], 'entries':entries}
  write_json(TXT/'index.json',manifest)
  # 分片倒排索引（UTF-8字符的首字码点对32取模），按需加载，无需整库下载。
  shards=[{} for _ in range(SHARDS)]
  for term,ids in inverted.items():
    first=term.partition(':')[2][0]
    shards[ord(first)%SHARDS][term]=varints(ids)
  for shard,terms in enumerate(shards):
    write_json(TXT/'search'/f'{shard:02d}.json',{'schema':1,'terms':terms})
  summary={'txt_files':len(entries),'txt_bytes':total,'categories':len(categories),'folders':len(folders),'encodings':dict(enc),'terms':len(inverted),'index_bytes':(TXT/'index.json').stat().st_size,'shards_bytes':sum(x.stat().st_size for x in (TXT/'search').glob('*.json')),'elapsed_seconds':round(time.time()-start,1)}
  write_json(TXT/'index-stats.json',summary)
  print(json.dumps(summary,ensure_ascii=False,indent=2))
  return summary
if __name__=='__main__': build()
