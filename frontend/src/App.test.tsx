import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import App from './App';
import type { Assessment, AssessmentBoundary } from './assessment';

test('a flooded car stays possible danger until a simulated drone clears assistance, retaining the closed evidence and history', async () => {
  const clock = vi.spyOn(Date, 'now').mockReturnValue(1000);
  try {
    const user = userEvent.setup();
    render(<App observations={[
      { id: 'drone-clear', title: 'Flooded car', scenario: 'drone-clear', image: null, latitude: 29.83, longitude: -95.43 },
      { id: 'no-flood', title: 'Other observation', scenario: 'no-flood', image: null, latitude: null, longitude: null },
    ]}/>);
    await user.click(screen.getByRole('button', { name: 'Run analysis' }));
    const details = screen.getByRole('region', { name: 'Observation details' });
    expect(await within(details).findByText('Flooding detected')).toBeVisible();
    expect(await within(details).findByText('Possible danger · Drone inspection')).toBeVisible();
    expect(within(details).getByText('A flooded vehicle is visible, but the initial image does not establish whether anyone needs help.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Flooded car · Possible danger · Drone inspection · 29.83, -95.43' })).toHaveClass('pending');
    expect(within(details).queryByText('Simulated response notification sent')).not.toBeInTheDocument();
    expect(within(details).queryByRole('button', { name: 'Run analysis' })).not.toBeInTheDocument();
    clock.mockReturnValue(5500);
    expect(await within(details).findByText('Inspecting observation')).toBeVisible();
    expect(within(details).getByText('Simulated drone inspection: maintaining a view of the observation.')).toBeVisible();
    clock.mockReturnValue(8000);
    expect(await within(details).findByText('Closed · No response needed')).toBeVisible();
    expect(within(details).getByText('Mission complete · No assistance needed')).toBeVisible();
    expect(within(details).getByText('SIMULATED DRONE')).toBeVisible();
    expect(within(details).getByText('No assistance needed')).toBeVisible();
    expect(within(details).getByText('The scripted drone inspection finds no one needing assistance near the flooded vehicle.')).toBeVisible();
    expect(within(details).getAllByText('High confidence')).toHaveLength(2);
    expect(within(details).getByText('Case closed. No response needed after simulated drone inspection.')).toBeVisible();
    expect(within(details).queryByText(/remains on site until/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Flooded car · Closed · No response needed · 29.83, -95.43' })).toHaveClass('closed');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Scenario' }), 'no-flood');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Scenario' }), 'drone-clear');
    expect(within(details).getByText('Closed · No response needed')).toBeVisible();
    expect(within(details).getByText('A flooded vehicle is visible, but the initial image does not establish whether anyone needs help.')).toBeVisible();
    expect(within(details).getByText('Case closed. No response needed after simulated drone inspection.')).toBeVisible();
  } finally { clock.mockRestore(); }
});

test('a clear assistance finding follows flood screening and automatically notifies simulated response', async () => {
  const user = userEvent.setup();
  let finishAssistance!: (result: Assessment) => void;
  const assistance = new Promise<Assessment>((resolve) => { finishAssistance = resolve; });
  const assess: AssessmentBoundary = async ({ stage }) => stage === 'flood'
    ? { stage, finding: 'yes', confidence: 'high', source: 'demo', reason: 'Floodwater surrounds the observation.' }
    : assistance;
  render(<App assess={assess}/>);
  await user.selectOptions(screen.getByRole('combobox', { name: 'Scenario' }), 'assistance');
  await user.click(screen.getByRole('button', { name: 'Run analysis' }));
  const details = screen.getByRole('region', { name: 'Observation details' });
  expect(await within(details).findByText('Flooding detected')).toBeVisible();
  expect(within(details).getByText('Assessing whether assistance is needed…')).toBeVisible();
  expect(within(details).queryByText('Simulated response notification sent')).not.toBeInTheDocument();
  await act(async () => finishAssistance({ stage: 'assistance', finding: 'yes', confidence: 'high', source: 'demo', reason: 'A person is visibly signaling for help.' }));
  expect(await within(details).findByText('Response recommended')).toBeVisible();
  expect(within(details).getByText('Assistance needed')).toBeVisible();
  expect(within(details).getByText('A person is visibly signaling for help.')).toBeVisible();
  expect(within(details).getByText('Simulated response notification sent')).toBeVisible();
  expect(within(details).getAllByText('High confidence')).toHaveLength(2);
  expect(within(details).getByText('Location pending · scripted mission only')).toBeVisible();
  expect(screen.queryByRole('button', { name: /Simulated drone ·/ })).not.toBeInTheDocument();
});

test('the nearest illustrative base sends a drone that stays on site until simulated response arrival, preserving red status and history', async () => {
  const clock = vi.spyOn(Date, 'now').mockReturnValue(1000);
  try {
    const user = userEvent.setup();
    const assess: AssessmentBoundary = async ({ stage }) => ({ stage, finding: 'yes', confidence: 'high', source: 'demo', reason: stage === 'flood' ? 'Floodwater is visible.' : 'A person is signaling for help.' });
    render(<App assess={assess} observations={[
      { id: 'north', title: 'North observation', scenario: 'assistance', image: null, latitude: 29.83, longitude: -95.43 },
      { id: 'other', title: 'Other observation', scenario: 'no-flood', image: null, latitude: null, longitude: null },
    ]}/>);
    await user.click(screen.getByRole('button', { name: 'Run analysis' }));
    const details = screen.getByRole('region', { name: 'Observation details' });
    expect(within(details).getByText('Illustrative base near Station 13')).toBeVisible();
    expect(within(details).getByText('0.9 km straight-line distance')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Simulated drone · En route' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'North observation · Response recommended · 29.83, -95.43' })).toHaveClass('response');
    expect(within(details).getByRole('button', { name: 'Mark response team arrived' })).toBeDisabled();
    clock.mockReturnValue(21000);
    expect(await within(details).findByText('On site · awaiting response team')).toBeVisible();
    expect(within(details).getByText('Simulated drone inspection: maintaining a view of the observation.')).toBeVisible();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Scenario' }), 'other');
    clock.mockReturnValue(81000);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Scenario' }), 'north');
    expect(within(details).getByText('On site · awaiting response team')).toBeVisible();
    await user.click(within(details).getByRole('button', { name: 'Mark response team arrived' }));
    expect(within(details).getByText('Mission complete · response team arrived')).toBeVisible();
    expect(within(details).getByText('Presenter marked simulated response team arrival. Drone mission ended.')).toBeVisible();
    expect(within(details).getByText('Simulated response notification sent automatically. No emergency service contacted.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'North observation · Response team arrived · 29.83, -95.43' })).toHaveClass('response');
    expect(within(details).queryByRole('button', { name: 'Mark response team arrived' })).not.toBeInTheDocument();
  } finally { clock.mockRestore(); }
});

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
