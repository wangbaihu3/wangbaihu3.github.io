/* Bounded speech queue with native pause/resume and one continuous sleep deadline. */
(function (root) {
  'use strict';
  class ReaderSpeech {
    constructor(synth, Utterance, options = {}) {
      Object.assign(this, {synth, Utterance, items:[], index:0, generation:0, state:'idle', voice:null,
        rate:1, volume:1, allowRemote:false, sleep:null, watchdog:null, phraseDelay:null, current:null, deferredEnd:null});
      this.onState = options.onState || (() => {});
      this.onSegment = options.onSegment || (() => {});
    }
    notify(message) { this.onState({state:this.state, index:this.index, total:this.items.length, message}); }
    cancelCurrent() {
      this.generation++; clearTimeout(this.watchdog); this.watchdog = null; clearTimeout(this.phraseDelay); this.phraseDelay = null; this.current = null; this.deferredEnd = null;
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
      const same = () => generation === this.generation && this.current === utterance;
      const current = () => same() && this.state === 'playing';
      const watchdog = (ms, message) => {
        clearTimeout(this.watchdog);
        this.watchdog = setTimeout(() => { if (current()) this.fail(message); }, ms);
      };
      utterance.onstart = () => {
        if (!current()) return;
        this.onSegment(item, this.index); this.notify('正在朗读');
        watchdog(Math.max(60000, item.text.length * 1500 / utterance.rate), '语音已开始但长时间没有完成通知；未自动跳段');
      };
      const finish = () => {
        if (!current()) return;
        clearTimeout(this.watchdog); this.watchdog = null; this.current = null;
        this.deferredEnd = null; this.index++;
        // 无额外毫秒延时：自然句读由语音引擎在一段中负责。
        this.say(generation);
      };
      utterance.onend = () => {
        if (!same()) return;
        if (this.state === 'paused') { this.deferredEnd = finish; return; }
        finish();
      };
      utterance.onerror = event => { if (same() && ['playing','paused'].includes(this.state)) this.fail(event.error || '未知错误'); };
      watchdog(15000, '服务未开始响应，请选择另一可用声音');
      this.notify('等待语音服务开始');
      try { this.synth.speak(utterance); } catch (error) { this.fail(error.message || '语音调用异常'); }
    }
    pauseResume() {
      if (this.state === 'playing') {
        // 原生 pause/resume 保留当前发音进度，不以 cancel() 打断后重读。
        try { this.state = 'paused'; clearTimeout(this.watchdog); this.watchdog = null; this.synth.pause(); if(this.state==='paused')this.notify('已暂停'); }
        catch (error) { this.fail(error.message || '暂停失败'); }
      } else if (this.state === 'paused') {
        try {
          this.synth.resume(); this.state = 'playing'; this.notify('已继续朗读');
          if (this.deferredEnd) { const complete = this.deferredEnd; this.deferredEnd = null; complete(); }
          else if (this.current) {
            const current = this.current, gen = this.generation;
            this.watchdog = setTimeout(() => { if (gen === this.generation && this.current === current && this.state === 'playing') this.fail('继续后没有收到结束通知'); }, Math.max(60000, current.text.length * 1500));
          }
        } catch (error) { this.fail(error.message || '继续失败'); }
      }
    }
    move(delta) { if (this.items.length) this.play(Math.max(0, Math.min(this.items.length - 1, this.index + delta))); }
    setTimer(minutes) {
      clearTimeout(this.sleep); this.sleep = null;
      if (Number.isFinite(minutes) && minutes > 0 && minutes <= 120) this.sleep = setTimeout(() => {this.stop();this.notify('已到定时停止时间');}, minutes * 60000);
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
  // 保留原有标点、句读和语境；不将每个字或每个逗号交给独立发音请求。
  // 用自然句界选择分段点；极长无标点文字才按安全的字素边界分开。
  function speechSegments(text, max=240) {
    if (!Number.isInteger(max) || max < 24 || max > 2000) throw Error('朗读分段长度无效');
    const value=String(text ?? '').normalize('NFC').replace(/\r\n?/g,'\n');
    const result=[]; let chunk=[], sentence=-1, clause=-1;
    const iterable=typeof Intl.Segmenter==='function'?new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(value):fallbackGraphemes(value);
    function emit(n){const part=chunk.splice(0,n).join('').trim(); if(part)result.push({text:part,pauseAfterMs:0});
      sentence=-1;clause=-1;chunk.forEach((g,i)=>{if(/[。！？!?；;\n]/u.test(g))sentence=i+1;else if(/[，、：,:]/u.test(g))clause=i+1;});}
    for(const item of iterable){const g=typeof item==='string'?item:item.segment;
      // 不把原标点改为空格；不强制插入拼音、字间空格或人工休止。
      chunk.push(g);
      if(/[。！？!?；;\n]/u.test(g))sentence=chunk.length;
      else if(/[，、：,:]/u.test(g))clause=chunk.length;
      // 引号、括号留在前句；选择接近容量上限的自然句界。
      if(chunk.length>max){let cut=sentence>=Math.floor(max*.48)?sentence:clause>=Math.floor(max*.65)?clause:max;
        if(cut>max+1)cut=max;
        while(cut<chunk.length&&/^[。！？!?；;，、：,:”’」』》）)\]】]/u.test(chunk[cut]))cut++;
        emit(cut);}
    }
    if(chunk.length)emit(chunk.length);
    // Avoid a one-character or tiny tail at a length boundary.
    if(result.length>1&&Array.from(result.at(-1).text).length<=8){const tail=result.pop().text;result.at(-1).text+=tail;}
    return result;
  }
  function mount() {
    const $ = id => document.getElementById(id), panel = $('tts-panel');
    if (!panel) return null;
    if (!('speechSynthesis' in root) || !('SpeechSynthesisUtterance' in root)) {
      $('tts-status').textContent = '当前浏览器没有朗读 API；阅读不受影响。';
      panel.querySelectorAll('button,select,input').forEach(e => { e.disabled = true; }); return null;
    }
    let provider = () => [], context = () => location.pathname, highlight = null, preparation=0, command=0, flowHooks=null, sleepDeadline=null;
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
        if (state.message === '已到定时停止时间') {sleepDeadline=null;flowHooks?.onStop?.();}
        $('tts-pause').disabled = !['playing','paused'].includes(state.state);
        $('tts-pause').textContent = state.state==='paused'?'继续朗读':'暂停朗读';
        $('tts-prev').disabled = !state.total;
        $('tts-next').disabled = !state.total;
      },
      onSegment(item, index) {
        clearHighlight(); highlight = item.element || null; highlight?.classList.add('current-audio');
        document.dispatchEvent(new CustomEvent('reader-speech-segment',{detail:{element:highlight,index}}));
        try { if (item.persist !== false) localStorage.setItem('messiah-tts-position', JSON.stringify({schema:5, context:context(), index, id:item.id, saved:Date.now()})); } catch {}
      }
    });
    // 本站公开经文朗读按用户要求默认允许浏览器联网声音；用户可关闭，点击播放后才会调用服务。
    let playbackSettings={remote:true,rate:1,volume:1};
    try{const saved=JSON.parse(localStorage.getItem('messiah-tts-playback-v1')||'null');if(saved&&typeof saved==='object'){
      if(typeof saved.remote==='boolean')playbackSettings.remote=saved.remote;
      if(Number.isFinite(saved.rate)&&saved.rate>=.5&&saved.rate<=2)playbackSettings.rate=saved.rate;
      if(Number.isFinite(saved.volume)&&saved.volume>=0&&saved.volume<=1)playbackSettings.volume=saved.volume;
    }}catch{}
    const savePlaybackSettings=()=>{try{localStorage.setItem('messiah-tts-playback-v1',JSON.stringify({remote:$('tts-remote').checked,rate:Number($('tts-rate').value),volume:Number($('tts-volume').value)}));}catch{}};
    $('tts-remote').checked=playbackSettings.remote;engine.allowRemote=playbackSettings.remote;
    $('tts-rate').value=playbackSettings.rate;$('tts-rate-value').textContent=playbackSettings.rate.toFixed(1);$('tts-volume').value=playbackSettings.volume;
    const voiceSelect = $('tts-voice'), providerSelect = $('tts-provider');
    let actualVoices = [], availableOptions = new Map();
    const policy=root.SpeechVoicePolicy;
    function providerName(voice) { return policy ? policy.classify(voice) : 'other'; }
    const providerLabels = {microsoft:'微软 Microsoft', google:'谷歌 Google', other:'其他／系统声音'};
    const voiceKey = voice => policy ? policy.voiceKey(voice) : JSON.stringify([voice.voiceURI || '', voice.lang || '', voice.name || '', voice.localService === true]);
    function selectActualVoice() {
      const voice = availableOptions.get(voiceSelect.value);
      engine.setVoice(voice && (voice.localService === true || $('tts-remote').checked) ? voice : null);
    }
    function voices() {
      const previous = engine.voice;
      const unique = new Map();
      for (const v of root.speechSynthesis.getVoices()) unique.set(voiceKey(v), v);
      actualVoices = [...unique.values()]; availableOptions = new Map();
      const filter = providerSelect ? providerSelect.value : 'all';
      const counts = {microsoft:0,google:0,other:0}; for (const v of actualVoices) counts[providerName(v)]++;
      if (providerSelect) for (const o of providerSelect.options) o.textContent = o.value === 'all' ? '全部实际声音（' + actualVoices.length + '）' : providerLabels[o.value] + '（' + (counts[o.value] || 0) + '）';
      voiceSelect.replaceChildren();
      const placeholder = document.createElement('option'); placeholder.value = ''; placeholder.textContent = '请选择一个当前浏览器提供的声音'; voiceSelect.append(placeholder);
      const candidates=actualVoices.filter(v => filter === 'all' || providerName(v) === filter);
      const list = policy ? policy.sorted(candidates) : candidates;
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
      const decision=policy ? policy.choose(list,$('tts-remote').checked) : {voice:null,reason:'未加载默认小雨声音选择规则'};
      voiceSelect.value=decision.voice?voiceKey(decision.voice):'';
      if (previous && (!decision.voice || voiceKey(previous)!==voiceKey(decision.voice))) {++command;++preparation;engine.stop();flowHooks?.onStop?.();}
      selectActualVoice();
      if ($('tts-voice-summary')) {
        $('tts-voice-summary').textContent = '本浏览器返回 ' + actualVoices.length + ' 个声音：微软 ' + counts.microsoft + '、谷歌 ' + counts.google + '、其他 ' + counts.other + '。' +
          (!list.length ? '当前来源没有可用声音；不会用其他厂商声音冒充。可刷新或换用已安装对应声音的浏览器。' :
          decision.reason || '已选当前浏览器实际提供的声音。') +
          ' 默认优先：微软 HsiaoYu；若缺席，显示实际中文备选的真实名称，绝不冒称小雨。';
      }
    }
    voices(); root.speechSynthesis.addEventListener?.('voiceschanged', voices);
    // 一些浏览器的声音目录会异步填充；两次有界复查避免初次列表为空。
    root.setTimeout?.(voices, 350); root.setTimeout?.(voices, 1400);
    voiceSelect.addEventListener('change', () => { ++command;++preparation; engine.stop(); flowHooks?.onStop?.(); const v=availableOptions.get(voiceSelect.value);if(v)policy?.save(v);selectActualVoice(); });
    if (providerSelect) providerSelect.addEventListener('change', () => { ++command;++preparation; engine.stop(); engine.setVoice(null); voiceSelect.value = ''; flowHooks?.onStop?.(); voices(); });
    $('tts-refresh')?.addEventListener('click', voices);
    $('tts-default')?.addEventListener('click', () => {policy?.reset();providerSelect.value='all';voices();$('tts-status').textContent='已恢复小雨优先策略；若当前没有小雨，将明确显示所使用的中文备选声音。';});
    $('tts-remote').addEventListener('change', () => { ++command;++preparation; engine.stop(); engine.allowRemote = $('tts-remote').checked; savePlaybackSettings();flowHooks?.onStop?.(); voices(); });
    $('tts-rate').addEventListener('input', () => { engine.rate = Number($('tts-rate').value); $('tts-rate-value').textContent = engine.rate.toFixed(1);savePlaybackSettings(); });
    $('tts-volume').addEventListener('input', () => { engine.volume = Number($('tts-volume').value);savePlaybackSettings(); });
    $('tts-timer').addEventListener('change', () => { const m=Number($('tts-timer').value); sleepDeadline=m>0?Date.now()+m*60000:null; engine.setTimer(m); });
    function items() { return provider().flatMap((item, p) => speechSegments(item.text, 240).map((seg, i) => ({...item, ...seg, id:(item.id || 'paragraph-' + p) + '-segment-' + i}))).filter(x => x.text.trim()); }
    async function prepare(token) {
      const rows=[],source=provider(); engine.stop();
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
          for(const seg of speechSegments(item.text.slice(offset,end), 240)){if(seg.text.trim())rows.push({...item, text:seg.text, pauseAfterMs:seg.pauseAfterMs, id:(item.id||'paragraph-'+p)+'-segment-'+segmentIndex});segmentIndex++;}
          offset=end;
          if(rows.length>30000){$('tts-status').textContent='朗读短段超过 30000；请把文稿分章后再读，未截断后继续朗读。';return null;}
          if(offset<item.text.length){await new Promise(r=>setTimeout(r,0));if(token!==preparation)return null;}
        }
        // 完整经节间不人工加停顿。
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
      const token=++preparation;
      try {
        const rows=await prepare(token);
        // An older cancelled preparation must not stop or overwrite the newer plan.
        if(token!==preparation)return false;
        if(!rows || !rows.length) {
          if (rows) $('tts-status').textContent='本章没有可以朗读的正文；未跳过本章';
          flowHooks?.onStop?.();
          return false;
        }
        const started=begin(0,rows,continuation);if(!started)flowHooks?.onStop?.();return started;
      } catch(error) {
        if(token!==preparation)return false;
        engine.clear(); $('tts-status').textContent='无法准备朗读：'+error.message;
        flowHooks?.onError?.(error.message); return false;
      }
    }
    $('tts-play').addEventListener('click', async () => {
      const request=++command;
      try {
        if (flowHooks?.beforeStart && await flowHooks.beforeStart({resume:false}) === false) return;
        if(request!==command)return;
        await playCurrent(false);
      } catch(error) { if(request!==command)return;engine.clear();$('tts-status').textContent='无法开始朗读：'+error.message;flowHooks?.onError?.(error.message); }
    });
    $('tts-pause').addEventListener('click', () => engine.pauseResume());
    $('tts-stop').addEventListener('click', () => {++command;++preparation;sleepDeadline=null;engine.stop();flowHooks?.onStop?.();});
    function moveSpeech(delta){
      ++command;++preparation;
      if(sleepDeadline!==null&&Date.now()>=sleepDeadline){engine.stop();flowHooks?.onStop?.();$('tts-status').textContent='已到定时停止时间';return;}
      engine.move(delta);if(engine.state==='playing'&&sleepDeadline!==null)engine.setTimer((sleepDeadline-Date.now())/60000);
    }
    $('tts-prev').addEventListener('click',()=>moveSpeech(-1));
    $('tts-next').addEventListener('click',()=>moveSpeech(1));
    $('tts-restore').addEventListener('click', async () => {
      const request=++command;
      let saved; try { saved = JSON.parse(localStorage.getItem('messiah-tts-position') || 'null'); } catch {}
      try { if (flowHooks?.beforeStart && await flowHooks.beforeStart({resume:true,saved}) === false) return; }
      catch(e) { if(request!==command)return;$('tts-status').textContent='恢复定位失败：'+e.message;flowHooks?.onStop?.();return; }
      if(request!==command)return;
      const token=++preparation;
      let rows;try{rows=await prepare(token);}catch(e){if(token!==preparation)return;$('tts-status').textContent='朗读准备失败：'+e.message;flowHooks?.onStop?.();return;}if(token!==preparation)return;if(!rows){flowHooks?.onStop?.();return;}
      if (!saved || ![4,5].includes(saved.schema) || saved.context !== context()) { $('tts-status').textContent = '没有与当前版本、章节和朗读模式一致的听读记录。';flowHooks?.onStop?.(); return; }
      const legacy = saved.schema === 4;
      const restoredId=legacy?String(saved.id||'').replace(/-segment-\d+$/, '-segment-0'):saved.id;
      const index = rows.findIndex(item => item.persist !== false && item.id === restoredId);
      if (index < 0) { $('tts-status').textContent = '保存的段落已不在当前文稿中，未按旧序号猜测位置。';flowHooks?.onStop?.(); return; }
      if(!begin(index, rows, false))flowHooks?.onStop?.();
      if(legacy)$('tts-status').textContent='分段规则已更新，从旧记录对应经节或段落的开头继续。';
    });
    engine.rate=Number($('tts-rate').value)||1;engine.volume=Number($('tts-volume').value);
    window.addEventListener('storage',event=>{if(event.key===null||event.key==='messiah-tts-position'){$('tts-status').textContent='本机听读记录已在其他页面更新或清除。';}});
    window.addEventListener('pagehide', () => {++command;++preparation;engine.clear();flowHooks?.onStop?.();});
    return {
      engine,
      setProvider(fn, ctx) { ++preparation; engine.clear(); provider = fn; if (ctx) context = ctx;
        try{if(provider().length)$('tts-status').textContent='正文已准备，可选择声音后开始朗读。';}catch{}
      },
      setFlowHooks(hooks) { flowHooks = hooks || null; },
      playCurrent: () => playCurrent(true),
      stop:() => { ++command;++preparation; sleepDeadline=null; engine.stop(); flowHooks?.onStop?.(); },
      reset:() => { ++command;++preparation;sleepDeadline=null;engine.clear(); flowHooks?.onStop?.(); }
    };
  }
  root.ReaderSpeech = ReaderSpeech; root.ReaderSpeechSplit = split; root.ReaderSpeechSegments = speechSegments; root.mountReaderSpeech = mount;
  if (typeof module === 'object' && module.exports) module.exports = {ReaderSpeech, split, speechSegments, fallbackGraphemes};
})(typeof window !== 'undefined' ? window : globalThis);
