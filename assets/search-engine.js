/* Search normalization is deliberately separate from stored/displayed source text. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SiteSearch = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  let han = {};
  function setMap(map) { han = map || {}; }
  function normalize(value) {
    return Array.from(String(value || '').normalize('NFKC')).map(c => han[c] || c).join('')
      .normalize('NFD').replace(/u\u0308/gi, 'v').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, '').replace(/\s+/g, ' ').trim();
  }
  function distance(a, b, cap = 2) {
    if (Math.abs(a.length - b.length) > cap) return cap + 1;
    let prev2 = null, prev = Array.from({length: b.length + 1}, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const row = [i];
      for (let j = 1; j <= b.length; j++) {
        row[j] = Math.min(row[j - 1] + 1, prev[j] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) row[j] = Math.min(row[j], prev2[j - 2] + 1);
      }
      prev2 = prev; prev = row;
    }
    return prev[b.length];
  }
  function prepare(r, labels = {}) {
    const titles = [r.name_zh, r.name_original].filter(Boolean).map(normalize);
    const title = titles.join(' '), alias = normalize((r.keywords || []).join(' '));
    const category = normalize((labels.categories || {})[r.category] || r.category || '');
    const language = (r.languages || []).map(x => (labels.languages || {})[x] || x).join(' ');
    const links = [...(r.related_links || []), ...(r.downloads || []), ...(r.channels || [])];
    return {
      resource: r, titles, title, alias, category,
      body: normalize([r.description, r.tradition, r.url, r.availability, language, ...links.map(x => (x.label || '') + ' ' + (x.url || ''))].filter(Boolean).join(' ')),
      py: Object.fromEntries(Object.entries(r.search || {}).map(([k, v]) => [k, normalize(v)])),
      hanWords: normalize(r.name_zh + ' ' + (r.keywords || []).join(' ')).match(/[\u3400-\u9fff]{3,}/g) || [],
      words: Array.from(new Set((title + ' ' + alias).match(/[a-z]{3,}/g) || []))
    };
  }
  function score(item, queryText) {
    const q = normalize(String(queryText).slice(0, 240));
    if (!q) return {score: 0, kind: '全部资源'};
    // Compare each actual title before tokenizing; joining two titles loses exact matches.
    if ((item.titles || [item.title]).includes(q)) return {score: 100000, kind: '名称精确匹配'};
    const terms = q.split(' ').filter(Boolean); let total = 0, kind = '关键词匹配';
    for (const term of terms) {
      let n = 0, k = '关键词匹配';
      const py = /^(?:[a-zv]+[1-5])+$/.test(term) ? term.replace(/[1-5]/g, '') : term;
      if (item.title.includes(term)) { n = 100 + (item.title.startsWith(term) ? 15 : 0); k = '名称包含'; }
      else if (item.alias.includes(term)) { n = 80; k = '关键词／别名'; }
      else if (/^[a-z]{2,}$/.test(py) && ((item.py.hanPinyin || '').includes(py) || (item.py.pinyin || '').includes(py) || (item.py.compact || '').includes(py))) { n = 72; k = '拼音匹配'; }
      else if (/^[a-z]{2,}$/.test(py) && (item.py.hanInitials || '').includes(py)) { n = 65; k = '拼音首字母'; }
      else if (item.category && item.category.includes(term)) { n = 45; k = '分类匹配'; }
      else if (item.body.includes(term)) { n = 35; k = '简介／网址匹配'; }
      else if (/^[a-z]{4,80}$/.test(term)) {
        const cap = term.length >= 8 ? 2 : 1; let best = cap + 1;
        for (const word of item.words) if (Math.abs(word.length - term.length) <= cap) best = Math.min(best, distance(term, word, cap));
        if (best <= cap) { n = 22 - best * 3; k = '模糊匹配'; }
      } else if (/^[\u3400-\u9fff]{4,40}$/.test(term) && item.hanWords.some(w => Math.abs(w.length - term.length) <= 1 && distance(term, w, 1) <= 1)) { n = 18; k = '模糊匹配'; }
      if (!n) return null;
      total += n;
      if (k === '模糊匹配' || kind !== '模糊匹配') kind = k;
    }
    if (item.title.includes(q)) total += 50;
    return {score: total, kind};
  }
  function query(items, text, filters = {}) {
    return items.filter(item => {
      const r = item.resource;
      return (!filters.scope || filters.scope === 'all' || r.group === filters.scope)
        && (!filters.lang || filters.lang === 'all' || r.language_group === filters.lang)
        && (!filters.category || filters.category === 'all' || r.category === filters.category)
        && (!filters.download || filters.download === 'all' || (filters.download === 'any'
          ? ['audio', 'ebook', 'document', 'video', 'data', 'software', 'github'].some(x => (r.download_types || []).includes(x))
          : (r.download_types || []).includes(filters.download)));
    }).map(item => { const s = score(item, text); return s ? {...s, resource: item.resource} : null; }).filter(Boolean)
      .sort((a, b) => (String(text).trim() ? b.score - a.score : (a.resource.sort_priority || 0) - (b.resource.sort_priority || 0)) || a.resource.name_zh.localeCompare(b.resource.name_zh, 'zh'));
  }
  return {setMap, normalize, prepare, score, query, distance};
});
