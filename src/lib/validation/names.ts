/** Family and token names: slug-safe and DTCG-safe (no leading $, no ".", "{", "}") — PRD §19. */

export function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export type NameCheck = { ok: true; name: string } | { ok: false; error: string };

export function validateFamilyName(input: string, existing: string[]): NameCheck {
  const name = slugify(input);
  if (!name) return { ok: false, error: 'Give the family a name using letters or numbers.' };
  if (!/^[a-z]/.test(name)) return { ok: false, error: 'Names need to start with a letter.' };
  if (name.length > 32) return { ok: false, error: 'Keep names to 32 characters or fewer.' };
  if (existing.includes(name)) return { ok: false, error: `“${name}” is already used by another family.` };
  return { ok: true, name };
}

export function isDtcgSafe(name: string): boolean {
  return name.length > 0 && !name.startsWith('$') && !/[.{}]/.test(name);
}

/** Returns `base`, or `base-2`, `base-3`… — whichever is free. */
export function uniqueName(base: string, existing: string[]): string {
  const root = slugify(base) || 'colour';
  if (!existing.includes(root)) return root;
  let n = 2;
  while (existing.includes(`${root}-${n}`)) n++;
  return `${root}-${n}`;
}
