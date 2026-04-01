import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';

type ScriptRunResult = {
  commands: string[];
  stderr: string;
  status: number | null;
  stdout: string;
  workspaceDir: string;
};

const scriptPath = join(process.cwd(), 'scripts', 'release.mjs');

const writeExecutable = (filePath: string, content: string): void => {
  writeFileSync(filePath, content);
  chmodSync(filePath, 0o755);
};

const createFakeTooling = (binDir: string, logPath: string): void => {
  writeExecutable(
    join(binDir, 'git'),
    `#!/usr/bin/env bash
printf 'git %s\n' "$*" >> "$COMMAND_LOG_PATH"
if [[ "$1" == "status" && "$2" == "--porcelain" ]]; then
  printf '%s' "\${GIT_STATUS_OUTPUT:-}"
fi
exit 0
`,
  );

  writeExecutable(
    join(binDir, 'npm'),
    `#!/usr/bin/env bash
printf 'npm %s\n' "$*" >> "$COMMAND_LOG_PATH"
if [[ "$1" == "pack" ]]; then
  touch sealad886-homebridge-blink-cameras-new-api-0.6.0.tgz
  printf 'sealad886-homebridge-blink-cameras-new-api-0.6.0.tgz\n'
fi
exit 0
`,
  );

  writeFileSync(logPath, '');
};

const runReleaseScript = (args: string[] = []): ScriptRunResult => {
  const workspaceDir = mkdtempSync(join(tmpdir(), 'release-script-test-'));
  const binDir = join(workspaceDir, 'bin');
  const logPath = join(workspaceDir, 'commands.log');

  mkdirSync(binDir);
  createFakeTooling(binDir, logPath);

  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: workspaceDir,
    encoding: 'utf8',
    env: {
      ...process.env,
      COMMAND_LOG_PATH: logPath,
      GIT_STATUS_OUTPUT: '',
      PATH: `${binDir}${delimiter}${process.env.PATH ?? ''}`,
    },
  });

  const commands = readFileSync(logPath, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  return {
    commands,
    stderr: result.stderr,
    status: result.status,
    stdout: result.stdout,
    workspaceDir,
  };
};

describe('release script', () => {
  const workspaceDirs: string[] = [];

  afterEach(() => {
    while (workspaceDirs.length > 0) {
      const workspaceDir = workspaceDirs.pop();
      if (workspaceDir) {
        rmSync(workspaceDir, { force: true, recursive: true });
      }
    }
  });

  it('runs validation checks without publishing or pushing', () => {
    const result = runReleaseScript();
    workspaceDirs.push(result.workspaceDir);

    expect(result.status).toBe(0);
    expect(result.commands).toEqual([
      'git status --porcelain',
      'npm run lint',
      'npm test',
      'npm run clean',
      'npm run build',
      'npm pack',
    ]);
    expect(result.stdout).toContain('Once the version bump commit is on main, push `git push origin main --follow-tags` to trigger publish.yml.');
  });

  it('rejects the removed local publish mode', () => {
    const result = runReleaseScript(['--yes']);
    workspaceDirs.push(result.workspaceDir);

    expect(result.status).toBe(1);
    expect(result.commands).toEqual([]);
    expect(`${result.stdout}${result.stderr}`).toContain('The --yes local publish mode has been removed.');
  });
});