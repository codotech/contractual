/**
 * Changeset naming utilities
 * Generates random three-word names for changeset files
 */

const ADJECTIVES = [
  'brave',
  'calm',
  'eager',
  'fancy',
  'gentle',
  'happy',
  'jolly',
  'kind',
  'lively',
  'mighty',
  'noble',
  'proud',
  'quick',
  'ready',
  'sharp',
  'swift',
  'tender',
  'vivid',
  'warm',
  'zesty',
] as const;

const NOUNS = [
  'bears',
  'cats',
  'dogs',
  'eagles',
  'foxes',
  'geese',
  'hawks',
  'ibis',
  'jays',
  'kites',
  'lions',
  'mice',
  'newts',
  'owls',
  'pandas',
  'quails',
  'ravens',
  'seals',
  'tigers',
  'wolves',
] as const;

const VERBS = [
  'fly',
  'run',
  'jump',
  'swim',
  'dance',
  'sing',
  'play',
  'rest',
  'hunt',
  'roam',
  'climb',
  'glide',
  'soar',
  'leap',
  'dash',
  'drift',
  'march',
  'prowl',
  'race',
  'sprint',
] as const;

/**
 * Get a random element from an array
 * @throws {Error} If the array is empty
 */
function randomElement<T>(array: readonly T[]): T {
  if (array.length === 0) {
    throw new Error('Cannot get random element from empty array');
  }
  const index = Math.floor(Math.random() * array.length);
  const element = array[index];
  // This assertion is safe because we've checked array.length > 0 and index is within bounds
  return element as T;
}

/**
 * Generate a random three-word changeset name
 * Format: adjective-noun-verb (e.g., "brave-tigers-fly")
 */
export function generateChangesetName(): string {
  const adjective = randomElement(ADJECTIVES);
  const noun = randomElement(NOUNS);
  const verb = randomElement(VERBS);

  return `${adjective}-${noun}-${verb}`;
}

/**
 * Generate a unique changeset name that doesn't collide with existing names
 * Retries with new random names until a unique one is found
 *
 * @param existingNames - Array of existing changeset names to avoid
 * @param maxRetries - Maximum number of retries before giving up (default: 100)
 * @returns A unique changeset name
 * @throws Error if unable to generate a unique name after max retries
 */
export function generateUniqueChangesetName(
  existingNames: string[],
  maxRetries = 100
): string {
  const existingSet = new Set(existingNames);

  for (let i = 0; i < maxRetries; i++) {
    const name = generateChangesetName();
    if (!existingSet.has(name)) {
      return name;
    }
  }

  // Fallback: append timestamp to ensure uniqueness
  const baseName = generateChangesetName();
  return `${baseName}-${Date.now()}`;
}
