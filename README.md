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

All four scenarios are ready. Run analysis to see separate flood and assistance assessments. Clear assistance automatically records a simulated response notification and drone mission. An ambiguous flooded-car observation triggers simulated inspection: the third scenario closes with no assistance needed; the fourth stops at operator review. At review, choose assistance needed, close with no response needed, or retry the scripted drone assessment once. Recommending response keeps the simulated drone on site until the presenter marks response team arrival.

Uncertain or lower-confidence flood findings wait for the operator to confirm flood, mark no flood, or retry flood assessment once through the active assessment source. Confirming flood continues assistance analysis. Only definite high-confidence findings make automatic decisions. Reasons, confidence, original assessments, retry history, and operator actions remain accessible when switching observations. Curated image assets and coordinates are pending and explicitly labeled. Missing coordinates keep mission messages scripted without inventing a base assignment, distance, or geographic route.

The frontend and backend have independent package areas. See [the assessment contract](docs/assessment-contract.md), [image handoff](images/README.md), and [architectural decision](docs/adr/0001-frontend-workflow-local-model-boundary.md). Local model mode is delivered in its integration ticket.
