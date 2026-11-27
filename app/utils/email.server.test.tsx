/**
 * @vitest-environment node
 */
import { expect, test } from 'vitest';
import { sendEmail } from './email.server.ts';

const BrokenTemplate = (): never => {
  throw new Error('template exploded');
};

test('sendEmail rejects instead of sending when a template throws', async () => {
  await expect(
    sendEmail({
      to: 'kody@example.com',
      subject: 'Hello',
      react: <BrokenTemplate />,
    }),
  ).rejects.toThrow('template exploded');
});
