/** Mensaje de error de un campo. `role="alert"` para que lo anuncie el lector. */
export function FieldError({ id, children }: { id?: string; children?: string }) {
  if (!children) return null;
  return (
    <p id={id} role="alert" className="mt-1 text-danger text-sm">
      {children}
    </p>
  );
}
