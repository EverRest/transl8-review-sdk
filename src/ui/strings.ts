import { canonicalizeLocale } from '../client/canonicalize-locale';
import type { PanelView } from './panel-shell';
import type { SdkReviewIssueType } from './report-issue-types';
import { AR } from './strings-ar';
import { ES } from './strings-es';
import { FR } from './strings-fr';
import { IT } from './strings-it';
import { RU } from './strings-ru';
import { UK } from './strings-uk';
import { ZH } from './strings-zh';

export interface SdkUiStrings {
  /**
   * Text direction of the chrome language this table is written in. The
   * SDK root's `dir` follows it (sdk-client.ts), so it is the resolved
   * chrome language that decides RTL, not the raw host `locale`: `he` has
   * no table yet, renders English, and so stays `ltr`.
   */
  dir: 'ltr' | 'rtl';
  panel: {
    close: string;
    back: string;
    keyCopy: string;
    titles: Record<PanelView, string>;
  };
  inspector: {
    dialogLabel: string;
    loadingSr: string;
    lookupError: string;
    notTracked: string;
    staleBanner: string;
    reload: string;
    sourceLabel: string;
    currentLabel: string;
    details: string;
    page: string;
    locale: string;
    version: string;
    askAi: string;
    report: string;
    applying: string;
    submitting: string;
    applySuccess: string;
    applyConflict: string;
    applyPermissionDenied: string;
    proposeSuccess: string;
    proposeConflict: string;
    proposeAlreadyPending: string;
    proposePermissionDenied: string;
    applyButtonLabel: string;
    proposeButtonLabel: string;
    notTranslatedYet: string;
  };
  aiPanel: {
    dialogLabel: string;
    requestPlaceholder: string;
    chips: {
      improve: string;
      check: string;
      explain: string;
    };
    cancelRequest: string;
    cancel: string;
    analyze: string;
    suggested: string;
    diffLabel: string;
    why: string;
    glossaryTermsLabel: string;
    createReport: string;
    back: string;
    applyButtonLabel: string;
    applying: string;
    confidence: {
      high: string;
      medium: string;
      low: string;
    };
    applySuccess: string;
    applyConflict: string;
    applyPermissionDenied: string;
    /**
     * User-facing wording for an AI analyze `issue.type` (the 10 values
     * `AI_TO_REPORT_TYPE` in map-ai-issue-to-report-type.ts keys on, not the
     * 5 POST /sdk/reviews types reportForm.issueTypes below covers). Keyed
     * by plain `string`, not a literal union, matching that file's own
     * `Record<string, string>` — the backend may add a type before the SDK
     * ships a label for it, which `humanIssueLabel()`'s naive fallback
     * covers for any key missing here.
     */
    issueTypes: Record<string, string>;
  };
  reportForm: {
    dialogLabel: string;
    commentPlaceholder: string;
    cancel: string;
    submit: string;
    successMessage: string;
    close: string;
    issueTypes: Record<SdkReviewIssueType, string>;
  };
  reviewModeBadges: {
    openTranslation: string;
    editLabel: string;
  };
  launcher: {
    reviewLabel: string;
    keysLabel: (count: number) => string;
    ariaLabel: string;
    title: string;
  };
  /**
   * User-facing error text for the seven `reportForm.setError` /
   * `aiPanel.setError` / `aiPanel.setApplyError` / `inspector.setProposeError`
   * call sites in sdk-client.ts that piped an inline string literal straight
   * to the UI instead of resolving through `getStrings()`.
   */
  errors: {
    generic: string;
    aiTimeout: string;
    aiRateLimited: string;
  };
}

export const EN: SdkUiStrings = {
  dir: 'ltr',
  panel: {
    close: 'Close',
    back: 'Back',
    keyCopy: 'Copy key',
    titles: {
      translation: 'Translation',
      ai: 'Translation AI',
      report: 'Report translation issue',
    },
  },
  inspector: {
    dialogLabel: 'Translation',
    loadingSr: 'Loading translation…',
    lookupError: "Couldn't load this translation. Please try again.",
    notTracked: 'This element has no translation key.',
    staleBanner: 'Updated by someone else.',
    reload: 'Reload',
    sourceLabel: 'Source',
    currentLabel: 'Current',
    details: 'Details',
    page: 'Page',
    locale: 'Locale',
    version: 'Version',
    askAi: 'Ask AI',
    report: 'Report',
    applying: 'Applying…',
    submitting: 'Submitting…',
    applySuccess: 'Translation applied.',
    applyConflict: 'This translation was changed by someone else.',
    applyPermissionDenied: "You don't have permission to apply it.",
    proposeSuccess: 'Submitted for review.',
    proposeConflict: 'This translation was changed by someone else.',
    proposeAlreadyPending: 'Already pending review.',
    proposePermissionDenied: "You don't have permission to submit this for review.",
    applyButtonLabel: 'Apply',
    proposeButtonLabel: 'Submit for review',
    notTranslatedYet: 'Not translated yet',
  },
  aiPanel: {
    dialogLabel: 'Translation AI',
    requestPlaceholder: 'Or ask anything...',
    chips: {
      improve: 'Improve translation',
      check: 'Check for errors',
      explain: 'Explain translation',
    },
    cancelRequest: 'Cancel request',
    cancel: 'Cancel',
    analyze: 'Analyze',
    suggested: 'Suggested',
    diffLabel: 'What changes',
    why: 'Why',
    glossaryTermsLabel: 'Glossary terms used',
    createReport: 'Create report',
    back: 'Back',
    applyButtonLabel: 'Apply suggestion',
    applying: 'Applying…',
    confidence: {
      high: 'High confidence',
      medium: 'Medium confidence',
      low: 'Low confidence — please review manually',
    },
    applySuccess: 'Translation applied.',
    applyConflict: 'This translation was changed by someone else.',
    applyPermissionDenied: "You don't have permission to apply it.",
    issueTypes: {
      grammar: 'Grammar / typo',
      spelling: 'Spelling',
      punctuation: 'Punctuation',
      meaning: 'Inaccurate meaning',
      terminology: 'Wrong terminology',
      style: 'Style mismatch',
      wrong_language: 'Wrong language',
      missing_translation: 'Missing translation',
      extra_content: 'Extra content',
      other: 'Other',
    },
  },
  reportForm: {
    dialogLabel: 'Report an issue',
    commentPlaceholder: 'Comment',
    cancel: 'Cancel',
    submit: 'Submit report',
    successMessage: 'Report submitted. Thank you!',
    close: 'Close',
    issueTypes: {
      wrong_translation: 'Wrong translation',
      grammar: 'Grammar / typo',
      wrong_meaning: 'Wrong meaning',
      wrong_language: 'Wrong language',
      other: 'Other',
    },
  },
  reviewModeBadges: {
    openTranslation: 'Open translation',
    editLabel: 'Edit',
  },
  launcher: {
    reviewLabel: 'Review',
    keysLabel: (count) => `${count} keys`,
    ariaLabel: 'Translation',
    title: 'Review mode (Ctrl+Shift+T)',
  },
  errors: {
    generic: 'Something went wrong. Please try again.',
    aiTimeout: 'AI is taking too long. Please try again.',
    aiRateLimited: 'Too many AI requests. Please wait a minute and try again.',
  },
};

const STRINGS_BY_LANGUAGE: Record<string, SdkUiStrings> = {
  en: EN,
  fr: FR,
  es: ES,
  it: IT,
  ar: AR,
  ru: RU,
  uk: UK,
  zh: ZH,
};

/**
 * Chrome strings for the SDK's own UI, keyed off the same `locale` a host
 * passes to `ReviewSdk.init({ locale })` / `setLocale()` — that value means
 * content target locale, and this reuses it for chrome text by design
 * (no separate UI-locale control). Chrome is translated for `en`, `fr`,
 * `es`, `it`, `ar`, `ru`, `uk` and `zh`, looked up by base language (`fr-CA`
 * -> `fr`); every other locale renders in English until translated (tracked
 * separately, not a bug).
 *
 * `zh` is Simplified Chinese, and base-language lookup sends every `zh-*`
 * tag to it: `zh-CN` and `zh-Hans` are right, but `zh-TW`, `zh-HK` and
 * `zh-Hant` get Simplified too until a `zh-Hant` table exists.
 */
export function getStrings(locale: string | undefined): SdkUiStrings {
  const canonical = canonicalizeLocale(locale);
  if (!canonical) {
    return EN;
  }
  const base = canonical.split('-')[0]!.toLowerCase();
  return STRINGS_BY_LANGUAGE[base] ?? EN;
}
