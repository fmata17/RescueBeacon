# Initial-image assessment contract

The frontend owns the workflow. The independent backend lives in `backend/` and owns local model inference. Both use the root `images/manifest.json` (see `images/README.md`). No real drone, response team, or notification service is connected.

## Request

`POST /api/assessments`, `Content-Type: application/json`:

```json
{ "observationId": "no-flood", "stage": "flood" }
```

`stage` is `flood` or `assistance`. The backend resolves the observation ID to the original file in the image manifest. Do not send a browser URL as the image input.

## Successful response

```json
{
  "stage": "flood",
  "finding": "no",
  "confidence": "high",
  "reason": "No floodwater is visible in the observation.",
  "source": "local-model"
}
```

`finding` is `yes`, `no`, or `uncertain`; `confidence` is `high`, `medium`, or `low`. `reason` is a nonempty plain-language explanation. The stage must match the request. A local endpoint response must have `source: "local-model"`. Frontend scripted results use `source: "demo"`; later drone evidence uses `source: "simulated-drone"` and never calls this endpoint. Confidence labels are illustrative; percentages are unsupported.

Only a high-confidence definite result can trigger an automatic case decision. All other flood findings enter operator review. The frontend currently implements no-flood closure and clear assistance: a high-confidence flood finding starts a separate initial-image assistance assessment. A high-confidence assistance finding automatically records a visibly simulated response notification and starts a simulated drone mission. The drone remains on site until the presenter marks response team arrival; its case marker retains red styling and a text status afterward. The ambiguous-drone and review controls are delivered in later tickets.

## Errors

Use a non-2xx status and JSON `{ "error": "A useful explanation" }`. Missing assets, invalid requests, malformed model output, and inference failures remain visible errors. The frontend must reject malformed responses and never replace a failed local request with a scripted answer. Backend environment and model settings belong in its own README.

## Current frontend seam

`AssessmentBoundary` in `frontend/src/assessment.ts` accepts `{ observationId, stage }` and returns the structured assessment asynchronously. The UI receives this boundary as `App`'s optional `assess` prop; its default is Demo mode. Tests exercise visible behavior through this boundary, with real components and map. The image handoff may keep `image`, `latitude`, and `longitude` null. No marker or geographic drone path should be drawn without supplied coordinates.

`frontend/src/mission.ts` owns the reusable simulated mission. Approximate illustrative bases near Stations 8, 13, and 37 use the [City of Houston station address list](https://www.houstontx.gov/fire/about/firestations.html) as anchors. These are demo locations, not operational resources. Supplied observation coordinates select the nearest base by great-circle straight-line distance; animation pacing is fixed for presentation and does not estimate travel time. Without observation coordinates, base assignment, distance, route, and drone map marker remain absent while clearly scripted mission messages continue. No observation coordinates are invented.
