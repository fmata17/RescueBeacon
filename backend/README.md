# Python model backend

`main.py` is the canonical service, adapted from the supplied FastAPI implementation and notebook. It replaces the earlier Node starter. It sends actual image bytes to the existing GB10 model server using the OpenAI Python library. No OpenAI cloud inference or model weights are involved.

## Start

Recommended: `npm run dev` from the repo root starts both API and frontend.

To run only the API, from the root:

```sh
python3.14 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements.txt
backend/.venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

API docs: http://127.0.0.1:8000/docs. Health: `/health` (checks the API, not model connectivity).

The model defaults preserve the team's supplied setup:

| Setting | Default |
| --- | --- |
| `LLM_BASE_URL` | `http://10.246.100.230/v1` |
| `LLM_MODEL` | `qwen3-vl-8b-instruct` |
| `LLM_API_KEY` | Supplied datathon key |
| `LLM_TIMEOUT_SECONDS` | `90` |
| `FRONTEND_ORIGINS` | localhost and 127.0.0.1 on port 5173 |

Export overrides in your shell before running. `.env.example` is a reference; a standalone uvicorn process can load an actual env file using `--env-file backend/.env`. The private model address requires the datathon network/VPN. Live failures are returned explicitly when a fresh analysis is requested. For the four exact original images, the normal showcase request may return the genuine notebook model result with source `recorded-model` and a notice if the live server is unavailable.

## Image workflow

`POST /api/assessments` accepts `{ "observationId": "drone-clear", "stage": "flood" }`. The stage is `flood` or `assistance`. It returns `{stage, finding, confidence, reason, source, notice}`. Source is `local-model` for a live result or `recorded-model` for the genuine saved notebook result. Add `refresh: true` to bypass the fallback and request a fresh model result. Findings are yes/no/uncertain; confidence is high/medium/low and is not calibrated.

The service resolves the image from the repository manifest, converts the inference input to a compact JPEG (maximum 1536 pixels per edge, quality 85), and asks Qwen for separate flood and assistance judgments in one JSON response. The flood request retains the paired assistance result for up to three minutes; the next assistance request consumes it. This avoids a second image upload/inference. Flood retries always call the model again. A request without a paired result also calls the model. No filename or scenario answer is provided as model evidence.

A flooded vehicle with unknown occupants must remain uncertain; model instructions preserve that policy. Drone findings remain frontend simulations because no drone images exist.

For compatibility, `POST /assess` still accepts the supplied starter's `{observation_id, image_name}` and returns `{observation_id, assessment, reason, next_action}`. Image names must exist in the four-image manifest. The notebook imports this service, so there is no separate backend implementation to keep synchronized.

Errors return non-2xx JSON `{ "error": "plain-language reason" }`. Invalid requests are 422, unknown observations 404, missing images 409, unavailable manifest 503, unreachable model 503, model timeout 504, and rejected/malformed model replies 502.

A bounded integration smoke check is available with `backend/.venv/bin/python backend/smoke.py`; it uses a controlled model transport, reads all four real images, and verifies the browser contract without making model calls.

## Recorded results and connectivity

`recorded_assessments.json` contains the actual Qwen responses captured in the original teammate notebook at commit e71cc2c, cells 21–24, together with normalized flood and assistance judgments and SHA-256 hashes of the original PNGs. It is not a script inventing a new model response. A saved result is eligible only when the original image bytes match. The model’s categorical confidence was not calibrated; the normalized labels are illustrative.

The normal request checks `/v1/models` with a 2.5-second availability deadline. If that fails, or a subsequent live assessment fails, a matching saved result is returned with explicit provenance in `source` and `notice`. `refresh: true` skips fallback and surfaces the actual error. The local integration repro observed upstream HTTP408 on live requests and timeouts on the small authenticated models request from this Mac; ensure the computer can reach the datathon network, even if a teammate’s notebook on another machine works.
