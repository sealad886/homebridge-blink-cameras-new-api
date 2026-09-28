import { Characteristic, Service } from 'homebridge';

const HAP_NAME_MAX_LENGTH = 64;
const HAP_NAME_MIDDLE_CHARACTER = /[\p{L}\p{N}\p{Zs}\u2019'&!._:;()/,-]/u;
const HAP_NAME_EDGE_CHARACTER = /[\p{L}\p{N}]/u;

/**
 * Normalize a user or vendor supplied label for a HAP Name characteristic.
 *
 * This is a HAP/Home compatibility constraint, not a Blink product naming
 * rule. Revisit it whenever Homebridge/HAP-NodeJS changes. Current upstream
 * behavior is documented by:
 * https://github.com/homebridge/HAP-NodeJS/blob/latest/src/lib/util/checkName.ts
 * and Apple's naming guidance:
 * https://developer.apple.com/design/human-interface-guidelines/homekit#Help-people-choose-useful-names
 *
 * HAP-NodeJS marks checkName as private API, so importing it would couple the
 * plugin to an unsupported module path. Keep this conservative boundary and
 * its compatibility tests aligned with the installed HAP implementation.
 */
export function toHapName(value: string | undefined, fallback: string): string {
  const fallbackCandidate = normalizeCandidate(fallback);
  const normalizedFallback = fallbackCandidate.length >= 2 ? fallbackCandidate : 'Blink Device';
  const normalized = normalizeCandidate(value ?? '');
  return normalized.length >= 2 ? normalized : normalizedFallback;
}

export function setHapServiceName(
  service: Service,
  nameCharacteristic: typeof Characteristic.Name,
  value: string | undefined,
  fallback: string,
): string {
  const name = toHapName(value, fallback);
  service.displayName = name;
  service.setCharacteristic(nameCharacteristic, name);
  return name;
}

function normalizeCandidate(value: string): string {
  const characters = Array.from(value.normalize('NFC'));
  const replaced = characters
    .map(character => HAP_NAME_MIDDLE_CHARACTER.test(character) ? character : ' ')
    .join('')
    .replace(/\p{Zs}+/gu, ' ')
    .trim();

  const validStart = Array.from(replaced).findIndex(character => HAP_NAME_EDGE_CHARACTER.test(character));
  if (validStart < 0) {
    return '';
  }

  const fromValidStart = Array.from(replaced).slice(validStart);
  let validEnd = fromValidStart.length - 1;
  while (validEnd >= 0 && !HAP_NAME_EDGE_CHARACTER.test(fromValidStart[validEnd])) {
    validEnd--;
  }

  const bounded = fromValidStart.slice(0, validEnd + 1).slice(0, HAP_NAME_MAX_LENGTH);
  while (bounded.length > 0 && !HAP_NAME_EDGE_CHARACTER.test(bounded[bounded.length - 1])) {
    bounded.pop();
  }
  return bounded.join('').trim();
}
