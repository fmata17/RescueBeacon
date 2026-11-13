import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createAssessmentServer } from './server.js';

function integerEnvironment(name: string, fallback: number, maximum: number) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new Error(`${name} must be an integer from 1 to ${maximum}.`);
  }
  return value;
}

try {
  const model = process.env.LOCAL_MODEL_NAME?.trim();
  if (!model) throw new Error('Set LOCAL_MODEL_NAME to the vision-language model served locally.');
  const port = integerEnvironment('PORT', 8787, 65_535);
  const server = createAssessmentServer({
    model,
    modelBaseUrl: process.env.LOCAL_MODEL_BASE_URL ?? 'http://127.0.0.1:1234/v1',
    manifestPath: process.env.IMAGE_MANIFEST_PATH
      ? resolve(process.env.IMAGE_MANIFEST_PATH)
      : fileURLToPath(new URL('../../images/manifest.json', import.meta.url)),
    timeoutMs: integerEnvironment('LOCAL_MODEL_TIMEOUT_MS', 30_000, 300_000),
    allowedOrigins: process.env.FRONTEND_ORIGINS?.split(',').map(value => value.trim()).filter(Boolean),
  });
  server.on('error', error => {
    console.error(`Assessment service could not start: ${error.message}`);
    process.exitCode = 1;
  });
  server.listen(port, '127.0.0.1', () => {
    console.log(`RescueBeacon assessments: http://127.0.0.1:${port}/api/assessments`);
  });
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      server.close();
      server.closeAllConnections();
    });
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Invalid backend configuration.');
  process.exitCode = 1;
}
