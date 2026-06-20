// Single source of truth for the version of the Terms of Service / Privacy
// Policy a user accepts at onboarding. Date-based. Bump this whenever the legal
// documents materially change — the new value is what gets written to
// `Consent.version` on subsequent acceptances, so future re-acceptance flows
// can detect who agreed to which version.
export const CURRENT_LEGAL_VERSION = '2026-06-20';

// Discriminator stored on `Consent.documentType`. The Terms of Service and
// Privacy Policy are accepted together via a single clickwrap checkbox, so one
// combined record covers both.
export const LEGAL_DOCUMENT_TYPE = 'TOS_AND_PRIVACY';
