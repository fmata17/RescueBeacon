# Showcase images

The four supplied PNGs are mapped by `manifest.json`:

| Observation ID | Image | Rehearsal path |
| --- | --- | --- |
| no-flood | not_flooded.png | No flood |
| assistance | flooded_with_people.png | Response notification |
| drone-clear | flooded_with_cars.png | Drone clears possible danger |
| operator-review | flooded_with_cars2.png | Drone requests review |

The original PNGs have no GPS coordinates. The user approved illustrative Harris County placements for the map demo. Each entry has `locationSource: "illustrative"`; the UI labels these as **simulated locations**, not image metadata. If original coordinates become available, replace latitude/longitude and set `locationSource: "metadata"`.

Image paths are relative to this folder. Frontend Vite serves them at the public root, and the Python backend resolves them relative to the manifest. Neither depends on the shell's working directory. The backend sends a compact version of the original image to Qwen. If the live host is unavailable, exact matching images may use the original recorded Qwen analysis, explicitly labeled. Later drone findings remain simulated. The priority field comes from those prior recorded assessments and sets the initial map colors; new results update the colors.

Verify all four assets and coordinate pairs with:

```sh
node scripts/validate-images.mjs --require-complete
```
