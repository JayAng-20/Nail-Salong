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
    document.querySelector('main').inert = open;
    document.querySelector('footer').inert = open;
    document.querySelector('.mobile-dock')?.toggleAttribute('inert', open);
    if (open) nav.querySelector('a')?.focus({ preventScroll: true });
  };
  toggle.addEventListener('click', () => set(!nav.classList.contains('is-open')));
  nav.addEventListener('click', (e) => { if (e.target.closest('a')) set(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && nav.classList.contains('is-open')) { set(false); toggle.focus(); } });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab' || !nav.classList.contains('is-open')) return;
    const nodes = [...nav.querySelectorAll('a[href]'), toggle];
    const i = nodes.indexOf(document.activeElement);
    e.preventDefault();
    nodes[(i + (e.shiftKey ? -1 : 1) + nodes.length) % nodes.length].focus();
  });
  window.matchMedia('(min-width: 768px)').addEventListener('change', (e) => { if (e.matches && nav.classList.contains('is-open')) set(false); });

  // 目前頁面標記
  const here = location.pathname.split('/').pop() || 'index.html';
  nav.querySelectorAll('.nav-links a').forEach((a) => {
    const target = (a.getAttribute('href') || '').split('#')[0].split('?')[0] || 'index.html';
    if (target === here && !a.getAttribute('href').includes('#')) a.setAttribute('aria-current', 'page');
  });

  const dock = document.querySelector('.mobile-dock');
  if (!dock) return;
  const mark = name => dock.querySelectorAll('[data-dock]').forEach(a => {
    if (a.dataset.dock === name) a.setAttribute('aria-current', 'location');
    else a.removeAttribute('aria-current');
  });
  if (here === 'status.html') { dock.hidden = true; return; }
  if (here === 'gallery.html') mark('works');
  else {
    dock.querySelectorAll('a[href^="index.html#"]').forEach(a => { a.href = a.getAttribute('href').replace('index.html', ''); });
    const sections = [...document.querySelectorAll('#latest,#services,#info')];
    let frame = 0;
    const update = () => {
      const at = innerHeight * .48;
      const active = sections.findLast(section => section.getBoundingClientRect().top < at);
      mark(active?.id === 'services' ? 'services' : active?.id === 'info' ? 'info' : 'works');
    };
    window.addEventListener('scroll', () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(update); }, { passive: true });
    update();
  }
}
