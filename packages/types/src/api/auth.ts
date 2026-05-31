import { z } from 'zod';
import { ParentAccountSchema } from '../progress';

/**
 * Auth API (own provider-agnostic email/password — not Supabase Auth). Passwords are
 * hashed server-side (scrypt) and stored in a separate, history-capable credentials
 * table; the session is a JWT returned as `token` (the kid app sends it as a bearer)
 * and also set as an httpOnly cookie for the web app.
 */

const PasswordSchema = z.string().min(8).max(100);

// POST /api/auth/signup
export const SignupRequestSchema = z.object({
  email: z.email(),
  password: PasswordSchema,
});
export type SignupRequest = z.infer<typeof SignupRequestSchema>;

// POST /api/auth/login
export const LoginRequestSchema = z.object({
  email: z.email(),
  password: z.string().min(1).max(100),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

// POST /api/auth/change-password (retires the current credential, inserts a new one)
export const ChangePasswordRequestSchema = z.object({
  current_password: z.string().min(1).max(100),
  new_password: PasswordSchema,
});
export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequestSchema>;

/** Session payload returned by signup/login. `token` is the bearer for the kid device. */
export const AuthSessionResponseSchema = z.object({
  token: z.string(),
  expires_at: z.iso.datetime(),
  parent: ParentAccountSchema,
});
export type AuthSessionResponse = z.infer<typeof AuthSessionResponseSchema>;

// GET /api/auth/me
export const MeResponseSchema = z.object({
  parent: ParentAccountSchema,
});
export type MeResponse = z.infer<typeof MeResponseSchema>;
