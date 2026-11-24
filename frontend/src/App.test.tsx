import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import App from './App';
import type { AssessmentBoundary } from './assessment';

const assessFloodAndUncertainAssistance: AssessmentBoundary = async ({ stage }) => ({
  stage,
  finding: stage === 'flood' ? 'yes' : 'uncertain',
  confidence: stage === 'flood' ? 'high' : 'medium',
  source: 'local-model',
  reason: stage === 'flood' ? 'Floodwater is visible.' : 'Occupancy cannot be determined.',
});

test('no flood closes the observation and its result remains accessible after switching photos', async () => {
  const user = userEvent.setup();
  const assess: AssessmentBoundary = async () => ({
    stage: 'flood',
    finding: 'no',
    confidence: 'high',
    source: 'local-model',
    reason: 'The roadway is dry.',
  });
  render(<App assess={assess} />);
  await user.click(screen.getByRole('button', { name: 'Run analysis' }));
  expect(await screen.findByText('Closed · No flood')).toBeVisible();
  expect(screen.getByText('The roadway is dry.')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'View assistance' }));
  await user.click(screen.getByRole('button', { name: 'View no-flood' }));
  expect(screen.getByText('The roadway is dry.')).toBeVisible();
  expect(screen.queryByRole('region', { name: 'Simulated drone mission' })).not.toBeInTheDocument();
});

test('a flooded vehicle gets a yellow hotspot and drone inspection before being cleared', async () => {
  const clock = vi.spyOn(Date, 'now').mockReturnValue(1000);
  try {
    const user = userEvent.setup();
    render(<App assess={assessFloodAndUncertainAssistance} />);
    await user.click(screen.getByRole('button', { name: 'View drone-clear' }));
    await user.click(screen.getByRole('button', { name: 'Run analysis' }));
    expect(await screen.findByText('Possible danger · Drone inspection')).toBeVisible();
    expect(
      screen.getByRole('button', { name: /Drone clears the case · Possible danger/ }),
    ).toHaveClass('warning');
    expect(screen.getByText('Occupancy cannot be determined.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Simulated drone · En route' })).toBeVisible();
    clock.mockReturnValue(14000);
    expect(await screen.findByText('Closed · No response needed')).toBeVisible();
    expect(
      screen.getByText(
        'The scripted drone inspection finds no one needing assistance near the flooded vehicle.',
      ),
    ).toBeVisible();
    expect(screen.queryByText('Simulated response notification sent')).not.toBeInTheDocument();
  } finally {
    clock.mockRestore();
  }
});

test('an unresolved inspection requests an operator decision and response keeps the drone on site', async () => {
  const clock = vi.spyOn(Date, 'now').mockReturnValue(1000);
  try {
    const user = userEvent.setup();
    render(<App assess={assessFloodAndUncertainAssistance} />);
    await user.click(screen.getByRole('button', { name: 'View operator-review' }));
    await user.click(screen.getByRole('button', { name: 'Run analysis' }));
    expect(await screen.findByText('Possible danger · Drone inspection')).toBeVisible();
    clock.mockReturnValue(14000);
    expect(await screen.findByText('Operator review')).toBeVisible();
    expect(screen.getByText('On site · awaiting operator decision')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Retry drone assessment' }));
    expect(screen.getByRole('button', { name: 'Retry used' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Assistance needed' }));
    expect(screen.getByText('Response recommended')).toBeVisible();
    expect(screen.getByText('On site · awaiting response team')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Mark response team arrived' }));
    expect(screen.getByText('Mission complete · response team arrived')).toBeVisible();
  } finally {
    clock.mockRestore();
  }
});

test.each([
  ['uncertain', 'low'],
  ['yes', 'medium'],
  ['no', 'low'],
] as const)(
  'flood finding %s at %s confidence requires review instead of an automatic decision',
  async (finding, confidence) => {
    const user = userEvent.setup();
    const assess: AssessmentBoundary = async ({ stage }) => ({
      stage,
      finding,
      confidence,
      source: 'local-model',
      reason: 'The waterline is unclear.',
    });
    render(<App assess={assess} />);
    await user.click(screen.getByRole('button', { name: 'Run analysis' }));
    const details = screen.getByRole('region', { name: 'Observation details' });
    expect(await within(details).findByText('Operator review')).toBeVisible();
    expect(within(details).getByText('The waterline is unclear.')).toBeVisible();
    expect(within(details).getByRole('button', { name: 'Flood confirmed' })).toBeVisible();
    expect(within(details).getByRole('button', { name: 'No flood' })).toBeVisible();
    await user.click(within(details).getByRole('button', { name: 'Retry flood assessment' }));
    expect(await within(details).findByRole('button', { name: 'Retry used' })).toBeDisabled();
  },
);
