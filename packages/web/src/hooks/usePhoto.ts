import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, upload } from '../lib/apiClient';

/** Sube la foto de un vino (multipart) e invalida el detalle y el listado. */
export function useUploadPhoto(wineId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) =>
      upload<{ photoUrl: string }>(`/wines/${wineId}/photo`, 'photo', file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wine', wineId] });
      queryClient.invalidateQueries({ queryKey: ['wines'] });
    },
  });
}

export function useDeletePhoto(wineId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.del<void>(`/wines/${wineId}/photo`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wine', wineId] });
      queryClient.invalidateQueries({ queryKey: ['wines'] });
    },
  });
}
