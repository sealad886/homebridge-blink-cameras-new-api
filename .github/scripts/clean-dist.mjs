// Only TypeScript/UI output owned by this repository is removed.
import { existsSync, lstatSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const output = fileURLToPath(new URL('../../dist', import.meta.url));
if (existsSync(output)) {
  if (!lstatSync(output).isDirectory() || lstatSync(output).isSymbolicLink()) throw new Error('Generated dist root must be a regular directory');
  rmSync(output, { recursive: true });
}
