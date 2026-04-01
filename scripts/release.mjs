import { spawnSync } from 'node:child_process';
import { Console } from 'node:console';
import { rmSync } from 'node:fs';
import process from 'node:process';

const logger = new Console({ stdout: process.stdout, stderr: process.stderr });

const args = new Set(process.argv.slice(2));

if (args.has('--yes')) {
    logger.error('The --yes local publish mode has been removed.');
    logger.error('Run `npm run release` for validation, then make sure the version bump commit is on main before pushing `git push origin main --follow-tags` to trigger publish.yml.');
    process.exit(1);
}

if (args.size > 0) {
    logger.error(`Unsupported option(s): ${Array.from(args).join(', ')}`);
    process.exit(1);
}

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

logger.log('\nRelease checks complete. Once the version bump commit is on main, push `git push origin main --follow-tags` to trigger publish.yml.');
