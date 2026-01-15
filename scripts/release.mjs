import { spawnSync } from 'node:child_process';
import { Console } from 'node:console';
import { rmSync } from 'node:fs';
import process from 'node:process';

const logger = new Console({ stdout: process.stdout, stderr: process.stderr });

const args = new Set(process.argv.slice(2));
const shouldPublish = args.has('--yes');

const run = (command, commandArgs, options = {}) => {
    const result = spawnSync(command, commandArgs, {
        stdio: options.capture ? 'pipe' : 'inherit',
        encoding: 'utf8',
    });

    if (result.error) {
        logger.error(result.error.message);
        process.exit(1);
    }

    if (typeof result.status === 'number' && result.status !== 0) {
        process.exit(result.status);
    }

    return result;
};

const ensureCleanWorkingTree = () => {
    const result = run('git', ['status', '--porcelain'], { capture: true });
    if (result.stdout.trim().length > 0) {
        logger.error('Working tree is not clean. Commit or stash changes before releasing.');
        process.exit(1);
    }
};

const packAndClean = () => {
    const result = run('npm', ['pack'], { capture: true });
    if (result.stdout) {
        process.stdout.write(result.stdout);
    }
    if (result.stderr) {
        process.stderr.write(result.stderr);
    }

    const tarball = result.stdout
        .split('\n')
        .map((line) => line.trim())
        .reverse()
        .find((line) => line.endsWith('.tgz'));

    if (tarball) {
        rmSync(tarball, { force: true });
    }
};

ensureCleanWorkingTree();

run('npm', ['run', 'lint']);
run('npm', ['test']);
run('npm', ['run', 'clean']);
run('npm', ['run', 'build']);
packAndClean();

if (!shouldPublish) {
    logger.log('\nRelease checks complete. Re-run with --yes to publish and push tags.');
    process.exit(0);
}

run('npm', ['publish']);
run('git', ['push']);
run('git', ['push', '--tags']);

const statusAfter = run('git', ['status', '--porcelain'], { capture: true });
if (statusAfter.stdout.trim().length > 0) {
    logger.warn('Working tree is not clean after publish.');
}
