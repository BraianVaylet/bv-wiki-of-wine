import type {
  CreateWineInput,
  Grape,
  Paginated,
  UpdateWineInput,
  WineDetail,
  WineListItem,
  WineryRef,
} from '@bv/shared';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient';

export interface WineFilters {
  query?: string;
  type?: string;
  sort?: 'recent' | 'rating';
}

function toSearchParams(filters: WineFilters, cursor?: string): string {
  const params = new URLSearchParams();
  if (filters.query) params.set('query', filters.query);
  if (filters.type) params.set('type', filters.type);
  if (filters.sort) params.set('sort', filters.sort);
  if (cursor) params.set('cursor', cursor);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/** Listado paginado. `recent` usa keyset (cursor); `rating` no pagina en el MVP. */
export function useWines(filters: WineFilters) {
  return useInfiniteQuery({
    queryKey: ['wines', filters],
    queryFn: ({ pageParam }) =>
      api.get<Paginated<WineListItem>>(`/wines${toSearchParams(filters, pageParam)}`),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useWine(id: number) {
  return useQuery({
    queryKey: ['wine', id],
    queryFn: () => api.get<WineDetail>(`/wines/${id}`),
  });
}

export function useGrapes() {
  return useQuery({
    queryKey: ['grapes'],
    queryFn: () => api.get<Grape[]>('/grapes'),
    staleTime: 5 * 60_000,
  });
}

/** Sugerencias de bodega para el autocomplete (con query mínima). */
export function useWinerySuggestions(query: string) {
  return useQuery({
    queryKey: ['wineries', query],
    queryFn: () => api.get<WineryRef[]>(`/wineries?query=${encodeURIComponent(query)}`),
    enabled: query.trim().length > 0,
    staleTime: 60_000,
  });
}

export function useCreateWine() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateWineInput) => api.post<WineListItem>('/wines', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['wines'] }),
  });
}

export function useUpdateWine(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateWineInput) => api.patch<WineListItem>(`/wines/${id}`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wines'] });
      queryClient.invalidateQueries({ queryKey: ['wine', id] });
    },
  });
}

export function useDeleteWine() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.del<{ hiddenReviews: number }>(`/wines/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['wines'] }),
  });
}
