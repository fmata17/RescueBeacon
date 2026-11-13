import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';
import App from './App';
import type { AssessmentBoundary } from './assessment';

test('operator runs a no-flood observation and can revisit its closed assessment and history', async () => {
  const user = userEvent.setup();
  const assess: AssessmentBoundary = async () => ({
    stage: 'flood', finding: 'no', confidence: 'high',
    reason: 'The roadway is dry and no standing floodwater is visible.', source: 'demo',
  });
  render(<App assess={assess} />);
  await user.click(screen.getByRole('button', { name: 'Run analysis' }));
  const details = screen.getByRole('region', { name: 'Observation details' });
  expect(await within(details).findByText('Closed · No flood')).toBeVisible();
  expect(within(details).getByText('High confidence')).toBeVisible();
  expect(within(details).getByText('The roadway is dry and no standing floodwater is visible.')).toBeVisible();
  expect(within(details).getByText('Not required — no flooding detected')).toBeVisible();
  expect(within(details).getByText('Case closed. No drone mission or response notification required.')).toBeVisible();
  await user.selectOptions(screen.getByRole('combobox', { name: 'Scenario' }), 'assistance');
  await user.click(screen.getByRole('button', { name: /No flood.*Closed/ }));
  expect(within(details).getByText('Closed · No flood')).toBeVisible();
});

test('supplied coordinates produce a text-labeled case marker and missing metadata leaves no invented marker', async () => {
  const user = userEvent.setup();
  const assess: AssessmentBoundary = async () => ({ stage: 'flood', finding: 'no', confidence: 'high', source: 'demo', reason: 'No standing floodwater is visible.' });
  const observation = { id: 'fixture-no-flood', title: 'No flood', scenario: 'no-flood' as const, image: null, latitude: 29.75, longitude: -95.36 };
  const { rerender } = render(<App assess={assess} observations={[observation]} />);
  expect(screen.getByRole('button', { name: 'No flood · Ready to analyze · 29.75, -95.36' })).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Run analysis' }));
  expect(await screen.findByRole('button', { name: 'No flood · Closed · No flood · 29.75, -95.36' })).toBeVisible();
  rerender(<App assess={assess} observations={[{ ...observation, latitude: null, longitude: null }]} />);
  expect(screen.queryByRole('button', { name: /29.75, -95.36/ })).not.toBeInTheDocument();
  expect(screen.getByText('Coordinates pending')).toBeVisible();
  expect(screen.getByText('PLACEHOLDER · NO IMAGE EVIDENCE')).toBeVisible();
});
