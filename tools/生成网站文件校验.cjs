/* 生成不含 TXT 正文的完整网站清单；书目和全文检索索引保持原字节。 */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');

function makeManifest(root) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'version.json'), 'utf8'));
  if (manifest.schema !== 'messiah-release-v1' || !manifest.build) throw Error('现有版本清单格式或版本标识不正确');
  const files = [], names = new Set();
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, {withFileTypes:true})) {
      const file = path.join(dir, entry.name), rel = path.relative(root, file).replace(/\\/g, '/');
      if (entry.isSymbolicLink()) throw Error('站点内存在符号链接：' + rel);
      if (entry.isDirectory()) { walk(file); continue; }
      if (!entry.isFile()) continue;
      const lower = rel.toLowerCase(), key = rel.normalize('NFC').toLowerCase();
      if (lower.startsWith('txt/books/') || (lower.startsWith('txt/') && lower.endsWith('.txt')))
        throw Error('本包不携带 TXT 正文，已拒绝生成清单：' + rel);
      if (rel.split('/').some(x => x === '.git' || x === '__pycache__')) throw Error('请先移出非发布目录：' + rel);
      if (names.has(key)) throw Error('文件名存在大小写或字符规范化冲突：' + rel);
      names.add(key);
      if (rel !== 'version.json') files.push(rel);
    }
  }
  walk(root);
  const entries = {};
  for (const name of files.sort()) {
    const raw = fs.readFileSync(path.join(root, name));
    entries[name] = {bytes:raw.length, sha256:crypto.createHash('sha256').update(raw).digest('hex')};
  }
  const catalogue = JSON.parse(fs.readFileSync(path.join(root, 'TXT/index.json'), 'utf8'));
  const books = catalogue.entries || [], paths = books.map(x => String(x.bundled_path || ''));
  if (catalogue.count !== 1360 || books.length !== 1360) throw Error('原有书目必须保持 1360 条');
  if (new Set(paths).size !== 1360 || paths.some(p => !/^books\/\d{4}\.txt$/.test(p))) throw Error('原有书目路径重复或编号格式不符');
  if (books.reduce((n,x) => n + x.bytes, 0) !== catalogue.total_bytes) throw Error('原有书目字节总量不一致');
  manifest.files = entries;
  manifest.file_count = files.length + 1;
  manifest.full_file_count = files.length + 1;
  manifest.txt_module = {
    route:'/TXT/', manifest:'/TXT/index.json', content_root:'/TXT/',
    index_style:'existing-numbered-text-with-original-paths',
    txt_files:books.length, catalogue_count:books.length,
    txt_files_meaning:'书目数量，不表示本包携带正文',
    txt_total_bytes:catalogue.total_bytes, text_files_are_validated_by_txt_manifest:true,
    bundled_txt_bodies:0
  };
  manifest.txt_delivery = {
    mode:'existing-same-origin-texts-excluded', bundled_txt_bodies:0, catalogue_count:books.length,
    original_bytes:catalogue.total_bytes, existing_remote_texts_preserved:true,
    local_file_reading_available:true, verified_remote_network:false
  };
  const raw = Buffer.from(JSON.stringify(manifest), 'utf8');
  if (raw.length > 190000) throw Error('新清单超过 190KB，未覆盖旧清单；网页读取上限为 200KB');
  return {raw, count:files.length + 1};
}

function main() {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--site')) throw Error('用法：node 生成网站文件校验.cjs [--site 网站目录]');
  const root = path.resolve(args.length ? args[1] : path.join(__dirname, '..'));
  const result = makeManifest(root), temp = path.join(root, 'release-check-' + crypto.randomBytes(10).toString('hex') + '.tmp');
  let created = false;
  try {
    fs.writeFileSync(temp, result.raw, {flag:'wx'});
    created = true;
    fs.renameSync(temp, path.join(root, 'version.json'));
  } finally { if (created && fs.existsSync(temp)) fs.unlinkSync(temp); }
  console.log('网站发布清单已更新：', result.count, '个网站文件；书目 1360 条；TXT 正文 0 份。');
}
module.exports = {makeManifest};
if (require.main === module) {
  try { main(); } catch (error) { console.error('停止：' + error.message); process.exitCode = 1; }
}
