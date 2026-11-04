'use strict';

const fs = require('node:fs');
const { Buffer } = require('node:buffer');
const path = require('node:path');
const process = require('node:process');
const { createRequire } = require('node:module');
const { createHash, randomUUID } = require('node:crypto');
const { LIMITS, admitLocalClip } = require('./core.cjs');

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function readOwnedFile(file, maximum, privateMode) {
  if (typeof file !== 'string' || !path.isAbsolute(file) || file.includes('\0')) throw new Error('Explicit local file required');
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.uid !== process.getuid() || stat.mode & (privateMode ? 0o077 : 0o022) || stat.size < 1 || stat.size > maximum) {
    throw new Error('Local qualification file rejected');
  }
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const opened = fs.fstatSync(fd);
    if (opened.ino !== stat.ino || opened.dev !== stat.dev || opened.size !== stat.size) throw new Error('Local qualification file changed');
    const bytes = fs.readFileSync(fd);
    if (bytes.length !== stat.size) throw new Error('Local qualification file changed');
    return { bytes, stat };
  } finally { fs.closeSync(fd); }
}
function admitPreview(file, expectedSha256) {
  if (typeof expectedSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(expectedSha256)) throw new Error('Explicit preview hash required');
  const { bytes } = readOwnedFile(file, LIMITS.snapshotBytes, true);
  if (bytes.length < 4 || bytes[0] !== 255 || bytes[1] !== 216 || bytes.at(-2) !== 255 || bytes.at(-1) !== 217 || hash(bytes) !== expectedSha256) {
    bytes.fill(0); throw new Error('Preview JPEG rejected');
  }
  return bytes;
}
function admitQualificationWorker(file, expectedSha256) {
  if (typeof expectedSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(expectedSha256)) throw new Error('Explicit qualification worker hash required');
  const { bytes, stat } = readOwnedFile(file, 64 * 1024 * 1024, false);
  try { if (!(stat.mode & 0o111) || hash(bytes) !== expectedSha256) throw new Error('Qualification worker rejected'); }
  finally { bytes.fill(0); }
  return file;
}
function admitScratchSpace(workspace, inputBytes) {
  let retainedBytes = 0;
  for (const name of fs.readdirSync(workspace)) {
    if (name === '.DS_Store' || !/^(input|prepared)-[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}\.mp4$/i.test(name)) continue;
    const stat = fs.lstatSync(path.join(workspace, name));
    if (!stat.isFile() || stat.uid !== process.getuid() || stat.mode & 0o077) throw new Error('Diagnostic scratch evidence rejected');
    retainedBytes += stat.size;
  }
  if (retainedBytes + inputBytes + LIMITS.preparedBytes > LIMITS.scratchBytes) throw new Error('Diagnostic scratch budget exhausted');
}
function writeParts(file, parts) {
  const fd = fs.openSync(file, 'wx', 0o600), digest = createHash('sha256'); let bytes = 0;
  try {
    for (const part of parts) {
      bytes += part.length;
      if (bytes > LIMITS.preparedBytes) throw new Error('Prepared evidence budget exhausted');
      let offset = 0;
      while (offset < part.length) offset += fs.writeSync(fd, part, offset, part.length - offset);
      digest.update(part);
    }
    fs.fsyncSync(fd); return { bytes, sha256: digest.digest('hex') };
  } finally { fs.closeSync(fd); }
}

/** Source decode and encoding remain entirely within the canonical private worker. */
function createPreparer({ pluginRoot, inputRoot, workspace, preview, previewSha256, qualificationWorker, qualificationWorkerSha256 }) {
  const published = createRequire(path.join(pluginRoot, 'package.json'));
  const { prepareSavedClip } = published('./dist/accessories/saved-clip-preparation.js');
  const previewBytes = admitPreview(preview, previewSha256);
  let workerFactory;
  if (!!qualificationWorker !== !!qualificationWorkerSha256) throw new Error('Qualification worker and hash must be supplied together');
  if (qualificationWorker) {
    admitQualificationWorker(qualificationWorker, qualificationWorkerSha256);
    const { PrivateMediaWorker } = published('./dist/accessories/media-worker.js');
    workerFactory = callbacks => new PrivateMediaWorker(admitQualificationWorker(qualificationWorker, qualificationWorkerSha256), callbacks);
  }
  return async (file, configuration, audioActive, signal) => {
    signal.throwIfAborted();
    const admitted = admitLocalClip(file, inputRoot); admitScratchSpace(workspace, admitted.bytes);
    const { bytes } = readOwnedFile(admitted.file, LIMITS.inputBytes, true);
    if (bytes.length !== admitted.bytes) { bytes.fill(0); throw new Error('Local clip changed'); }
    const id = randomUUID(), inputFile = `input-${id}.mp4`, preparedFile = `prepared-${id}.mp4`;
    let prepared;
    try {
      const sourceSha256 = hash(bytes);
      writeParts(path.join(workspace, inputFile), [bytes]);
      prepared = await prepareSavedClip({ bytes, expectedBytes: bytes.length, expectedSha256: sourceSha256 },
        configuration, audioActive, signal, workerFactory ? { workerFactory } : {});
      signal.throwIfAborted();
      const output = writeParts(path.join(workspace, preparedFile), [prepared.pin.initialization, ...prepared.fragments.map(fragment => fragment.data)]);
      if (output.sha256 !== prepared.preparedSha256) throw new Error('Prepared evidence identity mismatch');
      return { prepared, snapshot: Buffer.from(previewBytes), provenance: { inputFile, preparedFile,
        inputSha256: sourceSha256, preparedSha256: output.sha256, inputBytes: bytes.length, preparedBytes: output.bytes,
        durationSource: 'native-prepared-span-upper-bound', worker: workerFactory ? 'explicit-host-qualification' : 'verified-package' } };
    } catch (error) { prepared?.dispose(); throw error; }
    finally { bytes.fill(0); }
  };
}

module.exports = { createPreparer, admitScratchSpace, admitPreview, admitQualificationWorker };
