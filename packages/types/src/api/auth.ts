import { z } from 'zod';
import { ParentAccountSchema } from '../progress';

/**
 * Auth API (own provider-agnostic email/password — not Supabase Auth). Passwords are
 * hashed server-side (scrypt) and stored in a separate, history-capable credentials
 * table; the session is a JWT returned as `token` (the kid app sends it as a bearer)
 * and also set as an httpOnly cookie for the web app.
 */

const PasswordSchema = z.string().min(8).max(100);

/**
 * E.164 phone number (e.g. `+33612345678`). Client-side the signup form
 * validates with libphonenumber-js + a country picker; the server re-runs the
 * same library and stores the canonical E.164 string. Optional on signup
 * today (kept as nullable on the account); will become required when SMS
 * recovery lands.
 */
const PhoneSchema = z
  .string()
  .regex(/^\+[1-9]\d{6,14}$/, 'Phone must be in E.164 format (e.g. +33612345678)')
  .nullable();

// POST /api/auth/signup
export const SignupRequestSchema = z.object({
  email: z.email(),
  password: PasswordSchema,
  /** Optional. When omitted the account row's `phone` stays null. */
  phone: PhoneSchema.optional(),
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

// POST /api/auth/forgot-password — kicks off a reset by email. Always returns
// 200 so the endpoint can't be used to enumerate which emails are registered.
export const ForgotPasswordRequestSchema = z.object({
  email: z.email(),
});
export type ForgotPasswordRequest = z.infer<typeof ForgotPasswordRequestSchema>;

// POST /api/auth/reset-password — consumes the token from the email and sets
// the new password. The token is the raw value emailed to the user; the
// server hashes it and compares against `PasswordReset.tokenHash`.
export const ResetPasswordRequestSchema = z.object({
  token: z.string().min(20),
  new_password: PasswordSchema,
});
export type ResetPasswordRequest = z.infer<typeof ResetPasswordRequestSchema>;

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
