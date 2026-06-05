/**
 * Age in whole years from an ISO date string ("YYYY-MM-DD"), or null when the
 * birth date is missing/invalid. Pure + UTC-based so server and client agree.
 */
export function ageFromBirthDate(birthDate: string | null | undefined, now: Date = new Date()): number | null {
  if (!birthDate) return null;
  const dob = new Date(`${birthDate}T00:00:00Z`);
  if (Number.isNaN(dob.getTime())) return null;
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const m = now.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < dob.getUTCDate())) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}
