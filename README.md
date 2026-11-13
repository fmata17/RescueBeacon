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

The no-flood scenario is ready: select the observation, run analysis, and inspect its closed status, confidence, reason, and retained action history. The other three scenarios are selectable placeholders for subsequent workflow tickets. Curated image assets and coordinates are pending and are explicitly labeled in the console.

The frontend and backend have independent package areas. See [the assessment contract](docs/assessment-contract.md), [image handoff](images/README.md), and [architectural decision](docs/adr/0001-frontend-workflow-local-model-boundary.md). Local model mode and additional case workflows are delivered in subsequent tickets.
