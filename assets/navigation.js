/* Progressive enhancement: the complete, source-backed catalogue works without JavaScript. */
(function () {
  'use strict';
  var input = document.getElementById('directory-search');
  if (!input) return;
  var cards = Array.from(document.querySelectorAll('[data-resource]'));
  var scopes = Array.from(document.querySelectorAll('[data-scope]'));
  var categories = Array.from(document.querySelectorAll('[data-category-filter]'));
  var language = document.getElementById('language-filter');
  var tradition = document.getElementById('tradition-filter');
  var download = document.getElementById('download-filter');
  var fileTypes = ['audio', 'ebook', 'document', 'video', 'data', 'software', 'github'];
  var categorySelect = document.getElementById('category-select');
  var clear = document.getElementById('clear-search');
  var pagination = document.getElementById('directory-pagination');
  var more = document.getElementById('load-more');
  var counter = document.getElementById('result-count');
  var shown = document.getElementById('shown-count');
  var empty = document.getElementById('directory-empty');
  var summary = document.getElementById('active-filter-summary');
  var resetAll = document.getElementById('reset-all-filters');
  var PAGE_SIZE = 18;
  var scope = 'all';
  var category = 'all';
  var limit = PAGE_SIZE;
  var timer;
  var scopeLabels = { all: '全部资源', reformed: '改革宗资源', christian: '其他基督教资源', tools: '原文、文献与工具' };
  Array.from(categorySelect.options).forEach(function (option) { option.dataset.label = option.textContent.replace(/（\d+）$/, ''); });

  function normalize(value) { return String(value || '').normalize('NFKC').toLocaleLowerCase().trim(); }
  cards.forEach(function (card) { card.searchIndex = normalize(card.getAttribute('data-search')); });
  function allowed(select, value) { return Array.from(select.options).some(function (option) { return option.value === value; }); }
  function selectedLabel(select) { return select.options[select.selectedIndex].textContent.replace(/（\d+）$/, ''); }
  function restore() {
    var params = new URLSearchParams(window.location.search);
    input.value = (params.get('q') || '').slice(0, 240);
    scope = Object.prototype.hasOwnProperty.call(scopeLabels, params.get('scope')) ? params.get('scope') : 'all';
    category = allowed(categorySelect, params.get('category')) ? params.get('category') : 'all';
    language.value = allowed(language, params.get('lang')) ? params.get('lang') : 'all';
    tradition.value = allowed(tradition, params.get('tradition')) ? params.get('tradition') : 'all';
    download.value = allowed(download, params.get('download')) ? params.get('download') : 'all';
    if (scope === 'tools') tradition.value = 'all';
    var requested = Number(params.get('shown'));
    limit = Number.isInteger(requested) && requested > PAGE_SIZE ? Math.min(requested, cards.length) : PAGE_SIZE;
  }
  function syncURL(mode) {
    var params = new URLSearchParams();
    if (input.value.trim()) params.set('q', input.value.trim().slice(0, 240));
    if (scope !== 'all') params.set('scope', scope);
    if (category !== 'all') params.set('category', category);
    if (language.value !== 'all') params.set('lang', language.value);
    if (tradition.value !== 'all') params.set('tradition', tradition.value);
    if (download.value !== 'all') params.set('download', download.value);
    if (limit > PAGE_SIZE) params.set('shown', String(limit));
    var query = params.toString();
    var next = window.location.pathname + (query ? '?' + query : '') + window.location.hash;
    var current = window.location.pathname + window.location.search + window.location.hash;
    if (next === current) return;
    if (mode === 'push') window.history.pushState(null, '', next);
    else window.history.replaceState(null, '', next);
  }
  function render(mode) {
    var terms = normalize(input.value).split(/\s+/).filter(Boolean);
    var lang = language.value;
    var belief = tradition.value;
    var modeFilter = download.value;
    var base = cards.filter(function (card) {
      var types = card.dataset.downloadTypes.split(' ');
      return (modeFilter === 'all' || (modeFilter === 'any' ? fileTypes.some(function (type) { return types.includes(type); }) : types.includes(modeFilter))) &&
        (scope === 'all' || card.dataset.group === scope) &&
        (lang === 'all' || card.dataset.languages.split(' ').includes(lang)) &&
        (belief === 'all' || card.dataset.traditions.split(' ').includes(belief)) &&
        terms.every(function (term) { return card.searchIndex.includes(term); });
    });
    var results = base.filter(function (card) { return category === 'all' || card.dataset.category === category; });
    var visible = new Set(results.slice(0, limit));
    cards.forEach(function (card) { card.hidden = !visible.has(card); });
    scopes.forEach(function (button) {
      var active = button.dataset.scope === scope;
      button.classList.toggle('is-selected', active);
      button.setAttribute('aria-pressed', String(active));
    });
    categories.forEach(function (button) {
      var key = button.dataset.categoryFilter;
      var active = key === category;
      button.classList.toggle('is-selected', active);
      button.setAttribute('aria-pressed', String(active));
      button.querySelector('[data-category-count]').textContent = key === 'all' ? base.length : base.filter(function (card) { return card.dataset.category === key; }).length;
    });
    Array.from(categorySelect.options).forEach(function (option) {
      var count = option.value === 'all' ? base.length : base.filter(function (card) { return card.dataset.category === option.value; }).length;
      option.textContent = option.dataset.label + '（' + count + '）';
    });
    categorySelect.value = category;
    tradition.disabled = scope === 'tools';
    var activeFilters = [];
    if (input.value.trim()) activeFilters.push('搜索“' + input.value.trim() + '”');
    if (scope !== 'all') activeFilters.push(scopeLabels[scope]);
    if (category !== 'all') activeFilters.push(selectedLabel(categorySelect));
    if (belief !== 'all') activeFilters.push(selectedLabel(tradition));
    if (lang !== 'all') activeFilters.push(selectedLabel(language));
    if (modeFilter !== 'all') activeFilters.push(selectedLabel(download));
    summary.textContent = activeFilters.length ? '当前筛选：' + activeFilters.join(' · ') : '当前显示全部资源';
    resetAll.disabled = activeFilters.length === 0 && limit === PAGE_SIZE;
    counter.textContent = selectedLabel(categorySelect) + ' · ' + results.length + ' 个资源入口';
    clear.hidden = !input.value;
    empty.hidden = results.length !== 0;
    pagination.hidden = results.length === 0;
    more.hidden = visible.size >= results.length;
    shown.textContent = '已显示 ' + visible.size + ' / ' + results.length;
    if (mode) syncURL(mode);
  }
  function change(mode) { window.clearTimeout(timer); limit = PAGE_SIZE; render(mode || 'push'); }
  function resetFilters() {
    input.value = ''; scope = category = 'all'; language.value = tradition.value = download.value = 'all';
    change('push'); input.focus();
  }
  document.querySelector('.directory-search').addEventListener('submit', function (event) { event.preventDefault(); change('push'); });
  input.addEventListener('input', function () { window.clearTimeout(timer); timer = window.setTimeout(function () { change('replace'); }, 150); });
  clear.addEventListener('click', function () { input.value = ''; change('push'); input.focus(); });
  scopes.forEach(function (button) { button.addEventListener('click', function () {
    scope = button.dataset.scope; category = 'all'; tradition.value = 'all';
    change('push');
  }); });
  categories.forEach(function (button) { button.addEventListener('click', function () { category = button.dataset.categoryFilter; change('push'); }); });
  categorySelect.addEventListener('change', function () { category = categorySelect.value; change('push'); });
  language.addEventListener('change', function () { change('push'); });
  download.addEventListener('change', function () { change('push'); });
  tradition.addEventListener('change', function () {
    if (tradition.value !== 'all') {
      scope = 'all';
      category = 'all';
    }
    change('push');
  });
  resetAll.addEventListener('click', resetFilters);
  document.getElementById('reset-filters').addEventListener('click', resetFilters);
  more.addEventListener('click', function () {
    var previous = new Set(cards.filter(function (card) { return !card.hidden; }));
    limit += PAGE_SIZE; render('replace');
    var firstNew = cards.find(function (card) { return !card.hidden && !previous.has(card); });
    if (firstNew) firstNew.querySelector('.resource-link').focus();
  });
  window.addEventListener('popstate', function () { window.clearTimeout(timer); restore(); render(false); });
  restore(); render(false);
  document.documentElement.classList.add('directory-ready');
}());
