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
  if (observationId === 'assistance') return {
    stage, finding: 'yes', confidence: 'high', source: 'demo',
    reason: stage === 'flood' ? 'Floodwater surrounds this scripted observation.' : 'A person is signaling for help in this scripted observation.',
  };
  return {
    stage: 'flood', finding: 'no', confidence: 'high', source: 'demo',
    reason: 'No floodwater is visible in this scripted observation. The roadway is clear.',
  };
};
