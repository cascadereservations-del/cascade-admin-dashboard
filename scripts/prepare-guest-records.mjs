// Local only. Does not upload or modify source documents, photos, or databases.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseGuestMarkdown, parseLocalCollection, photoMime, MAX_PHOTO_BYTES } from '../app/src/features/guests/local-records.ts';

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
export async function prepareCollection(input, expectedDriveFolderId = null) {
  const root = await fs.realpath(input);
  // Fail closed: generated guest data may not live in any Git checkout.
  for (let dir = root; ; dir = path.dirname(dir)) {
    if (await fs.lstat(path.join(dir, '.git')).then(() => true, () => false)) throw new Error('Choose a private source folder outside every Git checkout.');
    if (dir === path.dirname(dir)) break;
  }
  const records = [];
  async function visit(dir) {
    const entries = (await fs.readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
    if (entries.some((e) => e.isSymbolicLink())) throw new Error('Symbolic links are not supported in the source collection.');
    const children = entries.filter((e) => e.isDirectory());
    const source = entries.find((e) => e.isFile() && e.name === 'guest-details.md');
    if (source || (dir !== root && !children.length)) {
      const folder = path.relative(root, dir).split(path.sep).join('/');
      const key = `record-${sha(folder).slice(0, 24)}`;
      const bytes = source ? await fs.readFile(path.join(dir, source.name)) : null;
      const record = bytes ? { ...parseGuestMarkdown(bytes.toString('utf8'), folder), key, sourceHash: sha(bytes), photos: [] } : {
        key, folder, kind: /inquir/i.test(folder) ? 'inquiry_only' : 'folder_only', displayName: path.basename(dir),
        stayDates: null, guestCount: null, contact: null, fields: [], notes: [], identity: [], sourceText: '', sourcePath: null, sourceHash: null, photos: [],
      };
      for (const e of entries.filter((e) => e.isFile() && /\.(?:jpe?g|png|webp)$/i.test(e.name))) {
        const photo = await fs.readFile(path.join(dir, e.name));
        if (photo.length > MAX_PHOTO_BYTES || !photoMime(photo)) throw new Error('A source photo is unsupported or exceeds 10 MB. No collection was written.');
        record.photos.push({ path: `${folder}/${e.name}`, sha256: sha(photo), bytes: photo.length });
      }
      records.push(record);
    }
    for (const child of children) await visit(path.join(dir, child.name));
  }
  await visit(root);
  const collection = { schemaVersion: 1, generatedAt: new Date().toISOString(), records };
  // Reuse only verified upload receipts for the same original photo hash.
  const receipts = await fs.readFile(path.join(root, 'drive-upload-manifest.local.json'), 'utf8').then(JSON.parse, () => null);
  if (expectedDriveFolderId && receipts?.destinationFolderId === expectedDriveFolderId && Array.isArray(receipts.files)) {
    for (const record of records) for (const photo of record.photos) {
      const receipt = receipts.files.find((f) => f.sourcePath === photo.path && f.sha256 === photo.sha256 && f.verified === true);
      if (receipt) photo.driveUrl = receipt.url;
    }
  }
  const serialized = JSON.stringify(collection, null, 2);
  parseLocalCollection(serialized);
  const target = path.join(root, 'guest-records.local.json');
  if (await fs.lstat(target).then((s) => s.isSymbolicLink(), () => false)) throw new Error('Output cannot be a symbolic link.');
  // Keep a previous manifest for recovery; source inputs are never overwritten.
  if (await fs.stat(target).then(() => true, () => false)) await fs.copyFile(target, `${target}.previous`);
  await fs.writeFile(target, serialized, { mode: 0o600 });
  return { records: records.length, documented: records.filter((r) => r.kind === 'documented').length, inquiries: records.filter((r) => r.kind === 'inquiry_only').length, folderOnly: records.filter((r) => r.kind === 'folder_only').length, photos: records.reduce((n, r) => n + r.photos.length, 0) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (!process.argv[2]) throw new Error('Provide the private source folder path.');
    console.log(JSON.stringify(await prepareCollection(process.argv[2], process.argv[3])));
  } catch { console.error('Preparation failed. Check the source folder, permissions and supported document/photo formats. No private values are logged.'); process.exitCode = 1; }
}
