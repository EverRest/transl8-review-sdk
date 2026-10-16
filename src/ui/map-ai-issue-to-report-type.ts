import type { SdkReviewIssueType } from './report-issue-types';
import { getStrings } from './strings';

export const AI_TO_REPORT_TYPE: Record<string, SdkReviewIssueType> = {
  grammar: 'grammar',
  spelling: 'grammar',
  punctuation: 'grammar',
  meaning: 'wrong_meaning',
  terminology: 'wrong_meaning',
  style: 'wrong_meaning',
  wrong_language: 'wrong_language',
  missing_translation: 'wrong_translation',
  extra_content: 'wrong_translation',
  other: 'other',
};

/**
 * Maps AI analyze `issue.type` (10 values) to POST /sdk/reviews types (5).
 */
export function mapAiIssueTypeToReportType(
  aiIssueType: string | undefined,
): SdkReviewIssueType {
  if (!aiIssueType) {
    return 'other';
  }
  return AI_TO_REPORT_TYPE[aiIssueType] ?? 'other';
}

const COMMENT_MAX = 500;

/**
 * Builds a report comment from AI analysis output (explanation + suggestion context).
 */
export function buildReportCommentFromAiAnalysis(analysis: {
  issue?: { type: string; severity: string };
  suggestion?: { text: string; explanation: string };
  explanation?: string;
}): string | undefined {
  const parts: string[] = [];
  if (analysis.issue) {
    parts.push(
      `AI detected: ${analysis.issue.type} (${analysis.issue.severity})`,
    );
  }
  if (analysis.suggestion?.text) {
    parts.push(`Suggested: ${analysis.suggestion.text}`);
  }
  const detail = analysis.suggestion?.explanation ?? analysis.explanation;
  if (detail) {
    parts.push(detail);
  }
  if (parts.length === 0) {
    return undefined;
  }
  const comment = parts.join('\n\n');
  return comment.length > COMMENT_MAX
    ? `${comment.slice(0, COMMENT_MAX - 1)}…`
    : comment;
}

/**
 * User-facing wording for an AI analyze `issue.type` — the same 10 values
 * `AI_TO_REPORT_TYPE` keys on above, not the 5 POST /sdk/reviews types it
 * maps to. The panel must never print the raw enum: `wrong_meaning
 * (medium)` is a database value, not a sentence. Sourced from
 * `strings.ts`'s `aiPanel.issueTypes` (the caller's `locale`, i.e.
 * `ai-panel.ts`'s `currentLocale`) so it renders in the same locale as the
 * rest of the panel's chrome. Unknown types fall back to a readable form
 * rather than throwing, because the backend may add a type before the SDK
 * ships a label for it — that fallback is locale-independent by design,
 * same as before.
 */
export function humanIssueLabel(type: string, locale?: string): string {
  return (
    getStrings(locale).aiPanel.issueTypes[type] ??
    type.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())
  );
}
