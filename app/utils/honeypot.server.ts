import { Honeypot, SpamError } from 'remix-utils/honeypot/server';

// remix-utils' Honeypot.check() maps a falsy decrypt result to SpamError, but
// its decrypt() lets raw atob/WebCrypto errors escape when a bot tampers with
// the from__confirm field (still unguarded as of remix-utils 10.0.0).
// Normalize decrypt failures to the falsy path check() already handles.
export class GuardedHoneypot extends Honeypot {
  protected override async decrypt(value: string) {
    try {
      return await super.decrypt(value);
    } catch {
      return '';
    }
  }
}

export const honeypot = new GuardedHoneypot({
  validFromFieldName: process.env.NODE_ENV === 'test' ? null : undefined,
  encryptionSeed: process.env.HONEYPOT_SECRET,
});

export async function checkHoneypot(formData: FormData) {
  try {
    await honeypot.check(formData);
  } catch (error) {
    if (error instanceof SpamError) {
      throw new Response('Form not submitted properly', { status: 400 });
    }
    throw error;
  }
}
