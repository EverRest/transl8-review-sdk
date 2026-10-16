export { resolveElementContext } from './context/element-context-resolver';
export type { SdkContext, SdkKeyEnvironment } from './context/types';
export { ReviewSdk } from './client/sdk-client';
export type {
  ReviewSdkInitOptions,
  ApplySdkTranslationParams,
  ApplySdkTranslationResult,
  ProposeSdkTranslationParams,
  ProposeSdkTranslationResult,
} from './client/sdk-client';
export {
  ApplyTranslationConflictError,
  ApplyTranslationForbiddenError,
  ApplyTranslationRejectedError,
  ProposeTranslationForbiddenError,
  ProposeTranslationConflictError,
  ProposeTranslationAlreadyPendingError,
  // Declared and thrown in sdk-client.ts but never re-exported,
  // so a host's documented `error instanceof SdkSessionExpiredError` recovery
  // branch could never actually match anything imported from the package root.
  SdkSessionExpiredError,
} from './client/sdk-client';
