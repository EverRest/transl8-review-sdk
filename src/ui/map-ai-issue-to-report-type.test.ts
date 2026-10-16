import { describe, expect, it } from 'vitest';
import {
  AI_TO_REPORT_TYPE,
  buildReportCommentFromAiAnalysis,
  humanIssueLabel,
  mapAiIssueTypeToReportType,
} from './map-ai-issue-to-report-type';
import { getStrings } from './strings';

describe('mapAiIssueTypeToReportType', () => {
  it.each([
    ['grammar', 'grammar'],
    ['spelling', 'grammar'],
    ['punctuation', 'grammar'],
    ['meaning', 'wrong_meaning'],
    ['terminology', 'wrong_meaning'],
    ['style', 'wrong_meaning'],
    ['wrong_language', 'wrong_language'],
    ['missing_translation', 'wrong_translation'],
    ['extra_content', 'wrong_translation'],
    ['other', 'other'],
  ] as const)('maps %s -> %s', (aiType, reportType) => {
    expect(mapAiIssueTypeToReportType(aiType)).toBe(reportType);
  });

  it('defaults unknown and missing types to other', () => {
    expect(mapAiIssueTypeToReportType(undefined)).toBe('other');
    expect(mapAiIssueTypeToReportType('not_real')).toBe('other');
  });
});

describe('humanIssueLabel (sourced from strings.ts aiPanel.issueTypes)', () => {
  it('has a strings.ts entry for every AI analyze issue type, so the two cannot drift', () => {
    for (const aiType of Object.keys(AI_TO_REPORT_TYPE)) {
      expect(getStrings('en').aiPanel.issueTypes[aiType]).toBeTypeOf('string');
    }
  });

  it('resolves known types through getStrings(locale), not a hardcoded local map', () => {
    for (const aiType of Object.keys(AI_TO_REPORT_TYPE)) {
      expect(humanIssueLabel(aiType, 'en')).toBe(getStrings('en').aiPanel.issueTypes[aiType]);
    }
  });

  it('falls back to a humanized form for a type the backend added before the SDK shipped a label', () => {
    expect(humanIssueLabel('brand_new_type')).toBe('Brand new type');
  });
});

describe('buildReportCommentFromAiAnalysis', () => {
  it('combines issue, suggestion, and explanation', () => {
    const comment = buildReportCommentFromAiAnalysis({
      issue: { type: 'grammar', severity: 'medium' },
      suggestion: { text: 'Fixed text', explanation: 'Grammar fix' },
      explanation: 'Extra',
    });
    expect(comment).toContain('AI detected: grammar');
    expect(comment).toContain('Suggested: Fixed text');
    expect(comment).toContain('Grammar fix');
  });

  it('returns undefined when there is nothing to report', () => {
    expect(buildReportCommentFromAiAnalysis({})).toBeUndefined();
  });

  it('truncates long comments to 500 characters', () => {
    const comment = buildReportCommentFromAiAnalysis({
      explanation: 'x'.repeat(600),
    });
    expect(comment!.length).toBeLessThanOrEqual(500);
    expect(comment!.endsWith('…')).toBe(true);
  });
});
