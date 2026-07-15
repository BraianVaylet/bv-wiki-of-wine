import { type CreateWineInput, type WineType, createWineSchema } from '@bv/shared';
import { type FormEvent, useEffect, useState } from 'react';
import { useGrapes, useWinerySuggestions } from '../hooks/useWines';
import { type FieldErrors, fieldErrorsFromApi, fieldErrorsFromZod } from '../lib/formErrors';
import { WineTypeSelect } from './WineTypeSelect';
import { Alert, Button, FieldError, Input, Label } from './ui';

const CURRENT_YEAR = new Date().getFullYear();
const MAX_GRAPES = 5;

export interface WineFormValues {
  name: string;
  type: WineType | null;
  vintage: string;
  wineryName: string;
  country: string;
  region: string;
  grapeNames: string[];
}

const EMPTY: WineFormValues = {
  name: '',
  type: null,
  vintage: '',
  wineryName: '',
  country: '',
  region: '',
  grapeNames: [],
};

interface WineFormProps {
  initial?: Partial<WineFormValues>;
  submitLabel: string;
  loading?: boolean;
  submitError?: unknown;
  onSubmit: (input: CreateWineInput) => void;
}

/** Alta/edición de vino. Autocomplete de bodega y uvas con `<datalist>` nativo. */
export function WineForm({ initial, submitLabel, loading, submitError, onSubmit }: WineFormProps) {
  const [values, setValues] = useState<WineFormValues>({ ...EMPTY, ...initial });
  const [grapeInput, setGrapeInput] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});

  const grapes = useGrapes();
  const winerySuggestions = useWinerySuggestions(values.wineryName);

  // Errores de campo que devuelve la API (p. ej. detalle de un 409) → inline.
  useEffect(() => {
    const apiErrors = fieldErrorsFromApi(submitError);
    if (Object.keys(apiErrors).length > 0) setErrors((prev) => ({ ...prev, ...apiErrors }));
  }, [submitError]);

  function set<K extends keyof WineFormValues>(key: K, value: WineFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function addGrape(name: string) {
    const trimmed = name.trim();
    if (!trimmed || values.grapeNames.length >= MAX_GRAPES) return;
    if (values.grapeNames.some((g) => g.toLowerCase() === trimmed.toLowerCase())) return;
    set('grapeNames', [...values.grapeNames, trimmed]);
    setGrapeInput('');
  }

  function removeGrape(name: string) {
    set(
      'grapeNames',
      values.grapeNames.filter((g) => g !== name),
    );
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = createWineSchema.safeParse({
      name: values.name,
      type: values.type ?? undefined,
      vintage: values.vintage ? Number(values.vintage) : undefined,
      wineryName: values.wineryName || undefined,
      country: values.country || undefined,
      region: values.region || undefined,
      grapeNames: values.grapeNames,
    });
    if (!parsed.success) {
      setErrors(fieldErrorsFromZod(parsed.error));
      return;
    }
    setErrors({});
    onSubmit(parsed.data);
  }

  const isConflict =
    submitError && typeof submitError === 'object' && 'code' in submitError
      ? (submitError as { code: string }).code === 'CONFLICT'
      : false;

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      {isConflict && <Alert variant="danger">Ese vino ya está cargado.</Alert>}

      <Input
        label="Nombre *"
        value={values.name}
        onChange={(e) => set('name', e.target.value)}
        error={errors.name}
      />

      <div>
        <Label>Tipo *</Label>
        <WineTypeSelect value={values.type} onChange={(t) => set('type', t)} />
        <FieldError>{errors.type}</FieldError>
      </div>

      <div>
        <Input
          label="Bodega"
          list="winery-suggestions"
          value={values.wineryName}
          onChange={(e) => set('wineryName', e.target.value)}
          autoComplete="off"
        />
        <datalist id="winery-suggestions">
          {winerySuggestions.data?.map((w) => (
            <option key={w.id} value={w.name} />
          ))}
        </datalist>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Cosecha"
          inputMode="numeric"
          value={values.vintage}
          onChange={(e) => set('vintage', e.target.value.replace(/\D/g, ''))}
          placeholder={String(CURRENT_YEAR)}
          error={errors.vintage}
        />
        <Input
          label="Región"
          value={values.region}
          onChange={(e) => set('region', e.target.value)}
        />
      </div>

      <div>
        <div className="flex items-end gap-2">
          <Input
            label={`Uvas (hasta ${MAX_GRAPES})`}
            className="flex-1"
            list="grape-suggestions"
            value={grapeInput}
            onChange={(e) => setGrapeInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addGrape(grapeInput);
              }
            }}
            autoComplete="off"
            disabled={values.grapeNames.length >= MAX_GRAPES}
          />
          <Button
            variant="secondary"
            onClick={() => addGrape(grapeInput)}
            disabled={values.grapeNames.length >= MAX_GRAPES}
          >
            Agregar
          </Button>
        </div>
        <datalist id="grape-suggestions">
          {grapes.data?.map((g) => (
            <option key={g.id} value={g.name} />
          ))}
        </datalist>
        {values.grapeNames.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {values.grapeNames.map((grape) => (
              <button
                key={grape}
                type="button"
                onClick={() => removeGrape(grape)}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2 py-1 text-fg text-sm"
              >
                {grape}
                <span aria-hidden="true" className="text-dim">
                  ×
                </span>
                <span className="sr-only">Quitar</span>
              </button>
            ))}
          </div>
        )}
        <FieldError>{errors.grapeNames}</FieldError>
      </div>

      <Button type="submit" size="lg" loading={loading}>
        {submitLabel}
      </Button>
    </form>
  );
}
