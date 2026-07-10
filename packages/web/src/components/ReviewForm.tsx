import {
  LIMITS,
  REVIEW_AXES,
  REVIEW_AXIS_LABELS,
  type Review,
  type ReviewAxis,
  type UpsertReviewInput,
} from '@bv/shared';
import { useState } from 'react';
import { StarRating } from './StarRating';
import { Alert, Button } from './ui';

const NOTES_MAX = LIMITS.reviewNotes.max;
const NOTES_COUNTER_FROM = 400;

type AxisValues = Record<ReviewAxis, number | null>;

interface ReviewFormProps {
  initial?: Review | null;
  loading?: boolean;
  error?: unknown;
  onSubmit: (input: UpsertReviewInput) => void;
  onCancel?: () => void;
}

/** Estrella global grande arriba; los 4 ejes y la nota, colapsables. */
export function ReviewForm({ initial, loading, error, onSubmit, onCancel }: ReviewFormProps) {
  const [overall, setOverall] = useState<number | null>(initial?.overall ?? null);
  const [axes, setAxes] = useState<AxisValues>({
    taste: initial?.taste ?? null,
    aroma: initial?.aroma ?? null,
    body: initial?.body ?? null,
    valueForMoney: initial?.valueForMoney ?? null,
  });
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [showDetail, setShowDetail] = useState(
    Boolean(
      initial &&
        (initial.taste || initial.aroma || initial.body || initial.valueForMoney || initial.notes),
    ),
  );
  const [touched, setTouched] = useState(false);

  function handleSubmit() {
    if (overall === null) {
      setTouched(true);
      return;
    }
    onSubmit({ overall, ...axes, notes: notes.trim() });
  }

  const hasError = Boolean(error);

  return (
    <div className="flex flex-col gap-4">
      {hasError && <Alert variant="danger">No se pudo guardar. Probá de nuevo.</Alert>}

      <div className="flex flex-col items-center gap-2">
        <span className="font-medium text-fg text-sm">¿Qué te pareció?</span>
        <StarRating
          name="overall"
          value={overall}
          onChange={setOverall}
          size={40}
          legend="Puntaje general"
        />
        {touched && overall === null && (
          <span className="text-danger text-sm">Poné al menos las estrellas generales.</span>
        )}
      </div>

      {showDetail ? (
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-2 p-3">
          {REVIEW_AXES.map((axis) => (
            <div key={axis} className="flex items-center justify-between gap-2">
              <span className="text-fg text-sm">{REVIEW_AXIS_LABELS[axis]}</span>
              <StarRating
                name={axis}
                value={axes[axis]}
                onChange={(v) => setAxes((a) => ({ ...a, [axis]: v }))}
                clearable
                size={24}
                legend={REVIEW_AXIS_LABELS[axis]}
              />
            </div>
          ))}
          <div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value.slice(0, NOTES_MAX))}
              rows={3}
              placeholder="Una nota para acordarte…"
              className="w-full rounded-lg border border-border bg-surface p-2 text-fg text-sm placeholder:text-dim"
            />
            {notes.length >= NOTES_COUNTER_FROM && (
              <p className="text-right text-dim text-xs">
                {notes.length}/{NOTES_MAX}
              </p>
            )}
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowDetail(true)}
          className="text-primary text-sm underline"
        >
          Agregar detalle (opcional)
        </button>
      )}

      <div className="flex gap-2">
        <Button size="lg" className="flex-1" loading={loading} onClick={handleSubmit}>
          Guardar reseña
        </Button>
        {onCancel && (
          <Button size="lg" variant="secondary" onClick={onCancel}>
            Cancelar
          </Button>
        )}
      </div>
    </div>
  );
}
