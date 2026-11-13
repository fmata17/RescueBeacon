# RescueBeacon

Harris County flood-response showcase using four supplied images, a locally hosted Qwen vision-language model, and simulated drone missions.

## Run everything

From the repository root:

```sh
npm run dev
```

This creates the backend Python environment and installs dependencies on first use, then starts both servers. Open **http://127.0.0.1:5173**. Ctrl+C stops both. Requires Python 3.13/3.14 (the launcher prefers 3.14), Node 22.12+ or 24 LTS, and internet for the map tiles.

The app opens in **Local model mode**. The backend uses the supplied datathon setup: `http://10.246.100.230/v1`, model `qwen3-vl-8b-instruct`, and the supplied datathon key. You must be on the network/VPN that can reach that GB10 server. Nothing downloads or loads model weights on this laptop. Override `LLM_BASE_URL`, `LLM_MODEL`, or `LLM_API_KEY` in your shell if your team's setup changes.

Select a case and click **Run analysis**. One image upload produces both flood and assistance judgments; the UI displays them as two steps. The model's results determine the live path. **Demo mode** is an explicit scripted rehearsal option and never substitutes for a failed model call.

## Four showcase cases

| Case | Source image | Scripted rehearsal path |
| --- | --- | --- |
| No flood | `not_flooded.png` | Close without a drone |
| Clear assistance need | `flooded_with_people.png` | Notify response; drone watches until presenter marks arrival |
| Drone clears the case | `flooded_with_cars.png` | Possible danger; simulated inspection closes with no response |
| Operator review | `flooded_with_cars2.png` | Possible danger; simulated inspection requests an operator decision |

All four images live in `images/`, mapped in its manifest. Their PNG metadata has no GPS; map points are **illustrative Harris County locations**, labeled simulated. Drone movement, later findings, response notifications, and arrival events are simulations. A live model may choose a different path than the rehearsal script; its answer is not overwritten to force the scenario.

**Reset scenario** replays a case. Switching modes clears cases and history. Operator controls handle uncertain flood or drone results. A flooded car alone is possible danger, not proof that someone needs rescue.

## Structure

- `frontend/`: React, TypeScript, Vite, map and case workflow.
- `backend/main.py`: canonical FastAPI image assessment service.
- `backend/notebooks/`: development notebook importing that same service.
- `images/`: the four original PNGs and scenario/location manifest.

For separate server commands and model configuration, see [backend setup](backend/README.md). The [assessment contract](docs/assessment-contract.md) documents the HTTP handoff. Verify the UI build with `npm run build`; verify images with `node scripts/validate-images.mjs --require-complete`.
