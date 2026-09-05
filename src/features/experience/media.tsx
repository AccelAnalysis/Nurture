import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Card } from "../../components/ui";
import type { ExperienceImageAsset, ExperienceMediaAsset, ExperienceVideoAsset } from "./contracts";

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID = /^\d{5,12}$/;

type YouTubePlayerInstance = { destroy(): void };
type YouTubePlayerApi = {
  Player: new (
    element: HTMLElement,
    options: {
      events: {
        onReady: () => void;
        onError: (event: { data: number }) => void;
      };
    },
  ) => YouTubePlayerInstance;
};
type YouTubeWindow = Window & {
  YT?: YouTubePlayerApi;
  onYouTubeIframeAPIReady?: () => void;
};

let youtubeApiPromise: Promise<YouTubePlayerApi> | null = null;

function loadYouTubePlayerApi() {
  if (typeof window === "undefined") return Promise.reject(new Error("YouTube playback requires a browser."));
  const youtubeWindow = window as YouTubeWindow;
  if (youtubeWindow.YT?.Player) return Promise.resolve(youtubeWindow.YT);
  if (youtubeApiPromise) return youtubeApiPromise;

  youtubeApiPromise = new Promise<YouTubePlayerApi>((resolve, reject) => {
    const previousReady = youtubeWindow.onYouTubeIframeAPIReady;
    youtubeWindow.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      if (youtubeWindow.YT?.Player) resolve(youtubeWindow.YT);
      else reject(new Error("The YouTube player API loaded without a Player constructor."));
    };

    let script = document.querySelector<HTMLScriptElement>('script[data-nurture-youtube-api="true"]');
    if (!script) {
      script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      script.dataset.nurtureYoutubeApi = "true";
      script.referrerPolicy = "strict-origin-when-cross-origin";
      document.head.appendChild(script);
    }
    script.addEventListener("error", () => reject(new Error("The YouTube player API could not be loaded.")), { once: true });
  });

  return youtubeApiPromise;
}

function safeHttpsUrl(input: string): URL | null {
  try {
    const url = new URL(input);
    return url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function normalizedHostname(url: URL) {
  return url.hostname.toLowerCase().replace(/^www\./, "");
}

export function parseYouTubeReference(input: string): { videoId: string; startSeconds?: number } | null {
  if (YOUTUBE_ID.test(input)) return { videoId: input };
  const url = safeHttpsUrl(input);
  if (!url) return null;
  const host = normalizedHostname(url);
  const youtubeHosts = new Set(["youtube.com", "m.youtube.com", "youtube-nocookie.com"]);
  const segments = url.pathname.split("/").filter(Boolean);
  let videoId: string | null = null;

  if (host === "youtu.be") videoId = segments[0] ?? null;
  else if (youtubeHosts.has(host) && url.pathname === "/watch") videoId = url.searchParams.get("v");
  else if (youtubeHosts.has(host) && ["embed", "shorts"].includes(segments[0] ?? "")) videoId = segments[1] ?? null;

  if (!videoId || !YOUTUBE_ID.test(videoId)) return null;
  const rawStart = url.searchParams.get("start") ?? url.searchParams.get("t");
  const startSeconds = rawStart && /^\d+$/.test(rawStart) ? Number(rawStart) : undefined;
  return { videoId, startSeconds };
}

export function parseVimeoReference(input: string): { videoId: string; privacyHash?: string } | null {
  const url = safeHttpsUrl(input);
  if (!url) return null;
  const host = normalizedHostname(url);
  if (!["vimeo.com", "player.vimeo.com"].includes(host)) return null;
  const segments = url.pathname.split("/").filter(Boolean);
  const idIndex = segments.findIndex((segment) => VIMEO_ID.test(segment));
  if (idIndex < 0) return null;
  const videoId = segments[idIndex];
  const next = segments[idIndex + 1];
  const privacyHash = url.searchParams.get("h") ?? (next && /^[A-Za-z0-9]+$/.test(next) ? next : undefined);
  return { videoId, privacyHash: privacyHash ?? undefined };
}

function MediaFailure({ asset, message }: { asset: ExperienceMediaAsset; message: string }) {
  return (
    <Card className="experience-media-fallback">
      <strong>{asset.title}</strong>
      <p>{message}</p>
      <a href={asset.sourceUrl} target="_blank" rel="noreferrer">Open the source instead ↗</a>
    </Card>
  );
}

function ImageAsset({ asset }: { asset: ExperienceImageAsset }) {
  const [failed, setFailed] = useState(false);
  const delivery = safeHttpsUrl(asset.deliveryUrl);
  if (!delivery || failed) return <MediaFailure asset={asset} message="This image is unavailable. The source and rights record are still available." />;
  return (
    <figure className="experience-media experience-image">
      <img src={delivery.toString()} alt={asset.alt} loading="lazy" onError={() => setFailed(true)} />
      <figcaption>
        <span>{asset.title}</span>
        <span>
          {asset.creator ? `${asset.creator} · ` : ""}
          <a href={asset.sourceUrl} target="_blank" rel="noreferrer">Source ↗</a>
          {asset.licenseUrl ? <> · <a href={asset.licenseUrl} target="_blank" rel="noreferrer">License ↗</a></> : null}
        </span>
      </figcaption>
    </figure>
  );
}

function VideoAsset({ asset }: { asset: ExperienceVideoAsset }) {
  const [requested, setRequested] = useState(false);
  const [providerReady, setProviderReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const playback = useMemo(() => {
    if (asset.provider === "youtube") {
      const parsed = parseYouTubeReference(asset.sourceUrl);
      if (!parsed) return null;
      const query = new URLSearchParams({
        playsinline: "1",
        rel: "0",
        enablejsapi: "1",
      });
      if (typeof window !== "undefined") query.set("origin", window.location.origin);
      if (parsed.startSeconds) query.set("start", String(parsed.startSeconds));
      return {
        kind: "youtube" as const,
        src: `https://www.youtube-nocookie.com/embed/${parsed.videoId}?${query.toString()}`,
      };
    }
    if (asset.provider === "vimeo") {
      const parsed = parseVimeoReference(asset.sourceUrl);
      if (!parsed) return null;
      const query = new URLSearchParams();
      if (parsed.privacyHash) query.set("h", parsed.privacyHash);
      return {
        kind: "vimeo" as const,
        src: `https://player.vimeo.com/video/${parsed.videoId}${query.size ? `?${query.toString()}` : ""}`,
      };
    }
    const source = asset.deliveryUrl ? safeHttpsUrl(asset.deliveryUrl) : null;
    if (!source || !asset.mimeType) return null;
    return { kind: "direct" as const, src: source.toString() };
  }, [asset]);

  useEffect(() => {
    setProviderReady(false);
    setFailed(false);
  }, [asset.id, playback?.src]);

  useEffect(() => {
    if (!requested || !playback || playback.kind === "direct" || providerReady || failed) return;
    const timeout = window.setTimeout(() => setFailed(true), 12000);
    return () => window.clearTimeout(timeout);
  }, [failed, playback, providerReady, requested]);

  useEffect(() => {
    if (!requested || !playback || playback.kind !== "youtube" || failed) return;
    let disposed = false;
    let player: YouTubePlayerInstance | undefined;

    loadYouTubePlayerApi()
      .then((api) => {
        if (disposed || !iframeRef.current) return;
        player = new api.Player(iframeRef.current, {
          events: {
            onReady: () => {
              if (!disposed) setProviderReady(true);
            },
            onError: () => {
              if (!disposed) setFailed(true);
            },
          },
        });
      })
      .catch(() => {
        if (!disposed) setFailed(true);
      });

    return () => {
      disposed = true;
      try {
        player?.destroy();
      } catch {
        // Provider teardown must not block route navigation or leave audio running.
      }
    };
  }, [failed, playback, requested]);

  if (!playback) return <MediaFailure asset={asset} message="This video reference is not a supported provider URL or approved direct-video input." />;
  if (failed) return <MediaFailure asset={asset} message="The embedded player did not become available or reported a provider restriction. The core Experience remains usable without it." />;

  if (!requested) {
    return (
      <Card className="experience-media-load">
        <div>
          <strong>{asset.title}</strong>
          <p>Load this optional {asset.provider === "direct" ? "video" : `${asset.provider} player`} when you are ready.</p>
        </div>
        <Button onClick={() => setRequested(true)}>Load video</Button>
        <a href={asset.sourceUrl} target="_blank" rel="noreferrer">Open provider page ↗</a>
      </Card>
    );
  }

  if (playback.kind === "direct") {
    return (
      <figure className="experience-media experience-video">
        <video
          controls
          preload="metadata"
          poster={asset.posterUrl}
          onError={() => setFailed(true)}
        >
          <source src={playback.src} type={asset.mimeType} />
          {asset.captionsUrl ? <track kind="captions" src={asset.captionsUrl} srcLang="en" label="English" default /> : null}
          Your browser does not support this video.
        </video>
        <figcaption>
          <span>{asset.title}</span>
          {asset.transcriptUrl ? <a href={asset.transcriptUrl} target="_blank" rel="noreferrer">Transcript ↗</a> : null}
        </figcaption>
      </figure>
    );
  }

  return (
    <figure className="experience-media experience-video">
      <div className="experience-video-frame">
        <iframe
          ref={iframeRef}
          src={playback.src}
          title={asset.title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          onLoad={() => {
            if (playback.kind === "vimeo") setProviderReady(true);
          }}
        />
      </div>
      <figcaption>
        <span>{asset.title}</span>
        <a href={asset.sourceUrl} target="_blank" rel="noreferrer">Watch on {asset.provider === "youtube" ? "YouTube" : "Vimeo"} ↗</a>
        {asset.transcriptUrl ? <a href={asset.transcriptUrl} target="_blank" rel="noreferrer">Transcript ↗</a> : null}
      </figcaption>
    </figure>
  );
}

export function SharedExperienceMedia({ asset }: { asset: ExperienceMediaAsset }) {
  return asset.kind === "image" ? <ImageAsset asset={asset} /> : <VideoAsset asset={asset} />;
}
