/**
 * Mirrors the backend's SDK_REVIEW_ISSUE_TYPES. Kept separate
 * from client/sdk-client.ts so ui/ files don't have to import the client
 * module, avoiding a client <-> ui cycle (same reasoning as
 * inspector-lookup-types.ts).
 */
export const SDK_REVIEW_ISSUE_TYPES = [
  'wrong_translation',
  'grammar',
  'wrong_meaning',
  'wrong_language',
  'other',
] as const;

export type SdkReviewIssueType = (typeof SDK_REVIEW_ISSUE_TYPES)[number];

export interface SdkReviewIssuePayload {
  issue: { type: SdkReviewIssueType; comment?: string };
  page: { url: string };
  element: { tagName: string };
  translation?: {
    key?: string;
    sourceLocale?: string;
    targetLocale?: string;
    sourceText?: string;
    translatedText?: string;
  };
}

export interface SdkReviewIssueResult {
  accepted: boolean;
  id: string;
}
