import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

function readInt(env, name, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;

  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} debe ser un entero entre ${min} y ${max}.`);
  }
  return value;
}

function readChoice(env, name, allowed, fallback) {
  const value = String(env[name] ?? fallback).toLowerCase();
  if (!allowed.includes(value)) {
    throw new Error(`${name} debe ser uno de: ${allowed.join(', ')}.`);
  }
  return value;
}

function readBool(env, name, fallback) {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;

  const value = raw.toLowerCase();
  if (['1', 'true', 'yes', 'si', 'sí'].includes(value)) return true;
  if (['0', 'false', 'no'].includes(value)) return false;
  throw new Error(`${name} debe ser true o false.`);
}

export function loadConfig(env = process.env) {
  const aiProvider = readChoice(env, 'AI_PROVIDER', ['mock', 'gemini', 'openai'], 'mock');
  const aiApiKey = String(env.AI_API_KEY ?? '').trim();

  if (aiProvider !== 'mock' && !aiApiKey) {
    throw new Error(`AI_PROVIDER=${aiProvider} requiere AI_API_KEY.`);
  }

  const defaultModel = aiProvider === 'gemini'
    ? 'gemini-2.5-flash'
    : aiProvider === 'openai'
      ? 'gpt-4o-mini'
      : 'mock';

  const rawDbPath = env.DB_PATH ?? 'data/tickets.db';
  const dbPath = rawDbPath === ':memory:' ? ':memory:' : path.resolve(rootDir, rawDbPath);

  return {
    rootDir,
    port: readInt(env, 'PORT', 3000, { min: 1, max: 65535 }),
    dbPath,
    publicDir: path.join(rootDir, 'public'),
    schemaPath: path.join(rootDir, 'schema.sql'),
    seedDemo: readBool(env, 'SEED_DEMO', env.NODE_ENV !== 'production'),
    ai: {
      provider: aiProvider,
      apiKey: aiApiKey,
      model: String(env.AI_MODEL ?? defaultModel).trim() || defaultModel,
      timeoutMs: readInt(env, 'AI_TIMEOUT_MS', 10000, { min: 1000, max: 60000 }),
    },
  };
}
