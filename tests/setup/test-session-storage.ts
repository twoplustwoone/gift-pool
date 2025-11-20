import { createCookieSessionStorage } from '@remix-run/node';

export const sessionKey = 'sessionId';

const baseCookieConfig = {
  sameSite: 'lax' as const,
  path: '/',
  httpOnly: true,
  secrets: process.env.SESSION_SECRET.split(','),
  secure: process.env.NODE_ENV === 'production',
};

export const authSessionStorage = createCookieSessionStorage({
  cookie: {
    ...baseCookieConfig,
    name: 'en_session',
  },
});

export const toastKey = 'toast';
export type ToastInput = {
  description: string;
  id?: string;
  title?: string;
  type?: 'message' | 'success' | 'error';
};

export const toastSessionStorage = createCookieSessionStorage({
  cookie: {
    ...baseCookieConfig,
    name: 'en_toast',
  },
});
