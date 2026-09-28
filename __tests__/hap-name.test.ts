import { toHapName } from '../src/hap-name';

describe('toHapName', () => {
  it.each([
    ['Corner (G8T1-K001-3255-014P)', 'Corner (G8T1-K001-3255-014P'],
    ['  Front  Kitchen  ', 'Front Kitchen'],
    ['🏠 Front Camera 🔔', 'Front Camera'],
    ['TV / Lounge', 'TV / Lounge'],
    ['Caméra arrière', 'Caméra arrière'],
  ])('normalizes %j to a current HAP-compatible name', (input, expected) => {
    expect(toHapName(input, 'Blink Camera')).toBe(expected);
  });

  it.each(['', '!', 'A'])('uses a valid contextual fallback for unusable input %j', input => {
    expect(toHapName(input, 'Blink Camera')).toBe('Blink Camera');
  });

  it('uses a built-in valid fallback when both supplied values are unusable', () => {
    expect(toHapName('!', 'A')).toBe('Blink Device');
  });

  it('caps names at the current HAP limit and retains an alphanumeric ending', () => {
    expect(toHapName(`${'A'.repeat(63)}-)`, 'Blink Camera')).toBe('A'.repeat(63));
  });
});
