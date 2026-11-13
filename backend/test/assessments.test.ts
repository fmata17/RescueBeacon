import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import test, { type TestContext } from 'node:test';
import { createAssessmentServer, type AssessmentServerOptions } from '../src/server.js';

const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64');

async function endpoint(t: TestContext, output: unknown, options: Partial<AssessmentServerOptions> = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'rescuebeacon-backend-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, 'observation.png'), image);
  await writeFile(join(directory, 'manifest.json'), JSON.stringify([{
    id: 'curated-observation', title: 'Curated observation', scenario: 'assistance',
    image: 'observation.png', latitude: null, longitude: null,
  }]));
  const server = createAssessmentServer({
    modelBaseUrl: 'http://127.0.0.1:1234/v1', model: 'local-vision',
    manifestPath: join(directory, 'manifest.json'),
    modelFetch: async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(output) } }],
    }), { headers: { 'content-type': 'application/json' } }),
    ...options,
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise<void>((resolve, reject) => {
    server.closeAllConnections();
    server.close(error => error ? reject(error) : resolve());
  }));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected TCP endpoint');
  return {
    directory,
    url: `http://127.0.0.1:${address.port}/api/assessments`,
    assess: (stage = 'flood', observationId = 'curated-observation') => fetch(`http://127.0.0.1:${address.port}/api/assessments`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ observationId, stage }),
    }),
  };
}

test('operator receives a validated flood assessment for a curated image', async t => {
  const api = await endpoint(t, { finding: 'yes', confidence: 'high', reason: 'Water covers the road.' });
  const response = await api.assess();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    stage: 'flood', finding: 'yes', confidence: 'high',
    reason: 'Water covers the road.', source: 'local-model',
  });
});

test('invalid model output is an explicit error, never an assessment', async t => {
  for (const output of [
    null,
    'not JSON',
    { finding: 'maybe', confidence: 'high', reason: 'Water is visible.' },
    { finding: ['yes'], confidence: 'high', reason: 'Water is visible.' },
    { finding: 'yes', confidence: ['high'], reason: 'Water is visible.' },
    { finding: 'yes', confidence: 0.9, reason: 'Water is visible.' },
    { finding: 'yes', confidence: 'high' },
    { finding: 'yes', confidence: 'high', reason: '   ' },
    { finding: 'yes', confidence: 'high', reason: 'x'.repeat(501) },
  ]) {
    await t.test(JSON.stringify(output)?.slice(0, 80) ?? 'null', async t => {
      const api = await endpoint(t, output);
      const response = await api.assess();
      assert.equal(response.status, 502);
      assert.deepEqual(await response.json(), { error: 'invalid_model_output' });
    });
  }
});

test('assistance is confirmed only with reported visible evidence of a person needing help', async t => {
  const api = await endpoint(t, {
    finding: 'yes', confidence: 'high', reason: 'A person is stranded on the roof.', personNeedingHelpVisible: true,
  });
  const response = await api.assess('assistance');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    stage: 'assistance', finding: 'yes', confidence: 'high',
    reason: 'A person is stranded on the roof.', source: 'local-model',
  });
});

test('a flooded car without reported occupants remains possible danger', async t => {
  const api = await endpoint(t, {
    finding: 'yes', confidence: 'high', reason: 'A car is surrounded by floodwater.', personNeedingHelpVisible: false,
  });
  const response = await api.assess('assistance');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    stage: 'assistance', finding: 'uncertain', confidence: 'low',
    reason: 'Possible danger is visible, but a person needing help is not established by this image.', source: 'local-model',
  });
});

test('a valid uncertain finding stays distinct from an endpoint error', async t => {
  const api = await endpoint(t, {
    finding: 'uncertain', confidence: 'medium', reason: 'Occupants cannot be seen through the windows.', personNeedingHelpVisible: false,
  });
  const response = await api.assess('assistance');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    stage: 'assistance', finding: 'uncertain', confidence: 'medium',
    reason: 'Occupants cannot be seen through the windows.', source: 'local-model',
  });
});

test('assistance output missing visible-person evidence is invalid', async t => {
  const api = await endpoint(t, { finding: 'yes', confidence: 'high', reason: 'A flooded vehicle is present.' });
  const response = await api.assess('assistance');
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: 'invalid_model_output' });
});

test('model invocation failures are errors rather than uncertain findings', async t => {
  for (const modelFetch of [
    async () => new Response('Model unavailable', { status: 503 }),
    async () => { throw new TypeError('Connection refused'); },
  ]) {
    const api = await endpoint(t, null, { modelFetch });
    const response = await api.assess();
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { error: 'inference_failed' });
  }
});

test('a slow local model returns a distinct timeout that can be retried', async t => {
  const api = await endpoint(t, null, {
    timeoutMs: 20,
    modelFetch: async (_request, init) => new Promise((resolve, reject) => {
      const timer = setTimeout(() => resolve(new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ finding: 'no', confidence: 'high', reason: 'Dry road.' }) } }],
      }), { headers: { 'content-type': 'application/json' } })), 80);
      init?.signal?.addEventListener('abort', () => { clearTimeout(timer); reject(init.signal?.reason); }, { once: true });
    }),
  });
  const response = await api.assess();
  assert.equal(response.status, 504);
  assert.deepEqual(await response.json(), { error: 'inference_timeout' });
});

test('endpoint startup rejects cloud and non-loopback model URLs', () => {
  for (const modelBaseUrl of [
    'https://api.openai.com/v1', 'http://192.168.1.50:1234/v1',
    'http://localhost.attacker.example/v1', 'file:///tmp/model',
    'http://secret@127.0.0.1:1234/v1', 'http://127.0.0.1:1234/v1?target=cloud',
  ]) {
    assert.throws(() => createAssessmentServer({ modelBaseUrl, model: 'local-vision', manifestPath: '/unused' }), /loopback/);
  }
});

test('the model transport receives only the configured local endpoint and original image', async t => {
  let receivedUrl: string | undefined;
  let receivedBody: Record<string, any> | undefined;
  const api = await endpoint(t, null, {
    modelFetch: async (input, init) => {
      receivedUrl = input instanceof Request ? input.url : String(input);
      receivedBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
        finding: 'no', confidence: 'high', reason: 'The road is dry.',
      }) } }] }), { headers: { 'content-type': 'application/json' } });
    },
  });
  const response = await api.assess();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    stage: 'flood', finding: 'no', confidence: 'high', reason: 'The road is dry.', source: 'local-model',
  });
  assert.equal(receivedUrl, 'http://127.0.0.1:1234/v1/chat/completions');
  assert.equal(receivedBody?.model, 'local-vision');
  assert.equal(receivedBody?.messages[0].content[1].image_url.url, `data:image/png;base64,${image.toString('base64')}`);
});

test('local model redirects cannot send inference to a cloud URL', async t => {
  let redirectMode: RequestRedirect | undefined;
  const api = await endpoint(t, null, {
    modelFetch: async (_input, init) => {
      redirectMode = init?.redirect;
      return new Response(null, { status: 307, headers: { location: 'https://api.openai.com/v1/chat/completions' } });
    },
  });
  const response = await api.assess();
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: 'inference_failed' });
  assert.equal(redirectMode, 'manual');
});

test('unknown observations and pending original images return explicit errors', async t => {
  const api = await endpoint(t, null);
  const unknown = await api.assess('flood', 'not-in-manifest');
  assert.equal(unknown.status, 404);
  assert.deepEqual(await unknown.json(), { error: 'observation_not_found' });
  await writeFile(join(api.directory, 'manifest.json'), JSON.stringify([{
    id: 'curated-observation', title: 'Pending original', scenario: 'assistance', image: null, latitude: null, longitude: null,
  }]));
  const pending = await api.assess();
  assert.equal(pending.status, 409);
  assert.deepEqual(await pending.json(), { error: 'image_unavailable' });
});

test('manifest paths cannot read images outside the image directory, including symlinks', async t => {
  const outside = await mkdtemp(join(tmpdir(), 'rescuebeacon-private-'));
  t.after(() => rm(outside, { recursive: true, force: true }));
  const secretPath = join(outside, 'secret.png');
  await writeFile(secretPath, image);
  for (const pathKind of ['absolute', 'traversal', 'symlink']) {
    await t.test(pathKind, async t => {
      const api = await endpoint(t, { finding: 'yes', confidence: 'high', reason: 'Water is visible.' });
      await symlink(secretPath, join(api.directory, 'link.png'));
      const imagePath = pathKind === 'absolute' ? secretPath : pathKind === 'traversal' ? relative(api.directory, secretPath) : 'link.png';
      await writeFile(join(api.directory, 'manifest.json'), JSON.stringify([{
        id: 'curated-observation', title: 'Unsafe path', scenario: 'assistance', image: imagePath, latitude: null, longitude: null,
      }]));
      const response = await api.assess();
      assert.equal(response.status, 422);
      assert.deepEqual(await response.json(), { error: 'image_unavailable' });
    });
  }
});

test('a malformed image manifest is a service error', async t => {
  const api = await endpoint(t, null);
  await writeFile(join(api.directory, 'manifest.json'), '{broken');
  const response = await api.assess();
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'manifest_unavailable' });
});

test('invalid assessment requests are rejected before inference', async t => {
  const api = await endpoint(t, { finding: 'yes', confidence: 'high', reason: 'Water covers the road.' });
  for (const body of [
    '{broken', 'null', '[]', '{}',
    JSON.stringify({ observationId: 'curated-observation', stage: 'drone' }),
    JSON.stringify({ observationId: 123, stage: 'flood' }),
    JSON.stringify({ observationId: '', stage: 'flood' }),
  ]) {
    const response = await fetch(api.url, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'invalid_request' });
  }
});

test('HTTP methods, routes, content type, and request size are explicit endpoint errors', async t => {
  const api = await endpoint(t, null);
  for (const [url, init, status, error] of [
    [api.url, { method: 'GET' }, 405, 'method_not_allowed'],
    [api.url.replace('/api/assessments', '/missing'), { method: 'POST' }, 404, 'not_found'],
    [api.url, { method: 'POST', body: '{}' }, 415, 'unsupported_media_type'],
    [api.url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'x'.repeat(16_385) }, 413, 'request_too_large'],
  ] as const) {
    const response = await fetch(url, init);
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { error });
  }
});

test('a local frontend can preflight and request an assessment through CORS', async t => {
  const api = await endpoint(t, { finding: 'no', confidence: 'high', reason: 'The road is dry.' });
  const preflight = await fetch(api.url, { method: 'OPTIONS', headers: {
    origin: 'http://localhost:5173', 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type',
  } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  assert.equal(preflight.headers.get('access-control-allow-methods'), 'POST, OPTIONS');
  const response = await fetch(api.url, { method: 'POST', headers: { origin: 'http://localhost:5173', 'content-type': 'application/json' },
    body: JSON.stringify({ observationId: 'curated-observation', stage: 'flood' }),
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:5173');
});

test('an unapproved browser origin cannot trigger inference', async t => {
  const api = await endpoint(t, { finding: 'yes', confidence: 'high', reason: 'Water covers the road.' });
  const response = await fetch(api.url, { method: 'POST', headers: { origin: 'https://unrelated.example', 'content-type': 'application/json' },
    body: JSON.stringify({ observationId: 'curated-observation', stage: 'flood' }),
  });
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: 'origin_not_allowed' });
});
