import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
/** Update document title and focus after lazy-loaded routes have actually rendered. */
export function RouteEffects() {
  const { pathname } = useLocation();
  const first = useRef(true);
  useEffect(() => {
    const initial = first.current;
    first.current = false;
    window.scrollTo({ top: 0, behavior: 'instant' });
    let disposed = false;
    const update = () => {
      const heading = document.querySelector<HTMLHeadingElement>('main h1');
      if (!heading || disposed) return false;
      document.title = `${heading.textContent?.slice(0, 100) ?? 'Your experience'} · Nurture`;
      if (!initial) heading.focus({ preventScroll: true });
      disposed = true;
      observer.disconnect();
      return true;
    };
    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true });
    const frame = requestAnimationFrame(update);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [pathname]);
  return null;
}
