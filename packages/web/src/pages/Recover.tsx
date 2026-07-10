import { aliasSchema, recoverySchema } from '@bv/shared';
import { type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthShell } from '../components/AuthShell';
import { Alert, Button, FieldError, Input, Label } from '../components/ui';
import { ApiError, api } from '../lib/apiClient';
import {
  type FieldErrors,
  fieldErrorsFromApi,
  fieldErrorsFromZod,
  formMessage,
} from '../lib/formErrors';

type Step = 'alias' | 'reset';

/** Recuperación en dos pasos: primero el alias trae la pregunta, luego se responde. */
export function Recover() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('alias');
  const [alias, setAlias] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmitAlias(event: FormEvent) {
    event.preventDefault();
    const parsed = aliasSchema.safeParse(alias);
    if (!parsed.success) {
      setErrors(fieldErrorsFromZod(parsed.error));
      return;
    }
    setErrors({});
    setFormError(null);
    setLoading(true);
    try {
      const { question: q } = await api.get<{ question: string }>(
        `/auth/recovery/${encodeURIComponent(parsed.data)}`,
      );
      setQuestion(q);
      setStep('reset');
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Ocurrió un error.');
    } finally {
      setLoading(false);
    }
  }

  async function onSubmitReset(event: FormEvent) {
    event.preventDefault();
    const parsed = recoverySchema.safeParse({ alias, answer, newPassword });
    if (!parsed.success) {
      setErrors(fieldErrorsFromZod(parsed.error));
      return;
    }
    setErrors({});
    setFormError(null);
    setLoading(true);
    try {
      await api.post('/auth/recovery', parsed.data);
      setDone(true);
    } catch (err) {
      setErrors(fieldErrorsFromApi(err));
      setFormError(formMessage(err));
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <AuthShell title="Contraseña actualizada" subtitle="Ya podés entrar con la nueva.">
        <Button size="lg" className="w-full" onClick={() => navigate('/login')}>
          Ir a entrar
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Recuperar contraseña"
      footer={
        <Link to="/login" className="text-primary underline">
          Volver a entrar
        </Link>
      }
    >
      {step === 'alias' ? (
        <form onSubmit={onSubmitAlias} noValidate className="flex flex-col gap-4">
          {formError && <Alert variant="danger">{formError}</Alert>}
          <div>
            <Label htmlFor="alias">Tu alias</Label>
            <Input
              id="alias"
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              autoCapitalize="none"
              invalid={Boolean(errors.alias)}
            />
            <FieldError>{errors.alias}</FieldError>
          </div>
          <Button type="submit" size="lg" loading={loading}>
            Continuar
          </Button>
        </form>
      ) : (
        <form onSubmit={onSubmitReset} noValidate className="flex flex-col gap-4">
          {formError && <Alert variant="danger">{formError}</Alert>}
          <p className="text-fg text-sm">{question}</p>
          <div>
            <Label htmlFor="answer">Respuesta</Label>
            <Input
              id="answer"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              autoComplete="off"
              invalid={Boolean(errors.answer)}
            />
            <FieldError>{errors.answer}</FieldError>
          </div>
          <div>
            <Label htmlFor="newPassword">Contraseña nueva</Label>
            <Input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              invalid={Boolean(errors.newPassword)}
            />
            <FieldError>{errors.newPassword}</FieldError>
          </div>
          <Button type="submit" size="lg" loading={loading}>
            Cambiar contraseña
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
