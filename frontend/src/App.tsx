import { useEffect, useState } from 'react';
import { Activity, Check, CheckCheck, ImageOff, MapPin, Play, Radio, Waves } from 'lucide-react';
import manifest from '../../images/manifest.json';
import {
  demoAssessment,
  localAssessment,
  simulatedDroneAssessment,
  type Assessment,
  type AssessmentBoundary,
  type Observation,
} from './assessment';
import ObservationMap from './ObservationMap';
import DroneMissionDetails from './DroneMissionDetails';
import { advanceDroneMission, startDroneMission, type DroneMission } from './mission';
import './styles.css';

type ObservationState = {
  analyzingStage?: 'flood' | 'assistance';
  status:
    | 'ready'
    | 'analyzing'
    | 'closed'
    | 'review'
    | 'error'
    | 'response'
    | 'arrived'
    | 'possible-danger';
  result?: Assessment;
  assistance?: Assessment;
  droneAssessment?: Assessment;
  closure?: 'no-response';
  responseBy?: 'automatic' | 'operator';
  droneRetried?: boolean;
  floodRetried?: boolean;
  mission?: DroneMission;
  error?: string;
  history: string[];
};
const createInitialObservationState = (): ObservationState => ({
  status: 'ready',
  history: ['Observation added to the review queue.'],
});
const getObservationStatusLabel = (state: ObservationState) =>
  ({
    ready: 'Ready to analyze',
    analyzing: 'Analyzing',
    closed: state.closure === 'no-response' ? 'Closed · No response needed' : 'Closed · No flood',
    review: 'Operator review',
    error: 'Analysis failed',
    response: 'Response recommended',
    arrived: 'Response team arrived',
    'possible-danger': 'Possible danger · Drone inspection',
  })[state.status];

type AppProps = {
  assess?: AssessmentBoundary;
  observations?: Observation[];
  initialMode?: 'demo' | 'local-model';
};

export default function App({
  assess,
  observations = manifest as Observation[],
  initialMode = 'demo',
}: AppProps) {
  const mode = initialMode;
  const assessObservation = assess ?? (mode === 'demo' ? demoAssessment : localAssessment);
  const [selectedId, setSelectedId] = useState(observations[0]?.id);
  const [observationStates, setObservationStates] = useState<Record<string, ObservationState>>({});
  const [failedImageId, setFailedImageId] = useState<string | null>(null);
  const isAnalyzing = Object.values(observationStates).some((item) => item.status === 'analyzing');
  const hasMovingMission = Object.values(observationStates).some(
    (item) => item.mission?.phase === 'en-route' || item.mission?.phase === 'inspecting',
  );
  useEffect(() => {
    if (!hasMovingMission) return;
    const timer = window.setInterval(
      () =>
        setObservationStates((previous) =>
          Object.fromEntries(
            Object.entries(previous).map(([id, item]) => {
              if (!item.mission) return [id, item];
              const next = advanceDroneMission(item.mission, Date.now());
              if (item.status === 'possible-danger' && next.mission.phase === 'on-site') {
                const observation = observations.find((entry) => entry.id === id);
                if (!observation) return [id, item];
                const droneAssessment = simulatedDroneAssessment(observation.scenario);
                const cleared =
                  droneAssessment.finding === 'no' && droneAssessment.confidence === 'high';
                return [
                  id,
                  {
                    ...item,
                    status: cleared ? 'closed' : 'review',
                    closure: cleared ? 'no-response' : undefined,
                    droneAssessment,
                    mission: { ...next.mission, phase: cleared ? 'complete' : 'on-site' },
                    history: [
                      ...item.history,
                      ...next.events,
                      `Simulated drone assistance assessment: ${cleared ? 'no assistance needed' : 'review required'} · ${droneAssessment.confidence} confidence.`,
                      cleared
                        ? 'Case closed. No response needed after simulated drone inspection.'
                        : 'Drone assessment requires operator review.',
                    ],
                  } satisfies ObservationState,
                ];
              }
              return [
                id,
                next.mission === item.mission
                  ? item
                  : { ...item, mission: next.mission, history: [...item.history, ...next.events] },
              ];
            }),
          ),
        ),
      200,
    );
    return () => window.clearInterval(timer);
  }, [hasMovingMission, observations]);
  const selected = observations.find((item) => item.id === selectedId) ?? observations[0];
  if (!selected)
    return <main className="empty-workspace">No observations in the image manifest.</main>;
  const state = observationStates[selected.id] ?? createInitialObservationState();
  const index = observations.findIndex((item) => item.id === selected.id);

  async function runAnalysis(retryFlood = false, refreshLive = false) {
    if (state.status === 'analyzing') return;
    if (state.status === 'error' && state.analyzingStage === 'assistance') {
      await runAssistance(selected, { ...state, error: undefined });
      return;
    }
    if (retryFlood && (state.status !== 'review' || state.droneAssessment || state.floodRetried))
      return;
    const current = { ...state, error: undefined, floodRetried: state.floodRetried || retryFlood };
    const observationId = selected.id;
    let history = [
      ...state.history,
      ...(retryFlood && state.result
        ? [
            `Previous flood assessment: ${state.result.finding} · ${state.result.confidence} confidence · ${state.result.source}. ${state.result.reason}`,
            'Operator requested the single flood assessment retry.',
          ]
        : []),
      'Flood screening started.',
    ];
    let result: Assessment | undefined = state.result;
    setObservationStates((previous) => ({
      ...previous,
      [observationId]: { ...current, analyzingStage: 'flood', status: 'analyzing', history },
    }));
    try {
      result = await assessObservation({
        observationId,
        stage: 'flood',
        ...(refreshLive ? { refresh: true } : {}),
      });
      const closed = result.finding === 'no' && result.confidence === 'high';
      history = [
        ...history,
        `Flood assessment: ${result.finding === 'no' ? 'no flooding detected' : result.finding === 'yes' ? 'flooding detected' : 'review required'} · ${result.confidence} confidence.`,
      ];
      if (result.finding === 'yes' && result.confidence === 'high') {
        await runAssistance(selected, { ...current, status: 'analyzing', result, history });
        return;
      }
      setObservationStates((previous) => ({
        ...previous,
        [observationId]: {
          ...current,
          status: closed ? 'closed' : 'review',
          result,
          history: [
            ...history,
            closed
              ? 'Case closed. No drone mission or response notification required.'
              : 'Assessment requires operator review.',
          ],
        },
      }));
    } catch (error) {
      setObservationStates((previous) => ({
        ...previous,
        [observationId]: {
          ...current,
          analyzingStage: 'flood',
          status: 'error',
          result,
          history: [...history, 'Analysis failed. No automatic case decision made.'],
          error: error instanceof Error ? error.message : 'Analysis could not be completed.',
        },
      }));
    }
  }

  async function runAssistance(observation: Observation, current: ObservationState) {
    try {
      const history = [...current.history, 'Assistance assessment started · Initial image.'];
      setObservationStates((previous) => ({
        ...previous,
        [observation.id]: {
          ...current,
          analyzingStage: 'assistance',
          status: 'analyzing',
          history,
        },
      }));
      const assistance = await assessObservation({
        observationId: observation.id,
        stage: 'assistance',
      });
      const response = assistance.finding === 'yes' && assistance.confidence === 'high';
      const possibleDanger = assistance.finding === 'uncertain' || assistance.confidence !== 'high';
      const mission =
        response || possibleDanger
          ? startDroneMission(observation, response ? 'response' : 'inspection')
          : undefined;
      setObservationStates((previous) => ({
        ...previous,
        [observation.id]: {
          ...current,
          responseBy: response ? 'automatic' : undefined,
          status: response ? 'response' : possibleDanger ? 'possible-danger' : 'closed',
          closure: !response && !possibleDanger ? 'no-response' : undefined,
          assistance,
          mission,
          history: [
            ...history,
            `Assistance assessment: ${response ? 'assistance needed' : possibleDanger ? 'possible danger' : 'no assistance needed'} · ${assistance.confidence} confidence.`,
            response
              ? 'Simulated response notification sent automatically. No emergency service contacted.'
              : possibleDanger
                ? 'Possible danger. A flooded vehicle alone does not confirm assistance is needed. Simulated drone inspection requested.'
                : 'Case closed. No response needed.',
            ...(mission
              ? [
                  mission.assignment
                    ? `Simulated drone launched from ${mission.assignment.base.name.toLowerCase()}.`
                    : 'Simulated drone mission started. Location pending; no geographic route drawn.',
                ]
              : []),
          ],
        },
      }));
    } catch (error) {
      setObservationStates((previous) => ({
        ...previous,
        [observation.id]: {
          ...current,
          analyzingStage: 'assistance',
          status: 'error',
          history: [
            ...current.history,
            'Assistance assessment failed. No automatic case decision made.',
          ],
          error: error instanceof Error ? error.message : 'Assessment could not be completed.',
        },
      }));
    }
  }

  function confirmFlood() {
    if (state.status !== 'review' || state.droneAssessment || !state.result) return;
    void runAssistance(selected, {
      ...state,
      history: [
        ...state.history,
        'Operator confirmed flooding. Assistance assessment may proceed.',
      ],
    });
  }

  function markNoFlood() {
    setObservationStates((previous) => {
      const current = previous[selected.id];
      if (current?.status !== 'review' || current.droneAssessment) return previous;
      return {
        ...previous,
        [selected.id]: {
          ...current,
          status: 'closed',
          history: [
            ...current.history,
            'Operator marked no flood. Case closed without a drone mission or response notification.',
          ],
        },
      };
    });
  }

  function recommendResponse() {
    setObservationStates((previous) => {
      const current = previous[selected.id];
      if (current?.status !== 'review' || !current.droneAssessment || !current.mission)
        return previous;
      return {
        ...previous,
        [selected.id]: {
          ...current,
          status: 'response',
          responseBy: 'operator',
          mission: { ...current.mission, purpose: 'response' },
          history: [
            ...current.history,
            'Operator marked assistance needed. Simulated response notification sent. No emergency service contacted.',
            'Simulated drone remains on site until the presenter marks response team arrival.',
          ],
        },
      };
    });
  }

  function closeReview() {
    setObservationStates((previous) => {
      const current = previous[selected.id];
      if (current?.status !== 'review' || !current.droneAssessment) return previous;
      return {
        ...previous,
        [selected.id]: {
          ...current,
          status: 'closed',
          closure: 'no-response',
          mission: current.mission ? { ...current.mission, phase: 'complete' } : undefined,
          history: [
            ...current.history,
            'Operator closed the case. No response needed. Simulated drone mission ended.',
          ],
        },
      };
    });
  }

  function retryDroneAssessment() {
    setObservationStates((previous) => {
      const current = previous[selected.id];
      if (current?.status !== 'review' || !current.droneAssessment || current.droneRetried)
        return previous;
      const droneAssessment = simulatedDroneAssessment(selected.scenario);
      return {
        ...previous,
        [selected.id]: {
          ...current,
          droneRetried: true,
          droneAssessment,
          history: [
            ...current.history,
            `Previous simulated drone assessment: ${current.droneAssessment.finding} · ${current.droneAssessment.confidence} confidence. ${current.droneAssessment.reason}`,
            'Operator requested the single simulated drone retry.',
            `Simulated drone retry: ${droneAssessment.finding} · ${droneAssessment.confidence} confidence. ${droneAssessment.reason}`,
          ],
        },
      };
    });
  }

  function markResponseArrived() {
    setObservationStates((previous) => {
      const current = previous[selected.id];
      if (!current?.mission || current.mission.phase !== 'on-site') return previous;
      return {
        ...previous,
        [selected.id]: {
          ...current,
          status: 'arrived',
          mission: { ...current.mission, phase: 'complete' },
          history: [
            ...current.history,
            'Presenter marked simulated response team arrival. Drone mission ended.',
          ],
        },
      };
    });
  }

  const latest = state.droneAssessment ?? state.assistance ?? state.result;
  const tone =
    state.status === 'response' || state.status === 'arrived'
      ? 'urgent'
      : ['possible-danger', 'review'].includes(state.status)
        ? 'warning'
        : state.status === 'closed'
          ? 'clear'
          : 'neutral';
  const observationLabels: Record<string, string> = {
    'no-flood': 'Dry roadway',
    assistance: 'People on rooftop',
    'drone-clear': 'Flooded parking lot',
    'operator-review': 'Flooded neighborhood',
  };
  const getObservationLabel = (item: Observation) => observationLabels[item.scenario] ?? item.title;
  const tones = Object.fromEntries(
    observations.map((item) => {
      const current = observationStates[item.id] ?? createInitialObservationState();
      return [
        item.id,
        current.status === 'response' || current.status === 'arrived'
          ? 'urgent'
          : ['possible-danger', 'review'].includes(current.status)
            ? 'warning'
            : current.status === 'closed'
              ? 'clear'
              : (item.priority ?? 'neutral'),
      ];
    }),
  );
  const sourceLabel =
    latest?.source === 'simulated-drone'
      ? 'Simulated drone'
      : latest?.source === 'recorded-model'
        ? 'Recorded Qwen result'
        : (state.result?.source ?? mode) === 'local-model'
          ? 'Local model'
          : 'Demo · scripted';

  return (
    <div className="map-app">
      <header className="app-header">
        <a href="./" className="app-brand">
          <Radio size={23} />
          <span>
            Rescue<span>Beacon</span>
          </span>
        </a>
        <span className="header-place">
          <MapPin size={14} />
          Harris County, Texas
        </span>
        <span className="header-caption">Flood response</span>
      </header>
      <main className="map-workspace">
        <section className="map-canvas" aria-label="Harris County observation map">
          <ObservationMap
            observations={observations}
            selected={selected}
            statuses={Object.fromEntries(
              observations.map((item) => [
                item.id,
                getObservationStatusLabel(
                  observationStates[item.id] ?? createInitialObservationState(),
                ),
              ]),
            )}
            tones={tones}
            onSelect={setSelectedId}
            missions={Object.fromEntries(
              Object.entries(observationStates).flatMap(([id, item]) =>
                item.mission ? [[id, item.mission]] : [],
              ),
            )}
          />
          <div className="map-title">
            <span>AREA OF INTEREST</span>
            <h1>Harris County</h1>
            <p>Select a hotspot to inspect the photo.</p>
          </div>
          <div className="map-key">
            <span>
              <i className="key-dot urgent" />
              Urgent response
            </span>
            <span>
              <i className="key-dot warning" />
              Drone inspection
            </span>
            <span>
              <i className="key-dot clear" />
              No response
            </span>
          </div>
          <div className="photo-strip" aria-label="Observation photos">
            {observations.map((item, i) => (
              <button
                key={item.id}
                aria-label={`View ${item.id}`}
                aria-pressed={item.id === selected.id}
                onClick={() => setSelectedId(item.id)}
                className={`photo-choice ${item.id === selected.id ? 'selected' : ''} ${tones[item.id]}`}
              >
                {item.image ? (
                  <img src={`/${item.image}`} alt="" />
                ) : (
                  <span className="photo-missing">
                    <ImageOff size={20} />
                  </span>
                )}
                <span className="photo-number">0{i + 1}</span>
                <span className="photo-caption">
                  <i className={`key-dot ${tones[item.id]}`} />
                  {getObservationLabel(item)}
                </span>
              </button>
            ))}
          </div>
          <span className="location-disclaimer">Illustrative map locations</span>
        </section>
        <section className="photo-panel" aria-label="Observation details">
          <div className="panel-content">
            <div className="panel-eyebrow">
              <span>OBSERVATION {String(index + 1).padStart(2, '0')}</span>
              <span>{sourceLabel}</span>
            </div>
            <h2>{getObservationLabel(selected)}</h2>
            <div className="source-photo">
              {selected.image && failedImageId !== selected.id ? (
                <img
                  src={`/${selected.image}`}
                  alt={`${selected.title} source observation`}
                  onError={() => setFailedImageId(selected.id)}
                />
              ) : (
                <div className="photo-empty">
                  <ImageOff size={28} />
                  <span>Source image unavailable</span>
                </div>
              )}
            </div>
            <div
              className={`assessment-result ${state.status === 'error' ? 'failed' : tone}`}
              aria-live="polite"
            >
              <div className="result-heading">
                <span className="result-symbol">
                  {state.status === 'analyzing' ? (
                    <Activity size={20} className="pulse" />
                  ) : tone === 'urgent' ? (
                    <Radio size={20} />
                  ) : state.status === 'closed' ? (
                    <CheckCheck size={20} />
                  ) : (
                    <Waves size={20} />
                  )}
                </span>
                <strong role="status">{getObservationStatusLabel(state)}</strong>
              </div>
              {state.error ? (
                <p className="model-error" role="alert">
                  {state.error}
                </p>
              ) : state.status === 'analyzing' ? (
                <>
                  <p>
                    {state.analyzingStage === 'assistance'
                      ? 'Assessing whether assistance is needed…'
                      : 'Screening this observation for flooding…'}
                  </p>
                  <div className="analysis-progress" />
                  <small>Waiting for the vision model</small>
                </>
              ) : (
                <p className="model-answer">
                  {latest?.reason ??
                    'Analyze this photo to check for flooding and people who may need help.'}
                </p>
              )}
              {latest?.notice && <small className="model-notice">{latest.notice}</small>}
              {latest && state.status !== 'analyzing' && (
                <span className="confidence">
                  {latest.confidence.charAt(0).toUpperCase() + latest.confidence.slice(1)}{' '}
                  confidence
                </span>
              )}
            </div>
            {(state.status === 'response' || state.status === 'arrived') && (
              <div className="response-confirmation">
                <Check size={14} />
                <span>Simulated response notification sent</span>
              </div>
            )}
            {state.mission && <DroneMissionDetails mission={state.mission} />}
            {state.result && (
              <details className="evidence-details">
                <summary>Assessment details</summary>
                <div className="evidence-item">
                  <strong>Flood screening</strong>
                  <span>
                    {state.result.finding === 'yes'
                      ? 'Flooding detected'
                      : state.result.finding === 'no'
                        ? 'No flooding detected'
                        : 'Review required'}{' '}
                    · {state.result.confidence} confidence
                  </span>
                  {(latest !== state.result || state.error) && <p>{state.result.reason}</p>}
                </div>
                {state.assistance ? (
                  <div className="evidence-item">
                    <strong>Assistance assessment</strong>
                    <span>
                      {state.assistance.finding === 'yes'
                        ? 'Assistance needed'
                        : state.assistance.finding === 'no'
                          ? 'No assistance needed'
                          : 'Assistance uncertain'}{' '}
                      · {state.assistance.confidence} confidence
                    </span>
                    {latest !== state.assistance && <p>{state.assistance.reason}</p>}
                  </div>
                ) : (
                  state.status === 'closed' && <p>Not required — no flooding detected</p>
                )}
              </details>
            )}
            {state.history.length > 1 && (
              <details className="history-details">
                <summary>
                  Activity <span>{state.history.length} events</span>
                </summary>
                <ol>
                  {state.history.slice(1).map((event, i) => (
                    <li key={i}>{event}</li>
                  ))}
                </ol>
              </details>
            )}
          </div>
          <div className="panel-actions">
            {state.status === 'response' ? (
              <button
                className="primary-action urgent"
                onClick={markResponseArrived}
                disabled={state.mission?.phase !== 'on-site'}
              >
                <CheckCheck size={17} />
                Mark response team arrived
              </button>
            ) : state.status === 'arrived' ? (
              <div className="action-complete">
                <CheckCheck size={17} />
                Response team arrived
              </div>
            ) : state.status === 'closed' ? (
              <div className="action-complete">
                <CheckCheck size={17} />
                Assessment complete
              </div>
            ) : state.status === 'possible-danger' ? (
              <div className="action-complete warning">
                <Radio size={17} />
                Drone inspection in progress
              </div>
            ) : state.status === 'review' && state.droneAssessment ? (
              <div className="review-actions">
                <button className="primary-action urgent" onClick={recommendResponse}>
                  Assistance needed
                </button>
                <button className="secondary-action" onClick={closeReview}>
                  No response needed
                </button>
                <button
                  className="text-action"
                  onClick={retryDroneAssessment}
                  disabled={state.droneRetried}
                >
                  {state.droneRetried ? 'Retry used' : 'Retry drone assessment'}
                </button>
              </div>
            ) : state.status === 'review' ? (
              <div className="review-actions">
                <button className="primary-action" onClick={confirmFlood}>
                  Flood confirmed
                </button>
                <button className="secondary-action" onClick={markNoFlood}>
                  No flood
                </button>
                <button
                  className="text-action"
                  onClick={() => void runAnalysis(true)}
                  disabled={state.floodRetried}
                >
                  {state.floodRetried ? 'Retry used' : 'Retry flood assessment'}
                </button>
              </div>
            ) : (
              <button
                className="primary-action"
                onClick={() => void runAnalysis()}
                disabled={state.status === 'analyzing'}
              >
                <Play size={16} />
                {state.status === 'analyzing'
                  ? 'Analyzing…'
                  : state.status === 'error'
                    ? 'Retry analysis'
                    : 'Run analysis'}
              </button>
            )}
            {state.result?.source === 'recorded-model' && (
              <button
                className="text-action live-retry"
                disabled={isAnalyzing}
                onClick={() => void runAnalysis(false, true)}
              >
                Request fresh live analysis
              </button>
            )}
            <button
              className="text-action reset-action"
              disabled={isAnalyzing}
              onClick={() => {
                if (!isAnalyzing)
                  setObservationStates((previous) => ({
                    ...previous,
                    [selected.id]: createInitialObservationState(),
                  }));
              }}
            >
              Reset observation
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
