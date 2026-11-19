import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export function openDatabase(dbPath, { schemaPath } = {}) {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON');

  // Normaliza texto para búsquedas: sin tildes y en minúsculas.
  // Se registra antes de aplicar el esquema para que cualquier consulta pueda usarla.
  db.function('fold', { deterministic: true }, (value) => String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase());

  if (dbPath !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL');
  }

  if (schemaPath) {
    db.exec(fs.readFileSync(schemaPath, 'utf8'));
  }

  return db;
}
