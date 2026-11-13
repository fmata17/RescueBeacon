# Showcase images

The four supplied PNGs are mapped by `manifest.json`:

| Observation ID | Image | Rehearsal path |
| --- | --- | --- |
| no-flood | not_flooded.png | No flood |
| assistance | flooded_with_people.png | Response notification |
| drone-clear | flooded_with_cars.png | Drone clears possible danger |
| operator-review | flooded_with_cars2.png | Drone requests review |

The original PNGs have no GPS coordinates. The user approved illustrative Harris County placements for the map demo. Each entry has `locationSource: "illustrative"`; the UI labels these as **simulated locations**, not image metadata. If original coordinates become available, replace latitude/longitude and set `locationSource: "metadata"`.

Image paths are relative to this folder. Frontend Vite serves them at the public root, and the Python backend resolves them relative to the manifest. Neither depends on the shell's working directory. Local mode sends the actual image bytes to the supplied Qwen server; Demo mode uses the explicit rehearsal script. Later drone findings remain simulated in both modes.

Verify all four assets and coordinate pairs with:

```sh
node scripts/validate-images.mjs --require-complete
```
