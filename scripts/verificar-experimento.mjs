import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const experimentDir = path.join(root, 'experimento');

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').toUpperCase();
}

function parseHashes(fileName) {
  return fs.readFileSync(path.join(experimentDir, fileName), 'utf8')
    .split(/\r?\n/)
    .slice(1)
    .filter(Boolean)
    .map((line) => {
      const [file, hash] = line.split('\t');
      return { file, hash };
    });
}

let ok = true;

console.log('Verificando el snapshot del experimento:\n');
for (const { file, hash } of parseHashes('linea-base.txt')) {
  const snapshot = path.join(experimentDir, 'snapshot', file);
  if (!fs.existsSync(snapshot)) {
    console.log(`FALTA  ${file} (no está en el snapshot)`);
    ok = false;
    continue;
  }

  const snapshotOk = sha256(snapshot) === hash;
  const currentChanged = !fs.existsSync(path.join(root, file)) || sha256(path.join(root, file)) !== hash;
  console.log(`${snapshotOk ? 'OK    ' : 'FALLO '} ${file.padEnd(24)} snapshot íntegro: ${snapshotOk ? 'sí' : 'no'} · archivo actual modificado: ${currentChanged ? 'sí' : 'no'}`);
  if (!snapshotOk) ok = false;
}

const reviewerHash = sha256(path.join(experimentDir, 'revisor.md'));
const expectedReviewer = parseHashes('linea-final.txt').find((row) => row.file === 'experimento/revisor.md')?.hash;
console.log(`\nRevisor actual: ${reviewerHash === expectedReviewer ? 'OK (coincide con linea-final.txt)' : 'FALLO (no coincide con linea-final.txt)'}`);
if (reviewerHash !== expectedReviewer) ok = false;

console.log(ok
  ? '\nEl experimento quedó preservado. Los archivos actuales pueden seguir evolucionando.'
  : '\nHay diferencias: revisá el snapshot antes de seguir.');
process.exitCode = ok ? 0 : 1;
