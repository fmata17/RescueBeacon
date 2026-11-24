# RescueBeacon

A flood-response demonstration that combines image assessment, an interactive Harris County map, and simulated drone missions. RescueBeacon helps an operator review flooding, distinguish possible danger from a confirmed need for assistance, and decide what happens next.

The app uses a privately hosted Qwen vision-language model. When that server is unavailable, the four supplied images can use genuine, hash-verified model results saved from the original team notebook. Recorded results are visibly labeled; drone missions and response notifications are simulated.

## Features

- Review four geolocated observations through an interactive map and photo strip.
- Assess flooding and assistance separately, with visible reasons, confidence, and result provenance.
- Follow simulated drone inspections from the nearest illustrative base.
- Resolve uncertain findings through operator review, with a history of assessments and decisions.
- Retry failed analysis or request a fresh live result instead of a recorded result.

## Technology

| Layer | Tools |
| --- | --- |
| Frontend | React, TypeScript, Vite, Leaflet, Lucide |
| API | Python, FastAPI, Pydantic, HTTPX, Pillow |
| Model integration | OpenAI-compatible Python client and a privately hosted Qwen service |
| Verification | Vitest, Testing Library, Node's test runner, Python integration smoke check |

## Run locally

Prerequisites: Python 3.13 or 3.14, npm, and a Node.js version matching the engine range in [frontend/package.json](frontend/package.json). Internet access is needed for map tiles; live inference requires access to the datathon model network or VPN.

From the repository root:

```sh
npm run dev
```

The launcher creates the backend virtual environment and installs dependencies on first use. It starts FastAPI on port **8000** and Vite on port **5173**. Open **http://127.0.0.1:5173**. Press Ctrl+C to stop both services.

Run this command from the root: starting Vite inside `frontend/` starts only the frontend. The launcher checks for occupied ports to help avoid duplicate servers. Check API health at **http://127.0.0.1:5173/api/health**; this checks the API, independently of model connectivity.

### Model configuration

The existing datathon defaults are preserved:

| Environment variable | Purpose / default |
| --- | --- |
| `LLM_BASE_URL` | Model service at `http://10.246.100.230/v1` |
| `LLM_MODEL` | `qwen3-vl-8b-instruct` |
| `LLM_API_KEY` | Supplied datathon credential |
| `LLM_TIMEOUT_SECONDS` | Request timeout, `90` seconds |
| `FRONTEND_ORIGINS` | Localhost and 127.0.0.1 on port 5173 |

Export overrides in your shell before starting the app. The root launcher does not automatically load `.env` files. See [backend setup](backend/README.md) for separate API startup and explicit environment-file loading.

## Analysis workflow

Select a hotspot or photo, then click **Run analysis**. The assessment appears beneath the image, including its reason and confidence. Red hotspots indicate response recommendations, yellow hotspots indicate drone investigation or review, and gray hotspots need no response.

High-confidence flooding proceeds to a separate assistance assessment. A flooded vehicle alone remains possible danger; it does not establish that someone needs rescue. Uncertain findings require inspection or an operator decision. Drone missions animate from the nearest illustrative base, and response missions remain on site until the presenter marks the response team's arrival.

**Reset observation** clears the selected observation for another demonstration. **Request fresh live analysis** bypasses recorded results and shows any live inference error. A live model's answer is preserved even when it differs from the rehearsal path.

### Showcase observations

| Observation | Original image | Rehearsal path |
| --- | --- | --- |
| No flood | `not_flooded.png` | Close without a drone mission |
| Assistance needed | `flooded_with_people.png` | Recommend response and keep the drone on site |
| Drone inspection | `flooded_with_cars.png` | Inspect possible danger and close without response |
| Operator review | `flooded_with_cars2.png` | Inspect possible danger and request an operator decision |

### Data and simulation

The original PNGs contain no GPS metadata. Their map points are illustrative Harris County locations, identified in the manifest with `locationSource: "illustrative"` and labeled in the UI. The model receives a compact JPEG derived from the original image; the displayed PNG remains unchanged.

When the model host is unavailable, recorded results are eligible only if the original image's SHA-256 hash matches. The UI labels them **Recorded Qwen result**. Drone movement, later drone findings, response notifications, and arrival events are simulations; the app does not contact emergency services. Confidence labels are categorical model judgments, not calibrated probabilities.

## Repository structure

```text
backend/
  main.py                       FastAPI service and model integration
  smoke.py                      Controlled HTTP integration check
  recorded_assessments.json     Original model results and image hashes
  notebooks/
    backend_development.ipynb   Notebook importing the canonical service
frontend/
  src/
    App.tsx                     Observation review workflow
    ObservationMap.tsx          Map, hotspots, and mission overlays
    DroneMissionDetails.tsx     Mission status and progress
    assessment.ts               Assessment types and service boundary
    mission.ts                  Simulated mission state and progression
images/                         Original PNGs and observation manifest
scripts/                        Development launcher and image validation
docs/                           HTTP contract and architecture decisions
```

The [assessment contract](docs/assessment-contract.md) documents the frontend/API boundary. [Architecture decisions](docs/adr/) explain the service design and recorded-result fallback.

## Validation

Run from the repository root after the development dependencies are installed:

```sh
npm --prefix frontend test
npm run build
node --test scripts/validate-images.test.mjs
node scripts/validate-images.mjs --require-complete
backend/.venv/bin/python backend/smoke.py
```

The backend smoke check uses the real image files and a controlled model transport, so it does not require the private model host.

## Code conventions

- React components, component filenames, and TypeScript types use `PascalCase`. Frontend tests use descriptive `PascalCase.test.tsx` names.
- TypeScript functions and variables use `camelCase`; functions use descriptive action names, such as `getMissionLabel` and `startDroneMission`.
- Python modules, notebooks, functions, and variables use `snake_case`; classes use `PascalCase` and constants use `UPPER_SNAKE_CASE`.
- JavaScript utility filenames, documentation filenames, and CSS classes use `kebab-case`. Standard entry points such as `main.py`, `main.tsx`, and `App.tsx` retain their conventional names.
- Source formatting uses two spaces for frontend and JavaScript code, four spaces for Python, and a 100-column target. TypeScript and JavaScript use single quotes and semicolons.
- API field names, environment variables, observation IDs, and original image filenames stay consistent with their existing contracts. The original asset names also preserve recorded-result provenance.
