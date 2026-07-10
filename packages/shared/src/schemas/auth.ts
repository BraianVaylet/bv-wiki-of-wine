import { z } from 'zod';
import { LIMITS } from '../constants';

export const aliasSchema = z
  .string()
  .trim()
  .min(LIMITS.alias.min, `El alias debe tener al menos ${LIMITS.alias.min} caracteres.`)
  .max(LIMITS.alias.max, `El alias no puede superar ${LIMITS.alias.max} caracteres.`)
  .regex(LIMITS.alias.pattern, 'Solo letras, números y . _ -')
  .transform((s) => s.toLowerCase());

const password = z
  .string()
  .min(LIMITS.password.min, `La contraseña debe tener al menos ${LIMITS.password.min} caracteres.`)
  .max(LIMITS.password.max, `La contraseña no puede superar ${LIMITS.password.max} caracteres.`);

const securityAnswer = z
  .string()
  .trim()
  .min(
    LIMITS.securityAnswer.min,
    `La respuesta debe tener al menos ${LIMITS.securityAnswer.min} caracteres.`,
  )
  .max(
    LIMITS.securityAnswer.max,
    `La respuesta no puede superar ${LIMITS.securityAnswer.max} caracteres.`,
  );

export const registerSchema = z.object({
  alias: aliasSchema,
  password,
  securityQuestionId: z.number().int('Elegí una pregunta de seguridad.'),
  securityAnswer,
});

export const loginSchema = z.object({ alias: aliasSchema, password });

/** Recuperación de contraseña respondiendo la pregunta de seguridad. */
export const recoverySchema = z.object({
  alias: aliasSchema,
  answer: securityAnswer,
  newPassword: password,
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RecoveryInput = z.infer<typeof recoverySchema>;
