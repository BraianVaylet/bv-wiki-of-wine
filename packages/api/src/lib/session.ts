import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { cookieSecure, env } from '../env';

export const SESSION_COOKIE = 'bv_session';

const SECONDS_PER_DAY = 24 * 60 * 60;

export function setSessionCookie(c: Context, token: string): void {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true, // inaccesible desde JS: un XSS no se lleva la sesión
    secure: cookieSecure,
    sameSite: 'Strict',
    path: '/',
    maxAge: env.SESSION_TTL_DAYS * SECONDS_PER_DAY,
  });
}

export function clearSessionCookie(c: Context): void {
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
}

export function getSessionToken(c: Context): string | undefined {
  return getCookie(c, SESSION_COOKIE);
}
