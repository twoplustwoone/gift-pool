import { timingSafeEqual } from 'node:crypto';

// Constant-time bearer-token check shared by the internal command endpoints
// (occasion-reminder trigger, replica→primary cache write-forward).
//
// - Returns false when INTERNAL_COMMAND_TOKEN is unset/empty, so a missing env
//   var can never make `Bearer undefined` a valid credential.
// - Compares in constant time (length pre-check + timingSafeEqual) so the two
//   endpoints don't differ and neither leaks token length/prefix via timing.
export function verifyInternalCommandToken(request: Request): boolean {
  const token = process.env.INTERNAL_COMMAND_TOKEN;
  if (!token) return false;

  const provided = request.headers.get('Authorization') ?? '';
  const expected = `Bearer ${token}`;
  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(expected);
  if (providedBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(providedBuf, expectedBuf);
}
