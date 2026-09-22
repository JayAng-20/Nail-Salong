// 動態偏好與卡片傾斜；僅在操作時更新，不常駐繪圖迴圈。
const media = window.matchMedia('(prefers-reduced-motion: reduce)');
let preference = null;
try { preference = localStorage.getItem('butterfly-motion'); } catch {}
export const motionEnabled = () => document.documentElement.dataset.motion !== 'quiet';

export function initMotion() {
  const apply = () => {
    const enabled = preference === null ? !media.matches : preference === 'on';
    document.documentElement.dataset.motion = enabled ? 'full' : 'quiet';
    document.querySelectorAll('[data-motion-toggle]').forEach(button => {
      button.setAttribute('aria-pressed', String(enabled));
      button.setAttribute('aria-label', enabled ? '關閉動態效果' : '開啟動態效果');
      button.querySelector('span').textContent = enabled ? '動態 開' : '動態 關';
    });
    document.dispatchEvent(new CustomEvent('motionchange'));
  };
  document.querySelectorAll('[data-motion-toggle]').forEach(button => button.addEventListener('click', () => {
    preference = motionEnabled() ? 'off' : 'on';
    try { localStorage.setItem('butterfly-motion', preference); } catch {}
    apply();
  }));
  media.addEventListener('change', () => { if (preference === null) apply(); });
  apply();

  let frame = 0, card = null;
  document.addEventListener('pointermove', event => {
    if (event.pointerType !== 'mouse' || !motionEnabled()) return;
    const next = event.target.closest('[data-tilt]');
    if (card && card !== next) reset();
    if (!next) return;
    card = next;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty('--tilt-x', `${-(event.clientY - r.top - r.height / 2) / r.height * 7}deg`);
      card.style.setProperty('--tilt-y', `${(event.clientX - r.left - r.width / 2) / r.width * 7}deg`);
    });
  }, { passive: true });
  const reset = () => {
    cancelAnimationFrame(frame);
    if (card) { card.style.removeProperty('--tilt-x'); card.style.removeProperty('--tilt-y'); }
    card = null;
  };
  document.addEventListener('pointerout', event => { if (!event.relatedTarget) reset(); });
  document.addEventListener('motionchange', reset);
  window.addEventListener('blur', reset);
}
