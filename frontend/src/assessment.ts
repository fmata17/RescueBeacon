export type AssessmentStage = 'flood' | 'assistance';
export type Assessment = {
  stage: AssessmentStage;
  finding: 'yes' | 'no' | 'uncertain';
  confidence: 'high' | 'medium' | 'low';
  reason: string;
  source: 'demo' | 'local-model' | 'simulated-drone';
};
export type AssessmentBoundary = (request: {
  observationId: string;
  stage: AssessmentStage;
}) => Promise<Assessment>;
export type Observation = {
  id: string;
  title: string;
  scenario: 'no-flood' | 'assistance' | 'drone-clear' | 'operator-review';
  image: string | null;
  latitude: number | null;
  longitude: number | null;
  locationSource?: 'illustrative' | 'metadata';
};

export const localAssessment: AssessmentBoundary = async (request) => {
  const response = await fetch('/api/assessments', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(typeof result?.error === 'string' ? result.error : `Local assessment failed (${response.status}).`);
  if (!result || result.stage !== request.stage || !['yes', 'no', 'uncertain'].includes(result.finding)
    || !['high', 'medium', 'low'].includes(result.confidence) || typeof result.reason !== 'string'
    || !result.reason.trim() || result.reason.trim().length > 500 || result.source !== 'local-model') {
    throw new Error('Invalid local assessment response. Retry the assessment.');
  }
  return { stage: result.stage, finding: result.finding, confidence: result.confidence, reason: result.reason.trim(), source: result.source };
};

export const demoAssessment: AssessmentBoundary = async ({ observationId, stage }) => {
  await new Promise((resolve) => setTimeout(resolve, 650));
  if (stage === 'flood' && observationId !== 'no-flood') return {
    stage, finding: 'yes', confidence: 'high', source: 'demo',
    reason: 'Floodwater surrounds this scripted observation.',
  };
  if (stage === 'assistance' && observationId === 'assistance') return {
    stage, finding: 'yes', confidence: 'high', source: 'demo',
    reason: 'A person is signaling for help in this scripted observation.',
  };
  if (stage === 'assistance' && observationId !== 'no-flood') return {
    stage, finding: 'uncertain', confidence: 'medium', source: 'demo',
    reason: 'A flooded vehicle is visible, but the initial image does not establish whether anyone needs help.',
  };
  return {
    stage, finding: 'no', confidence: 'high', source: 'demo',
    reason: 'No floodwater is visible in this scripted observation. The roadway is clear.',
  };
};

export function simulatedDroneAssessment(scenario: Observation['scenario']): Assessment {
  return scenario === 'drone-clear' ? {
    stage: 'assistance', finding: 'no', confidence: 'high', source: 'simulated-drone',
    reason: 'The scripted drone inspection finds no one needing assistance near the flooded vehicle.',
  } : {
    stage: 'assistance', finding: 'uncertain', confidence: 'medium', source: 'simulated-drone',
    reason: 'The scripted drone inspection cannot establish whether assistance is needed.',
  };
}
