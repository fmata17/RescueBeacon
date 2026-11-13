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

Only a high-confidence definite result can trigger an automatic case decision. A high-confidence no-flood finding closes the case; all other flood findings enter operator review unless high-confidence flooding starts a separate initial-image assistance assessment. Flood review offers flood confirmed (continues assistance), no flood (closes), and one retry through the active assessment boundary. It never substitutes a Demo answer for a Local model finding.

A high-confidence assistance finding automatically records a visibly simulated response notification and starts a simulated drone mission. An uncertain or lower-confidence assistance finding starts simulated drone inspection. The third scenario supplies a high-confidence no-assistance drone finding and closes with no response needed. The fourth supplies an uncertain drone finding and stops at operator review. Operator controls recommend assistance, close with no response needed, or retry the scripted drone assessment once. That retry stays visibly simulated in every mode because there is no drone image.

An operator assistance decision records a simulated response notification and keeps the drone on site until the presenter marks response team arrival. Pending review is labeled “awaiting operator decision”; closure ends the mission. Review never implies that response has already been notified. The case marker retains its text status, red styling for response, and complete activity history across observation switches. Assessment reasons and confidence remain visible; retries preserve previous evidence in history and cannot reset their one-retry limit by switching observations.

## Errors

Use a non-2xx status and JSON `{ "error": "A useful explanation" }`. Missing assets, invalid requests, malformed model output, and inference failures remain visible errors. The frontend must reject malformed responses and never replace a failed local request with a scripted answer. Backend environment and model settings belong in its own README.

## Current frontend seam

`AssessmentBoundary` in `frontend/src/assessment.ts` accepts `{ observationId, stage }` and returns the structured assessment asynchronously. The UI defaults to Demo mode and selects `localAssessment` in Local model mode, posting directly to `http://127.0.0.1:8787/api/assessments`. It validates stage, finding, confidence, a nonempty reason of at most 500 characters, and local source before accepting a response. `App` also accepts an optional `assess` boundary for workflow tests; HTTP integration tests render real components and map and control only external fetch. Changing mode clears all cases and history; Reset scenario clears the selected case. Both controls are disabled while any initial-image assessment is pending. Endpoint Retry repeats the failed stage. The image handoff may keep `image`, `latitude`, and `longitude` null. No marker or geographic drone path should be drawn without supplied coordinates.

`frontend/src/mission.ts` owns the reusable simulated mission. Approximate illustrative bases near Stations 8, 13, and 37 use the [City of Houston station address list](https://www.houstontx.gov/fire/about/firestations.html) as anchors. These are demo locations, not operational resources. Supplied observation coordinates select the nearest base by great-circle straight-line distance; animation pacing is fixed for presentation and does not estimate travel time. Without observation coordinates, base assignment, distance, route, and drone map marker remain absent while clearly scripted mission messages continue. No observation coordinates are invented.
