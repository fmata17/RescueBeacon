import { createServer, type IncomingMessage } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import OpenAI from 'openai';

export interface AssessmentServerOptions {
  modelBaseUrl: string;
  model: string;
  manifestPath: string;
  modelFetch?: typeof fetch;
  timeoutMs?: number;
  allowedOrigins?: string[];
}

class EndpointError extends Error {
  constructor(public status: number, public code: string) {
    super(code);
  }
}

async function assessmentInput(request: IncomingMessage) {
  if (request.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new EndpointError(415, 'unsupported_media_type');
  }
  const body = await new Promise<string>((resolveBody, reject) => {
    let body = '';
    let bytes = 0;
    request.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > 16_384) {
        reject(new EndpointError(413, 'request_too_large'));
        return;
      }
      body += chunk.toString('utf8');
    });
    request.on('end', () => resolveBody(body));
    request.on('error', () => reject(new EndpointError(400, 'invalid_request')));
  });
  try {
    const value: unknown = JSON.parse(body);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    const input = value as Record<string, unknown>;
    if (typeof input.observationId !== 'string' || !input.observationId.trim() || input.observationId.length > 200 ||
        (input.stage !== 'flood' && input.stage !== 'assistance')) throw new Error();
    return { observationId: input.observationId, stage: input.stage };
  } catch {
    throw new EndpointError(400, 'invalid_request');
  }
}

function localModelUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('LOCAL_MODEL_BASE_URL must be an HTTP(S) loopback URL.');
  }
  if (!['http:', 'https:'].includes(url.protocol) ||
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      url.username || url.password || url.search || url.hash) {
    throw new Error('LOCAL_MODEL_BASE_URL must be an HTTP(S) loopback URL without credentials, query, or fragment.');
  }
  // Keep localhost local even if host resolution is changed on the machine.
  if (url.hostname === 'localhost') url.hostname = '127.0.0.1';
  url.pathname = url.pathname.replace(/\/$/, '') + '/';
  return url;
}

async function originalImage(manifestPath: string, observationId: string) {
  let manifest: Array<{ id: string; image: string | null }>;
  try {
    const value: unknown = JSON.parse(await readFile(manifestPath, 'utf8'));
    if (!Array.isArray(value) || value.some(entry =>
      !entry || typeof entry !== 'object' || typeof entry.id !== 'string' || !entry.id.trim() ||
      (entry.image !== null && typeof entry.image !== 'string')) ||
      new Set(value.map(entry => entry.id)).size !== value.length) throw new Error();
    manifest = value;
  } catch {
    throw new EndpointError(503, 'manifest_unavailable');
  }
  const observation = manifest.find(entry => entry.id === observationId);
  if (!observation) throw new EndpointError(404, 'observation_not_found');
  if (!observation.image) throw new EndpointError(409, 'image_unavailable');
  if (isAbsolute(observation.image) || observation.image.includes('\\') ||
      observation.image.includes('\0') || /^[a-z][a-z0-9+.-]*:/i.test(observation.image)) {
    throw new EndpointError(422, 'image_unavailable');
  }
  try {
    const root = await realpath(dirname(manifestPath));
    const path = await realpath(resolve(root, observation.image));
    const contained = relative(root, path);
    if (contained === '..' || contained.startsWith(`..${sep}`) || isAbsolute(contained)) {
      throw new EndpointError(422, 'image_unavailable');
    }
    const mediaTypes: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
    const mediaType = mediaTypes[extname(path).toLowerCase()];
    if (!mediaType) throw new EndpointError(422, 'image_unavailable');
    const image = await readFile(path);
    return `data:${mediaType};base64,${image.toString('base64')}`;
  } catch (error) {
    if (error instanceof EndpointError) throw error;
    throw new EndpointError(409, 'image_unavailable');
  }
}

function validatedResult(content: string | null | undefined, stage: string) {
  try {
    const value: unknown = JSON.parse(content ?? '');
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    const result = value as Record<string, unknown>;
    if (typeof result.finding !== 'string' || !['yes', 'no', 'uncertain'].includes(result.finding) ||
        typeof result.confidence !== 'string' || !['high', 'medium', 'low'].includes(result.confidence) ||
        typeof result.reason !== 'string' || !result.reason.trim() || result.reason.trim().length > 500) {
      throw new Error();
    }
    if (stage === 'assistance') {
      if (typeof result.personNeedingHelpVisible !== 'boolean') throw new Error();
      if (result.finding === 'yes' && !result.personNeedingHelpVisible) {
        return {
          finding: 'uncertain', confidence: 'low',
          reason: 'Possible danger is visible, but a person needing help is not established by this image.',
        };
      }
    }
    return { finding: result.finding, confidence: result.confidence, reason: result.reason.trim() };
  } catch {
    throw new EndpointError(502, 'invalid_model_output');
  }
}

export function createAssessmentServer(options: AssessmentServerOptions) {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const baseUrl = localModelUrl(options.modelBaseUrl);
  const completionUrl = new URL('chat/completions', baseUrl).href;
  const transport = options.modelFetch ?? globalThis.fetch;
  const model = new OpenAI({
    baseURL: baseUrl.href,
    apiKey: 'local-only',
    maxRetries: 0,
    timeout: timeoutMs,
    fetch: async (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url !== completionUrl) throw new Error('Blocked non-local inference destination');
      return transport(input, { ...init, redirect: 'manual' });
    },
  });

  const allowedOrigins = options.allowedOrigins ?? ['http://localhost:5173', 'http://127.0.0.1:5173'];
  const server = createServer(async (request, response) => {
    response.setHeader('content-type', 'application/json');
    response.setHeader('cache-control', 'no-store');
    response.setHeader('vary', 'Origin');
    try {
      if (request.url?.split('?')[0] !== '/api/assessments') throw new EndpointError(404, 'not_found');
      const origin = request.headers.origin;
      if (origin) {
        if (!allowedOrigins.includes(origin)) throw new EndpointError(403, 'origin_not_allowed');
        response.setHeader('access-control-allow-origin', origin);
      }
      if (request.method === 'OPTIONS') {
        response.setHeader('access-control-allow-methods', 'POST, OPTIONS');
        response.setHeader('access-control-allow-headers', 'content-type');
        response.statusCode = 204;
        response.end();
        return;
      }
      if (request.method !== 'POST') {
        response.setHeader('allow', 'POST, OPTIONS');
        throw new EndpointError(405, 'method_not_allowed');
      }
      const input = await assessmentInput(request);
      const image = await originalImage(options.manifestPath, input.observationId);
      const controller = new AbortController();
      let deadline: ReturnType<typeof setTimeout> | undefined;
      const expired = new Promise<never>((_resolve, reject) => {
        deadline = setTimeout(() => {
          reject(new EndpointError(504, 'inference_timeout'));
          controller.abort();
        }, timeoutMs);
      });
      const completion = await Promise.race([model.chat.completions.create({
        model: options.model,
        messages: [{ role: 'user', content: [
          { type: 'text', text: `Assess ${input.stage} from the original image only. Return JSON with finding (yes/no/uncertain), confidence (high/medium/low), and a concise reason (1-500 characters). Do not infer coordinates or invent occupants. ${input.stage === 'assistance' ? 'Include personNeedingHelpVisible (boolean). A vehicle in floodwater is possible danger, not proof of occupants or assistance needed. If the image cannot establish whether someone needs help, return uncertain. Set personNeedingHelpVisible true only when a person needing help is visibly evidenced.' : 'Assess flooding separately from whether anyone needs assistance.'}` },
          { type: 'image_url', image_url: { url: image } },
        ] }],
        response_format: { type: 'json_object' },
      }, { signal: controller.signal }), expired]).finally(() => clearTimeout(deadline));
      const result = validatedResult(completion.choices?.[0]?.message?.content, input.stage);
      response.end(JSON.stringify({ ...result, stage: input.stage, source: 'local-model' }));
    } catch (error) {
      request.resume();
      if (error instanceof OpenAI.APIConnectionTimeoutError) error = new EndpointError(504, 'inference_timeout');
      response.statusCode = error instanceof EndpointError ? error.status : 502;
      response.end(JSON.stringify({ error: error instanceof EndpointError ? error.code : 'inference_failed' }));
    }
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  return server;
}
