import { useLayoutEffect, useRef } from 'react';

/**
 * Gives an element exactly the height of its content, and glides to the new height whenever that
 * changes (a tab opens, the window gets narrower and things wrap) instead of jumping. The CSS
 * transition on `height` does the gliding; this keeps `height` set to a number it can animate.
 */
// The height the last panel had when its page closed, so the next page's panel starts from it and
// grows or shrinks into its own, rather than appearing at its own size.
let remembered = 0;

export default function useAutoHeight<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let first = true;
    const start = remembered;

    const fit = () => {
      // Where it is now (mid-glide too; on a new page, where the last panel was), then where its
      // content wants it.
      const from = first && start ? start : el.getBoundingClientRect().height;
      el.style.transition = 'none';
      el.style.height = 'auto';
      const to = el.getBoundingClientRect().height;
      first = false;
      if (Math.abs(to - from) < 0.5) {
        el.style.height = `${to}px`;
        void el.offsetHeight;
        el.style.transition = '';
        return;
      }
      el.style.height = `${from}px`;
      void el.offsetHeight;
      el.style.transition = '';
      // Clip while it moves, so nothing spills out of a shrinking panel.
      el.dataset.resizing = '';
      el.style.height = `${to}px`;
    };

    const done = (e: TransitionEvent) => {
      if (e.target === el && e.propertyName === 'height') delete el.dataset.resizing;
    };

    // The content changing size, a tab's group showing or hiding included, shows up as one of
    // the children changing size; the window changing size, as the element's own width.
    const ro = new ResizeObserver(fit);
    const watch = () => {
      ro.disconnect();
      for (const child of el.children) ro.observe(child);
    };
    watch();
    // Once now, before the first paint, so a new panel never shows a frame at its own size first.
    fit();
    const mo = new MutationObserver(watch);
    mo.observe(el, { childList: true });
    el.addEventListener('transitionend', done);
    window.addEventListener('resize', fit);
    return () => {
      // Read when the panel goes, so the next page's panel starts from here.
      if (el.style.height) remembered = el.getBoundingClientRect().height;
      ro.disconnect();
      mo.disconnect();
      el.removeEventListener('transitionend', done);
      window.removeEventListener('resize', fit);
    };
  }, []);

  return ref;
}
