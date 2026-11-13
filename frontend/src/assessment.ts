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
