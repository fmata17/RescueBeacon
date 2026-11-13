import { readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const manifestIndex = args.indexOf('--manifest');
const manifestPath = manifestIndex === -1
  ? fileURLToPath(new URL('../images/manifest.json', import.meta.url))
  : args[manifestIndex + 1];
function validateHandoff(manifestPath) {
  const observations = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (!Array.isArray(observations) || observations.some((entry) => !entry || typeof entry !== 'object' || Array.isArray(entry))) {
    throw new Error('Manifest must be an array of observation objects.');
  }
  const imageDirectory = realpathSync(dirname(resolve(manifestPath)));
  const expected = ['no-flood', 'assistance', 'drone-clear', 'operator-review'];
  const errors = [];
  if (observations.length !== 4) errors.push('Manifest must contain exactly four observations.');
  for (const id of expected) {
    if (observations.filter((observation) => observation.id === id).length !== 1) {
      errors.push(`Manifest must contain exactly one observation with id "${id}".`);
    }
  }
  const entries = observations.map(({ id, title, scenario, image, latitude, longitude }) => {
    const initialErrors = errors.length;
    if (!expected.includes(id) || scenario !== id) errors.push(`${id}: scenario must match its original observation id.`);
    if (typeof title !== 'string' || !title.trim()) errors.push(`${id}: title must be a nonempty string.`);
    const pending = [];
    if (image === null) pending.push('image');
    else if (typeof image !== 'string' || !image.trim() || isAbsolute(image)
      || /[\\:%?#]/.test(image) || image.split('/').some((part) => !part || part === '.' || part === '..')) {
      errors.push(`${id}: image must be a relative file path within the image directory (or null while pending).`);
    } else {
      try {
        const imagePath = realpathSync(resolve(imageDirectory, image));
        const localPath = relative(imageDirectory, imagePath);
        if (localPath === '..' || localPath.startsWith(`..${sep}`) || isAbsolute(localPath) || !statSync(imagePath).isFile()) {
          errors.push(`${id}: image must be a file contained within the image directory.`);
        }
      } catch {
        errors.push(`${id}: image file does not exist or cannot be read: ${image}.`);
      }
    }
    if (latitude === null && longitude === null) pending.push('coordinates');
    else if (!Number.isFinite(latitude) || !Number.isFinite(longitude)
      || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      errors.push(`${id}: coordinates must both be null or a numeric latitude [-90, 90] and longitude [-180, 180].`);
    }
    return { id, status: errors.length > initialErrors ? 'invalid' : pending.length ? 'pending' : 'ready', pending };
  });
  return {
    status: errors.length ? 'invalid' : entries.some(({ status }) => status === 'pending') ? 'pending' : 'ready',
    errors,
    observations: entries,
  };
}

let report;
try {
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--manifest') {
      if (!args[index + 1] || args[index + 1].startsWith('--')) throw new Error('--manifest requires a file path.');
      index += 1;
    } else if (args[index] !== '--require-complete') {
      throw new Error(`Unknown argument: ${args[index]}`);
    }
  }
  report = validateHandoff(manifestPath);
} catch (error) {
  report = { status: 'invalid', errors: [`Cannot read image handoff: ${error.message}`], observations: [] };
}
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.status === 'invalid' ? 1 : args.includes('--require-complete') && report.status === 'pending' ? 2 : 0;
