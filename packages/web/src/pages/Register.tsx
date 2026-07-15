import { SECURITY_QUESTIONS, registerSchema } from '@bv/shared';
import { type FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { useRegister } from '../auth/useAuth';
import { AuthShell } from '../components/AuthShell';
import { Alert, Button, Input, Select } from '../components/ui';
import {
  type FieldErrors,
  fieldErrorsFromApi,
  fieldErrorsFromZod,
  formMessage,
} from '../lib/formErrors';

const FIRST_QUESTION_ID = SECURITY_QUESTIONS[0]?.id ?? 1;

export function Register() {
  const register = useRegister();
  const [alias, setAlias] = useState('');
  const [password, setPassword] = useState('');
  const [securityQuestionId, setSecurityQuestionId] = useState(FIRST_QUESTION_ID);
  const [securityAnswer, setSecurityAnswer] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = registerSchema.safeParse({
      alias,
      password,
      securityQuestionId,
      securityAnswer,
    });
    if (!parsed.success) {
      setErrors(fieldErrorsFromZod(parsed.error));
      return;
    }
    setErrors({});
    register.mutate(parsed.data, { onError: (err) => setErrors(fieldErrorsFromApi(err)) });
  }

  const formError = formMessage(register.error);

  return (
    <AuthShell
      title="Crear cuenta"
      subtitle="Sin email: la contraseña se recupera con una pregunta de seguridad."
      footer={
        <Link to="/login" className="text-primary underline">
          Ya tengo cuenta
        </Link>
      }
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {formError && <Alert variant="danger">{formError}</Alert>}

        <Input
          label="Alias"
          name="alias"
          value={alias}
          onChange={(e) => setAlias(e.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          error={errors.alias}
        />

        <Input
          label="Contraseña"
          name="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          error={errors.password}
        />

        <Select
          label="Pregunta de seguridad"
          value={String(securityQuestionId)}
          onValueChange={(v) => setSecurityQuestionId(Number(v))}
          options={SECURITY_QUESTIONS.map((q) => ({ value: String(q.id), label: q.text }))}
        />

        <Input
          label="Respuesta"
          name="securityAnswer"
          value={securityAnswer}
          onChange={(e) => setSecurityAnswer(e.target.value)}
          autoComplete="off"
          error={errors.securityAnswer}
        />

        <Button type="submit" size="lg" loading={register.isPending}>
          Crear cuenta
        </Button>
      </form>
    </AuthShell>
  );
}
