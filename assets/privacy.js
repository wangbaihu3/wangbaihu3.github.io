(function(){'use strict';
  const $=id=>document.getElementById(id);
  $('clear-local-data').addEventListener('click',()=>{
    try{for(const key of ['messiah-favorites-v1','messiah-bible-position','messiah-tts-position','messiah-directory-history-v1','messiah-bible-audio-plan','messiah-txt-last-position','messiah-txt-settings-v1','messiah-tts-voice-preference-v3','messiah-bible-reading-settings-v1','messiah-tts-playback-v1'])localStorage.removeItem(key);
      $('clear-data-status').textContent='已清除本浏览器的本站收藏、搜索历史和阅读位置；其他页面请刷新后查看清除结果。浏览历史与服务器日志不在本按钮控制范围。';
    }catch{$('clear-data-status').textContent='当前浏览器不允许访问本地存储。';}
  });
  const button=$('verify-release');
  if(!button)return;
  button.addEventListener('click',async()=>{
    button.disabled=true;$('release-status').textContent='正在核对当前页面与服务器的发布版本……';$('release-results').replaceChildren();
    try{
      const manifest=await SiteRuntime.release();
      const paths=Object.keys(manifest.files).filter(p=>p.endsWith('.html')||p.startsWith('assets/')||['CNAME','.nojekyll','.well-known/site-build.json','data/bible/meta.json','data/resources.json','data/labels.json'].includes(p));
      const results=await SiteRuntime.verifyFiles(paths,(n,total)=>{$('release-status').textContent='已核对 '+n+' / '+total+' 个关键发布文件……';});
      const failed=results.filter(r=>!r.ok);
      $('release-status').textContent=failed.length?'发现 '+failed.length+' 个文件缺失或版本不一致；不要据此显示更新成功。':'关键发布文件与 '+manifest.build+' 一致。此检查不代表全部数据库、外站、真实语音或大陆各线路均已验收。';
      for(const r of failed){const p=document.createElement('p');p.textContent=r.path+'：'+r.error;$('release-results').append(p);}
    }catch(e){$('release-status').textContent='发布校验未完成：'+e.message;}
    finally{button.disabled=false;}
  });
})();
