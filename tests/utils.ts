import * as setCookieParser from 'set-cookie-parser';
import { authSessionStorage, sessionKey } from './setup/test-session-storage.ts';

export const BASE_URL = 'https://www.giftpool.app';

export const convertSetCookieToCookie = (setCookie: string) => {
  const parsedCookie = setCookieParser.parseString(setCookie);
  return new URLSearchParams({
    [parsedCookie.name]: parsedCookie.value,
  }).toString();
};

export const getSessionSetCookieHeader = async (
  session: { id: string },
  existingCookie?: string,
) => {
  const authSession = await authSessionStorage.getSession(existingCookie);
  authSession.set(sessionKey, session.id);
  const setCookieHeader = await authSessionStorage.commitSession(authSession);
  return setCookieHeader;
};

export const getSessionCookieHeader = async (
  session: { id: string },
  existingCookie?: string,
) => {
  const setCookieHeader = await getSessionSetCookieHeader(
    session,
    existingCookie,
  );
  return convertSetCookieToCookie(setCookieHeader);
};
