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
    expect(await within(details).findByText('Possible danger · Drone inspection', {}, { timeout: 2500 })).toBeVisible();
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


test('the fourth showcase stops at operator review and an operator response holds the drone until simulated arrival', async () => {
  const clock = vi.spyOn(Date, 'now').mockReturnValue(1000);
  try {
    const user = userEvent.setup();
    render(<App observations={[
      { id: 'operator-review', title: 'Needs operator review', scenario: 'operator-review', image: null, latitude: 29.83, longitude: -95.43 },
      { id: 'other', title: 'Other observation', scenario: 'no-flood', image: null, latitude: null, longitude: null },
    ]}/>);
    await user.click(screen.getByRole('button', { name: 'Run analysis' }));
    const details = screen.getByRole('region', { name: 'Observation details' });
    expect(await within(details).findByText('Possible danger · Drone inspection', {}, { timeout: 2500 })).toBeVisible();
    clock.mockReturnValue(8000);
    expect(await within(details).findByText('Operator review')).toBeVisible();
    expect(within(details).getByText('On site · awaiting operator decision')).toBeVisible();
    expect(within(details).getByText('The scripted drone inspection cannot establish whether assistance is needed.')).toBeVisible();
    expect(within(details).getAllByText('Medium confidence')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Needs operator review · Operator review · 29.83, -95.43' })).toHaveClass('pending');
    expect(within(details).queryByText('Simulated response notification sent')).not.toBeInTheDocument();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Scenario' }), 'other');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Scenario' }), 'operator-review');
    await user.click(within(details).getByRole('button', { name: 'Assistance needed' }));
    expect(within(details).getByText('Response recommended')).toBeVisible();
    expect(within(details).getByText('Simulated response notification sent')).toBeVisible();
    expect(within(details).getByText('Operator marked assistance needed. Simulated response notification sent. No emergency service contacted.')).toBeVisible();
    expect(within(details).getByText('On site · awaiting response team')).toBeVisible();
    expect(within(details).queryByText(/notified automatically/)).not.toBeInTheDocument();
    await user.click(within(details).getByRole('button', { name: 'Mark response team arrived' }));
    expect(within(details).getByText('Mission complete · response team arrived')).toBeVisible();
  } finally { clock.mockRestore(); }
});


test('operator can retry the unresolved simulated drone assessment only once, then close with evidence retained', async () => {
  const clock = vi.spyOn(Date, 'now').mockReturnValue(1000);
  try {
    const user = userEvent.setup();
    const assess: AssessmentBoundary = async ({ stage }) => ({ stage, finding: stage === 'flood' ? 'yes' : 'uncertain', confidence: stage === 'flood' ? 'high' : 'medium', source: 'demo', reason: stage === 'flood' ? 'Floodwater is visible.' : 'Occupancy cannot be determined.' });
    render(<App assess={assess} observations={[
      { id: 'operator-review', title: 'Review observation', scenario: 'operator-review', image: null, latitude: null, longitude: null },
      { id: 'other', title: 'Other observation', scenario: 'no-flood', image: null, latitude: null, longitude: null },
    ]}/>);
    await user.click(screen.getByRole('button', { name: 'Run analysis' }));
    const details = screen.getByRole('region', { name: 'Observation details' });
    clock.mockReturnValue(8000);
    expect(await within(details).findByText('Operator review')).toBeVisible();
    await user.click(within(details).getByRole('button', { name: 'Retry simulated assessment once' }));
    expect(within(details).getByText('Operator requested the single simulated drone retry.')).toBeVisible();
    expect(within(details).getByRole('button', { name: 'Simulated retry used' })).toBeDisabled();
    expect(within(details).getByText('Operator review')).toBeVisible();
    expect(within(details).queryByText('Simulated response notification sent')).not.toBeInTheDocument();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Scenario' }), 'other');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Scenario' }), 'operator-review');
    expect(within(details).getByRole('button', { name: 'Simulated retry used' })).toBeDisabled();
    await user.click(within(details).getByRole('button', { name: 'Close case · No response needed' }));
    expect(within(details).getByText('Closed · No response needed')).toBeVisible();
    expect(within(details).getByText('Operator closed the case. No response needed. Simulated drone mission ended.')).toBeVisible();
    expect(within(details).getByText('Occupancy cannot be determined.')).toBeVisible();
    expect(within(details).getByText('The scripted drone inspection cannot establish whether assistance is needed.')).toBeVisible();
    expect(within(details).queryByRole('button', { name: 'Assistance needed' })).not.toBeInTheDocument();
  } finally { clock.mockRestore(); }
});


test.each([
  ['uncertain', 'high'], ['yes', 'medium'], ['no', 'low'],
] as const)('a %s flood finding at %s confidence requires operator review before assistance', async (finding, confidence) => {
  const user = userEvent.setup();
  const assess: AssessmentBoundary = async ({ stage }) => ({ stage, finding, confidence, source: 'local-model', reason: 'The waterline is unclear in the supplied image.' });
  render(<App assess={assess}/>);
  await user.click(screen.getByRole('button', { name: 'Run analysis' }));
  const details = screen.getByRole('region', { name: 'Observation details' });
  expect(await within(details).findByText('Operator review')).toBeVisible();
  expect(within(details).getByText('The waterline is unclear in the supplied image.')).toBeVisible();
  expect(within(details).getByRole('button', { name: 'Flood confirmed' })).toBeVisible();
  expect(within(details).getByRole('button', { name: 'No flood' })).toBeVisible();
  expect(within(details).getByRole('button', { name: 'Retry flood assessment once' })).toBeVisible();
  expect(within(details).queryByText('Simulated response notification sent')).not.toBeInTheDocument();
  expect(within(details).queryByRole('region', { name: 'Simulated drone mission' })).not.toBeInTheDocument();
});


test('operator confirming uncertain flood continues assistance analysis without replacing the original finding', async () => {
  const user = userEvent.setup();
  const assess: AssessmentBoundary = async ({ stage }) => stage === 'flood'
    ? { stage, finding: 'uncertain', confidence: 'low', source: 'local-model', reason: 'Shadow obscures the waterline.' }
    : { stage, finding: 'yes', confidence: 'high', source: 'local-model', reason: 'A person is signaling for help.' };
  render(<App assess={assess}/>);
  await user.click(screen.getByRole('button', { name: 'Run analysis' }));
  const details = screen.getByRole('region', { name: 'Observation details' });
  await user.click(await within(details).findByRole('button', { name: 'Flood confirmed' }));
  expect(await within(details).findByText('Response recommended')).toBeVisible();
  expect(within(details).getByText('Operator confirmed flooding. Assistance assessment may proceed.')).toBeVisible();
  expect(within(details).getByText('Shadow obscures the waterline.')).toBeVisible();
  expect(within(details).getByText('Low confidence')).toBeVisible();
  expect(within(details).getByText('A person is signaling for help.')).toBeVisible();
});


test('operator can mark an uncertain flood observation no flood and retain the reason after switching cases', async () => {
  const user = userEvent.setup();
  const assess: AssessmentBoundary = async ({ stage }) => ({ stage, finding: 'yes', confidence: 'low', source: 'local-model', reason: 'Reflections may be floodwater.' });
  render(<App assess={assess}/>);
  await user.click(screen.getByRole('button', { name: 'Run analysis' }));
  const details = screen.getByRole('region', { name: 'Observation details' });
  await user.click(await within(details).findByRole('button', { name: 'No flood' }));
  expect(within(details).getByText('Closed · No flood')).toBeVisible();
  await user.selectOptions(screen.getByRole('combobox', { name: 'Scenario' }), 'assistance');
  await user.selectOptions(screen.getByRole('combobox', { name: 'Scenario' }), 'no-flood');
  expect(within(details).getByText('Reflections may be floodwater.')).toBeVisible();
  expect(within(details).getByText('Low confidence')).toBeVisible();
  expect(within(details).getByText('Operator marked no flood. Case closed without a drone mission or response notification.')).toBeVisible();
  expect(within(details).queryByText('Simulated response notification sent')).not.toBeInTheDocument();
});


test('flood review retries the active assessment once and preserves both findings and its retry limit', async () => {
  const user = userEvent.setup();
  let attempt = 0;
  let finishRetry!: (assessment: Assessment) => void;
  const retried = new Promise<Assessment>((resolve) => { finishRetry = resolve; });
  const assess: AssessmentBoundary = async ({ stage }) => ++attempt === 1 ? { stage, finding: 'uncertain', confidence: 'low', source: 'local-model', reason: 'Original image has a shadow.' } : retried;
  render(<App assess={assess}/>);
  await user.click(screen.getByRole('button', { name: 'Run analysis' }));
  const details = screen.getByRole('region', { name: 'Observation details' });
  await user.click(await within(details).findByRole('button', { name: 'Retry flood assessment once' }));
  expect(within(details).getByText('Screening this observation for flooding…')).toBeVisible();
  expect(within(details).getByRole('button', { name: 'Analyzing observation…' })).toBeDisabled();
  await act(async () => finishRetry({ stage: 'flood', finding: 'uncertain', confidence: 'low', source: 'local-model', reason: 'The second local assessment still cannot resolve the waterline.' }));
  expect(await within(details).findByText('The second local assessment still cannot resolve the waterline.')).toBeVisible();
  expect(within(details).getByText('Local model')).toBeVisible();
  expect(within(details).getByText('Previous flood assessment: uncertain · low confidence · local-model. Original image has a shadow.')).toBeVisible();
  expect(within(details).getByText('Operator requested the single flood assessment retry.')).toBeVisible();
  expect(within(details).getByRole('button', { name: 'Flood retry used' })).toBeDisabled();
  await user.selectOptions(screen.getByRole('combobox', { name: 'Scenario' }), 'assistance');
  await user.selectOptions(screen.getByRole('combobox', { name: 'Scenario' }), 'no-flood');
  expect(within(details).getByRole('button', { name: 'Flood retry used' })).toBeDisabled();
  expect(within(details).getByRole('button', { name: 'Flood confirmed' })).toBeEnabled();
  expect(within(details).getByRole('button', { name: 'No flood' })).toBeEnabled();
});
