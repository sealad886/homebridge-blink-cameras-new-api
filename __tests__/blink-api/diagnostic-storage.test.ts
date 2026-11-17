import { ImmisProxyServer } from '../../src/blink-api/immis-proxy';
import { promises as fs, WriteStream } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

describe('diagnostic recording storage containment', () => {
  let root: string;
  let storage: string;
  let outside: string;
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'blink-storage-proof-'));
    storage = path.join(root, 'homebridge');
    outside = path.join(root, 'outside');
    await fs.mkdir(storage);
  });
  afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });

  async function record(saveStreamPath?: string, storagePath: string | undefined = storage) {
    const errorLog = jest.fn();
    const proxy = new ImmisProxyServer({ immisUrl: 'immis://media.immedia-semi.com/?client_id=1', serial: 'SYNTHETIC', saveStreamPath, storagePath: storagePath || undefined, errorLog });
    await (proxy as unknown as { startStreamRecording(): Promise<void> }).startStreamRecording();
    const writer = (proxy as unknown as { streamFile: WriteStream | null }).streamFile;
    if (writer) await new Promise<void>(resolve => writer.end(Buffer.from('synthetic diagnostic bytes'), resolve));
    proxy.stop(); await proxy.whenClosed;
    return { writer, errorLog };
  }

  it.each(['relative', 'absolute', 'root-alias', 'canonical-root'] as const)('writes real bytes within storage for %s paths', async scenario => {
    let storagePath = storage;
    let destination = scenario === 'relative' ? 'diagnostics/nested' : path.join(storage, 'diagnostics');
    if (scenario === 'root-alias' || scenario === 'canonical-root') {
      storagePath = path.join(root, 'storage-alias');
      await fs.symlink(storage, storagePath, 'dir');
      destination = path.join(scenario === 'root-alias' ? storagePath : await fs.realpath(storage), 'diagnostics');
    }
    const { writer, errorLog } = await record(destination, storagePath);
    expect(writer).toBeTruthy();
    expect(errorLog).not.toHaveBeenCalled();
    expect(await fs.readFile(String(writer!.path), 'utf8')).toBe('synthetic diagnostic bytes');
    expect(path.relative(await fs.realpath(storage), String(writer!.path))).not.toMatch(/^\.\./);
  });

  it.each(['external', 'traversal', 'symlink-parent', 'symlink-final', 'missing-storage'] as const)('refuses %s before outside disk mutation', async scenario => {
    let destination = outside;
    let storagePath: string | undefined = storage;
    if (scenario === 'traversal') destination = '../outside/new-child';
    if (scenario === 'symlink-parent' || scenario === 'symlink-final') {
      await fs.mkdir(outside);
      const link = path.join(storage, 'escape');
      await fs.symlink(outside, link, 'dir');
      destination = scenario === 'symlink-parent' ? path.join(link, 'new-child') : storage;
      if (scenario === 'symlink-final') await fs.symlink(outside, path.join(storage, 'blink-stream-recordings'), 'dir');
    }
    if (scenario === 'missing-storage') storagePath = '';
    const { writer, errorLog } = await record(destination, storagePath);
    expect(writer).toBeNull();
    expect(errorLog).toHaveBeenCalledWith(expect.stringContaining('Failed to start stream recording.'));
    expect(await fs.readdir(root)).toEqual(expect.arrayContaining(['homebridge']));
    const outsideEntries = await fs.readdir(outside).catch(error => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    });
    expect(outsideEntries).toEqual([]);
    if (scenario === 'external' || scenario === 'traversal' || scenario === 'missing-storage') await expect(fs.stat(outside)).rejects.toHaveProperty('code', 'ENOENT');
  });

  it('preserves existing external captures and refuses a missing storage directory', async () => {
    await fs.mkdir(outside);
    const oldCapture = path.join(outside, 'old-capture.ts');
    await fs.writeFile(oldCapture, 'previous capture');
    expect((await record(outside)).writer).toBeNull();
    expect(await fs.readFile(oldCapture, 'utf8')).toBe('previous capture');
    expect(await fs.readdir(outside)).toEqual(['old-capture.ts']);
    const missing = path.join(root, 'missing-storage');
    expect((await record('diagnostics', missing)).writer).toBeNull();
    await expect(fs.stat(missing)).rejects.toHaveProperty('code', 'ENOENT');
  });

  it('refuses a relative host storage root without creating diagnostics', async () => {
    const { writer, errorLog } = await record('diagnostics', path.relative(path.resolve('.'), storage));
    expect(writer).toBeNull();
    expect(errorLog).toHaveBeenCalled();
    expect(await fs.readdir(storage)).toEqual([]);
  });

  it('leaves disabled diagnostics inert without a storage root', async () => {
    const { writer, errorLog } = await record(undefined, '');
    expect(writer).toBeNull(); expect(errorLog).not.toHaveBeenCalled();
    expect(await fs.readdir(storage)).toEqual([]);
  });
});
