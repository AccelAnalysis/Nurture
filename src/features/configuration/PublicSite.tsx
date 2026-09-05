import { useEffect, useMemo, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { Badge, Card } from "../../components/ui";
import { Link } from "../../router";
import type { MediaAsset, OrganizationConfiguration } from "./types";

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
  useEffect(() => {
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!media) return;
    const update = () => setReduced(media.matches);
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);
  return reduced;
}

function youtubeId(value: string) {
  try {
    const url = new URL(value);
    if (url.hostname === "youtu.be") return url.pathname.split("/").filter(Boolean)[0] ?? null;
    if (["youtube.com", "www.youtube.com", "m.youtube.com", "www.youtube-nocookie.com"].includes(url.hostname)) {
      if (url.pathname === "/watch") return url.searchParams.get("v");
      const parts = url.pathname.split("/").filter(Boolean);
      if (["embed", "shorts", "live"].includes(parts[0] ?? "")) return parts[1] ?? null;
    }
  } catch {
    return null;
  }
  return null;
}

function vimeoId(value: string) {
  try {
    const parts = new URL(value).pathname.split("/").filter(Boolean);
    for (let index = parts.length - 1; index >= 0; index -= 1) {
      if (/^\d+$/.test(parts[index])) return parts[index];
    }
  } catch {
    return null;
  }
  return null;
}

function MediaFallback({ asset, message }: { asset: MediaAsset; message: string }) {
  return (
    <div className="track-a-media-fallback" role="img" aria-label={asset.alt || "Nurture media fallback"}>
      <img src="/brand/logo/nurture-n.svg" alt="" />
      <p>{message}</p>
      {asset.url.startsWith("https://") ? <a href={asset.url} target="_blank" rel="noreferrer">Open media source</a> : null}
    </div>
  );
}

export function HeroMedia({ asset }: { asset: MediaAsset }) {
  const reducedMotion = useReducedMotion();
  const [failed, setFailed] = useState(false);
  const youtube = useMemo(() => asset.kind === "youtube" ? youtubeId(asset.url) : null, [asset.kind, asset.url]);
  const vimeo = useMemo(() => asset.kind === "vimeo" ? vimeoId(asset.url) : null, [asset.kind, asset.url]);

  if (asset.kind === "none") {
    return (
      <div className="track-a-default-hero-mark" aria-hidden="true">
        <img src="/brand/logo/nurture-n.svg" alt="" />
      </div>
    );
  }

  if (failed) return <MediaFallback asset={asset} message="This media could not be loaded. The rest of the page remains available." />;

  if (asset.kind === "image") {
    return <img className="track-a-hero-image" src={asset.url} alt={asset.alt} onError={() => setFailed(true)} />;
  }

  if (reducedMotion) {
    return asset.posterUrl
      ? <img className="track-a-hero-image" src={asset.posterUrl} alt={asset.alt || "Static media preview"} onError={() => setFailed(true)} />
      : <MediaFallback asset={asset} message="Video is replaced with a static treatment when reduced motion is enabled." />;
  }

  if (asset.kind === "youtube") {
    if (!youtube) return <MediaFallback asset={asset} message="The YouTube URL is not supported." />;
    return (
      <div className="track-a-video-frame">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${youtube}`}
          title={asset.alt || "YouTube video"}
          loading="lazy"
          allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
        <a href={asset.url} target="_blank" rel="noreferrer">Open on YouTube</a>
      </div>
    );
  }

  if (asset.kind === "vimeo") {
    if (!vimeo) return <MediaFallback asset={asset} message="The Vimeo URL is not supported." />;
    return (
      <div className="track-a-video-frame">
        <iframe
          src={`https://player.vimeo.com/video/${vimeo}`}
          title={asset.alt || "Vimeo video"}
          loading="lazy"
          allow="fullscreen; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
        <a href={asset.url} target="_blank" rel="noreferrer">Open on Vimeo</a>
      </div>
    );
  }

  return (
    <video
      className="track-a-direct-video"
      src={asset.url}
      poster={asset.posterUrl}
      controls
      preload="metadata"
      aria-label={asset.alt || "Video"}
      onError={() => setFailed(true)}
    />
  );
}

export function ConfiguredBrand({ configuration, link = true }: { configuration: OrganizationConfiguration; link?: boolean }) {
  const content = (
    <>
      <img src={configuration.brand.logoUrl} alt="" onError={(event) => { event.currentTarget.src = "/brand/logo/nurture-n.svg"; }} />
      <span>{configuration.brand.applicationName}</span>
    </>
  );
  return link ? <Link className="brand" href="/">{content}</Link> : <span className="brand">{content}</span>;
}

function PreviewLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  const stop = (event: MouseEvent<HTMLAnchorElement>) => event.preventDefault();
  return <a href={href} className={className} onClick={stop}>{children}</a>;
}

export function ConfiguredMarketingHome({
  configuration,
  preview = false,
}: {
  configuration: OrganizationConfiguration;
  preview?: boolean;
}) {
  const PublicLink = preview ? PreviewLink : Link;
  const accentStyle = { "--track-a-accent": configuration.brand.accentColor } as CSSProperties;
  return (
    <div className="track-a-configured-home" style={accentStyle}>
      <section className="hero content-width track-a-configured-hero">
        <div>
          <Badge tone="accent">{configuration.site.eyebrow}</Badge>
          <h1>{configuration.site.headline}</h1>
          <p>{configuration.site.supportingText}</p>
          <div className="hero-actions">
            <PublicLink className="button track-a-accent-button" href={configuration.site.primaryCta.href}>{configuration.site.primaryCta.label}</PublicLink>
            <PublicLink className="button button-secondary" href={configuration.site.secondaryCta.href}>{configuration.site.secondaryCta.label}</PublicLink>
          </div>
        </div>
        <div className="track-a-hero-media"><HeroMedia asset={configuration.site.heroMedia} /></div>
      </section>

      <section className="content-width section">
        <div className="section-heading">
          <p className="eyebrow">Built from Nurture defaults</p>
          <h2>{configuration.site.proofHeading || "A useful starting point, ready to make your own."}</h2>
          {configuration.site.proofBody ? <p>{configuration.site.proofBody}</p> : null}
        </div>
        <div className="feature-list">
          {configuration.site.features.map((feature) => <Card key={feature.id}><h3>{feature.title}</h3><p>{feature.body}</p></Card>)}
        </div>
      </section>
    </div>
  );
}

export function PublicSitePreview({ configuration }: { configuration: OrganizationConfiguration }) {
  return (
    <div className="track-a-preview-site" style={{ "--track-a-accent": configuration.brand.accentColor } as CSSProperties}>
      <header className="track-a-preview-header">
        <ConfiguredBrand configuration={configuration} link={false} />
        <nav aria-label="Preview navigation">
          {configuration.site.navigation.slice(0, 4).map((item) => <PreviewLink key={item.id} href={item.href}>{item.label}</PreviewLink>)}
        </nav>
      </header>
      <ConfiguredMarketingHome configuration={configuration} preview />
      <footer className="track-a-preview-footer">
        <ConfiguredBrand configuration={configuration} link={false} />
        <p>{configuration.site.footerTagline}</p>
        <small>{configuration.site.copyrightText}</small>
      </footer>
    </div>
  );
}
