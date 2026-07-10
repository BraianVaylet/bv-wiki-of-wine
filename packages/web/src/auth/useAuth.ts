import type { LoginInput, PublicUser, RegisterInput } from '@bv/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../lib/apiClient';

export const SESSION_KEY = ['session'] as const;

const UNAUTHENTICATED_STATUS = 401;

interface MeResponse {
  user: PublicUser;
}

/**
 * Sesión actual. Un 401 no es un error de la app: significa "no hay nadie".
 * Devolverlo como `null` evita que cada consumidor tenga que distinguir
 * "falló la red" de "no estás logueado".
 */
export function useSession() {
  return useQuery({
    queryKey: SESSION_KEY,
    queryFn: async (): Promise<PublicUser | null> => {
      try {
        const { user } = await api.get<MeResponse>('/auth/me');
        return user;
      } catch (err) {
        if (err instanceof ApiError && err.status === UNAUTHENTICATED_STATUS) return null;
        throw err;
      }
    },
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: LoginInput) => api.post<MeResponse>('/auth/login', input),
    onSuccess: ({ user }) => queryClient.setQueryData(SESSION_KEY, user),
  });
}

export function useRegister() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RegisterInput) => api.post<MeResponse>('/auth/register', input),
    onSuccess: ({ user }) => queryClient.setQueryData(SESSION_KEY, user),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<void>('/auth/logout'),
    // Salir borra toda la caché: la del catálogo también es de esta sesión.
    onSuccess: () => queryClient.clear(),
  });
}
