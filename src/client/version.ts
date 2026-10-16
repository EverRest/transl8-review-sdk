/**
 * Previously the SDK never reported its own version; whatever a host
 * hardcoded into `application.sdkVersion` (a free-text context field, see
 * `../context/types.ts`) was the only value the server ever saw, and nothing
 * populated it. This is the SDK's *own* build version instead: injected at
 * build time by esbuild's `define` (`scripts/build.mjs`) from
 * `package.json`'s `"version"`, or by vitest's matching `define`
 * (`vitest.config.ts`) under test — see `sdk-client.ts`'s `init()`, which
 * sends it as `X-Sdk-Version` on `POST /sdk/session`.
 */
declare const __SDK_VERSION__: string;

export const SDK_VERSION: string = __SDK_VERSION__;
