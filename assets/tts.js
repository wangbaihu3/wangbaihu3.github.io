/* Bounded speech queue. Pause resumes from the start of the current short segment. */
(function (root) {
  'use strict';
  class ReaderSpeech {
    constructor(synth, Utterance, options = {}) {
      Object.assign(this, {synth, Utterance, items:[], index:0, generation:0, state:'idle', voice:null,
        rate:1, volume:1, allowRemote:false, sleep:null, watchdog:null, phraseDelay:null, current:null});
      this.onState = options.onState || (() => {});
      this.onSegment = options.onSegment || (() => {});
    }
    notify(message) { this.onState({state:this.state, index:this.index, total:this.items.length, message}); }
    cancelCurrent() {
      this.generation++; clearTimeout(this.watchdog); this.watchdog = null; clearTimeout(this.phraseDelay); this.phraseDelay = null; this.current = null;
      this.synth.cancel();
    }
    stop() { this.cancelCurrent(); clearTimeout(this.sleep); this.sleep = null; this.state = 'idle'; this.notify('已停止'); }
    clear() { this.stop(); this.items = []; this.index = 0; this.notify('没有可朗读文字'); }
    setItems(items, start = 0) {
      this.clear(); this.items = items.filter(x => x && typeof x.text === 'string' && x.text.trim());
      this.index = this.items.length && Number.isInteger(start) ? Math.max(0, Math.min(start, this.items.length - 1)) : 0;
      this.notify(this.items.length ? '已准备 ' + this.items.length + ' 段' : '没有可朗读文字');
    }
    setVoice(voice) { this.voice = voice; }
    permitted() {
      if (!this.voice) { this.notify('没有选择可用声音；请检查设备语音设置'); return false; }
      if (this.voice.localService !== true && !this.allowRemote) { this.notify('该声音未确认是本机服务，尚未获得联网许可'); return false; }
      return true;
    }
    fail(error) {
      this.cancelCurrent(); clearTimeout(this.sleep); this.sleep = null; this.state = 'error';
      this.notify('语音失败：' + error + '。当前段未标记完成，可手动重试。');
    }
    play(index = this.index) {
      if (!this.items.length) { this.notify('没有可朗读文字'); return false; }
      if (!this.permitted()) return false;
      this.cancelCurrent();
      this.index = Number.isInteger(index) ? Math.max(0, Math.min(index, this.items.length - 1)) : 0;
      this.state = 'playing';
      // cancel() does not guarantee a cleared platform paused flag.
      try { this.synth.resume(); this.say(this.generation); return this.state !== 'error'; }
      catch (error) { this.fail(error.message || '平台调用异常'); return false; }
    }
    say(generation) {
      if (generation !== this.generation || this.state !== 'playing') return;
      if (this.index >= this.items.length) {
        this.state = 'ended'; this.current = null; clearTimeout(this.sleep); this.sleep = null;
        this.notify('本次朗读完成'); return;
      }
      if (!this.permitted()) { this.fail('声音许可已改变'); return; }
      const item = this.items[this.index], utterance = new this.Utterance(item.text);
      this.current = utterance;
      utterance.voice = this.voice; utterance.lang = this.voice.lang;
      utterance.rate = Number.isFinite(this.rate) ? Math.max(0.5, Math.min(this.rate, 2)) : 1;
      utterance.volume = Number.isFinite(this.volume) ? Math.max(0, Math.min(this.volume, 1)) : 1;
      const current = () => generation === this.generation && this.current === utterance && this.state === 'playing';
      const watchdog = (ms, message) => {
        clearTimeout(this.watchdog);
        this.watchdog = setTimeout(() => { if (current()) this.fail(message); }, ms);
      };
      utterance.onstart = () => {
        if (!current()) return;
        this.onSegment(item, this.index); this.notify('正在朗读');
        watchdog(Math.max(60000, item.text.length * 1500 / utterance.rate), '语音已开始但长时间没有完成通知；未自动跳段');
      };
      utterance.onend = () => {
        if (!current()) return;
        clearTimeout(this.watchdog); this.current = null; this.index++;
        const delay = Math.max(0, Math.min(800, Number(item.pauseAfterMs) || 0));
        if (delay) this.phraseDelay = setTimeout(() => { this.phraseDelay = null; this.say(generation); }, delay);
        else this.say(generation);
      };
      utterance.onerror = event => { if (current()) this.fail(event.error || '未知错误'); };
      watchdog(15000, '服务未开始响应，请选择另一可用声音');
      this.notify('等待语音服务开始');
      try { this.synth.speak(utterance); } catch (error) { this.fail(error.message || '语音调用异常'); }
    }
    pauseResume() {
      if (this.state === 'playing') {
        // Cancel/replay is portable across engines which implement pause as cancellation.
        this.cancelCurrent(); this.state = 'paused';
        this.notify('已暂停；继续时会从当前短段开头重读，不跳过文字');
      } else if (this.state === 'paused') this.play(this.index);
    }
    move(delta) { if (this.items.length) this.play(Math.max(0, Math.min(this.items.length - 1, this.index + delta))); }
    setTimer(minutes) {
      clearTimeout(this.sleep); this.sleep = null;
      if (Number.isFinite(minutes) && minutes > 0 && minutes <= 120) this.sleep = setTimeout(() => this.stop(), minutes * 60000);
    }
  }
  // Streaming iteration avoids materialising a document-sized grapheme array.
  function fallbackGraphemes(text) {
    const groups=[];let join=false, regional=0;
    for(const char of Array.from(text)) {
      const cp=char.codePointAt(0),isRegional=cp>=0x1f1e6&&cp<=0x1f1ff;
      const extend=/[\p{Mark}\uFE0E\uFE0F\u200D]/u.test(char)||(cp>=0x1f3fb&&cp<=0x1f3ff);
      if(groups.length&&(join||extend||(isRegional&&regional%2===1)))groups[groups.length-1]+=char;
      else groups.push(char);
      regional=isRegional?regional+1:0;join=char==='\u200D';
    }
    return groups;
  }
  function split(text, max=160) {
    if(!Number.isInteger(max)||max<1||max>2000)throw Error('朗读分段长度无效');
    const value=String(text),result=[];let chunk='',count=0;
    const iterable=typeof Intl.Segmenter==='function'?new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(value):fallbackGraphemes(value);
    for(const part of iterable){const g=typeof part==='string'?part:part.segment;chunk+=g;count++;
      if(count>=max||(/[。！？!?\n]/u.test(g)&&count>=20)){result.push(chunk);chunk='';count=0;}}
    if(chunk)result.push(chunk);return result;
  }
  // Speech-only transformation: never change the visible Bible, source data, or footnotes.
  // Text inside parentheses is preserved; the bracket glyphs themselves are never voiced.
  // Pauses are scheduled *between* punctuation-free utterances for natural phrasing.
  function speechSegments(text, max=160) {
    if (!Number.isInteger(max) || max < 1 || max > 2000) throw Error('朗读分段长度无效');
    const value = String(text ?? '');
    const iterable = typeof Intl.Segmenter === 'function'
      ? new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(value)
      : fallbackGraphemes(value);
    const rows = [];
    let chunk = '', count = 0;
    function flush(pauseAfterMs=0) {
      const clean = chunk.trim();
      if (clean) rows.push({text:clean, pauseAfterMs});
      else if (rows.length && pauseAfterMs) rows[rows.length-1].pauseAfterMs = Math.max(rows[rows.length-1].pauseAfterMs, pauseAfterMs);
      chunk = ''; count = 0;
    }
    for (const part of iterable) {
      const g = typeof part === 'string' ? part : part.segment;
      if (/[\r\n\u2028\u2029]/u.test(g)) { flush(480); continue; }
      if (/\p{P}|\p{S}/u.test(g)) {
        if (/[。．.!！?？]/u.test(g)) flush(390);
        else if (/[，,、]/u.test(g)) flush(180);
        else if (/[；;：:]/u.test(g)) flush(270);
        else if (/[—–－\-…⋯]/u.test(g)) flush(290);
        // Quotes, parentheses and all remaining punctuation/symbols are silent.
        continue;
      }
      if (/\s/u.test(g)) {
        if (chunk && !chunk.endsWith(' ')) chunk += ' ';
        continue;
      }
      // Keep all original written letters, numbers and combining marks (including accents).
      // Remove emoji, technical symbols, control chars and non-written decorations.
      if (!/[\p{L}\p{N}\p{M}]/u.test(g)) continue;
      chunk += g; count++;
      if (count >= max) flush();
    }
    flush();
    return rows;
  }
  function mount() {
    const $ = id => document.getElementById(id), panel = $('tts-panel');
    if (!panel) return null;
    if (!('speechSynthesis' in root) || !('SpeechSynthesisUtterance' in root)) {
      $('tts-status').textContent = '当前浏览器没有朗读 API；阅读不受影响。';
      panel.querySelectorAll('button,select,input').forEach(e => { e.disabled = true; }); return null;
    }
    let provider = () => [], context = () => location.pathname, highlight = null, preparation=0, flowHooks=null, sleepDeadline=null;
    const clearHighlight = () => { highlight?.classList.remove('current-audio'); highlight = null; };
    const engine = new ReaderSpeech(root.speechSynthesis, root.SpeechSynthesisUtterance, {
      onState(state) {
        $('tts-status').textContent = state.message + (state.total ? '（' + Math.min(state.index + 1, state.total) + '／' + state.total + '）' : '');
        if (['idle','ended','error'].includes(state.state)) clearHighlight();
        if (state.state === 'ended' && flowHooks?.onChapterEnd) {
          const expected=preparation;
          Promise.resolve().then(() => { if (expected === preparation && engine.state === 'ended') flowHooks.onChapterEnd(); });
        }
        if (state.state === 'error') flowHooks?.onError?.(state.message);
        $('tts-pause').disabled = !['playing','paused'].includes(state.state);
      },
      onSegment(item, index) {
        clearHighlight(); highlight = item.element || null; highlight?.classList.add('current-audio');
        try { if (item.persist !== false) localStorage.setItem('messiah-tts-position', JSON.stringify({schema:4, context:context(), index, id:item.id, saved:Date.now()})); } catch {}
      }
    });
    // Consent is per page session; do not inherit restored checkbox state as a new authorization.
    $('tts-remote').checked = false;
    const voiceSelect = $('tts-voice'), providerSelect = $('tts-provider');
    let actualVoices = [], availableOptions = new Map();
    function providerName(voice) {
      const name = String(voice.name || '') + ' ' + String(voice.voiceURI || '');
      return /microsoft/i.test(name) ? 'microsoft' : /google/i.test(name) ? 'google' : 'other';
    }
    const providerLabels = {microsoft:'微软 Microsoft', google:'谷歌 Google', other:'其他／系统声音'};
    const voiceKey = voice => JSON.stringify([voice.voiceURI || '', voice.lang || '', voice.name || '', voice.localService === true]);
    function selectActualVoice() {
      const voice = availableOptions.get(voiceSelect.value);
      engine.setVoice(voice && (voice.localService === true || $('tts-remote').checked) ? voice : null);
    }
    function voices() {
      const old = voiceSelect.value, previous = engine.voice;
      const unique = new Map();
      for (const v of root.speechSynthesis.getVoices()) unique.set(voiceKey(v), v);
      actualVoices = [...unique.values()]; availableOptions = new Map();
      const filter = providerSelect ? providerSelect.value : 'all';
      const counts = {microsoft:0,google:0,other:0}; for (const v of actualVoices) counts[providerName(v)]++;
      if (providerSelect) for (const o of providerSelect.options) o.textContent = o.value === 'all' ? '全部实际声音（' + actualVoices.length + '）' : providerLabels[o.value] + '（' + (counts[o.value] || 0) + '）';
      voiceSelect.replaceChildren();
      const placeholder = document.createElement('option'); placeholder.value = ''; placeholder.textContent = '请选择一个当前浏览器提供的声音'; voiceSelect.append(placeholder);
      const list = actualVoices.filter(v => filter === 'all' || providerName(v) === filter)
        .sort((a,b) => Number(/^zh/i.test(b.lang)) - Number(/^zh/i.test(a.lang)) || Number(b.localService === true) - Number(a.localService === true) || String(a.name).localeCompare(String(b.name)));
      for (const providerID of ['microsoft','google','other']) {
        const values = list.filter(v => providerName(v) === providerID); if (!values.length) continue;
        const group = document.createElement('optgroup'); group.label = providerLabels[providerID];
        for (const voice of values) {
          const o = document.createElement('option'), key = voiceKey(voice); o.value = key;
          const local = voice.localService === true, allowed = local || $('tts-remote').checked;
          o.textContent = voice.name + ' · ' + voice.lang + ' · ' + (local ? '本机' : allowed ? '联网' : '联网：需先勾选许可');
          o.disabled = !allowed; group.append(o); availableOptions.set(key, voice);
        }
        voiceSelect.append(group);
      }
      const eligible = list.filter(v => v.localService === true || $('tts-remote').checked);
      const selected = eligible.find(v => voiceKey(v) === old) || eligible.find(v => /^zh/i.test(v.lang)) || eligible[0];
      voiceSelect.value = selected ? voiceKey(selected) : '';
      if (previous && (!selected || voiceKey(previous) !== voiceKey(selected))) { ++preparation; engine.stop(); }
      selectActualVoice();
      if ($('tts-voice-summary')) {
        $('tts-voice-summary').textContent = '本浏览器返回 ' + actualVoices.length + ' 个声音：微软 ' + counts.microsoft + '、谷歌 ' + counts.google + '、其他 ' + counts.other + '。' +
          (!list.length ? '当前来源没有可用声音；不会用其他厂商声音冒充。可刷新或换用已安装对应声音的浏览器。' :
          !eligible.length ? '已列出联网声音；先明确允许联网语音，才能选择播放。' : '当前来源可选 ' + eligible.length + ' 个；联网声音未经许可保持禁用。') +
          ' 厂商按浏览器返回的名称识别；不是本站另外接入云端 API。';
      }
    }
    voices(); root.speechSynthesis.addEventListener?.('voiceschanged', voices);
    voiceSelect.addEventListener('change', () => { ++preparation; engine.stop(); flowHooks?.onStop?.(); selectActualVoice(); });
    if (providerSelect) providerSelect.addEventListener('change', () => { ++preparation; engine.stop(); engine.setVoice(null); voiceSelect.value = ''; flowHooks?.onStop?.(); voices(); });
    $('tts-refresh')?.addEventListener('click', voices);
    $('tts-remote').addEventListener('change', () => { ++preparation; engine.stop(); engine.allowRemote = $('tts-remote').checked; flowHooks?.onStop?.(); voices(); });
    $('tts-rate').addEventListener('input', () => { engine.rate = Number($('tts-rate').value); $('tts-rate-value').textContent = engine.rate.toFixed(1); });
    $('tts-volume').addEventListener('input', () => { engine.volume = Number($('tts-volume').value); });
    $('tts-timer').addEventListener('change', () => { const m=Number($('tts-timer').value); sleepDeadline=m>0?Date.now()+m*60000:null; engine.setTimer(m); });
    function items() { return provider().flatMap((item, p) => speechSegments(item.text).map((seg, i) => ({...item, ...seg, id:(item.id || 'paragraph-' + p) + '-segment-' + i}))).filter(x => x.text.trim()); }
    async function prepare() {
      const token=++preparation,rows=[],source=provider(); engine.stop();
      $('tts-status').textContent='正在准备朗读短段……';
      for(let p=0;p<source.length;p++){
        if(token!==preparation)return null;
        const item=source[p];
        if(typeof item.text!=='string')continue;
        // Split extremely long local paragraphs in bounded windows, without truncation.
        let segmentIndex=0,offset=0;
        while(offset<item.text.length){
          let end=Math.min(offset+8000,item.text.length);
          if(end<item.text.length){
            const code=item.text.charCodeAt(end-1);if(code>=0xD800&&code<=0xDBFF)end--;
            while(end<item.text.length&&/[\p{Mark}\uFE0E\uFE0F\u200D]/u.test(item.text[end]))end++;
            if(item.text[end-1]==='\u200D')end=Math.min(item.text.length,end+2);
          }
          for(const seg of speechSegments(item.text.slice(offset,end))){if(seg.text.trim())rows.push({...item, text:seg.text, pauseAfterMs:seg.pauseAfterMs, id:(item.id||'paragraph-'+p)+'-segment-'+segmentIndex});segmentIndex++;}
          offset=end;
          if(rows.length>30000){$('tts-status').textContent='朗读短段超过 30000；请把文稿分章后再读，未截断后继续朗读。';return null;}
          if(offset<item.text.length){await new Promise(r=>setTimeout(r,0));if(token!==preparation)return null;}
        }
        if (rows.length) rows[rows.length-1].pauseAfterMs=Math.max(rows[rows.length-1].pauseAfterMs||0,250);
        if(p%32===0){await new Promise(r=>setTimeout(r,0));if(token!==preparation)return null;}
      }
      return token===preparation?rows:null;
    }
    function begin(index, rows, continuation=false) {
      engine.setItems(rows,index);
      if (!continuation) {
        const m=Number($('tts-timer').value);
        sleepDeadline=Number.isFinite(m)&&m>0?Date.now()+m*60000:null;
      }
      if (sleepDeadline !== null && Date.now() >= sleepDeadline) {
        engine.stop(); flowHooks?.onStop?.(); $('tts-status').textContent='达到定时停止时间，未继续下一章'; return false;
      }
      const ok=engine.play(index);
      if(ok && sleepDeadline!==null) engine.setTimer((sleepDeadline-Date.now())/60000);
      return ok;
    }
    async function playCurrent(continuation=false) {
      try {
        const rows=await prepare();
        if(!rows || !rows.length) {
          if (rows) $('tts-status').textContent='本章没有可以朗读的正文；未跳过本章';
          return false;
        }
        return begin(0,rows,continuation);
      } catch(error) {
        engine.clear(); $('tts-status').textContent='无法准备朗读：'+error.message;
        flowHooks?.onError?.(error.message); return false;
      }
    }
    $('tts-play').addEventListener('click', async () => {
      try {
        if (flowHooks?.beforeStart && await flowHooks.beforeStart({resume:false}) === false) return;
        await playCurrent(false);
      } catch(error) { engine.clear();$('tts-status').textContent='无法开始朗读：'+error.message;flowHooks?.onError?.(error.message); }
    });
    $('tts-pause').addEventListener('click', () => engine.pauseResume());
    $('tts-stop').addEventListener('click', () => {++preparation;sleepDeadline=null;engine.stop();flowHooks?.onStop?.();});
    $('tts-prev').addEventListener('click',()=>{++preparation;engine.move(-1);if(engine.state==='playing')engine.setTimer(Number($('tts-timer').value));});
    $('tts-next').addEventListener('click',()=>{++preparation;engine.move(1);if(engine.state==='playing')engine.setTimer(Number($('tts-timer').value));});
    $('tts-restore').addEventListener('click', async () => {
      let saved; try { saved = JSON.parse(localStorage.getItem('messiah-tts-position') || 'null'); } catch {}
      try { if (flowHooks?.beforeStart && await flowHooks.beforeStart({resume:true,saved}) === false) return; }
      catch(e) { $('tts-status').textContent='恢复定位失败：'+e.message;return; }
      let rows;try{rows=await prepare();}catch(e){$('tts-status').textContent='朗读准备失败：'+e.message;return;}if(!rows)return;
      if (!saved || saved.schema !== 4 || saved.context !== context()) { $('tts-status').textContent = '没有与当前版本、章节和朗读模式一致的听读记录。'; return; }
      const index = rows.findIndex(item => item.persist !== false && item.id === saved.id);
      if (index < 0) { $('tts-status').textContent = '保存的段落已不在当前文稿中，未按旧序号猜测位置。'; return; }
      begin(index, rows, false);
    });
    engine.rate=Number($('tts-rate').value)||1;engine.volume=Number($('tts-volume').value);
    window.addEventListener('storage',event=>{if(event.key===null||event.key==='messiah-tts-position'){$('tts-status').textContent='本机听读记录已在其他页面更新或清除。';}});
    window.addEventListener('pagehide', () => {++preparation;engine.clear();flowHooks?.onStop?.();});
    return {
      engine,
      setProvider(fn, ctx) { ++preparation; engine.clear(); provider = fn; if (ctx) context = ctx; },
      setFlowHooks(hooks) { flowHooks = hooks || null; },
      playCurrent: () => playCurrent(true),
      stop:() => { ++preparation; sleepDeadline=null; engine.stop(); flowHooks?.onStop?.(); },
      reset:() => { ++preparation; engine.clear(); flowHooks?.onStop?.(); }
    };
  }
  root.ReaderSpeech = ReaderSpeech; root.ReaderSpeechSplit = split; root.ReaderSpeechSegments = speechSegments; root.mountReaderSpeech = mount;
  if (typeof module === 'object' && module.exports) module.exports = {ReaderSpeech, split, speechSegments, fallbackGraphemes};
})(typeof window !== 'undefined' ? window : globalThis);
