import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './apiClient';

const ONE_MINUTE_MS = 60_000;
const CLIENT_ERROR_MIN = 400;
const CLIENT_ERROR_MAX = 500;
const MAX_RETRIES = 2;

/** QueryClient compartido. No reintenta errores 4xx (cliente); sí fallos de red. */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: ONE_MINUTE_MS,
        gcTime: 15 * ONE_MINUTE_MS,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          if (
            error instanceof ApiError &&
            error.status >= CLIENT_ERROR_MIN &&
            error.status < CLIENT_ERROR_MAX
          ) {
            return false;
          }
          return failureCount < MAX_RETRIES;
        },
      },
      mutations: { retry: false },
    },
  });
}
