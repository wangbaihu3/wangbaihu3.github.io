#!/usr/bin/env python3
# -*- coding:utf-8 -*-
"""不依赖 Node 的网站发布清单生成器。TXT正文由TXT/index.json单独校验。"""
from pathlib import Path
import json,hashlib
root=Path(__file__).resolve().parent.parent
version=root/'version.json'
m=json.loads(version.read_text('utf-8'));entries={}
for p in sorted(root.rglob('*')):
 if not p.is_file():continue
 rel=p.relative_to(root).as_posix()
 if rel=='version.json':continue
 if rel.startswith('TXT/') and rel.lower().endswith('.txt'):continue
 b=p.read_bytes();entries[rel]={'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()}
m['files']=entries
m['file_count']=len(entries)+1
txt=json.loads((root/'TXT/index.json').read_text('utf-8'))
m['txt_module']={'route':'/TXT/','manifest':'/TXT/index.json','content_root':'/TXT/','index_style':'bundled-numbered-text-with-original-paths','txt_files':txt['count'],'txt_total_bytes':txt['total_bytes'],'text_files_are_validated_by_txt_manifest':True}
version.write_text(json.dumps(m,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
if version.stat().st_size>190000:raise RuntimeError('网站版本清单过大，原站读取限制200KB')
print('网站发布清单更新完成:',len(entries),'个非TXT正文文件')
