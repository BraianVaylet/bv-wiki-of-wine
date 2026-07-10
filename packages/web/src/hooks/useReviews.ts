import type { MyReview, Review, UpsertReviewInput, WineDetail } from '@bv/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/apiClient';

/**
 * Upsert de reseña con optimistic update: la reseña se pinta al instante y se
 * revierte si el server rechaza. Es la única interacción donde la latencia se nota.
 */
export function useUpsertReview(wineId: number) {
  const queryClient = useQueryClient();
  const key = ['wine', wineId];

  return useMutation({
    mutationFn: (input: UpsertReviewInput) => api.put<Review>(`/wines/${wineId}/review`, input),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<WineDetail>(key);
      // No tocamos los agregados a mano: al confirmar, invalidateQueries los
      // recalcula desde el server. Acá solo adelantamos la reseña propia visible.
      return { previous };
    },
    onError: (_err, _input, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
      queryClient.invalidateQueries({ queryKey: ['wines'] });
      queryClient.invalidateQueries({ queryKey: ['my-reviews'] });
    },
  });
}

export function useDeleteReview(wineId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.del<void>(`/wines/${wineId}/review`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wine', wineId] });
      queryClient.invalidateQueries({ queryKey: ['wines'] });
      queryClient.invalidateQueries({ queryKey: ['my-reviews'] });
    },
  });
}

export function useMyReviews(sort: 'recent' | 'rating') {
  return useQuery({
    queryKey: ['my-reviews', sort],
    queryFn: () => api.get<{ items: MyReview[] }>(`/me/reviews?sort=${sort}`),
  });
}
