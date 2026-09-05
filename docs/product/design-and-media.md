# Design, branding, stock media, and video

**Version:** 1.0.0 · **Date:** 2026-09-05 · **Status:** Target requirements; no player implementation is claimed  
**Parent requirements:** [NUR-03–NUR-04, NUR-08–NUR-09, NUR-12, NUR-29–NUR-31, NUR-33](nurture-product-spec.md)  
**Baselines:** Apple HIG, the repository's Nurture brand guide, and the owner's request for linked stock images/video including YouTube.

## 1. Design authority — DESIGN-01

Use [Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/) as interaction/design guidance and [Nurture's brand guide](../../brand/README.md) as the canonical visual system. This React web application is HIG-inspired, not a native Apple app or Apple-certified product. Native point dimensions and native APIs are not automatically CSS specifications.

The Nurture-specific requirements below translate that direction into web acceptance criteria. Accessibility and usable content take precedence over glass effects, background media, or an organization's color preference.

## 2. Canonical assets and organization overrides — DESIGN-02

Consume these existing files rather than inventing replacements:

| Asset | Canonical source |
| --- | --- |
| Brand guide | [`brand/README.md`](../../brand/README.md) |
| Gradient N | [`brand/logo/nurture-n.svg`](../../brand/logo/nurture-n.svg) |
| Monochrome N | [`brand/logo/nurture-n-mono.svg`](../../brand/logo/nurture-n-mono.svg) |
| Platform-neutral tokens | [`brand/tokens.json`](../../brand/tokens.json) |
| CSS tokens/fallbacks | [`brand/tokens.css`](../../brand/tokens.css) |
| Visual reference | [`brand/preview.html`](../../brand/preview.html) |

The existing public brand asset sync is the distribution mechanism, not another design source. Default navigation/identity/offer/Experience surfaces must actually render the N asset; writing “Nurture” as text is not a substitute. Preserve the guide's 25% clear space, recommended 28px-or-larger logo, and 20px absolute small-format floor. Do not distort or redraw the ribbon N.

Organization administrators may replace their logo, hero, icon, copy, and permitted theme tokens. Those are scoped overrides; they must not overwrite the canonical Nurture asset or rebrand platform administration. Missing/invalid overrides fall back to the approved Nurture default and generate an actionable admin warning.

## 3. Functional glass and visual hierarchy — DESIGN-03

Follow the brand guide's calm blue-to-cyan system, system typography, 4px spacing rhythm, and semantic colors. The default light-mode action accent is `#0264EC`; do not replace it with a brighter low-contrast color merely to match a photo. Use system fonts without bundling Apple font files.

Glass belongs primarily to navigation, floating controls, and overlays. Reading areas, forms, tables, checkout, and onboarding stay comparatively quiet/opaque. Use the shared glass tokens rather than nested translucent cards. Provide opaque fallback for unsupported blur, reduced transparency, and increased contrast. Organization overrides must pass the same contrast and legibility checks.

Apple's [Materials](https://developer.apple.com/design/human-interface-guidelines/materials) guidance is the external reference; the repository brand guide determines Nurture's actual token values. Do not claim CSS blur is the native Liquid Glass rendering system.

## 4. Interaction and accessibility — DESIGN-04

Nurture web acceptance criteria include keyboard operation, visible focus, semantic headings/landmarks/labels, understandable error recovery, text reflow, and explicit loading/empty/error/completion states. Retain the brand guide's 44 × 44 CSS-pixel default targets and 17px default body text. Test light/dark, enlarged text, reduced motion, and reduced transparency independently.

Target WCAG 2.2 AA for the implemented web surfaces, with documented exceptions rather than an unsupported compliance claim. Standard text needs at least 4.5:1 contrast; qualifying large text may use 3:1. Use non-color cues and ensure focus and important controls are not obscured. Validate keyboard-only flows, 200% text enlargement, and narrow-screen reflow. Caption meaningful speech, provide a transcript or equivalent information, and supply audio description where visual content conveys otherwise unavailable information.

Sources: [Apple Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility), [WCAG 2.2](https://www.w3.org/TR/WCAG22/). The exact web tests are Nurture requirements, not claims that Apple requires every listed CSS value.

Use familiar controls, a clear primary action, progressive disclosure, and preview-before-publish. No mandatory tour of the pipeline. Each organization can change content without changing the navigation/security model. The Experience is the visual focus for customers.

## 5. Shared media model — MEDIA-01

Brand & Site, onboarding, informational content, and Experience modules use one media service/renderer. Support an uploaded image, approved external image URL, supported provider video URL, or uploaded/direct-file video. Keep the creator/source page separate from the actual delivery URL or provider asset ID: a Pexels page is not an MP4 URL.

Required metadata:

| Field group | Stored information |
| --- | --- |
| Identity/scope | Asset ID, organization or platform-default scope, media kind, version |
| Provider | Provider name, canonical source URL, provider asset/video ID, delivery mechanism |
| Rights | Creator, source link, license link/type, acquisition/check date, attribution text, permission notes and approval state |
| Presentation | Title, descriptive alt text or decorative flag, poster, intrinsic dimensions/aspect ratio, focal point/crop, fit |
| Accessibility | Caption tracks/languages, transcript or equivalent content, audio-description availability, motion policy |
| Controls | Autoplay off by default, muted/loop flags where allowed, player-control mode, external fallback link |
| Operations | Validation status, last availability check, published references, failure fallback |

For signed delivery URLs, retain the stable asset identity rather than publishing an expired token as permanent configuration. Do not expose third-party API keys or private storage credentials. Do not accept arbitrary HTML, scripts, `javascript:`/`data:` URLs, localhost/private-network imports, or lookalike provider hosts. Server-side metadata fetches require provider allowlists, redirect checks, size/time limits, and SSRF protection.

## 6. Linked stock images and footage — MEDIA-02

Use these concrete source pages as **linked starter candidates**, not fabricated assets. They are references for selecting actual media during implementation; no file has been downloaded or published by this documentation change. Confirm final crop, playback, rights, and relevance before marking any asset production-approved.

| Candidate | Creator and source link | Suggested use | Rights/source status |
| --- | --- | --- | --- |
| Abstract Blue Background | [Steve A Johnson / Pexels, asset 24712929](https://www.pexels.com/photo/abstract-blue-background-24712929/) | Brand-compatible default hero/detail image behind a readable content surface | Source page reviewed; [Pexels license](https://www.pexels.com/license/) |
| A modern workspace with computer accessories organized | [Robert Bye / Unsplash, Eq76mDacpto](https://unsplash.com/photos/a-modern-workspace-with-computer-accessories-organized-Eq76mDacpto) | Optional organization-selected technology/workspace imagery; not a required Nurture vertical | Page identifies the free [Unsplash license](https://unsplash.com/license/); review visible product/brand rights for the chosen use |
| Abstract Blue Flowing Waves Animation | [Nicola Narracci / Pexels, asset 34163494](https://www.pexels.com/video/abstract-blue-flowing-waves-animation-34163494/) | Optional subdued decorative video with static poster fallback | Source page reviewed; [Pexels license](https://www.pexels.com/license/); playback/accessibility approval remains outstanding |
| Abstract Blue Sculptural Animation Loop | [Nicola Narracci / Pexels, asset 34327133](https://www.pexels.com/video/abstract-blue-sculptural-animation-loop-34327133/) | Alternative abstract footage, selected by an administrator | Source page reviewed; same license and approval gate |

Linked source libraries: [Pexels photos/videos](https://www.pexels.com/), [Unsplash](https://unsplash.com/), and [Mixkit footage](https://mixkit.co/free-stock-video/). Provide an administrator-visible source/credit link for every stock asset, plus public attribution where required or chosen.

Pexels allows broad use but prohibits uses such as implied endorsement, unaltered resale, and stock redistribution; its imagery must not become the Nurture trademark. The free Unsplash license and Unsplash+ license are different. Unsplash+ restricts digital-template use, so do not seed those assets into a reusable shell under an assumption of identical rights. Mixkit has both Free and Restricted video licenses; check the specific clip. Third-party people, brands, property, music, or artwork may require additional review beyond the stock copyright license.

Provider/API rules can differ from downloaded-asset licenses. An Unsplash API integration must use returned image URLs and follow API credit/download-event requirements; do not apply a blanket cache/rehost policy to API results. For other assets, use approved hosting only when the asset/license permits it. A provider page link remains the provenance record even when a licensed derivative is delivered from approved storage.

Sources: [Pexels license](https://www.pexels.com/license/), [Unsplash license](https://unsplash.com/license/), [Unsplash+ license](https://unsplash.com/plus/license), [Unsplash third-party-rights guidance](https://help.unsplash.com/en/articles/2646379-what-if-there-s-a-brand-or-identifiable-person-depicted-in-an-image-that-i-download), [Unsplash API documentation](https://unsplash.com/documentation), [Mixkit licenses](https://mixkit.co/license/).

## 7. Video provider support — MEDIA-03

The first shared media implementation must support **YouTube, Vimeo, and approved direct/uploaded HTML5 video**. Stock-footage libraries supply licensed files; they are not interchangeable iframe players. Additional adapters may be added without changing each Experience.

| Provider path | Admin input | Playback contract |
| --- | --- | --- |
| YouTube | Supported watch/share/embed/Shorts URL or a validated video ID | Official embedded player; preserve provider controls and restrictions |
| Vimeo | Supported video/share URL and required privacy token where applicable | Provider embed; respect video-owner/domain/privacy restrictions |
| Direct/uploaded | Authorized MP4/WebM file reference with compatible encoding | Shared HTML5 player, poster, caption tracks, standard controls |
| Additional provider | A separately reviewed adapter | Must meet equivalent security/accessibility/failure tests before activation |

Vimeo embedding depends on the video's privacy and provider features; private/blocked content cannot be made playable merely by storing its URL. Support documented URL forms, preserve needed unlisted tokens, and show a clear failure. See [Vimeo's embedding guide](https://help.vimeo.com/hc/en-us/articles/12426259908881-How-to-embed-my-video).

For direct files, validate media type and browser codec support, range requests, delivery authorization, and cross-origin captions. Unsupported streaming manifests must be rejected or explicitly supported by an approved adapter; a file extension alone does not prove playability. Provider links are not a security mechanism for paid private media.

## 8. YouTube must actually play — MEDIA-04

### Input and URL handling

Accept and normalize these forms to a validated single video ID: `youtube.com/watch?v=ID`, `youtu.be/ID`, `youtube.com/embed/ID`, `youtube-nocookie.com/embed/ID`, `youtube.com/shorts/ID`, and supported mobile-domain equivalents. Parse with the URL API and exact host checks, not substring matching. Reject channel/search/playlist-only URLs when a single video is required. Accept only explicitly supported start-time parameters and discard unrecognized executable or tracking fields.

Render an official HTTPS iframe, not a watch page inside a generic iframe and not a YouTube URL inside `<video>`. Prefer the privacy-enhanced embed domain when appropriate. It changes personalization behavior; it is not a claim of zero third-party data processing. Delay provider requests behind the applicable consent/explicit-load choice and provide a usable static placeholder before load.

### Player integration

When lifecycle playback hooks are needed, use the official IFrame Player API, load it once, and dispose player/listeners on unmount. Set `enablejsapi=1`, `playsinline=1`, and the actual page origin when using JS control. Do not hard-code production origin into localhost or preview deployments. Preserve a valid browser Referer; use a suitable policy such as `strict-origin-when-cross-origin`, not blanket `no-referrer`, and verify preview/production behavior.

Use a descriptive iframe title, keyboard-reachable standard controls, visible play action, fullscreen permission, and a responsive frame. Honor YouTube's minimum 200 × 200 player viewport; a narrow 16:9 layout must not shrink height below that minimum. Preserve layout space before load.

Default to user-initiated playback. Handle ready/error/state and blocked-autoplay outcomes without reporting a successful play merely because a request was made. Do not let a destroyed player continue audio after navigation. Restrict any Nurture playback logging to the documented consent/purpose and provider policies; never use viewing as financial proof or a referral-reward condition.

### Error and restriction behavior

Handle removed/private videos, owner-disabled embedding (including errors 101/150), missing client identification/Referer (153), invalid IDs, network/CSP failures, blocked cookies/consent, and region/age restrictions. Where API detection is unavailable, provide a timeout/help path rather than an endless spinner. Show a poster or neutral fallback, explanation, retry where useful, and **Watch on YouTube** link when permitted.

Do not promise that all YouTube videos can be embedded. Do not bypass owner restrictions, download/rehost a YouTube video, obscure player UI/ads, or promise that `rel=0` removes all related videos. `modestbranding` is not a reliable branding-removal feature. YouTube is not a silent decorative-background-video service or access control for private paid content.

### Linked implementation fixture

Use [Google's IFrame API sample video](https://www.youtube.com/watch?v=M7lc1UVf-VE) as a replaceable integration fixture, not Nurture marketing or licensed stock footage. Its current embeddability must be checked in the actual test environment. Test the same ID through supported URL forms; keep it separate from production media selections.

Official references: [player parameters](https://developers.google.com/youtube/player_parameters), [IFrame API and errors](https://developers.google.com/youtube/iframe_api_reference), [client identity / required functionality](https://developers.google.com/youtube/terms/required-minimum-functionality), [privacy-enhanced embedding](https://support.google.com/youtube/answer/171780).

### Interaction with offers, surveys, and incentives

Paid Nurture offers must provide independent Experience value; do not sell access to otherwise free YouTube playback. Do not require a survey, referral share, or other promotional action before allowing a user to watch a selected YouTube video, and do not reward watching it. Privacy consent is handled through the appropriate consent flow. Review the provider policy before combining an embed with entitlement gates or derived analytics. Source: [YouTube developer-policy guide](https://developers.google.com/youtube/terms/developer-policies-guide).

## 9. Media experience, consent, and performance — MEDIA-05

Images need responsive variants, intrinsic dimensions, useful alt text or an explicit decorative designation, and a meaningful failure fallback. Store a focal point so mobile crops do not obscure important content. Do not lazy-load the principal above-the-fold image; defer noncritical media/player scripts. These are Nurture performance choices, not claims that every provider behaves alike.

Meaningful video defaults to controls and no autoplay with sound. Optional decorative hero video may use only approved licensed direct footage, muted, with pause/stop, static poster, and reduced-motion/data-saving fallback. It must not carry essential instructions and must not become a distraction behind form fields. On reduced motion, default to the static treatment.

Maintain visible brand identity, readable copy, captions/transcripts, and usable controls over all media variants. Essential registration, purchase, survey response, or cancellation cannot depend on a third-party player loading successfully. Apple references: [Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility) and [Playing video](https://developer.apple.com/design/human-interface-guidelines/playing-video).

Use a provider-specific Content Security Policy and permissions configuration, tested with actual preview/production origins. Do not resolve a failure by allowing every frame/script host, disabling security headers, or suppressing Referer for YouTube. Do not describe click-to-load as a complete legal consent implementation; determine the applicable policy before launch.

## 10. Media acceptance matrix — MEDIA-06

| Test | Required result |
| --- | --- |
| Default organization | Canonical N logo renders; linked stock candidate can be configured with provenance and a fallback |
| Scoped customization | Organization A's logo, hero, video, and footer do not change organization B or platform administration |
| Publish isolation | Unpublished asset/content changes remain in preview |
| Image breakage | Wrong URL, blocked host, failed request, and oversized upload fail safely |
| Rights metadata | Source/creator/license link persists through selection, publish, and replacement |
| YouTube forms | Supported watch, short share, embed, Shorts, and mobile URL forms resolve to the same video |
| YouTube environments | User-initiated playback succeeds on localhost, hosting preview, and production with correct origin/Referer |
| Restricted YouTube | Private/deleted/embed-disabled/153/blocked cases show a useful state and external fallback, not false success |
| Vimeo | Supported normal/unlisted video works where embedding is allowed; restrictions are explained |
| Direct video | Compatible MP4/WebM and caption tracks play; unsupported types fail clearly |
| Accessibility | Keyboard and screen-reader labels work; captions/equivalent content present; motion reduction produces a static fallback |
| Responsive layout | Phone, tablet, and desktop keep player controls visible and honor provider minimum dimensions |
| Consent/loading | No forbidden third-party request before the configured consent/load action; core application remains usable without playback |
| Lifecycle isolation | Media failure cannot grant an entitlement or generate a financial/referral reward |
| Security | Lookalike hosts, executable URLs, arbitrary iframe HTML, and cross-tenant asset references are rejected |

Record browser/device, page origin, provider fixture, consent state, expected/actual outcome, and evidence date. Browser verification is a future implementation acceptance gate; this specification does not claim that playback has already been tested.
