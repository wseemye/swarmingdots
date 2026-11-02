import { useLayoutEffect, useRef } from 'react';

/**
 * Gives an element exactly the height of its content, and glides to the new height whenever that
 * changes (a tab opens, the window gets narrower and things wrap) instead of jumping. The CSS
 * transition on `height` does the gliding; this keeps `height` set to a number it can animate.
 */
export default function useAutoHeight<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let first = true;

    const fit = () => {
      // Where it is now (mid-glide too), then where its content wants it.
      const from = el.getBoundingClientRect().height;
      el.style.transition = 'none';
      el.style.height = 'auto';
      const to = el.getBoundingClientRect().height;
      if (first || Math.abs(to - from) < 0.5) {
        el.style.height = `${to}px`;
        void el.offsetHeight;
        el.style.transition = '';
        first = false;
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
    const mo = new MutationObserver(watch);
    mo.observe(el, { childList: true });
    el.addEventListener('transitionend', done);
    window.addEventListener('resize', fit);
    return () => {
      ro.disconnect();
      mo.disconnect();
      el.removeEventListener('transitionend', done);
      window.removeEventListener('resize', fit);
    };
  }, []);

  return ref;
}
