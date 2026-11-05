/** A readable name for the signed-in user. The login response carries only a
 * role, so the name is derived from the email the user typed, kept in memory
 * and never logged (NFR-03). */

const FALLBACK = 'Signed in';

function titleCase(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

export function displayNameFromEmail(email: string | null): string {
  const local = (email ?? '').split('@')[0] ?? '';
  const words = local
    .replace(/(\d+)$/, ' $1')
    .split(/[\s._-]+/)
    .filter((word) => word !== '');
  return words.length === 0 ? FALLBACK : words.map(titleCase).join(' ');
}
