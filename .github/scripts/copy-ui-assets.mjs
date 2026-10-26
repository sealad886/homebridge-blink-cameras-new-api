import { cpSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const source = join(process.cwd(), 'src/homebridge-ui/public');
const destination = join(process.cwd(), 'dist/homebridge-ui/public');
mkdirSync(destination, { recursive: true });
// Preserve the existing public/* selection; recursive directory contents stay intact.
for (const name of readdirSync(source)) {
  if (!name.startsWith('.')) cpSync(join(source, name), join(destination, name), { recursive: true });
}
