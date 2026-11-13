import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const command = fileURLToPath(new URL('./validate-images.mjs', import.meta.url));
const placeholders = () => ['no-flood', 'assistance', 'drone-clear', 'operator-review'].map((scenario) => ({
  id: scenario, title: scenario, scenario, image: null, latitude: null, longitude: null,
}));

function handoff(t, observations = placeholders()) {
  const directory = mkdtempSync(join(tmpdir(), 'rescuebeacon-images-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const manifest = join(directory, 'manifest.json');
  writeFileSync(manifest, JSON.stringify(observations));
  return {
    directory,
    run: (...args) => {
      const result = spawnSync(process.execPath, [command, '--manifest', manifest, ...args], { encoding: 'utf8' });
      return { code: result.status, report: JSON.parse(result.stdout) };
    },
  };
}

test('a placeholder handoff is valid and explicitly pending, but cannot pass release readiness', (t) => {
  const fixture = handoff(t);
  const { code, report } = fixture.run();
  assert.equal(code, 0);
  assert.equal(report.status, 'pending');
  assert.deepEqual(report.errors, []);
  assert.equal(report.observations.length, 4);
  assert.deepEqual(report.observations[0], { id: 'no-flood', status: 'pending', pending: ['image', 'coordinates'] });
  assert.equal(fixture.run('--require-complete').code, 2);
});

test('a complete handoff preserves all four supplied images and coordinates as ready', (t) => {
  const observations = placeholders().map((observation) => ({
    ...observation, image: `${observation.id}.jpg`, latitude: 29.75, longitude: -95.36,
  }));
  const fixture = handoff(t, observations);
  for (const observation of observations) writeFileSync(join(fixture.directory, observation.image), 'test image bytes');
  const { code, report } = fixture.run('--require-complete');
  assert.equal(code, 0);
  assert.equal(report.status, 'ready');
  assert.deepEqual(report.observations, [
    { id: 'no-flood', status: 'ready', pending: [] },
    { id: 'assistance', status: 'ready', pending: [] },
    { id: 'drone-clear', status: 'ready', pending: [] },
    { id: 'operator-review', status: 'ready', pending: [] },
  ]);
});

test('missing, duplicate, or reassigned scenarios are invalid rather than pending', async (t) => {
  for (const [name, change] of [
    ['missing observation', (items) => items.pop()],
    ['reassigned scenario', (items) => { items[0].scenario = 'assistance'; }],
    ['duplicate identifier', (items) => { items[1].id = 'no-flood'; }],
    ['extra observation', (items) => items.push({ ...items[0] })],
    ['missing title', (items) => { items[0].title = ''; }],
  ]) {
    await t.test(name, (t) => {
      const observations = placeholders();
      change(observations);
      const { code, report } = handoff(t, observations).run();
      assert.equal(code, 1);
      assert.equal(report.status, 'invalid');
      assert.ok(report.errors.length > 0);
    });
  }
});

test('coordinates must be a supplied valid pair, never a partial or coerced location', async (t) => {
  for (const [latitude, longitude] of [[29.75, null], [null, -95.36], ['29.75', -95.36], [91, -95.36], [29.75, -181], [undefined, undefined]]) {
    await t.test(`${latitude}, ${longitude}`, (t) => {
      const observations = placeholders();
      Object.assign(observations[0], { latitude, longitude });
      const { code, report } = handoff(t, observations).run();
      assert.equal(code, 1);
      assert.equal(report.status, 'invalid');
      assert.match(report.errors.join('\n'), /no-flood:.*coordinates/);
    });
  }
});

test('a supplied image must exist as a file contained within the image handoff directory', async (t) => {
  for (const image of ['absent.jpg', '../outside.jpg', '/tmp/outside.jpg', 'https://example.com/image.jpg', 'nested/../image.jpg', 'linked.jpg', 'directory', '', 12, undefined]) {
    await t.test(String(image), (t) => {
      const observations = placeholders();
      observations[0].image = image;
      const fixture = handoff(t, observations);
      mkdirSync(join(fixture.directory, 'directory'));
      const outside = join(fixture.directory, '../', `outside-${fixture.directory.split('/').pop()}.jpg`);
      writeFileSync(outside, 'outside handoff');
      t.after(() => rmSync(outside));
      symlinkSync(outside, join(fixture.directory, 'linked.jpg'));
      const { code, report } = fixture.run();
      assert.equal(code, 1);
      assert.equal(report.status, 'invalid');
      assert.match(report.errors.join('\n'), /no-flood:.*image/);
    });
  }
});

test('unreadable or malformed manifests produce a structured invalid report', async (t) => {
  for (const contents of ['not json', '{}', '[null]', '[12]']) {
    await t.test(contents, (t) => {
      const fixture = handoff(t);
      writeFileSync(join(fixture.directory, 'manifest.json'), contents);
      const { code, report } = fixture.run();
      assert.equal(code, 1);
      assert.equal(report.status, 'invalid');
      assert.ok(report.errors.length > 0);
    });
  }
  await t.test('missing manifest', (t) => {
    const fixture = handoff(t);
    rmSync(join(fixture.directory, 'manifest.json'));
    const { code, report } = fixture.run();
    assert.equal(code, 1);
    assert.equal(report.status, 'invalid');
  });
});

test('nested image paths and a supplied zero coordinate remain valid without inventing missing metadata', (t) => {
  const observations = placeholders();
  observations[0].image = 'observations/source.jpg';
  observations[0].latitude = 0;
  observations[0].longitude = 0;
  observations[1].latitude = 29.75;
  observations[1].longitude = -95.36;
  const fixture = handoff(t, observations);
  mkdirSync(join(fixture.directory, 'observations'));
  writeFileSync(join(fixture.directory, 'observations/source.jpg'), 'test bytes');
  const { code, report } = fixture.run();
  assert.equal(code, 0);
  assert.equal(report.status, 'pending');
  assert.deepEqual(report.observations[0], { id: 'no-flood', status: 'ready', pending: [] });
  assert.deepEqual(report.observations[1], { id: 'assistance', status: 'pending', pending: ['image'] });
});

test('a mistyped readiness flag fails rather than silently treating a pending handoff as complete', (t) => {
  const { code, report } = handoff(t).run('--require-complet');
  assert.equal(code, 1);
  assert.equal(report.status, 'invalid');
  assert.match(report.errors.join('\n'), /Unknown argument/);
});
