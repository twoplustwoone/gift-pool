/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { SignupFormSchema } from './onboarding.tsx';

const validBase = {
  username: 'consent_user',
  name: 'Consent User',
  password: 'correct horse battery staple',
  confirmPassword: 'correct horse battery staple',
};

describe('SignupFormSchema affirmation', () => {
  it('accepts a submission when the terms / 13+ affirmation is checked', () => {
    const result = SignupFormSchema.safeParse({
      ...validBase,
      agreeToTermsOfServiceAndPrivacyPolicy: true,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a submission when the affirmation is missing', () => {
    const result = SignupFormSchema.safeParse({ ...validBase });
    expect(result.success).toBe(false);
    if (!result.success) {
      const affirmationError = result.error.issues.some((issue) =>
        issue.path.includes('agreeToTermsOfServiceAndPrivacyPolicy'),
      );
      expect(affirmationError).toBe(true);
    }
  });

  it('rejects a submission when the affirmation is explicitly false', () => {
    const result = SignupFormSchema.safeParse({
      ...validBase,
      agreeToTermsOfServiceAndPrivacyPolicy: false,
    });
    expect(result.success).toBe(false);
  });
});
