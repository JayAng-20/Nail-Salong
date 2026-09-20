// 手機漢堡選單：全螢幕展開、Esc 關閉、點連結關閉、鎖住背景捲動
export function initNav() {
  const toggle = document.querySelector('.nav-toggle');
  const nav = document.querySelector('.site-nav');
  if (!toggle || !nav) return;
  const set = (open) => {
    nav.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    toggle.setAttribute('aria-label', open ? '關閉選單' : '開啟選單');
    document.body.classList.toggle('is-locked', open);
    if (open) nav.querySelector('a')?.focus({ preventScroll: true });
  };
  toggle.addEventListener('click', () => set(!nav.classList.contains('is-open')));
  nav.addEventListener('click', (e) => { if (e.target.closest('a')) set(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && nav.classList.contains('is-open')) { set(false); toggle.focus(); } });
  window.matchMedia('(min-width: 768px)').addEventListener('change', (e) => { if (e.matches) set(false); });

  // 目前頁面標記
  const here = location.pathname.split('/').pop() || 'index.html';
  nav.querySelectorAll('.nav-links a').forEach((a) => {
    const target = (a.getAttribute('href') || '').split('#')[0].split('?')[0] || 'index.html';
    if (target === here && !a.getAttribute('href').includes('#')) a.setAttribute('aria-current', 'page');
  });
}
