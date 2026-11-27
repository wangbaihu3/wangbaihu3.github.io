#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成不含 TXT 正文的完整网站清单；不改写书目和全文检索索引。"""
from pathlib import Path
import argparse
import hashlib
import json
import os
import re
import tempfile
import unicodedata


def build_manifest(root):
    root = Path(root).resolve()
    version = root / 'version.json'
    manifest = json.loads(version.read_text(encoding='utf-8'))
    if manifest.get('schema') != 'messiah-release-v1' or not manifest.get('build'):
        raise RuntimeError('现有版本清单缺少正确的格式和版本标识。')
    entries, names = {}, {}
    for p in sorted(root.rglob('*')):
        rel = p.relative_to(root).as_posix()
        if p.is_symlink():
            raise RuntimeError('站点内存在符号链接，未生成清单：' + rel)
        if not p.is_file():
            continue
        low = rel.casefold()
        if low.startswith('txt/books/') or (low.startswith('txt/') and low.endswith('.txt')):
            raise RuntimeError('本包不携带 TXT 正文，已拒绝生成清单：' + rel)
        if '.git' in p.relative_to(root).parts or '__pycache__' in p.relative_to(root).parts:
            raise RuntimeError('请先移出非发布目录，未生成清单：' + rel)
        key = unicodedata.normalize('NFC', rel).casefold()
        if key in names:
            raise RuntimeError('文件名存在大小写或字符规范化冲突：' + rel)
        names[key] = rel
        if rel == 'version.json':
            continue
        raw = p.read_bytes()
        entries[rel] = {'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}
    catalogue = json.loads((root / 'TXT/index.json').read_text(encoding='utf-8'))
    books = catalogue.get('entries', [])
    if catalogue.get('count') != 1360 or len(books) != 1360:
        raise RuntimeError('原有书目必须保持 1360 条。')
    paths = [str(x.get('bundled_path', '')) for x in books]
    if len(set(paths)) != 1360 or any(not re.fullmatch(r'books/\d{4}\.txt', p) for p in paths):
        raise RuntimeError('原有书目路径重复或编号格式不符。')
    if sum(x.get('bytes', 0) for x in books) != catalogue.get('total_bytes'):
        raise RuntimeError('原有书目字节总量不一致。')
    manifest['files'] = entries
    manifest['file_count'] = len(entries) + 1
    manifest['full_file_count'] = len(entries) + 1
    manifest['txt_module'] = {
        'route': '/TXT/', 'manifest': '/TXT/index.json', 'content_root': '/TXT/',
        'index_style': 'existing-numbered-text-with-original-paths',
        'txt_files': len(books), 'catalogue_count': len(books),
        'txt_files_meaning': '书目数量，不表示本包携带正文',
        'txt_total_bytes': catalogue['total_bytes'],
        'text_files_are_validated_by_txt_manifest': True,
        'bundled_txt_bodies': 0
    }
    manifest['txt_delivery'] = {
        'mode': 'existing-same-origin-texts-excluded',
        'bundled_txt_bodies': 0, 'catalogue_count': len(books),
        'original_bytes': catalogue['total_bytes'],
        'existing_remote_texts_preserved': True,
        'local_file_reading_available': True,
        'verified_remote_network': False
    }
    raw = json.dumps(manifest, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    if len(raw) > 190000:
        raise RuntimeError('新清单超过 190KB，未覆盖旧清单。网页读取上限为 200KB。')
    return raw, len(entries)


def main():
    parser = argparse.ArgumentParser(description='生成不含 TXT 正文的完整网站清单')
    parser.add_argument('--site', type=Path, default=Path(__file__).resolve().parent.parent)
    args = parser.parse_args()
    root = args.site.resolve()
    raw, count = build_manifest(root)
    temp = None
    try:
        with tempfile.NamedTemporaryFile(dir=root, prefix='release-check-', suffix='.tmp', delete=False) as f:
            temp = Path(f.name)
            f.write(raw)
        os.replace(temp, root / 'version.json')
    finally:
        if temp is not None and temp.exists():
            temp.unlink()
    print('网站发布清单已更新：', count + 1, '个网站文件；书目 1360 条；TXT 正文 0 份。')


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, KeyError, TypeError, RuntimeError) as exc:
        raise SystemExit('停止：' + str(exc))
