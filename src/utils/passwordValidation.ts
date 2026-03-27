import { z } from 'zod';

/**
 * Password policy rules:
 * - Minimum 8 characters
 * - Maximum 128 characters
 * - At least 1 uppercase letter
 * - At least 1 lowercase letter
 * - At least 1 number
 * - At least 1 special character
 */

export const PASSWORD_RULES = [
  { test: (pw: string) => pw.length >= 8, label: 'Mínimo 8 caracteres' },
  { test: (pw: string) => /[A-Z]/.test(pw), label: 'Uma letra maiúscula' },
  { test: (pw: string) => /[a-z]/.test(pw), label: 'Uma letra minúscula' },
  { test: (pw: string) => /[0-9]/.test(pw), label: 'Um número' },
  { test: (pw: string) => /[^A-Za-z0-9]/.test(pw), label: 'Um caractere especial (!@#$...)' },
] as const;

export const passwordSchema = z
  .string()
  .min(8, 'Senha deve ter no mínimo 8 caracteres')
  .max(128, 'Senha deve ter no máximo 128 caracteres')
  .refine((pw) => /[A-Z]/.test(pw), 'Senha deve conter pelo menos uma letra maiúscula')
  .refine((pw) => /[a-z]/.test(pw), 'Senha deve conter pelo menos uma letra minúscula')
  .refine((pw) => /[0-9]/.test(pw), 'Senha deve conter pelo menos um número')
  .refine((pw) => /[^A-Za-z0-9]/.test(pw), 'Senha deve conter pelo menos um caractere especial');

export function validatePassword(pw: string): { valid: boolean; errors: string[] } {
  const result = passwordSchema.safeParse(pw);
  if (result.success) return { valid: true, errors: [] };
  return { valid: false, errors: result.error.errors.map((e) => e.message) };
}

export function getPasswordStrength(pw: string): number {
  if (!pw) return 0;
  return PASSWORD_RULES.filter((r) => r.test(pw)).length;
}
