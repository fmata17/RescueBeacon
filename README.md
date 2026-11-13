# RescueBeacon

A Harris County flood observation demo. All assessments in Demo mode are scripted; no real drone, emergency dispatch, or notification service is connected.

## Run the frontend

Use Node 22.12+ in the Node 22 line, Node 24, or a later supported LTS. The current build and test tools follow their supported Node versions.

```sh
cd frontend
npm ci
npm run dev
```

Open the URL printed by Vite. The desktop console uses OpenStreetMap tiles and needs internet for the basemap. Its workflow runs without those tiles. Run `npm test` and `npm run build` from `frontend/` to verify changes.

Choose **Demo mode**, select a scenario, and click **Run analysis** for each presentation path:

1. **No flood** closes after high-confidence flood screening with no mission or response.
2. **Clear assistance need** shows separate flood and assistance findings, automatically records a simulated response notification, and keeps the simulated drone on site until **Mark response team arrived**.
3. **Drone clears the case** sends a simulated inspection after uncertain initial assistance evidence; its scripted finding closes with no response needed.
4. **Operator review** sends a simulated inspection and stops awaiting an operator decision. Choose assistance needed, close with no response needed, or retry the scripted drone assessment once. Recommending response keeps the drone on site until simulated arrival.

**Reset scenario** clears the selected case, its mission, and its history so the presenter can replay it. Changing assessment mode clears every case and history so results from different sources cannot mix. Mode changes and resets are disabled while any initial-image request is pending; switching observations still preserves results in the correct case.

Uncertain or lower-confidence flood findings wait for the operator to confirm flood, mark no flood, or retry flood assessment once through the active assessment source. Confirming flood continues assistance analysis. Only definite high-confidence findings make automatic decisions. Reasons, confidence, original assessments, retry history, and operator actions remain accessible when switching observations. Curated image assets and coordinates are pending and explicitly labeled. Missing coordinates keep mission messages scripted without inventing a base assignment, distance, or geographic route.

For **Local model mode**, start a local OpenAI-compatible vision server, then run the independent backend in another terminal:

```sh
cd backend
npm ci
LOCAL_MODEL_NAME=your-local-vision-model LOCAL_MODEL_BASE_URL=http://127.0.0.1:1234/v1 npm start
```

Leave the frontend running and select **Local model mode**. The browser posts `{ observationId, stage }` to `http://127.0.0.1:8787/api/assessments`; the backend resolves the original image. Flood and assistance responses drive the same workflow, so the model's findings determine the path. Local results are labeled before, during, and after analysis. HTTP failures, unavailable images, malformed output, and network failures remain visible errors with **Retry analysis**. Retry repeats the failed stage; no Demo answer is substituted. Later drone findings, retries, notifications, and arrival events always remain scripted simulations.

Curated image assets and coordinates are still pending: the current manifest contains placeholders, so Local model mode reports `image_unavailable` until real original images are supplied. Follow the [image handoff](images/README.md) to add them; no locations are invented. See [backend configuration and checks](backend/README.md), [the assessment contract](docs/assessment-contract.md), and [architectural decision](docs/adr/0001-frontend-workflow-local-model-boundary.md). The default backend CORS origins support Vite on `localhost:5173` and `127.0.0.1:5173`; configure `FRONTEND_ORIGINS` for another frontend origin.
