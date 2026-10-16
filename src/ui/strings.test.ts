import { describe, it, expect } from 'vitest';
import { getStrings, EN } from './strings';

const TRANSLATED = ['fr', 'es', 'it', 'ar', 'ru', 'uk', 'zh'] as const;

/** Every leaf's dotted path, with its typeof — so a missing key AND a string-vs-function mismatch both show up. */
function leafPaths(node: unknown, prefix = ''): Record<string, string> {
  if (typeof node === 'object' && node !== null) {
    return Object.assign(
      {},
      ...Object.entries(node).map(([key, value]) =>
        leafPaths(value, prefix ? `${prefix}.${key}` : key),
      ),
    );
  }
  return { [prefix]: typeof node };
}

describe('getStrings', () => {
  it('returns the English table for "en"', () => {
    expect(getStrings('en')).toBe(EN);
  });

  it('falls back to English for a locale with no translation yet', () => {
    expect(getStrings('de')).toBe(EN);
    expect(getStrings('he')).toBe(EN);
  });

  it('falls back to English for a regional variant of a covered base language', () => {
    expect(getStrings('en-GB')).toBe(EN);
  });

  it.each(TRANSLATED)('resolves %s, and its regional/script variants, by base language', (lang) => {
    const table = getStrings(lang);
    expect(table).not.toBe(EN);
    expect(getStrings(`${lang}-XX`)).toBe(table);
    expect(getStrings(lang.toUpperCase())).toBe(table);
  });

  it('resolves concrete regional tags to their base language', () => {
    expect(getStrings('fr-CA')).toBe(getStrings('fr'));
    expect(getStrings('uk-UA')).toBe(getStrings('uk'));
    expect(getStrings('ar-EG')).toBe(getStrings('ar'));
    expect(getStrings('es-419')).toBe(getStrings('es'));
    expect(getStrings('ru-Cyrl-RU')).toBe(getStrings('ru'));
  });

  it('sends every zh-* tag to the one (Simplified) table, Traditional included, until a zh-Hant table exists', () => {
    for (const tag of ['zh-CN', 'zh-Hans', 'zh-Hans-CN', 'zh-TW', 'zh-HK', 'zh-Hant', 'zh-Hant-TW']) {
      expect(getStrings(tag), tag).toBe(getStrings('zh'));
    }
  });

  it('falls back to English for undefined or malformed input', () => {
    expect(getStrings(undefined)).toBe(EN);
    expect(getStrings('')).toBe(EN);
    expect(getStrings('!!!')).toBe(EN);
  });

  it('carries the inspector strings alongside panel', () => {
    expect(getStrings('en').inspector).toEqual({
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
    });
  });

  it('carries the aiPanel strings alongside panel/inspector', () => {
    expect(getStrings('en').aiPanel).toEqual({
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
    });
  });

  it('carries the reportForm strings alongside panel/inspector/aiPanel', () => {
    expect(getStrings('en').reportForm).toEqual({
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
    });
  });

  it('carries the reviewModeBadges strings alongside the rest', () => {
    expect(getStrings('en').reviewModeBadges).toEqual({
      openTranslation: 'Open translation',
      editLabel: 'Edit',
    });
  });

  it('carries the launcher strings, with keysLabel as a function field', () => {
    const launcher = getStrings('en').launcher;
    expect(launcher.reviewLabel).toBe('Review');
    expect(launcher.ariaLabel).toBe('Translation');
    expect(launcher.title).toBe('Review mode (Ctrl+Shift+T)');
    expect(launcher.keysLabel(3)).toBe('3 keys');
  });
});

describe.each(TRANSLATED)('%s strings table', (lang) => {
  const table = getStrings(lang);

  it('has exactly the key paths of EN, with the same string/function shape', () => {
    expect(leafPaths(table)).toEqual(leafPaths(EN));
  });

  it('has no empty or whitespace-only string', () => {
    for (const [path, type] of Object.entries(leafPaths(table))) {
      if (type !== 'string') continue;
      const value = path.split('.').reduce<any>((node, key) => node[key], table);
      expect(value.trim(), path).not.toBe('');
    }
  });

  it('returns a non-empty string from every function-valued field', () => {
    for (const [path, type] of Object.entries(leafPaths(table))) {
      if (type !== 'function') continue;
      const fn = path.split('.').reduce<any>((node, key) => node[key], table);
      for (const count of [0, 1, 2, 5, 21, 100]) {
        const out = fn(count);
        expect(typeof out, `${path}(${count})`).toBe('string');
        expect(out.length, `${path}(${count})`).toBeGreaterThan(0);
      }
    }
  });
});

describe('chrome direction', () => {
  it('is rtl for ar and ltr for every other language, including untranslated RTL locales', () => {
    expect(getStrings('ar').dir).toBe('rtl');
    expect(getStrings('ar-EG').dir).toBe('rtl');
    for (const lang of ['en', 'fr', 'es', 'it', 'ru', 'uk', 'zh', 'zh-Hant', 'he', 'fa', undefined]) {
      expect(getStrings(lang).dir, String(lang)).toBe('ltr');
    }
  });
});

describe('launcher.keysLabel plurals', () => {
  const cases: Array<[string, Array<[number, string]>]> = [
    [
      'ru',
      [
        [0, '0 ключей'],
        [1, '1 ключ'],
        [2, '2 ключа'],
        [4, '4 ключа'],
        [5, '5 ключей'],
        [11, '11 ключей'],
        [21, '21 ключ'],
        [22, '22 ключа'],
        [100, '100 ключей'],
        [111, '111 ключей'],
      ],
    ],
    [
      'uk',
      [
        [0, '0 ключів'],
        [1, '1 ключ'],
        [2, '2 ключі'],
        [4, '4 ключі'],
        [5, '5 ключів'],
        [11, '11 ключів'],
        [21, '21 ключ'],
        [22, '22 ключі'],
        [100, '100 ключів'],
        [111, '111 ключів'],
      ],
    ],
    [
      'ar',
      [
        [0, '0 مفاتيح'],
        [1, 'مفتاح واحد'],
        [2, 'مفتاحان'],
        [3, '3 مفاتيح'],
        [10, '10 مفاتيح'],
        [11, '11 مفتاحًا'],
        [99, '99 مفتاحًا'],
        [100, '100 مفتاح'],
        [102, '102 مفتاح'],
      ],
    ],
    [
      'zh',
      [
        [0, '0 个键'],
        [1, '1 个键'],
        [2, '2 个键'],
        [21, '21 个键'],
        [100, '100 个键'],
      ],
    ],
    [
      'fr',
      [
        [0, '0 clé'],
        [1, '1 clé'],
        [2, '2 clés'],
        [21, '21 clés'],
      ],
    ],
    [
      'es',
      [
        [1, '1 clave'],
        [2, '2 claves'],
        [100, '100 claves'],
      ],
    ],
    [
      'it',
      [
        [1, '1 chiave'],
        [2, '2 chiavi'],
        [100, '100 chiavi'],
      ],
    ],
  ];

  it.each(cases)('%s', (lang, expectations) => {
    for (const [count, expected] of expectations) {
      expect(getStrings(lang).launcher.keysLabel(count), `${lang} ${count}`).toBe(expected);
    }
  });
});
