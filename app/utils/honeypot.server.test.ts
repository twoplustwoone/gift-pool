/**
 * @vitest-environment node
 */
import { SpamError } from 'remix-utils/honeypot/server';
import { describe, expect, it } from 'vitest';

import { checkHoneypot, GuardedHoneypot } from './honeypot.server.ts';

// The exported `honeypot` instance disables the valid-from field under
// NODE_ENV=test, so the decrypt path is exercised through a dedicated
// instance configured like production.
function makeHoneypot() {
  return new GuardedHoneypot({ encryptionSeed: 'test-seed' });
}

function makeFormData(validFrom: string) {
  const formData = new FormData();
  formData.set('name__confirm', '');
  formData.set('from__confirm', validFrom);
  return formData;
}

describe('GuardedHoneypot', () => {
  it('treats a non-base64 valid-from value as spam instead of throwing InvalidCharacterError', async () => {
    const formData = makeFormData('%%%not-base64%%%');
    await expect(makeHoneypot().check(formData)).rejects.toBeInstanceOf(
      SpamError,
    );
  });

  it('treats a truncated ciphertext as spam instead of throwing OperationError', async () => {
    // Valid base64, but decodes to fewer bytes than the AES-GCM IV + tag.
    const formData = makeFormData('AAAA');
    await expect(makeHoneypot().check(formData)).rejects.toBeInstanceOf(
      SpamError,
    );
  });

  it('treats a forged ciphertext (wrong key/tag) as spam', async () => {
    const forged = Buffer.from(new Uint8Array(32).fill(7)).toString('base64');
    const formData = makeFormData(forged);
    await expect(makeHoneypot().check(formData)).rejects.toBeInstanceOf(
      SpamError,
    );
  });

  it('accepts a legit getInputProps round-trip', async () => {
    const hp = makeHoneypot();
    const props = await hp.getInputProps();
    const formData = new FormData();
    formData.set(props.nameFieldName, '');
    formData.set(props.validFromFieldName!, props.encryptedValidFrom);
    await expect(hp.check(formData)).resolves.toBeUndefined();
  });
});

describe('checkHoneypot', () => {
  it('rejects a filled honeypot field with a 400 Response', async () => {
    const formData = new FormData();
    formData.set('name__confirm', 'bot text');
    await expect(checkHoneypot(formData)).rejects.toSatisfy(
      (thrown) => thrown instanceof Response && thrown.status === 400,
    );
  });
});
