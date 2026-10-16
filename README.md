# @transl8.ai/review-sdk

Browser SDK for in-context translation review with [transl8.ai](https://transl8.ai).
It adds a review launcher to your page: reviewers hover keyed text, inspect and
propose translations, ask the AI for an analysis, and report issues. It talks to
a transl8.ai backend through the `/sdk/*` API.

## Install (npm)

```bash
npm install @transl8.ai/review-sdk
```

```ts
import { ReviewSdk } from '@transl8.ai/review-sdk';

const sdk = await ReviewSdk.init({
  apiBaseUrl: 'https://your-transl8-host/api/v1',
  projectId: 'your-project-id',
  apiKey: 'your-sdk-api-key',
  locale: 'de',
  // optional
  sourceLocale: 'en',
  mountTarget: '#review-root', // element or selector; defaults to document.body
  captureScreenshots: false, // opt-in; default false
  onSessionExpired: () => {
    // the event stream gave up; re-init if you want to continue
  },
});

sdk.setLocale('fr'); // when your app switches language
sdk.destroy(); // tear down the UI, listeners and event stream
```

`ReviewSdk.init` rejects if the backend refuses the session.

## Script tag (self-hosted bundle)

The package ships a plain browser bundle, `dist/index.global.js`, that exposes
the global `Transl8ReviewSdk`. Copy it from `node_modules/@transl8.ai/review-sdk/dist/`
to a path your host serves, then include it:

```html
<script src="/sdk/index.global.js"></script>
<script>
  Transl8ReviewSdk.ReviewSdk.init({
    apiBaseUrl: 'https://your-transl8-host/api/v1',
    projectId: 'your-project-id',
    apiKey: 'your-sdk-api-key',
    locale: 'de',
  });
</script>
```

Screenshot capture is opt-in (`captureScreenshots: true`). When enabled, the SDK
loads the separate `dist/capture.js` chunk at runtime from
`<apiBaseUrl>/sdk/bundle/capture`, so serve that file at that URL.

The minified bundle carries no `sourceMappingURL`. CI keeps the matching
`index.global.js.map` as a build artifact named `review-sdk-sourcemap-<version>`.

## Development

```bash
npm ci
npm run typecheck
npm test
npm run build   # also runs scripts/verify-dist.mjs
```

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## License

[MIT](LICENSE)
