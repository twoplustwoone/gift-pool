import { describe, expect, it } from 'vitest';
import { FeedbackSchema } from './feedback-validation.ts';

describe('FeedbackSchema', () => {
  const valid = {
    type: 'BUG',
    message: 'The vote button does nothing when I click it.',
  };

  it('accepts a valid bug report without an email', () => {
    const result = FeedbackSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('rejects an unknown type', () => {
    const result = FeedbackSchema.safeParse({ ...valid, type: 'RANT' });
    expect(result.success).toBe(false);
  });

  it('rejects a too-short message', () => {
    const result = FeedbackSchema.safeParse({ ...valid, message: 'broken' });
    expect(result.success).toBe(false);
  });

  it('treats a blank email as absent (undefined)', () => {
    const result = FeedbackSchema.safeParse({ ...valid, email: '' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBeUndefined();
  });

  it('rejects a malformed email when one is provided', () => {
    const result = FeedbackSchema.safeParse({ ...valid, email: 'not-an-email' });
    expect(result.success).toBe(false);
  });

  it('lowercases a valid email', () => {
    const result = FeedbackSchema.safeParse({
      ...valid,
      email: 'Person@Example.COM',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe('person@example.com');
  });
});
