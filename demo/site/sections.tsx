// Pieces for pages that stack many live demos in one scrolling list (Components,
// Examples): mount each demo only near the screen, and track which section is on screen.

import { ReactNode, RefObject, useEffect, useRef, useState } from 'react';

/**
 * Mounts its children the first time they come near the screen. With `release`, it
 * unmounts them again once they are well off screen, so only the demos around you
 * run their animation loops; the space they took is kept so the page doesn't jump.
 */
export function MountWhenNear({ height, release = false, className, children }: { height: number; release?: boolean; className: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [minHeight, setMinHeight] = useState(height);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') return setNear(true);
    const io = new IntersectionObserver(
      (entries) => {
        // a busy page can hand over several changes at once: only the newest says where the demo is now
        const entry = entries[entries.length - 1];
        if (entry.isIntersecting) {
          setNear(true);
          if (!release) io.disconnect();
        } else if (release) {
          setMinHeight(el.offsetHeight);
          setNear(false);
        }
      },
      { rootMargin: release ? '600px 0px' : '200px 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [release]);
  return (
    <div ref={ref} className={className} style={{ minHeight }} data-mounted={near ? 'yes' : 'no'}>
      {near ? children : null}
    </div>
  );
}

/** The section at the top of the screen (or the last one, at the bottom of the page). */
export function useActiveSection(ids: string[]) {
  const [active, setActive] = useState(ids[0]);
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      let current = ids[0];
      if (atBottom) current = ids[ids.length - 1];
      else
        for (const id of ids) {
          const el = document.getElementById(id);
          if (el && el.getBoundingClientRect().top <= window.innerHeight * 0.35) current = id;
        }
      setActive(current);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [ids]);
  return active;
}

/**
 * Keeps the sidebar link for the active section in view when the sidebar itself
 * scrolls: sideways on phones, up and down on short screens.
 */
export function useKeepActiveInView(nav: RefObject<HTMLElement>, active: string) {
  useEffect(() => {
    const list = nav.current;
    const link = list?.querySelector<HTMLElement>(`a[href$="#${active}"]`);
    if (!list || !link) return;
    const box = list.getBoundingClientRect();
    const r = link.getBoundingClientRect();
    if (list.scrollWidth > list.clientWidth) {
      list.scrollTo({ left: list.scrollLeft + r.left - box.left - 16, behavior: 'smooth' });
    } else if (list.scrollHeight > list.clientHeight && (r.top < box.top || r.bottom > box.bottom)) {
      list.scrollTo({ top: list.scrollTop + r.top - box.top - box.height / 2, behavior: 'smooth' });
    }
  }, [nav, active]);
}
