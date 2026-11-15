/* Category-first directory. Index normalization never rewrites displayed/source text. */
(function () {
  'use strict';
  SiteSearch.setMap(window.HAN_FOLD);
  const $ = id => document.getElementById(id);
  const keys = ['scope', 'language', 'category', 'download', 'tradition'];
  const state = {resources: [], items: [], labels: {}, favorites: new Set(), history: [], limit: 60, ready: false};
  let timer, composing = false, storeOK = true;
  const scopeNames = {all: '全部资源', reformed: '改革宗', christian: '福音派与其他基督教', tools: '原文与学术工具'};
  const historyKey = 'messiah-directory-history-v1';
  try {
    const ids = JSON.parse(localStorage.getItem('messiah-favorites-v1') || '[]');
    if (Array.isArray(ids)) state.favorites = new Set(ids.filter(x => typeof x === 'string'));
    const past = JSON.parse(localStorage.getItem(historyKey) || '[]');
    if (Array.isArray(past)) state.history = past.filter(x => typeof x === 'string' && x.trim() && x.length <= 240).slice(0, 8);
  } catch { storeOK = false; }
  function el(tag, text, cls) { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; }
  function link(url, text, cls) {
    try {
      const u = new URL(url); if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) return el('span', text);
      const a = el('a', text, cls); a.href = u.href; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a;
    } catch { return el('span', text); }
  }
  function button(text, callback, cls = 'secondary') { const b = el('button', text, cls); b.type = 'button'; b.addEventListener('click', callback); return b; }
  function persist(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { $('search-hint').textContent = '本机存储不可用，收藏与搜索历史只在当前页面有效。'; } }
  function historyRender() {
    $('recent-searches').replaceChildren();
    if (!state.history.length) return;
    $('recent-searches').append(el('span', '最近搜索', 'subtle'));
    for (const term of state.history) $('recent-searches').append(button(term, () => { $('directory-search').value = term; change(); }, 'recent-query'));
  }
  function remember() {
    const term = $('directory-search').value.trim().slice(0, 240); if (!term) return;
    state.history = [term, ...state.history.filter(x => x !== term)].slice(0, 8); persist(historyKey, state.history); historyRender();
  }
  function restore() {
    const p = new URLSearchParams(location.search); $('directory-search').value = (p.get('q') || '').slice(0, 240);
    for (const key of keys) { const v = p.get(key === 'language' ? 'lang' : key) || 'all'; $(key).value = [...$(key).options].some(o => o.value === v) ? v : 'all'; }
    $('favorites-only').checked = p.get('saved') === '1';
    const shown = Number(p.get('shown')); state.limit = Number.isSafeInteger(shown) && shown >= 60 ? Math.min(shown, 1000) : 60;
  }
  function syncURL(mode) {
    const p = new URLSearchParams(), term = $('directory-search').value.trim().slice(0, 240);
    if (term) p.set('q', term);
    for (const key of keys) if ($(key).value !== 'all') p.set(key === 'language' ? 'lang' : key, $(key).value);
    if ($('favorites-only').checked) p.set('saved', '1');
    if (term && state.limit > 60) p.set('shown', state.limit);
    const next = location.pathname + (p.size ? '?' + p.toString() : '');
    if (next !== location.pathname + location.search) { try { history[mode === 'push' ? 'pushState' : 'replaceState'](null, '', next); } catch { $('search-hint').textContent = '浏览器没有保存网址状态；筛选仍可使用。'; } }
  }
  function selectCategory(category) {
    $('category').value = category; change();
    if (matchMedia('(max-width: 850px)').matches) $('category-menu').open = false;
    $('search-status').scrollIntoView({block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
  }
  function favoriteButton(r) {
    const b = button('', () => {
      state.favorites.has(r.id) ? state.favorites.delete(r.id) : state.favorites.add(r.id);
      persist('messiah-favorites-v1', [...state.favorites]);
      if ($('favorites-only').checked) render(); else update();
    }, 'favorite-button');
    function update() { const has = state.favorites.has(r.id); b.textContent = has ? '已收藏' : '收藏'; b.setAttribute('aria-pressed', String(has)); b.setAttribute('aria-label', (has ? '取消收藏：' : '收藏：') + r.name_zh); }
    update(); return b;
  }
  function resourceCard(item, compact) {
    const r = item.resource, a = el('article', undefined, 'resource ' + r.language_group + (compact ? ' compact-resource' : ''));
    a.dataset.id = r.id;
    const top = el('div', undefined, 'resource-top'), lang = el('span', r.language_group === 'zh' ? '中文／含中文' : '外语', 'badge language-badge');
    top.append(lang, favoriteButton(r));
    const h = el('h3'); h.append(link(r.url, r.name_zh, 'resource-link'));
    a.append(top, h);
    if (r.name_original && r.name_original !== r.name_zh) { const p = el('p', r.name_original, 'original'); p.lang = (r.languages || []).includes('en') ? 'en' : ''; p.dir = 'auto'; a.append(p); }
    a.append(el('p', r.description, 'description'));
    if ($('directory-search').value.trim()) a.append(el('p', item.kind, 'match-type'));
    if (compact) return a;
    a.append(el('p', [r.tradition || '', (r.languages || []).map(x => state.labels.languages[x] || x).join('／')].filter(Boolean).join(' · '), 'meta'));
    const actions = el('div', undefined, 'resource-actions'), allActions = [], seen = new Set();
    function addAction(d, fallback) { if (d && typeof d.url === 'string' && !seen.has(d.url)) { seen.add(d.url); allActions.push({url: d.url, label: d.label || fallback}); } }
    for (const d of r.downloads || []) { addAction(d, '获取入口'); if (d.client_download) addAction(d.client_download, '下载 Windows 版资源库'); }
    for (const d of r.channels || []) addAction(d, '视频频道');
    for (const d of r.related_links || []) addAction(d, '相关入口');
    for (const d of allActions.slice(0, 3)) actions.append(link(d.url, d.label, 'resource-action'));
    if (actions.childNodes.length) a.append(actions);
    const details = el('details', undefined, 'resource-details'); details.append(el('summary', allActions.length > 3 ? '更多入口、来源与说明' : '来源、条件与完整简介'));
    if (allActions.length > 3) { const extra = el('div', undefined, 'resource-actions'); for (const d of allActions.slice(3)) extra.append(link(d.url, d.label, 'resource-action')); details.append(extra); }
    details.append(el('p', r.description), el('p', r.availability || r.access || '获取及授权条件请查原站。', 'evidence'), el('p', r.evidence_reason || '沿用原目录来源，本轮未逐页重核。', 'evidence'));
    if (r.download_note) details.append(el('p', r.download_note, 'evidence'));
    if (r.research_check) details.append(el('p', '核对范围：' + (r.research_check.status || '') + '。' + (r.research_check.scope || ''), 'evidence'));
    const sources = [...new Set([r.evidence_url, ...(r.source_urls || []), ...(r.alternate_urls || [])].filter(x => typeof x === 'string' && x))];
    for (let i = 0; i < sources.length; i++) { const p = el('p'); p.append(link(sources[i], i ? '补充来源／保留入口 ' + i : '查看官方或原始来源')); details.append(p); }
    details.append(el('p', '资料核对：' + (r.last_checked || '未注明') + '；不是实时在线保证。', 'meta'));
    const report = el('a', '反馈这个条目'); report.href = 'mailto:wangbaihu3@163.com?subject=' + encodeURIComponent('导航勘误：' + r.name_zh) + '&body=' + encodeURIComponent(r.url + '\n问题说明：'); details.append(report); a.append(details); return a;
  }
  function matches() {
    const f = {scope: $('scope').value, lang: $('language').value, download: $('download').value};
    let rows = SiteSearch.query(state.items, $('directory-search').value, f);
    if (!$('directory-search').value.trim()) rows.sort((a,b) => (a.resource.sort_priority || 0) - (b.resource.sort_priority || 0) || state.resourceOrder.get(a.resource.id) - state.resourceOrder.get(b.resource.id));
    if ($('tradition').value !== 'all') rows = rows.filter(x => (x.resource.traditions || []).includes($('tradition').value));
    if ($('favorites-only').checked) rows = rows.filter(x => state.favorites.has(x.resource.id));
    return rows;
  }
  function section(category, rows, preview, total = rows.length) {
    const s = el('section', undefined, 'category-section' + (preview ? ' category-preview' : ''));
    s.id = 'category-' + category;
    const header = el('div', undefined, 'category-heading'), h = el('h2', state.labels.categories[category]), count = el('span', total === rows.length ? total + ' 项' : '已显示 ' + rows.length + '／' + total + ' 项', 'category-total');
    header.append(h, count);
    if (preview) header.append(button('查看全部 →', () => selectCategory(category), 'category-more'));
    s.append(header);
    const chosen = preview ? rows.slice(0, 4) : rows;
    const columns = el('div', undefined, 'category-language-columns');
    const atEnd = !preview && !$('directory-search').value.trim();
    const batches = atEnd ? [chosen.filter(x => (x.resource.sort_priority || 0) < 1000), chosen.filter(x => (x.resource.sort_priority || 0) >= 1000)] : [chosen];
    batches.forEach((batch, batchIndex) => {
      for (const group of ['zh', 'foreign']) {
        const entries = batch.filter(x => x.resource.language_group === group); if (!entries.length) continue;
        const lane = el('div', undefined, 'language-lane ' + group + (batchIndex ? ' directory-tail' : ''));
        if (!preview) lane.append(el('h3', (batchIndex ? '其他福音派广播 · ' : '') + (group === 'zh' ? '中文／含中文' : '外语 · 中外文对照') + '（' + entries.length + '）', 'language-heading'));
        const list = el('div', undefined, 'category-cards'); for (const r of entries) list.append(resourceCard(r, preview)); lane.append(list); columns.append(lane);
      }
    });
    s.append(columns);
    if (preview && rows.length > 4) s.append(button('还有 ' + (rows.length - 4) + ' 项 · 进入本分类', () => selectCategory(category), 'preview-tail'));
    return s;
  }
  function overview(rows) {
    const place = $('category-overview'); place.replaceChildren();
    if ($('category').value !== 'all' || $('directory-search').value.trim() || $('favorites-only').checked) { place.hidden = true; return; }
    place.hidden = false;
    const row = el('div', undefined, 'macro-shortcuts'); row.append(el('span', '快速定位', 'subtle'));
    for (const g of state.labels.category_groups) {
      const first = g.categories.find(cat => rows.some(x => x.resource.category === cat)); if (!first) continue;
      const a = el('a', g.name); a.href = '#category-' + first; row.append(a);
    }
    place.append(row);
  }
  function render(mode) {
    if (!state.ready) return;
    const base = matches(), category = $('category').value, term = $('directory-search').value.trim();
    const rows = base.filter(x => category === 'all' || x.resource.category === category);
    const allBrowse = category === 'all' && !term && !$('favorites-only').checked;
    document.querySelectorAll('[data-select-category]').forEach(b => { const selected = b.dataset.selectCategory === category; b.classList.toggle('is-selected', selected); b.setAttribute('aria-pressed', String(selected)); });
    document.querySelectorAll('[data-count-category]').forEach(span => { const cat = span.dataset.countCategory; span.textContent = cat === 'all' ? base.length : base.filter(x => x.resource.category === cat).length; });
    document.querySelectorAll('[data-select-scope]').forEach(b => { const active = b.dataset.selectScope === $('scope').value; b.classList.toggle('is-selected', active); b.setAttribute('aria-pressed', String(active)); });
    for (const option of $('category').options) { const cat = option.value; option.textContent = (cat === 'all' ? '全部主题' : state.labels.categories[cat]) + '（' + (cat === 'all' ? base.length : base.filter(x => x.resource.category === cat).length) + '）'; }
    overview(base);
    const out = $('classified-results'); out.replaceChildren(); out.className = allBrowse ? 'classified-overview-grid' : 'classified-full';
    const visible = !allBrowse && term ? rows.slice(0, state.limit) : rows;
    let categories = state.labels.category_groups.flatMap(g => g.categories).filter(cat => visible.some(r => r.resource.category === cat));
    if (term) categories.sort((a,b) => Math.max(...visible.filter(x => x.resource.category === b).map(x => x.score)) - Math.max(...visible.filter(x => x.resource.category === a).map(x => x.score)));
    for (const cat of categories) out.append(section(cat, visible.filter(x => x.resource.category === cat), allBrowse, rows.filter(x => x.resource.category === cat).length));
    if (!rows.length) { const p = el('div', undefined, 'empty-result'); p.append(el('h2', '没有找到匹配结果'), el('p', '试试较短的关键词、拼音、简体或繁体；也可切回全部分类与全部语言。'), button('清除全部筛选', reset)); out.append(p); }
    const fuzzy = rows.filter(x => x.kind === '模糊匹配').length;
    $('search-status').textContent = (term ? '搜索结果' : '分类资源') + '：' + rows.length + ' 项' + (fuzzy ? '，含 ' + fuzzy + ' 项模糊匹配' : '');
    const labels = [scopeNames[$('scope').value], category === 'all' ? '全部分类' : state.labels.categories[category]];
    if ($('language').value !== 'all') labels.push($('language').selectedOptions[0].textContent);
    if ($('download').value !== 'all') labels.push($('download').selectedOptions[0].textContent);
    if ($('tradition').value !== 'all') labels.push($('tradition').selectedOptions[0].textContent);
    if ($('favorites-only').checked) labels.push('我的收藏');
    $('active-selection').textContent = labels.join(' · ') + (allBrowse ? ' · 每类先显示 4 项，点分类看全部与下载入口' : '');
    $('show-more-results').hidden = allBrowse || !term || visible.length >= rows.length;
    $('show-more-results').textContent = '显示更多搜索结果（已显示 ' + visible.length + '／' + rows.length + '）';
    if (mode) syncURL(mode);
  }
  function change(mode = 'push') { clearTimeout(timer); if (composing) return; state.limit = 60; render(mode); }
  function reset() { $('directory-search').value = ''; for (const k of keys) $(k).value = 'all'; $('favorites-only').checked = false; change(); $('directory-search').focus(); }
  $('filters').addEventListener('submit', e => { e.preventDefault(); change(); remember(); });
  $('directory-search').addEventListener('compositionstart', () => { composing = true; clearTimeout(timer); });
  $('directory-search').addEventListener('compositionend', () => { composing = false; change('replace'); });
  $('directory-search').addEventListener('input', () => { clearTimeout(timer); if (!composing) timer = setTimeout(() => change('replace'), 140); });
  for (const k of keys) $(k).addEventListener('change', () => change());
  $('favorites-only').addEventListener('change', () => change()); $('reset').addEventListener('click', reset);
  for (const b of document.querySelectorAll('[data-select-category]')) b.addEventListener('click', () => selectCategory(b.dataset.selectCategory));
  for (const b of document.querySelectorAll('[data-select-scope]')) b.addEventListener('click', () => { $('scope').value = b.dataset.selectScope; $('category').value = 'all'; $('tradition').value = 'all'; change(); });
  $('show-more-results').addEventListener('click', () => { const seen = new Set([...document.querySelectorAll('[data-id]')].map(e => e.dataset.id)); state.limit += 60; render('replace'); document.querySelectorAll('[data-id]').forEach(e => { if (!seen.has(e.dataset.id) && !state.focusedNew) { e.querySelector('h3 a')?.focus(); state.focusedNew = true; } }); state.focusedNew = false; });
  window.addEventListener('popstate', () => { clearTimeout(timer); restore(); render(); });
  document.addEventListener('keydown', e => { if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !document.activeElement.isContentEditable && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); $('directory-search').focus(); } if (e.key === 'Escape' && document.activeElement === $('directory-search')) { $('directory-search').value = ''; change(); } });
  $('clear-history').addEventListener('click', () => { state.history = []; persist(historyKey, []); historyRender(); $('search-hint').textContent = '已清除本机搜索历史。'; });
  $('export-favorites').addEventListener('click', () => { const blob = new Blob([JSON.stringify({schema: 'messiah-favorites-v1', ids: [...state.favorites]}, null, 2)], {type: 'application/json'}), u = URL.createObjectURL(blob), a = el('a'); a.href = u; a.download = '神学资源收藏.json'; a.click(); setTimeout(() => URL.revokeObjectURL(u), 1000); });
  $('import-favorites').addEventListener('change', async e => {
    try {
      const f = e.target.files[0]; if (!f) return; if (!state.ready) throw Error('目录尚未加载'); if (f.size > 1000000) throw Error('文件超过 1 MB');
      const j = JSON.parse(await f.text()); if (!j || j.schema !== 'messiah-favorites-v1' || !Array.isArray(j.ids) || j.ids.length > 10000) throw Error('不是本站收藏文件');
      const known = new Set(state.resources.map(x => x.id)), good = [...new Set(j.ids.filter(x => typeof x === 'string' && known.has(x)))];
      good.forEach(x => state.favorites.add(x)); persist('messiah-favorites-v1', [...state.favorites]); render(); $('search-hint').textContent = '已导入 ' + good.length + ' 个有效收藏；未识别编号已跳过。';
    } catch (error) { $('search-hint').textContent = '未导入：' + error.message; } finally { e.target.value = ''; }
  });
  window.addEventListener('storage', e => {
    if (e.key === historyKey || e.key === null) { try { const h = JSON.parse(e.key === null ? '[]' : e.newValue || '[]'); state.history = Array.isArray(h) ? h.filter(x => typeof x === 'string' && x.length <= 240).slice(0, 8) : []; } catch { state.history = []; } historyRender(); }
    if (e.key !== null && e.key !== 'messiah-favorites-v1') return;
    try { const ids = JSON.parse(e.newValue || '[]'); state.favorites = new Set(Array.isArray(ids) ? ids.filter(x => typeof x === 'string' && state.resources.some(r => r.id === x)) : []); } catch { state.favorites = new Set(); } render();
  });
  if (matchMedia('(max-width: 850px)').matches) $('category-menu').open = false;
  restore(); historyRender();
  Promise.all([SiteRuntime.json('/data/resources.json'), SiteRuntime.json('/data/labels.json')]).then(([data, labels]) => {
    if (!Array.isArray(data.resources) || !labels.categories || !labels.languages || !Array.isArray(labels.category_groups)) throw Error('目录结构不符');
    const seen = new Set();
    for (const r of data.resources) { if (!r || typeof r.id !== 'string' || seen.has(r.id) || typeof r.name_zh !== 'string' || typeof r.description !== 'string' || !['zh', 'foreign'].includes(r.language_group) || !labels.categories[r.category]) throw Error('条目不完整或编号重复'); seen.add(r.id); }
    state.favorites = new Set([...state.favorites].filter(x => seen.has(x))); state.labels = labels; state.resources = data.resources; state.resourceOrder = new Map(data.resources.map((r,i) => [r.id,i])); state.items = data.resources.map(SiteSearch.prepare); state.ready = true; render();
    const list = el('ul'); for (const p of data.pending || []) { const title = p.name_zh || p.name || p.domain || p.url || p.id || '待核实'; const address = p.domain || p.source_url || p.url || ''; const label = title + (address && !title.includes(address) ? '（' + address + '）' : ''); list.append(el('li', label + '：' + (p.reason || p.note || p.status || '待重新核实') + '［记录日期：' + (p.last_checked || '未注明') + '；不代表本轮已重新验证］')); } $('pending').append(list);
    if (!storeOK) $('search-hint').textContent = '本机存储不可用；搜索仍可用，收藏与历史不能跨页保存。';
  }).catch(error => { $('directory-error').hidden = false; $('directory-error').textContent = '目录未加载：' + error.message + '。可使用下方完整静态清单。'; $('search-status').textContent = '目录加载失败，不代表没有资源。'; });
}());
