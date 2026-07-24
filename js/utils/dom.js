/**
 * DOM 工具函数
 */
const DOM = {
  $(sel, parent) { return (parent || document).querySelector(sel); },
  $$(sel, parent) { return [...(parent || document).querySelectorAll(sel)]; },

  create(tag, attrs = {}, children = []) {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === 'className') el.className = v;
      else if (k === 'innerHTML') el.innerHTML = v;
      else if (k === 'textContent') el.textContent = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'dataset') Object.entries(v).forEach(([dk, dv]) => el.dataset[dk] = dv);
      else el.setAttribute(k, v);
    });
    children.forEach(c => { if (typeof c === 'string') el.appendChild(document.createTextNode(c)); else if (c) el.appendChild(c); });
    return el;
  },

  remove(el) { if (el) el.remove(); },
  empty(el) { while (el.firstChild) el.removeChild(el.firstChild); },
  addClass(el, cls) { el.classList.add(cls); },
  removeClass(el, cls) { el.classList.remove(cls); },
  toggleClass(el, cls) { el.classList.toggle(cls); },
  hasClass(el, cls) { return el.classList.contains(cls); },

  fadeIn(el, ms = 300) {
    el.style.opacity = '0';
    el.style.display = '';
    el.style.transition = `opacity ${ms}ms ease`;
    requestAnimationFrame(() => { el.style.opacity = '1'; });
  },

  fadeOut(el, ms = 300) {
    el.style.transition = `opacity ${ms}ms ease`;
    el.style.opacity = '0';
    setTimeout(() => { el.style.display = 'none'; }, ms);
  },

  slideDown(el, ms = 300) {
    el.style.display = '';
    const h = el.scrollHeight;
    el.style.height = '0';
    el.style.overflow = 'hidden';
    el.style.transition = `height ${ms}ms ease`;
    requestAnimationFrame(() => { el.style.height = h + 'px'; });
    setTimeout(() => { el.style.height = 'auto'; el.style.overflow = ''; }, ms);
  },

  slideUp(el, ms = 300) {
    el.style.height = el.scrollHeight + 'px';
    el.style.overflow = 'hidden';
    el.style.transition = `height ${ms}ms ease`;
    requestAnimationFrame(() => { el.style.height = '0'; });
    setTimeout(() => { el.style.display = 'none'; el.style.height = 'auto'; el.style.overflow = ''; }, ms);
  },

  delegate(parent, event, selector, handler) {
    parent.addEventListener(event, e => {
      const target = e.target.closest(selector);
      if (target && parent.contains(target)) handler.call(target, e);
    });
  }
};
