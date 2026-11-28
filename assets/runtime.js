/* Same-origin, bounded data loading with release and SHA-256 consistency checks. */
(function (root) {
  'use strict';
  const BUILD = '20261128-r31-core-reading-auth';
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

// SHA-256 in plain JavaScript for ordinary HTTP origins where crypto.subtle is unavailable.
// This detects accidental mixed-version files, but cannot authenticate HTTP delivery.
function portableSHA256(input) {
  const K = new Uint32Array([
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
  ]);
  const H = new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
  const length=input.length, padded=Math.ceil((length+9)/64)*64;
  const data=new Uint8Array(padded), words=new Uint32Array(64);data.set(input);data[length]=128;
  const bits=length*8;
  for(let i=0;i<8;i++) data[padded-1-i]=Math.floor(bits/Math.pow(2,i*8))&255;
  function rotr(v,n){return(v>>>n)|(v<<(32-n));}
  for(let offset=0;offset<padded;offset+=64){
    for(let j=0;j<16;j++){const k=offset+j*4;words[j]=((data[k]<<24)|(data[k+1]<<16)|(data[k+2]<<8)|data[k+3])>>>0;}
    for(let j=16;j<64;j++){
      const x=words[j-15],y=words[j-2];
      const s0=rotr(x,7)^rotr(x,18)^(x>>>3),s1=rotr(y,17)^rotr(y,19)^(y>>>10);
      words[j]=(words[j-16]+s0+words[j-7]+s1)>>>0;
    }
    let [a,b,c,d,e,f,g,h]=H;
    for(let j=0;j<64;j++){
      const s1=rotr(e,6)^rotr(e,11)^rotr(e,25),ch=(e&f)^(~e&g),t1=(h+s1+ch+K[j]+words[j])>>>0;
      const s0=rotr(a,2)^rotr(a,13)^rotr(a,22),maj=(a&b)^(a&c)^(b&c),t2=(s0+maj)>>>0;
      h=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;
    }
    H[0]=(H[0]+a)>>>0;H[1]=(H[1]+b)>>>0;H[2]=(H[2]+c)>>>0;H[3]=(H[3]+d)>>>0;
    H[4]=(H[4]+e)>>>0;H[5]=(H[5]+f)>>>0;H[6]=(H[6]+g)>>>0;H[7]=(H[7]+h)>>>0;
  }
  return Array.from(H,v=>v.toString(16).padStart(8,'0')).join('');
}
async function digest(bytes) {
  if(root.crypto?.subtle) {
    const hash=await root.crypto.subtle.digest('SHA-256',bytes);
    return Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
  }
  return portableSHA256(bytes instanceof Uint8Array?bytes:new Uint8Array(bytes));
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
  root.SiteRuntime = {build:BUILD,json,release,verifyFiles,decodeFragment,digest};
})(typeof window !== 'undefined' ? window : globalThis);
