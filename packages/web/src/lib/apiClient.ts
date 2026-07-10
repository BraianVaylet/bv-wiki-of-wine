import type { ApiError as ApiErrorBody, ErrorCode, ErrorDetail } from '@bv/shared';

const BASE: string = (import.meta.env.VITE_API_BASE as string | undefined) ?? '/api';
const CSRF_COOKIE = 'bv_csrf';
const CSRF_HEADER = 'x-csrf-token';
const NO_CONTENT = 204;

/** Error tipado de la API (forma `{ error: { code, message, details? } }`). */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: ErrorCode,
    message: string,
    public details?: ErrorDetail[],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function readCookie(name: string): string | undefined {
  for (const part of document.cookie.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return undefined;
}

/**
 * Garantiza un token CSRF antes de una mutación. La cookie puede faltar aunque la
 * sesión siga viva: en ese caso se pide a `/auth/csrf` y se relee. Evita el 403.
 */
async function ensureCsrf(): Promise<string | undefined> {
  const existing = readCookie(CSRF_COOKIE);
  if (existing) return existing;
  try {
    await fetch(`${BASE}/auth/csrf`, { credentials: 'include' });
  } catch {
    // Sin red: la mutación va a fallar igual con NETWORK más abajo.
  }
  return readCookie(CSRF_COOKIE);
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const method = opts.method ?? 'GET';
  const headers: Record<string, string> = {};
  const hasBody = opts.body !== undefined;
  if (hasBody) headers['content-type'] = 'application/json';
  if (method !== 'GET') {
    const csrf = await ensureCsrf();
    if (csrf) headers[CSRF_HEADER] = csrf;
  }

  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method,
      credentials: 'include',
      headers,
      body: hasBody ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'No se pudo conectar con el servidor.');
  }

  if (res.status === NO_CONTENT) return undefined as T;

  const data = (await res.json().catch(() => undefined)) as unknown;
  if (!res.ok) {
    const err = (data as ApiErrorBody | undefined)?.error;
    throw new ApiError(
      res.status,
      err?.code ?? 'INTERNAL',
      err?.message ?? 'Ocurrió un error.',
      err?.details,
    );
  }
  return data as T;
}

/** Sube un archivo (multipart). Separado de `request` porque no serializa JSON. */
export async function upload<T>(path: string, field: string, file: File): Promise<T> {
  const csrf = await ensureCsrf();
  const form = new FormData();
  form.append(field, file);

  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method: 'POST',
      credentials: 'include',
      headers: csrf ? { [CSRF_HEADER]: csrf } : {},
      body: form,
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'No se pudo conectar con el servidor.');
  }

  const data = (await res.json().catch(() => undefined)) as unknown;
  if (!res.ok) {
    const err = (data as ApiErrorBody | undefined)?.error;
    throw new ApiError(res.status, err?.code ?? 'INTERNAL', err?.message ?? 'Ocurrió un error.');
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
