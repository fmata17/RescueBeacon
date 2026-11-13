import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import App from './App';

afterEach(() => vi.unstubAllGlobals());

test('local mode submits the selected original image for flood screening and keeps its source visible while pending', async () => {
  const user = userEvent.setup();
  let finish!: (response: Response) => void;
  const fetch = vi.fn(() => new Promise<Response>((resolve) => { finish = resolve; }));
  vi.stubGlobal('fetch', fetch);
  render(<App/>);
  await user.selectOptions(screen.getByRole('combobox', { name: 'Assessment mode' }), 'local-model');
  const details = screen.getByRole('region', { name: 'Observation details' });
  expect(within(details).getByText('Local model')).toBeVisible();
  expect(screen.getByRole('combobox', { name: 'Assessment mode' })).toHaveValue('local-model');
  expect(within(details).queryByText('Demo · scripted')).not.toBeInTheDocument();
  expect(screen.queryByText('Scripted assessments. No live drone or emergency dispatch.')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Run analysis' }));
  expect(within(details).getByText('Screening this observation for flooding…')).toBeVisible();
  expect(screen.getByRole('combobox', { name: 'Assessment mode' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Reset scenario' })).toBeDisabled();
  expect(fetch).toHaveBeenCalledWith('http://127.0.0.1:8787/api/assessments', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ observationId: 'no-flood', stage: 'flood' }),
  });
  await act(async () => finish(Response.json({ stage: 'flood', finding: 'no', confidence: 'high', reason: 'The original image shows a dry roadway.', source: 'local-model' })));
  expect(await within(details).findByText('Closed · No flood')).toBeVisible();
  expect(within(details).getByText('The original image shows a dry roadway.')).toBeVisible();
  expect(within(details).queryByText(/scripted observation/)).not.toBeInTheDocument();
});

test('an assistance endpoint failure keeps the flood evidence and retries only the failed stage', async () => {
  const user = userEvent.setup();
  const fetch = vi.fn()
    .mockResolvedValueOnce(Response.json({ stage: 'flood', finding: 'yes', confidence: 'high', reason: 'Floodwater covers the roadway.', source: 'local-model' }))
    .mockResolvedValueOnce(Response.json({ error: 'inference_timeout' }, { status: 504 }))
    .mockResolvedValueOnce(Response.json({ stage: 'assistance', finding: 'yes', confidence: 'high', reason: 'A person is signaling for help.', source: 'local-model' }));
  vi.stubGlobal('fetch', fetch);
  render(<App/>);
  await user.selectOptions(screen.getByRole('combobox', { name: 'Assessment mode' }), 'local-model');
  await user.selectOptions(screen.getByRole('combobox', { name: 'Scenario' }), 'assistance');
  await user.click(screen.getByRole('button', { name: 'Run analysis' }));
  const details = screen.getByRole('region', { name: 'Observation details' });
  expect(await within(details).findByRole('alert')).toHaveTextContent('inference_timeout');
  expect(within(details).getByText('Floodwater covers the roadway.')).toBeVisible();
  expect(within(details).getByText('Local model')).toBeVisible();
  expect(within(details).queryByText('Simulated response notification sent')).not.toBeInTheDocument();
  await user.click(within(details).getByRole('button', { name: 'Retry analysis' }));
  expect(await within(details).findByText('Response recommended')).toBeVisible();
  expect(within(details).getByText('A person is signaling for help.')).toBeVisible();
  expect(fetch).toHaveBeenLastCalledWith('http://127.0.0.1:8787/api/assessments', expect.objectContaining({ body: JSON.stringify({ observationId: 'assistance', stage: 'assistance' }) }));
});
