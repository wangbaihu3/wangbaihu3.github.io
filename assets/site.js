/* 本地静态页面：联系方式复制，不上传任何输入。 */
(function () {
  'use strict';
  document.documentElement.classList.add('js-ready');
  var status = document.querySelector('.copy-status');
  var timers = new WeakMap();

  function legacyCopy(text) {
    var active = document.activeElement;
    var field = document.createElement('textarea');
    field.className = 'copy-buffer';
    field.value = text;
    field.setAttribute('readonly', '');
    field.setAttribute('aria-label', '待复制的联系方式');
    document.body.appendChild(field);
    field.focus({ preventScroll: true });
    field.select();
    field.setSelectionRange(0, field.value.length);
    var copied = false;
    try { copied = document.execCommand('copy'); } catch (error) { copied = false; }
    field.remove();
    if (active && typeof active.focus === 'function') active.focus({ preventScroll: true });
    return copied;
  }

  async function copyContact(text) {
    if (window.isSecureContext && navigator.clipboard && navigator.clipboard.writeText) {
      try { await navigator.clipboard.writeText(text); return true; } catch (error) { /* HTTP及权限受限时使用选区复制。 */ }
    }
    return legacyCopy(text);
  }

  document.querySelectorAll('[data-copy]').forEach(function (button) {
    button.addEventListener('click', async function () {
      var text = button.getAttribute('data-copy');
      var previous = timers.get(button);
      if (previous) window.clearTimeout(previous);
      var copied = await copyContact(text);
      button.textContent = copied ? '已复制' : '请选中';
      if (status) status.textContent = copied ? '已复制：' + text : '浏览器未允许自动复制，请直接选中上方联系方式复制。';
      timers.set(button, window.setTimeout(function () { button.textContent = '复制'; }, 2300));
    });
  });
}());
