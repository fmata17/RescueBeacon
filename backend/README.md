# Local assessment service

This independent Node.js/TypeScript package serves `POST /api/assessments` on `127.0.0.1:8787`. It uses the OpenAI client library against a locally hosted vision-language model. The frontend owns Demo mode, workflow, and all later simulated drone findings. This service assesses the original image only and never supplies a scripted fallback.

## Run

Use Node.js 22 or later and start your team's local OpenAI-compatible vision-language server. It must accept image data URLs and JSON-object chat completions at `/v1/chat/completions`.

```sh
cd backend
npm ci
LOCAL_MODEL_NAME=your-local-vision-model LOCAL_MODEL_BASE_URL=http://127.0.0.1:1234/v1 npm start
```

`npm run dev` enables source watching. `.env.example` documents settings; the process does not automatically load `.env` files. Set the values in your shell, or use a Node environment file loader.

| Environment variable | Default | Meaning |
| --- | --- | --- |
| `LOCAL_MODEL_NAME` | Required | Model identifier accepted by the local server |
| `LOCAL_MODEL_BASE_URL` | `http://127.0.0.1:1234/v1` | HTTP(S) loopback model base URL |
| `LOCAL_MODEL_TIMEOUT_MS` | `30000` | Complete inference deadline, 1–300000 ms |
| `PORT` | `8787` | Local service port |
| `IMAGE_MANIFEST_PATH` | Repository `images/manifest.json` | Custom manifest path, relative to the process working directory or absolute |
| `FRONTEND_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Comma-separated CORS allowlist; empty disables browser origins |

Only `localhost`, `127.0.0.1`, and `[::1]` model hosts are accepted. `localhost` is pinned to `127.0.0.1`. Other hosts, URL credentials, queries, and fragments fail startup. The transport permits only the configured completion URL and disables redirects. SDK automatic retries are disabled so the frontend's Retry remains explicit. `OPENAI_BASE_URL` and `OPENAI_API_KEY` are not used: the SDK receives an explicit local base URL and a fixed `local-only` placeholder key. Never configure a local proxy to forward inference to a cloud provider.

## Frontend contract

The shared contract is documented in [assessment-contract.md](../docs/assessment-contract.md). For a curated observation:

```sh
curl http://127.0.0.1:8787/api/assessments \
  -H 'Content-Type: application/json' \
  -d '{"observationId":"assistance","stage":"flood"}'
```

Use an actual `id` from the manifest. `stage` is `flood` or `assistance`. A successful response is:

```json
{"stage":"flood","finding":"yes","confidence":"high","reason":"Water covers the road.","source":"local-model"}
```

Findings are `yes`, `no`, or `uncertain`; confidence is `high`, `medium`, or `low`. Reasons must contain 1–500 characters after trimming. Confidence describes the model's reported certainty; it is not calibrated or a measured reliability claim. No coordinates are inferred or returned.

Vite can proxy `/api` to `http://127.0.0.1:8787`, or the browser can request this URL directly from an allowed frontend origin. Other browser origins receive `403`. The backend binds only to loopback.

## Original-image handoff

The frontend owns [images/manifest.json](../images/manifest.json), an array of `{id, title, scenario, image, latitude, longitude}`. The backend reads `id` and `image`, requiring unique IDs and a string-or-null image field; the remaining supplied metadata is preserved by the frontend. An image path is relative to the manifest's directory. Supported extensions are PNG, JPEG, and WebP. Absolute paths, remote URLs, traversal outside that directory, and symlinks escaping it are rejected. Requests cannot supply an image or a model URL.

Original teammate image assets remain pending. `image: null` is a deliberate placeholder and produces `409 image_unavailable`. Null coordinates are accepted; they are never invented. Tests use temporary local image fixtures without modifying the shared manifest. A missing manifest produces `503 manifest_unavailable` until the handoff is present.

## Model output and assistance uncertainty

Flood output must be a JSON object with `finding`, `confidence`, and `reason`. Assistance output must also include `personNeedingHelpVisible`, a boolean that reports whether the image visibly supports a person needing help. The prompt treats a flooded vehicle alone as possible danger and asks for uncertainty when assistance cannot be established. A model output of `finding: "yes"` with `personNeedingHelpVisible: false` becomes an `uncertain`, `low` assessment with an explicit explanation. Missing or incorrectly typed evidence is invalid output. This evidence field is internal and is omitted from the frontend response.

The policy checks the model's structured report. It does not independently verify occupants or detect every mistaken visual interpretation. Model selection, hosting, tuning, and the confidence mapping belong to the model team.

## Errors and checks

All errors return JSON `{ "error": "code" }` and a non-2xx status. An error is never converted into an uncertain assessment or a Demo result.

| Status | Error | Meaning |
| --- | --- | --- |
| 400 | `invalid_request` | Invalid JSON, observation ID, or stage |
| 403 | `origin_not_allowed` | Browser origin is outside the configured allowlist |
| 404 | `not_found` / `observation_not_found` | Unknown route / manifest observation |
| 405 | `method_not_allowed` | Use POST; OPTIONS supports CORS |
| 409 | `image_unavailable` | Original image is pending or cannot be read |
| 413 | `request_too_large` | JSON request exceeds 16 KiB |
| 415 | `unsupported_media_type` | Use `application/json` |
| 422 | `image_unavailable` | Unsafe image path or unsupported image extension |
| 502 | `invalid_model_output` | Missing, malformed, or unsupported model fields |
| 502 | `inference_failed` | Model transport, HTTP, or protocol failure |
| 503 | `manifest_unavailable` | Missing, invalid, or ambiguous manifest |
| 504 | `inference_timeout` | Complete inference exceeded the configured deadline |

```sh
npm test
npm run check
```

Tests start a real HTTP assessment endpoint with temporary curated images and control only the external model transport. They do not call a real inference server or cloud service. Coverage includes flood/assistance/uncertainty, malformed output, evidence policy, model failures and deadlines, destination/redirect guards, image containment, request validation, and CORS.
