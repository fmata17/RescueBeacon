# Curated observation handoff

The four entries in `manifest.json` are placeholders. No image assets or coordinates have been supplied. Do not infer a location from an image or substitute imagery from another place.

For each entry, keep its `id` and `scenario`; supply the image filename relative to this directory, plus the original metadata's latitude and longitude in decimal degrees. An example image path is `observations/no-flood.jpg`. Use `null` for unavailable fields. Both coordinates must be supplied to place an observation marker. Null coordinates do not prevent a scripted scenario from running.

The frontend imports this manifest and Vite copies this directory into its public build. Do not place secrets here. The backend resolves the same image paths on disk; browser URLs are not backend image inputs. Restart the development server after updating the manifest.
