/* Explicit verse-coordinate aliases; no first-character guessing or silent clamping. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.BibleReferences = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const ALIASES = [
    '创 創 创世记 創世記 Genesis Gen', '出 出埃及记 出埃及記 Exodus Exod Ex',
    '利 利未记 利未記 Leviticus Lev', '民 民数记 民數記 Numbers Num',
    '申 申命记 申命記 Deuteronomy Deut', '书 書 约书亚记 約書亞記 Joshua Josh',
    '士 士师记 士師記 Judges Judg', '得 路得记 路得記 Ruth',
    '撒上 撒母耳记上 撒母耳記上 1Samuel 1Sam', '撒下 撒母耳记下 撒母耳記下 2Samuel 2Sam',
    '王上 列王纪上 列王紀上 1Kings 1Kgs', '王下 列王纪下 列王紀下 2Kings 2Kgs',
    '代上 历代志上 歷代志上 1Chronicles 1Chr', '代下 历代志下 歷代志下 2Chronicles 2Chr',
    '拉 以斯拉记 以斯拉記 Ezra', '尼 尼希米记 尼希米記 Nehemiah Neh',
    '斯 以斯帖记 以斯帖記 Esther Esth', '伯 约伯记 約伯記 Job',
    '诗 詩 诗篇 詩篇 Psalms Psalm Ps', '箴 箴言 Proverbs Prov',
    '传 傳 传道书 傳道書 Ecclesiastes Eccl', '歌 雅歌 Song SongofSongs SongofSolomon Canticles',
    '赛 賽 以赛亚书 以賽亞書 Isaiah Isa', '耶 耶利米书 耶利米書 Jeremiah Jer',
    '哀 耶利米哀歌 Lamentations Lam', '结 結 以西结书 以西結書 Ezekiel Ezek',
    '但 但以理书 但以理書 Daniel Dan', '何 何西阿书 何西阿書 Hosea Hos',
    '珥 约珥书 約珥書 Joel', '摩 阿摩司书 阿摩司書 Amos',
    '俄 俄巴底亚书 俄巴底亞書 Obadiah Obad', '拿 约拿书 約拿書 Jonah',
    '弥 彌 弥迦书 彌迦書 Micah Mic', '鸿 鴻 那鸿书 那鴻書 Nahum Nah',
    '哈 哈巴谷书 哈巴谷書 Habakkuk Hab', '番 西番雅书 西番雅書 Zephaniah Zeph',
    '该 該 哈该书 哈該書 Haggai Hag', '亚 亞 撒迦利亚书 撒迦利亞書 Zechariah Zech',
    '玛 瑪 玛拉基书 瑪拉基書 Malachi Mal', '太 马太福音 馬太福音 Matthew Matt Mt',
    '可 马可福音 馬可福音 Mark Mk', '路 路加福音 Luke Lk',
    '约 約 约翰福音 約翰福音 John Jn', '徒 使徒行传 使徒行傳 Acts',
    '罗 羅 罗马书 羅馬書 Romans Rom', '林前 哥林多前书 哥林多前書 1Corinthians 1Cor',
    '林后 林後 哥林多后书 哥林多後書 2Corinthians 2Cor', '加 加拉太书 加拉太書 Galatians Gal',
    '弗 以弗所书 以弗所書 Ephesians Eph', '腓 腓立比书 腓立比書 Philippians Phil',
    '西 歌罗西书 歌羅西書 Colossians Col', '帖前 帖撒罗尼迦前书 帖撒羅尼迦前書 1Thessalonians 1Thess',
    '帖后 帖後 帖撒罗尼迦后书 帖撒羅尼迦後書 2Thessalonians 2Thess',
    '提前 提摩太前书 提摩太前書 1Timothy 1Tim', '提后 提後 提摩太后书 提摩太後書 2Timothy 2Tim',
    '多 提多书 提多書 Titus', '门 門 腓利门书 腓利門書 Philemon Phlm',
    '来 來 希伯来书 希伯來書 Hebrews Heb', '雅 雅各书 雅各書 James Jas',
    '彼前 彼得前书 彼得前書 1Peter 1Pet', '彼后 彼後 彼得后书 彼得後書 2Peter 2Pet',
    '约壹 約壹 约翰一书 約翰一書 1John 1Jn', '约贰 約貳 约貳 約贰 约翰二书 約翰二書 2John 2Jn',
    '约叁 約參 約叁 约參 约翰三书 約翰三書 3John 3Jn', '犹 猶 犹大书 猶大書 Jude',
    '启 啟 启示录 啟示錄 Revelation Rev'
  ];
  const key = s => String(s).normalize('NFKC').toLowerCase().replace(/[\s.]/g, '');
  const lookup = new Map();
  ALIASES.forEach((s, i) => s.split(' ').forEach(a => lookup.set(key(a), i + 1)));
  function parse(input, books) {
    const q = String(input).normalize('NFKC').trim().replace(/第(?=\d)/g, '').replace(/節$/, '节').replace(/章\s*(?=\d)/, ':');
    const m = /^(.+?)\s*(\d+)\s*(?:[:章]\s*(\d+)\s*节?|章)?$/i.exec(q);
    if (!m) return null;
    const id = lookup.get(key(m[1]));
    if (!id) return /[:章]/.test(q) ? {error:'经卷缩写不明确或未识别；请使用完整书名，例如“约翰福音 1:1”。'} : null;
    const chapter = Number(m[2]), verse = m[3] ? Number(m[3]) : null;
    const book = books.find(b => b.id === id);
    if (!book || !Number.isSafeInteger(chapter) || chapter < 1 || chapter > book.chapters ||
      (verse !== null && (!Number.isSafeInteger(verse) || verse < 1)))
      return {error:'章或节号不在有效范围；未跳转至其他经文。'};
    return {book:id, chapter, verse};
  }
  function validChapter(chapter, count) {
    return Number.isInteger(chapter) && chapter >= 1 && chapter <= count;
  }
  return {parse, validChapter, aliases:ALIASES};
});
