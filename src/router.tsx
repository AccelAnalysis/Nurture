import { useEffect, useState, type AnchorHTMLAttributes, type MouseEvent, type ReactNode } from "react";

export interface RouteState {
  path: string;
  segments: string[];
  query: URLSearchParams;
}

function currentRoute(): RouteState {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  return {
    path,
    segments: path.split("/").filter(Boolean),
    query: new URLSearchParams(window.location.search),
  };
}

export function useRoute() {
  const [route, setRoute] = useState<RouteState>(() => currentRoute());
  useEffect(() => {
    const update = () => setRoute(currentRoute());
    window.addEventListener("popstate", update);
    window.addEventListener("nurture:navigate", update);
    return () => {
      window.removeEventListener("popstate", update);
      window.removeEventListener("nurture:navigate", update);
    };
  }, []);
  return route;
}

export function navigate(to: string, replace = false) {
  if (replace) window.history.replaceState({}, "", to);
  else window.history.pushState({}, "", to);
  window.dispatchEvent(new Event("nurture:navigate"));
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
}

export function Link({ href, children, className, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode }) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    props.onClick?.(event);
    if (
      event.defaultPrevented ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      props.target === "_blank" ||
      href.startsWith("http") ||
      href.startsWith("mailto:") ||
      href.startsWith("tel:")
    ) return;
    event.preventDefault();
    navigate(href);
  };
  return <a href={href} className={className} {...props} onClick={handleClick}>{children}</a>;
}
