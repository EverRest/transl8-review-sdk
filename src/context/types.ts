export type SdkKeyEnvironment = 'live' | 'test';

export interface SdkContext {
  schemaVersion: '0.1.0';
  project: { id: string };
  keyEnvironment: SdkKeyEnvironment;
  application: { sdkVersion: string };
  locale: { source: string; target: string };
  page: { url: string; title?: string };
  element?: {
    tagName: string;
    text?: string;
    translationKey?: string;
    attributes?: Record<string, string>;
  };
  translation?: {
    key?: string;
    currentText?: string;
  };
}
