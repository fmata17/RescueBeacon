# Curated observation handoff

The four entries in `manifest.json` are placeholders. No image assets or coordinates have been supplied. **GitHub issue #9 remains unresolved until the teammate supplies the actual four curated images and their metadata.** Do not infer a location from an image or substitute imagery from another place.

For each entry, keep its `id` and `scenario`; supply the image filename relative to this directory, plus the original metadata's latitude and longitude in decimal degrees. An example image path is `observations/no-flood.jpg`. Use `null` for unavailable fields. Both coordinates must be supplied to place an observation marker. Null coordinates do not prevent a scripted scenario from running.

| Observation `id` | Required `scenario` | Intended path through the demo |
| --- | --- | --- |
| `no-flood` | `no-flood` | No flooding; close the case |
| `assistance` | `assistance` | Clear assistance need; simulated response |
| `drone-clear` | `drone-clear` | Simulated drone finds no assistance need |
| `operator-review` | `operator-review` | Uncertainty remains; operator decides |

Preserve all four rows exactly once. Titles may be changed to describe the supplied observations. `image` must be `null` or a relative path to a real file within this directory; nested paths are supported. Use `/` separators, without traversal segments, URL escapes, query strings, or fragments. Absolute paths, remote URLs, and symlinks that leave this directory are rejected. Latitude and longitude must either both be `null` or both be finite numbers in the ranges `[-90, 90]` and `[-180, 180]`. Do not use numeric strings or populate a missing value with zero.

After receiving the handoff:

1. Copy the four original image files into this directory (for example, under `observations/`).
2. Fill each existing manifest entry with that observation's actual image path and supplied coordinate pair. Keep any unavailable fields `null`.
3. From the repository root, run `node scripts/validate-images.mjs --require-complete`.
4. Restart the frontend and backend, select each scenario, and confirm its source image and supplied location appear. Confirm a failed image load is visibly reported. This visual check is required: the validator checks file presence and metadata, and does not verify image decoding, provenance, Harris County location, or scenario correctness from pixels.

The command prints a JSON report with one status per observation and a top-level status:

| Status | Meaning | Default exit code | With `--require-complete` |
| --- | --- | --- | --- |
| `ready` | Four valid mappings, existing image files, and coordinate pairs | `0` | `0` |
| `pending` | Valid manifest with at least one explicit `null` image or coordinate pair | `0` | `2` |
| `invalid` | Malformed manifest, incorrect mapping, invalid coordinates, or unsafe/missing file | `1` | `1` |

Use `node scripts/validate-images.mjs` to check the current scaffold without treating the external dependency as malformed. Use `--manifest /path/to/manifest.json` to validate a proposed handoff before copying it; image paths resolve relative to that manifest's directory. The validator does not modify files. Run its behavior tests with `node --test scripts/validate-images.test.mjs`.

The frontend imports this manifest and Vite copies this directory into its public build. Do not place secrets here. The backend resolves the same image paths on disk; browser URLs are not backend image inputs. Restart the development server after updating the manifest.
