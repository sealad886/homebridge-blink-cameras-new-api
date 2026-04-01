import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';

const scriptPath = join(process.cwd(), 'scripts', 'deploy-to-pi.sh');

const writeExecutable = (filePath: string, content: string): void => {
  writeFileSync(filePath, content);
  chmodSync(filePath, 0o755);
};

describe('deploy-to-pi script', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    while (tempDirs.length > 0) {
      const tempDir = tempDirs.pop();
      if (tempDir) {
        rmSync(tempDir, { force: true, recursive: true });
      }
    }
  });

  it('rejects the removed tarball deployment mode', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'deploy-to-pi-test-'));
    const binDir = join(tempDir, 'bin');
    tempDirs.push(tempDir);

    mkdirSync(binDir);
    writeExecutable(
      join(binDir, 'nc'),
      `#!/usr/bin/env bash
exit 1
`,
    );

    const result = spawnSync('bash', [scriptPath, '--tarball'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${binDir}${delimiter}${process.env.PATH ?? ''}`,
      },
    });

    expect(result.status).toBe(1);
    expect(`${result.stdout}${result.stderr}`).toContain('The --tarball deployment mode has been removed.');
  });
});