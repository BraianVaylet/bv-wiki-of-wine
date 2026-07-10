import { ACCEPTED_IMAGE_MIME } from '@bv/shared';
import type { WineType } from '@bv/shared';
import { Camera, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { useDeletePhoto, useUploadPhoto } from '../hooks/usePhoto';
import { ApiError } from '../lib/apiClient';
import { BottleGlyph } from './BottleGlyph';
import { Alert, Button, Spinner } from './ui';

const MAX_MB = 6;
const BYTES_PER_MB = 1024 * 1024;

interface PhotoInputProps {
  wineId: number;
  type: WineType;
  photoUrl: string | null;
  canEdit: boolean;
}

/** Foto de la etiqueta: preview local (blob) mientras sube, con progreso y error. */
export function PhotoInput({ wineId, type, photoUrl, canEdit }: PhotoInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadPhoto = useUploadPhoto(wineId);
  const deletePhoto = useDeletePhoto(wineId);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function pick(file: File | undefined) {
    if (!file) return;
    setError(null);

    if (!ACCEPTED_IMAGE_MIME.includes(file.type as (typeof ACCEPTED_IMAGE_MIME)[number])) {
      setError('Formato no soportado. Usá JPEG, PNG o WebP.');
      return;
    }
    if (file.size > MAX_MB * BYTES_PER_MB) {
      setError(`La imagen supera los ${MAX_MB} MB.`);
      return;
    }

    // Preview inmediato con un blob local; se revoca al terminar.
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    uploadPhoto.mutate(file, {
      onError: (err) =>
        setError(err instanceof ApiError ? err.message : 'No se pudo subir la imagen.'),
      onSettled: () => {
        URL.revokeObjectURL(objectUrl);
        setPreview(null);
      },
    });
  }

  const shown = preview ?? photoUrl;

  return (
    <div className="flex flex-col gap-2">
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-surface-2">
        {shown ? (
          <img src={shown} alt="Etiqueta del vino" className="h-full w-full object-cover" />
        ) : (
          <BottleGlyph type={type} className="mx-auto h-full w-auto p-8" />
        )}
        {uploadPhoto.isPending && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-white">
            <Spinner size={28} />
          </div>
        )}
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      {canEdit && (
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            className="sr-only"
            onChange={(e) => pick(e.target.files?.[0])}
          />
          <Button
            variant="secondary"
            className="flex-1"
            loading={uploadPhoto.isPending}
            onClick={() => inputRef.current?.click()}
          >
            <Camera size={16} aria-hidden="true" />
            {photoUrl ? 'Cambiar foto' : 'Agregar foto'}
          </Button>
          {photoUrl && (
            <Button
              variant="secondary"
              loading={deletePhoto.isPending}
              onClick={() => deletePhoto.mutate()}
              aria-label="Quitar foto"
            >
              <Trash2 size={16} aria-hidden="true" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
