# `@transl8.ai/review-sdk` changelog

This package is versioned independently of the transl8.ai product. Entries
before the move to this repository were written when the package was
`@transl8/review-sdk` and was self-hosted by the transl8.ai backend only.

## 0.9.2 — 2026-09-20 — Ask AI is hidden without `translation.analyze`

**Patch** — no change to the exported surface. The inspector's "Ask AI"
button now renders only when the SDK session carries `translation.analyze`
(the permission `POST /sdk/ai/analyze` enforces). Before, every session saw the
button and a session without the permission got the generic error on click.
The panel fails closed: `setCanAskAi(true)` is what shows it, and the client
calls `setCanAskAi(permissions.includes('translation.analyze'))` wherever it
already calls `setCanEdit` / `setCanPropose`. Rejected: hiding it server-side
only (the server already refuses; the fault was the dead button).

## 0.9.1 — 2026-09-19 — chrome strings now come from the transl8.ai platform, corrected

**Patch** — text only; no code, no exported-surface change. The seven
translation tables (`fr`, `es`, `it`, `ar`, `ru`, `uk`, `zh`) were regenerated
from the platform's own output (the SDK project on the MCP server) and then
corrected by review: 403 of 581 strings (69%) kept as the platform wrote them,
178 (31%) changed. `dir` and `launcher.keysLabel` are unchanged.

What the corrections were, in order of weight: wrong sense on short labels
("Source" rendered as "Apply"/"Translation", "Locale" as a bare language name,
"Review" as "comment", "Version" as "Révision"); one term per concept
(review, report, key, AI/IA); the shortcut name `Ctrl+Shift+T` kept literal
(the platform localized it to "Ctrl+Maj+T" in fr and "Ctrl+Maiusc+T" in it);
typographic apostrophes in fr/it; agreement and grammar slips (ar, es, it, uk).
Translations are still machine-authored and **not native-reviewed**; ar, uk, ru
and zh carry the highest risk.

## 0.9.0 — 2026-09-19 — chrome strings in fr, es, it, ar, ru, uk, zh

**Minor** — additive behavior, no change to the exported surface. The
SDK's own UI (launcher, inspector, AI panel, issue-type labels, review-mode
badges) now renders in `fr`, `es`, `it`, `ar`, `ru`, `uk` and Simplified
Chinese `zh` as well as `en`, chosen from the same `locale` the host passes
to `ReviewSdk.init()` / `setLocale()` (the 0.7.2 design is unchanged: no
separate UI-locale control). Lookup is by base language, so `fr-CA`,
`ar-EG`, `uk-UA` and every `zh-*` tag resolve to their table — `zh-TW` /
`zh-Hant` get the Simplified table until a Traditional one exists. Any other
locale still renders in English.

- One file per language (`src/ui/strings-<lang>.ts`); plurals through
  `Intl.PluralRules` (ru/uk `one/few/many/other`, ar all six categories).
- `ar` sets `dir="rtl"` on the SDK root (`SdkUiStrings.dir`, follows the
  resolved chrome language, so untranslated RTL locales stay LTR). Launcher,
  AI-panel chip and badge padding moved to logical CSS properties. Known
  leftovers: the inspector Details chevron and the glossary chip arrow are not
  mirrored.
- `dist/index.global.js` grows from ~22 KB to ~29.6 KB gzip (≈+34%); most of
  the raw growth is esbuild's ASCII escaping of Arabic/Cyrillic/CJK text,
  kept so a host serving `/sdk/bundle` without a UTF-8 charset cannot garble it.
- Translations are machine-authored and have not had native-speaker review.

## 0.8.1 — 2026-09-19 — idle-state launcher badge fix

**Patch** — bugfix only, no public-surface change. `ReviewModeElementTracker.reposition()`'s
zero-elements branch called `onCountChange?.(0)` unconditionally, so an
ordinary page scroll or window resize while review mode was `idle` flipped
the launcher's persistent "Review" label to "0 keys" with no user action
related to review mode at all. Now guarded on `stateMachine.state !== 'idle'`,
mirroring the guard `setLocale()` already had for the same root cause.

## 0.8.0 — 2026-09-14 — silent session refresh, smaller bundle

**Minor** — one additive export: `SdkSessionExpiredError` is now re-exported
from `src/index.ts`. It was already declared and thrown internally
(`sdk-client.ts`) but never re-exported, so a host's documented
`error instanceof SdkSessionExpiredError` recovery branch could never
actually match anything imported from the package root — this was a bug in
the public surface, not new behavior added to it.

Everything else in this release is either internal or server-side, so not a
public-surface change under this package's own bump policy: `ReviewSdk` now
schedules a silent `POST /sdk/session/refresh` 60s before `sessionExpiresAt`
(no new public method — existing `getSessionToken()`/`getSessionExpiresAt()`
just reflect the refreshed values), and `captureElementScreenshot` (an
internal UI helper, never exported from `src/index.ts`) now takes a runtime
capture-module URL instead of a static `import('html2canvas')`, splitting
html2canvas into its own `dist/capture.js` — `dist/index.global.js` gzip
dropped from 67,580 B to ~20,504 B.
## 0.7.2 — SDK chrome speaks the content locale

The SDK's own chrome — Inspector/AI-panel/report-form/badge/launcher button
text, panel titles, status and error messages — now sources its strings from
`getStrings(locale)` (`src/ui/strings.ts`) using the same `locale` a host
passes to `init({ locale })` / `setLocale()`, instead of hardcoded English
throughout each UI component. There is no separate UI-locale control: chrome
locale always mirrors content locale by design. Only `en` has translated
strings today; every other locale still renders the SDK's own chrome in
English until translated (tracked separately, not a bug).

This release wires the last two call sites: the persistent launcher badge
(`Transl8Launcher.setLocale`) and the review-mode element badges
(`ReviewModeElementTracker.setLocale` → `Transl8ReviewModeBadges.render`),
both of which — unlike the panels — don't close/remount on a locale change,
so each re-renders its own chrome text immediately from `sdk.onLocaleChange`
rather than waiting for the next unrelated re-render trigger. No public API
change (Patch).

## 0.7.1 — sourcemap kept as a CI artifact, not a route

The IIFE build now emits `sourcemap: 'external'` instead of `false`
(`scripts/build.mjs`): `dist/index.global.js.map` is written to disk, and the
bundle still carries no `sourceMappingURL` comment, so the
"unservable sourcemap" check keeps passing unchanged. CI (`.github/workflows/
ci.yml`) uploads the map as `review-sdk-sourcemap-<version>`,
retention 90 days, for offline symbolication of a customer's minified stack
trace. The host that self-hosts the bundle still copies only
`index.global.js`; the map is never served. Verified once against the real
built map: a known class member's minified position resolves back to its
exact original `src/client/sdk-client.ts` line.

## 0.7.0 — SDK version negotiation

The build now embeds its own `package.json` version at build time
(`SDK_VERSION`, `src/client/version.ts`, injected by `scripts/build.mjs`'s
esbuild `define`) and sends it as `X-Sdk-Version` on `POST /sdk/session`.
The server refuses to mint a session for a reported build below
`SDK_MIN_SUPPORTED_VERSION` with an actionable `400`. A request with no
`X-Sdk-Version` header — every existing caller until it rebuilds against
this version — is not refused; only a client that actively reports an old
version is.

## 0.6.0 — no unservable sourcemap, no dead postContext method

**Breaking:** `ReviewSdk.postContext()` is removed. Nothing in the
SDK's own UI called it, and nothing read the `sdk_context` audit rows it wrote
server-side — nine months live with zero readers. The server route
(`POST /sdk/events/context`) and its DTO are deleted too.

The IIFE build (`dist/index.global.js`, the one `GET /sdk/bundle` actually
serves) no longer sets `sourcemap: true`. The deploy path never
copied the `.map` file and the host had no static-file route that could
have served it, so the bundle was advertising a `sourceMappingURL` that
resolved to a 404 on every customer page. `scripts/verify-dist.mjs` now fails
the build if that regresses.

## 0.5.0 — minified builds

`scripts/build.mjs` now passes `minify: true`. The package had always shipped
unminified.

| Artifact | Before | After | Delta |
|---|---|---|---|
| `dist/index.global.js` raw | 557,054 B | 291,720 B | -47.6% |
| `dist/index.global.js` gzipped | 96,850 B | 67,981 B | **-29.8%** |
| `dist/index.js` gzipped | 95,787 B | 67,847 B | -29.2% |

`sourcemap: true` is unchanged. Nothing here depends on identifier names —
custom-element tags are string literals and the only `.name` reads are
`DOMException.name`.

> **Correction (see 0.6.0 below):** the "stack traces still
> resolve" half of that sentence was true of `dist/`, not of the deploy — the
> map was never copied to the self-hosting host and nothing could have served
> it. Fixed in 0.6.0.

`scripts/verify-dist.mjs` additionally asserts that the custom elements register
and that the IIFE build defines its `Transl8ReviewSdk` global, which nothing
checked before.

## 0.4.0 — screenshot capture is opt-in

**Breaking for hosts that rely on screenshots.** `ReviewSdk.init()` now takes
`captureScreenshots?: boolean`, defaulting to **false**. With it off, nothing is
rendered and `html2canvas` is never executed.

The SDK's design already stated "Screenshots are opt-in" as a guarantee,
listed beside "Password / input values are never collected". The SDK captured
unconditionally until now, so the guarantee was documented and not kept. Pass
`captureScreenshots: true` to restore the previous behaviour.

`html2canvas` moved behind a dynamic import. This does **not** shrink
`dist/index.global.js` (measured: 96,798 → 96,850 bytes gzipped) — esbuild cannot
code-split an IIFE, so it stays inlined. What changes is that its module body is
no longer evaluated on page load, only on the first capture.

## Bump policy

Semver, scoped to this package's public surface: everything re-exported from
`src/index.ts` (`ReviewSdk`, `resolveElementContext`, error classes,
exported types), plus the wire contracts it depends on (the `SdkContext`
event/DTO shapes sent to `/sdk/*`, the `transl8:*` custom events it
dispatches).

- **Breaking** — removed/renamed export, changed method signature, changed
  required fields, removed/renamed custom event or its payload shape. While
  the package stays pre-1.0 (see below), a breaking change bumps **minor**
  instead of major, per semver's own 0.x convention.
- **Minor** — additive, backward-compatible change to the public surface
  (new export, new optional field, new custom event).
- **Patch** — internal fix/refactor with no change to the public surface.

Stays **0.x** until at least one real external consumer is running a pinned
build in production — before that, "breaking" has nothing to actually break.

## 0.3.0 — 2026-09-02 — locale switching, teardown, and report screenshots

Minor: additive to `src/index.ts` (`ReviewSdk.setLocale`) and to the
`transl8:*` event contract (`transl8:set-locale`, new — the first *inbound*
`transl8:*` event; every other `transl8:*` event is dispatched by the SDK,
not listened for). No existing export, method signature, or event changed.

- **`ReviewSdk.setLocale(locale: string): void`** repoints every
  subsequent `/sdk/*` request (translation lookups, applies, proposals, AI
  analysis) at a new target language. No re-authentication and no new
  session — the SDK session token doesn't carry locale, so this is a plain
  field update, not a round trip.
- **`transl8:set-locale` window event** — a second entry point for a host
  that loaded the bundle via a bare `<script>` tag and has no reference to
  the object `init()` returned: `window.dispatchEvent(new CustomEvent('transl8:set-locale', { detail: 'de' }))`
  does the same thing as calling `setLocale('de')` on the instance.
- If a review panel (Inspector / Ask AI / Report) is open when the locale
  actually changes, it closes — its content was resolved in the language
  that just became stale. If review mode was active, it stays active
  (badges re-scan the page for the new language instead of review mode
  turning itself off); if review mode was off, it stays off. Setting the
  locale to its current value is a no-op — it does not close an open panel
  or touch review mode.
- `locale` is validated as a BCP-47 tag (via the platform's own
  `Intl.getCanonicalLocales`) and stored in its **canonical** form — e.g.
  `'en-us'` becomes `'en-US'` — so two different-cased calls that name the
  same language are treated as the same locale, and every request after
  either one sends identical casing. Anything that isn't a syntactically
  valid tag (not a string, empty, malformed) is rejected silently — the
  current locale is kept and nothing is sent to the backend. This applies
  to `init()`'s `locale` option too, not only `setLocale` — `getLocale()`
  may therefore return a different casing than what was passed to `init()`
  if that value wasn't already canonical; the request payloads that get
  sent, not the exact bytes the host typed, are what changing this made
  correct. A value `Intl` doesn't recognize at all is left as-is (same as
  before this change) rather than rejected at startup — it will produce
  empty lookups from the backend, the existing behavior for an unknown
  locale.
- A request already in flight when the locale changes completes normally,
  but its result is discarded if it arrives after the locale has moved on
  again — no stale-language content is painted into a panel, and no
  stale-language value is written back onto the host page's DOM. The
  request itself is never cancelled or aborted; it simply has no visible
  effect once it's no longer about the locale the reviewer is currently
  looking at.
- **`ApplyTranslationRejectedError`** (new export) — `applyTranslation()`
  now throws this on a 400 (e.g. the translation is already published and
  `ApplySdkTranslationHandler` refuses to edit it), carrying the server's
  own message. Previously a 400 fell through to a generic assertOk() Error
  the Inspector/AI panel rendered as "Something went wrong" — the real,
  actionable reason is shown instead.
- **Ask AI now uses the project glossary.** The backend matches the
  project's glossary terms against the current string's source text
  (case-insensitive substring) and (a) feeds the matched terms into the AI
  prompt as `Glossary rules`, so suggestions honor house terminology
  automatically, and (b) returns them as `matchedTerms` on the analysis
  result — the AI panel renders them as a "Glossary terms used" chip row
  (hidden when empty). The lookup fails open (a glossary DB error degrades
  to no glossary terms, not a failed request) and is bounded by the same
  deadline as the AI call itself, same as every other read on this path.
  No new SDK export or request shape; `matchedTerms` is an additive,
  optional field on the existing `analyzeTranslation()` result — its
  `targetTerm` may be `string`, `null` (recorded with no target term yet),
  or absent. This is a
  narrow, deliberate exception to "project config never reaches the AI
  provider".
- Inspector: a `version: 0` lookup (no translation for this language yet —
  see the backend's apply-translation create path) showed the epoch
  (`01/01/1970`) as its "updated" timestamp. Now shows "Not translated
  yet" — the epoch was never a real event. The current-value field itself
  stays empty, as before; the key now shows up on the host page's own
  untranslated elements instead, not inside this panel.
- `mountLauncher`'s `connectSdkEventStream` handle was
  discarded, so nothing could ever stop the SSE stream; `ReviewSdk.destroy()`
  (new export surface, additive) now closes it and removes the
  `transl8:set-locale` window listener added by `init()`. The stream also
  used to retry a dead session token forever after expiry — it now reads
  the browser's own `readyState` before reconnecting: a `CLOSED` readyState
  (the non-2xx/401 case) is treated as terminal instead of retried. A new
  optional `onSessionExpired?: () => void` on `ReviewSdkInitOptions` fires
  once the stream gives up for good (terminal failure or reconnect budget
  exhausted), so the host can re-`init()` deliberately. No auto-refresh —
  There was no refresh endpoint to call yet.
- **`ReviewSdk.uploadReportScreenshot(reportId: string, blob: Blob):
  Promise<void>`** (new additive export) — **Minor**, per the bump policy
  above (additive to the public surface, no existing export or signature
  changed). Uploads a screenshot captured for an already-submitted review
  report to `POST /sdk/reviews/:id/screenshot`. Used internally by the new
  `captureElementScreenshot` utility (not itself exported), which wraps
  this package's first-ever runtime dependency, **`html2canvas`** — note
  the bundle-size tradeoff this brings (the SDK's single IIFE bundle, served to
  every host-page visitor, grows by `html2canvas`'s ~410 KB unminified).

## 0.2.1 — 2026-08-31 — every request has a deadline

Patch: no public surface changes.

`init()` and `analyzeTranslation()` each grew their own 10s AbortController
when a hung backend was found to hang them. The other five network calls never
got one, so a backend that accepted the connection and then went quiet left the
Inspector spinning with no error and no way back — the exact failure the first
two were fixed for, still reachable through `getTranslation`, `postContext`,
`reportIssue`, `applyTranslation` and `proposeTranslation`.

All seven now share one `fetchWithTimeout()` rather than a third copy of the
same dance. Each rejects with a `DOMException` named `TimeoutError`, which the
existing callers already tell apart from a caller-triggered `AbortError`; every
call site already had a `.catch`, so nothing becomes an unhandled rejection.

Timing out a write is safe to retry: apply and propose both carry
`expectedVersion`, so a retry after a request that actually landed conflicts
with 409 rather than writing twice.

Note for consumers asserting on `fetch` calls in tests: every request now
carries a `signal`.

## 0.2.0 — 2026-08-29 — UI redesign

Minor: no change to `src/index.ts` exports, the `SdkContext` wire shapes, or
the `transl8:*` events.

- One token stylesheet (`src/ui/tokens.ts`), a single constructed
  `CSSStyleSheet` adopted by every Shadow root (with a `<style>` fallback
  where `adoptedStyleSheets` isn't available), replaces four different
  accent colours scattered across five components — colour, type, space,
  radius and motion now have one definition each. Enforced going forward by
  `no-colour-literals.test.ts`, which fails any `src/ui/*.ts` file other
  than `tokens.ts` that reintroduces a hex, an `rgb()`/`rgba()` literal or
  a named CSS colour.
  Eleven inline SVG icons (`icon()`) replace the emoji set; `<use>` sprite
  refs don't resolve across a shadow boundary, so each icon is inlined as
  complete markup.
- Inspector, AI and report panels are repainted onto the shared token sheet
  — the inspector's radial gradients and gradient-clipped title and the
  other two panels' ad-hoc `#1a73e8` Material palette are gone in favour of
  one surface and one palette.
- A `transl8-panel-shell` custom element now owns the frame, header and
  persistent key row; the inspector, AI and report views are slots inside
  it instead of three independent dialogs pinned to the same coordinates,
  so opening the AI view no longer unmounts the inspector and loses the key
  the user was looking at. Each view still owns its own actions row. The
  panel renders in the native top layer (`popover="manual"`) so it can't
  lose a z-index fight with the host page, and animates in/out with
  `@starting-style` (instant under `prefers-reduced-motion`); the loading
  state is a skeleton shaped like the loaded panel instead of a layout
  shift.
- Launcher (`transl8-launcher`) reads as a neutral-when-idle,
  accent-when-active status pill — state carried by `aria-pressed`, icon
  fill and a visible label, not colour alone — instead of a red circle that
  read as a fault on a healthy page.
- Inspector puts source and translation adjacent at the top (Apply is the
  one primary action); secondary detail moves into a collapsed `<details>`.
- AI results lead with a three-segment confidence meter and a diff against
  the current value instead of small grey text under an uncompared string;
  low confidence demotes Apply to a ghost button.
- Review mode is legible at real page density: a dashed frame and a small
  dot at rest, with the labelled "Edit" badge resolving only on hover/focus
  so one element is loud at a time instead of every translatable element
  getting a solid frame and a 20px badge simultaneously.
- Panels have `role="dialog"`, move focus in on open and back to the
  opener on close, and dismiss on Escape (not a full focus trap — the SDK
  is a guest in a page it doesn't own). "The opener" is resolved through
  the shadow chain, since every real opener — the review-mode badge, the
  inspector's own Ask AI / Report buttons — sits inside a shadow root and
  `document.activeElement` reports only its host; a badge click also
  focuses the badge, which Chromium does on its own but Safari and Firefox
  do not. Escape and the header's dismiss control both read the one
  `dismissAction()` table, so a state with no exit edge (an in-flight
  apply/propose/analyse/submit) is inert for both instead of Escape tearing
  the panel off screen behind the state machine's back.
- Leaving review mode closes the panel. Previously the shell stayed painted
  over the host page with the badges already cleared, the header's X
  disabled and Back hidden — nothing left on screen could dismiss it.

### Also in 0.2.0, from the unreleased post-0.1.1 work

These landed after 0.1.1 and were documented in an `Unreleased` section
that the 0.2.0 rewrite dropped; they ship as part of this version.

- Selecting an element to inspect is now exclusively a review-mode badge
  click: every `[data-translation-key]` element gets a persistent frame +
  badge button for as long as review mode is active (new
  `transl8-review-mode-badges` custom element + `ReviewModeElementTracker`,
  which also rescans on DOM mutations so SPA-added/removed/re-tagged
  elements stay in sync). `HoverTracker` no longer intercepts clicks on the
  host element itself — it only shows/hides the hover highlight box now —
  which is what fixes a translated link/button sometimes navigating instead
  of opening the inspector.
- `ReviewSdkStateMachine` gained a direct `review-mode-active` →
  `element-selected` edge on `element.click`, for a badge click that never
  went through `hovering` first.

## 0.1.1 — 2026-08-27

**Patch.** `connectSdkEventStream`'s reconnect backoff now applies equal
jitter (delay ranges from half the exponential backoff to the full value)
instead of a fixed delay, so a fleet of clients dropped by the same backend
blip doesn't reconnect in lockstep. No change to the public surface —
`ReviewSdkInitOptions`, exports, and wire contracts are unchanged.

## 0.1.0 — 2026-08-21

Initial package scaffold. The version field held `0.1.0` unchanged through
the initial feature work and the delivery work (build pipeline +
self-hosted serving) — this
changelog is the first thing to actually apply the bump policy above, on
whatever SDK change ships next.
