# RescueBeacon

Harris County flood-response showcase using four supplied images, a locally hosted Qwen vision-language model, and simulated drone missions.

## Run everything

From the repository root:

```sh
npm run dev
```

This creates the backend Python environment and installs dependencies on first use, then starts both servers. Open **http://127.0.0.1:5173**. Ctrl+C stops both. Requires Python 3.13/3.14 (the launcher prefers 3.14), Node 22.12+ or 24 LTS, and internet for the map tiles.

The backend uses the supplied datathon setup: `http://10.246.100.230/v1`, model `qwen3-vl-8b-instruct`, and the supplied datathon key. You must be on a network/VPN that can reach that GB10 server. Override `LLM_BASE_URL`, `LLM_MODEL`, or `LLM_API_KEY` in your shell if the setup changes.

Choose a photo from the map or bottom photo strip, then click **Run analysis**. The answer appears directly beneath the photo. Red hotspots indicate urgent support; yellow hotspots indicate drone investigation; gray hotspots need no response. Drone missions animate from the nearest hub, with the map focused on the flight. Assessment details and activity are collapsed beneath the main result.

There is no assessment-mode switch or simulation banner. The app first checks the live model server. If it is unavailable, these four exact images can use the genuine Qwen responses saved in the original team notebook, visibly labeled **Recorded Qwen result**. These are hash-checked against the source image. **Request fresh live analysis** bypasses that fallback and reports any actual live failure. The model input is a compact JPEG; the displayed original PNG is unchanged.

The root `npm run dev` command starts **both** FastAPI on port 8000 and Vite on port 5173. Running `npm run dev` only inside `frontend/` starts no backend. Avoid starting two copies: the root launcher checks for occupied ports and tells you to stop the older instance. Backend health is at `/api/health` through the frontend proxy.

## Four showcase cases

| Case | Source image | Showcase path |
| --- | --- | --- |
| No flood | `not_flooded.png` | Close without a drone |
| Clear assistance need | `flooded_with_people.png` | Notify response; drone watches until presenter marks arrival |
| Drone clears the case | `flooded_with_cars.png` | Possible danger; simulated inspection closes with no response |
| Operator review | `flooded_with_cars2.png` | Possible danger; simulated inspection requests an operator decision |

All four images live in `images/`, mapped in its manifest. Their PNG metadata has no GPS; map points are **illustrative Harris County locations**, labeled simulated. Drone movement, later findings, response notifications, and arrival events are simulations. A live model may choose a different path than the rehearsal script; its answer is not overwritten to force the scenario.

**Reset observation** replays the selected photo. Operator controls handle uncertain flood or drone results. A flooded car alone is possible danger, not proof that someone needs rescue.

## Structure

- `frontend/`: React, TypeScript, Vite, map and case workflow.
- `backend/main.py`: canonical FastAPI image assessment service.
- `backend/notebooks/`: development notebook importing that same service.
- `images/`: the four original PNGs and scenario/location manifest.

For separate server commands and model configuration, see [backend setup](backend/README.md). The [assessment contract](docs/assessment-contract.md) documents the HTTP handoff. Verify the UI build with `npm run build`; verify images with `node scripts/validate-images.mjs --require-complete`.
