import { loginSchema } from '@bv/shared';
import { type FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLogin } from '../auth/useAuth';
import { AuthShell } from '../components/AuthShell';
import { Alert, Button, Input } from '../components/ui';
import {
  type FieldErrors,
  fieldErrorsFromApi,
  fieldErrorsFromZod,
  formMessage,
} from '../lib/formErrors';

export function Login() {
  const login = useLogin();
  const [alias, setAlias] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    // Mismo schema que valida la API: una sola verdad sobre qué es válido.
    const parsed = loginSchema.safeParse({ alias, password });
    if (!parsed.success) {
      setErrors(fieldErrorsFromZod(parsed.error));
      return;
    }
    setErrors({});
    login.mutate(parsed.data, { onError: (err) => setErrors(fieldErrorsFromApi(err)) });
  }

  const formError = formMessage(login.error);

  return (
    <AuthShell
      title="Entrar"
      subtitle="Los vinos que probamos, y si nos gustaron."
      footer={
        <>
          <Link to="/register" className="text-primary underline">
            Crear cuenta
          </Link>
          {' · '}
          <Link to="/recover" className="text-primary underline">
            Olvidé mi contraseña
          </Link>
        </>
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
          autoComplete="current-password"
          error={errors.password}
        />

        <Button type="submit" size="lg" loading={login.isPending}>
          Entrar
        </Button>
      </form>
    </AuthShell>
  );
}
