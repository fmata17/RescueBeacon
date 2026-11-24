import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import App from './App';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

test('the model answer is prominent, urgent hotspot is red, and the drone moves from its hub', async () => {
  const clock = vi.spyOn(Date, 'now').mockReturnValue(1000);
  const user = userEvent.setup();
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          stage: 'flood',
          finding: 'yes',
          confidence: 'high',
          reason: 'Floodwater surrounds the buildings.',
          source: 'local-model',
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          stage: 'assistance',
          finding: 'yes',
          confidence: 'high',
          reason: 'Three people are stranded on the roof and signaling for help.',
          source: 'local-model',
        }),
      ),
  );
  render(<App initialMode="local-model" />);
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  expect(screen.queryByText('Simulation workspace')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'View assistance' }));
  await user.click(screen.getByRole('button', { name: 'Run analysis' }));
  const details = screen.getByRole('region', { name: 'Observation details' });
  expect(await within(details).findByText('Response recommended')).toBeVisible();
  expect(
    within(details).getByText('Three people are stranded on the roof and signaling for help.'),
  ).toBeVisible();
  expect(document.querySelector('.hotspot.urgent')).toBeInTheDocument();
  const drone = document.querySelector('.flying-drone')!;
  const position = drone.getAttribute('style');
  clock.mockReturnValue(5000);
  await waitFor(() => expect(drone.getAttribute('style')).not.toBe(position));
  const flight = within(details).getByRole('progressbar', { name: 'Drone flight progress' });
  expect(Number(flight.getAttribute('aria-valuenow'))).toBeGreaterThan(20);
  expect(Number(flight.getAttribute('aria-valuenow'))).toBeLessThan(90);
});

test('a model failure is displayed immediately beneath the image instead of hidden in history', async () => {
  const user = userEvent.setup();
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        Response.json(
          { error: 'Model server returned HTTP 408. Retry live analysis.' },
          { status: 502 },
        ),
      ),
  );
  render(<App initialMode="local-model" />);
  await user.click(screen.getByRole('button', { name: 'Run analysis' }));
  const alert = await screen.findByRole('alert');
  expect(alert).toBeVisible();
  expect(alert).toHaveTextContent('Model server returned HTTP 408');
  expect(alert.closest('.assessment-result')).not.toBeNull();
  expect(screen.getByRole('button', { name: 'Retry analysis' })).toBeEnabled();
});

test('an empty proxy failure explains how to reconnect the backend and allows analysis to be retried', async () => {
  const user = userEvent.setup();
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 502 }))
      .mockResolvedValueOnce(
        Response.json({
          stage: 'flood',
          finding: 'no',
          confidence: 'high',
          reason: 'The road is dry.',
          source: 'local-model',
        }),
      ),
  );
  render(<App initialMode="local-model" />);
  await user.click(screen.getByRole('button', { name: 'Run analysis' }));
  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent(
    'The assessment API returned an empty or invalid response (502). Start both services with npm run dev from the repository root, then retry.',
  );
  await user.click(screen.getByRole('button', { name: 'Retry analysis' }));
  expect(await screen.findByText('Closed · No flood')).toBeVisible();
  expect(screen.getByText('The road is dry.')).toBeVisible();
});
