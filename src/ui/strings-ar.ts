import type { SdkUiStrings } from './strings';

// Modern Standard Arabic, RTL. Terminology: ترجمة (translation) / مراجعة
// (review) / مشكلة (issue) / بلاغ (report) / مفتاح (key) / المسرد
// (glossary). Latin digits, so counts read the same as in the other
// languages. "Ctrl+Shift+T" stays Latin (a key name, not prose).
//
// Arabic has all six CLDR plural categories; 1 and 2 use the dual/singular
// noun with no numeral, 3-10 the plural, 11-99 the accusative singular
// (تمييز), 0 and 100+ the plain singular/plural.
const KEYS = new Intl.PluralRules('ar');
const KEY_FORMS: Record<Intl.LDMLPluralRule, (count: number) => string> = {
  zero: (n) => `${n} مفاتيح`,
  one: () => 'مفتاح واحد',
  two: () => 'مفتاحان',
  few: (n) => `${n} مفاتيح`,
  many: (n) => `${n} مفتاحًا`,
  other: (n) => `${n} مفتاح`,
};

export const AR: SdkUiStrings = {
  dir: 'rtl',
  panel: {
    close: 'إغلاق',
    back: 'رجوع',
    keyCopy: 'نسخ المفتاح',
    titles: {
      translation: 'ترجمة',
      ai: 'الذكاء الاصطناعي للترجمة',
      report: 'الإبلاغ عن مشكلة في الترجمة',
    },
  },
  inspector: {
    dialogLabel: 'ترجمة',
    loadingSr: 'جارٍ تحميل الترجمة…',
    lookupError: 'تعذر تحميل هذه الترجمة. يرجى المحاولة مرة أخرى.',
    notTracked: 'هذا العنصر ليس له مفتاح ترجمة.',
    staleBanner: 'تم التحديث بواسطة شخص آخر.',
    reload: 'إعادة تحميل',
    sourceLabel: 'مصدر',
    currentLabel: 'حالي',
    details: 'تفاصيل',
    page: 'صفحة',
    locale: 'اللغة',
    version: 'إصدار',
    askAi: 'اسأل الذكاء الاصطناعي',
    report: 'إبلاغ',
    applying: 'جارٍ التطبيق…',
    submitting: 'جارٍ الإرسال…',
    applySuccess: 'تم تطبيق الترجمة.',
    applyConflict: 'تم تغيير هذه الترجمة بواسطة شخص آخر.',
    applyPermissionDenied: 'ليس لديك إذن بتطبيقها.',
    proposeSuccess: 'تم الإرسال للمراجعة.',
    proposeConflict: 'تم تغيير هذه الترجمة بواسطة شخص آخر.',
    proposeAlreadyPending: 'قيد المراجعة بالفعل.',
    proposePermissionDenied: 'ليس لديك إذن بإرسالها للمراجعة.',
    applyButtonLabel: 'تطبيق',
    proposeButtonLabel: 'إرسال للمراجعة',
    notTranslatedYet: 'لم تتم ترجمته بعد',
  },
  aiPanel: {
    dialogLabel: 'الذكاء الاصطناعي للترجمة',
    requestPlaceholder: 'أو اسأل أي شيء…',
    chips: {
      improve: 'تحسين الترجمة',
      check: 'التحقق من الأخطاء',
      explain: 'شرح الترجمة',
    },
    cancelRequest: 'إلغاء الطلب',
    cancel: 'إلغاء',
    analyze: 'تحليل',
    suggested: 'مقترح',
    diffLabel: 'ما الذي سيتغيّر',
    why: 'لماذا',
    glossaryTermsLabel: 'مصطلحات المسرد المستخدمة',
    createReport: 'إنشاء بلاغ',
    back: 'رجوع',
    applyButtonLabel: 'تطبيق الاقتراح',
    applying: 'جارٍ التطبيق…',
    confidence: {
      high: 'ثقة عالية',
      medium: 'ثقة متوسطة',
      low: 'ثقة منخفضة — يرجى المراجعة يدويًا',
    },
    applySuccess: 'تم تطبيق الترجمة.',
    applyConflict: 'تم تغيير هذه الترجمة بواسطة شخص آخر.',
    applyPermissionDenied: 'ليس لديك إذن بتطبيقها.',
    issueTypes: {
      grammar: 'قواعد اللغة / خطأ مطبعي',
      spelling: 'الإملاء',
      punctuation: 'علامات الترقيم',
      meaning: 'معنى غير دقيق',
      terminology: 'مصطلحات خاطئة',
      style: 'أسلوب غير مناسب',
      wrong_language: 'لغة خاطئة',
      missing_translation: 'ترجمة مفقودة',
      extra_content: 'محتوى زائد',
      other: 'أخرى',
    },
  },
  reportForm: {
    dialogLabel: 'الإبلاغ عن مشكلة',
    commentPlaceholder: 'تعليق',
    cancel: 'إلغاء',
    submit: 'إرسال البلاغ',
    successMessage: 'تم إرسال البلاغ. شكرًا لك!',
    close: 'إغلاق',
    issueTypes: {
      wrong_translation: 'ترجمة خاطئة',
      grammar: 'قواعد اللغة / خطأ مطبعي',
      wrong_meaning: 'معنى خاطئ',
      wrong_language: 'لغة خاطئة',
      other: 'أخرى',
    },
  },
  reviewModeBadges: {
    openTranslation: 'فتح الترجمة',
    editLabel: 'تعديل',
  },
  launcher: {
    reviewLabel: 'مراجعة',
    keysLabel: (count) => KEY_FORMS[KEYS.select(count)](count),
    ariaLabel: 'ترجمة',
    title: 'وضع المراجعة (Ctrl+Shift+T)',
  },
  errors: {
    generic: 'حدث خطأ ما. يرجى المحاولة مرة أخرى.',
    aiTimeout: 'يستغرق الذكاء الاصطناعي وقتًا طويلًا. يرجى المحاولة مرة أخرى.',
    aiRateLimited:
      'تم تقديم عدد كبير جدًا من طلبات الذكاء الاصطناعي. يرجى الانتظار دقيقة واحدة والمحاولة مرة أخرى.',
  },
};
