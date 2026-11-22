/* Same-origin, bounded data loading with release and SHA-256 consistency checks. */
(function (root) {
  'use strict';
  const BUILD = '20261123-r4-v181-natural-tts';
  const BASE = root.location ? root.location.href : 'https://https.ng/';
  const ORIGIN = new URL(BASE).origin;
  let releasePromise = null;
  function address(path) {
    const u = new URL(path, BASE);
    if (!['http:', 'https:'].includes(u.protocol) || u.origin !== ORIGIN || u.username || u.password)
      throw Error('只允许读取本站的 HTTP/HTTPS 发布文件；请通过网站地址访问，不要双击本地 HTML。');
    u.searchParams.set('v', BUILD); return u;
  }
  async function raw(path, options = {}) {
    const u = address(path), controller = new AbortController(), signal = options.signal;
    const ms = Number.isFinite(options.timeout) ? Math.min(60000, Math.max(1, options.timeout)) : 30000;
    const maxBytes = options.maxBytes || 12 * 1024 * 1024;
    const abort = () => controller.abort();
    if (signal) { if (signal.aborted) abort(); else signal.addEventListener('abort', abort, {once:true}); }
    const timer = setTimeout(abort, ms);
    try {
      const response = await fetch(u.href, {signal:controller.signal, credentials:'omit', redirect:'error', cache:'no-cache', referrerPolicy:'no-referrer'});
      if (!response.ok) throw Error('HTTP ' + response.status + '：' + u.pathname);
      if (response.url && new URL(response.url).origin !== ORIGIN) throw Error('文件被重定向至外站，未读取');
      const type = (response.headers.get('content-type') || '').toLowerCase();
      if (options.json && !/(?:\/json|\+json)(?:;|$)/.test(type)) throw Error('服务器未返回 JSON 数据：' + u.pathname);
      if (Number(response.headers.get('content-length')) > maxBytes) throw Error('响应超过容量上限');
      let bytes;
      if (response.body && typeof response.body.getReader === 'function') {
        const reader = response.body.getReader(), chunks = []; let count = 0;
        try {
          while (true) {
            const part = await reader.read(); if (part.done) break;
            count += part.value.length;
            if (count > maxBytes) { await reader.cancel(); throw Error('响应超过容量上限'); }
            chunks.push(part.value);
          }
          bytes = new Uint8Array(count); let offset = 0;
          for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
        } finally { reader.releaseLock(); }
      } else bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length > maxBytes) throw Error('响应超过容量上限');
      if (controller.signal.aborted) throw Object.assign(Error(), {name:'AbortError'});
      return bytes;
    } catch (error) {
      if (controller.signal.aborted || error.name === 'AbortError') throw Error(signal?.aborted ? '请求已取消' : '请求超时；请重试，不会改用其他来源');
      throw error;
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
  }
  function decode(bytes) { return new TextDecoder('utf-8', {fatal:true}).decode(bytes); }
  async function digest(bytes) {
    if (!root.crypto?.subtle) throw Error('当前环境不能核对 SHA-256；请使用 HTTPS 或可信本机预览，不读取未经核对的数据库');
    const hash = await root.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
  }
  function release() {
    if (!releasePromise) releasePromise = raw('/version.json', {json:true,maxBytes:200000}).then(bytes => {
      const value = JSON.parse(decode(bytes));
      if (value.schema !== 'messiah-release-v1' || value.build !== BUILD || !value.files || typeof value.files !== 'object')
        throw Error('页面与服务器发布版本不一致；可能正在更新或未上传完整。请在更新完成后刷新。');
      return value;
    }).catch(error => { releasePromise = null; throw error; });
    return releasePromise;
  }
  async function checked(path, options = {}) {
    const u = address(path), manifest = await release();
    if (options.signal?.aborted) throw Error('请求已取消');
    const entry = Object.hasOwn(manifest.files, u.pathname.slice(1)) && manifest.files[u.pathname.slice(1)];
    if (!entry || !Number.isSafeInteger(entry.bytes) || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw Error('文件未列入当前发布清单：' + u.pathname);
    const bytes = await raw(u.href, options);
    if (bytes.length !== entry.bytes || await digest(bytes) !== entry.sha256)
      throw Error('文件与当前发布清单不一致：' + u.pathname + '；已停止使用，未混合新旧数据。');
    if (options.signal?.aborted) throw Error('请求已取消');
    return bytes;
  }
  async function json(path, options = {}) { return JSON.parse(decode(await checked(path, {...options, json:true}))); }
  async function verifyFiles(paths, onProgress = () => {}, signal) {
    const results = []; let index = 0;
    const workers = Array.from({length:Math.min(3,paths.length)}, async () => {
      while (index < paths.length && !signal?.aborted) {
        const path = paths[index++];
        try { await checked('/' + path.replace(/^\//,''), {signal}); results.push({path,ok:true}); }
        catch (e) { results.push({path,ok:false,error:e.message}); }
        onProgress(results.length,paths.length);
      }
    });
    await Promise.all(workers); return results;
  }
  function decodeFragment(hash) { try { return decodeURIComponent(String(hash || '').replace(/^#/,'')); } catch { return null; } }
  root.SiteRuntime = {build:BUILD,json,release,verifyFiles,decodeFragment};
})(typeof window !== 'undefined' ? window : globalThis);
