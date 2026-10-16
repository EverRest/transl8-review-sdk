/**
 * Shape returned by `GET /sdk/translations/lookup` (mirrors the backend's
 * `SdkTranslationLookupResult`).
 * Kept separate from client/sdk-client.ts so the UI layer (inspector-panel.ts)
 * doesn't have to import the client module, avoiding a client <-> ui cycle.
 */
export interface SdkTranslationLookupResult {
  key: string;
  sourceText: string;
  value: string;
  version: number;
  updatedAt: string;
}
