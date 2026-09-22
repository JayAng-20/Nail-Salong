// 每一頁共用的初始化
import { applyConfigText, applySeo, CONFIG } from './config.js';
import { renderSocialIcons } from './render.js';
import { initNav } from './nav.js';
import { initHeader, initReveal } from './animations.js';
import { initMotion } from './motion.js';
import { $$ } from './util.js';

export function initCommon({ pageTitle = null, ogImage = null } = {}) {
  applyConfigText();
  applySeo({ pageTitle, ogImage });
  $$('[data-social-icons]').forEach(renderSocialIcons);
  $$('[data-phone-link]').forEach((a) => { if (CONFIG.info.phone) a.href = 'tel:' + String(CONFIG.info.phone).replace(/[^\d+]/g, ''); else a.removeAttribute('href'); });
  initMotion();
  initNav();
  initHeader();
  initReveal();
  document.documentElement.classList.add('js');
  return CONFIG;
}

/** 站內深層連結（作品集頁）— 分享用的絕對網址 */
export function galleryLink(photo, { absolute = true } = {}) {
  const p = new URLSearchParams();
  if (photo.catId) p.set('c', photo.catId);
  if (photo.albumId) p.set('a', photo.albumId);
  p.set('p', photo.id);
  const rel = 'gallery.html?' + p.toString();
  if (!absolute) return rel;
  const base = location.pathname.endsWith('/') ? location.pathname : location.pathname.slice(0, location.pathname.lastIndexOf('/') + 1);
  return location.origin + base + rel;
}
