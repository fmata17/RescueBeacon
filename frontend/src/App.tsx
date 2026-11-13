import { useEffect, useState } from 'react';
import { Activity, ArrowRight, Check, CheckCheck, ChevronDown, CircleHelp, Crosshair, ImageOff, Layers, MapPin, Play, Radio, ShieldCheck, Waves } from 'lucide-react';
import manifest from '../../images/manifest.json';
import { demoAssessment, simulatedDroneAssessment, type Assessment, type AssessmentBoundary, type Observation } from './assessment';
import ObservationMap from './ObservationMap';
import DroneMissionDetails from './DroneMissionDetails';
import { advanceDroneMission, startDroneMission, type DroneMission } from './mission';
import './styles.css';

type CaseState = { analyzingStage?: 'flood' | 'assistance'; status: 'ready' | 'analyzing' | 'closed' | 'review' | 'error' | 'response' | 'arrived' | 'possible-danger'; result?: Assessment; assistance?: Assessment; droneAssessment?: Assessment; closure?: 'no-response'; responseBy?: 'automatic' | 'operator'; droneRetried?: boolean; floodRetried?: boolean; mission?: DroneMission; error?: string; history: string[] };
const initialCase = (): CaseState => ({ status: 'ready', history: ['Observation added to the review queue.'] });
const statusLabel = (state: CaseState) => ({ ready: 'Ready to analyze', analyzing: 'Analyzing', closed: state.closure === 'no-response' ? 'Closed · No response needed' : 'Closed · No flood', review: 'Operator review', error: 'Analysis failed', response: 'Response recommended', arrived: 'Response team arrived', 'possible-danger': 'Possible danger · Drone inspection' })[state.status];
const descriptions = ['A clear observation with no visible flooding.', 'Flooding with a clear need for assistance.', 'A closer look resolves possible danger.', 'Additional evidence needs an operator decision.'];

export default function App({ assess = demoAssessment, observations = manifest as Observation[] }: { assess?: AssessmentBoundary; observations?: Observation[] }) {
  const [selectedId, setSelectedId] = useState(observations[0]?.id);
  const [cases, setCases] = useState<Record<string, CaseState>>({});
  const [imageFailed, setImageFailed] = useState<string | null>(null);
  const hasMovingMission = Object.values(cases).some((item) => item.mission?.phase === 'en-route' || item.mission?.phase === 'inspecting');
  useEffect(() => {
    if (!hasMovingMission) return;
    const timer = window.setInterval(() => setCases((previous) => Object.fromEntries(Object.entries(previous).map(([id, item]) => {
      if (!item.mission) return [id, item];
      const next = advanceDroneMission(item.mission, Date.now());
      if (item.status === 'possible-danger' && next.mission.phase === 'on-site') {
        const observation = observations.find((entry) => entry.id === id);
        if (!observation) return [id, item];
        const droneAssessment = simulatedDroneAssessment(observation.scenario);
        const cleared = droneAssessment.finding === 'no' && droneAssessment.confidence === 'high';
        return [id, {
          ...item, status: cleared ? 'closed' : 'review', closure: cleared ? 'no-response' : undefined, droneAssessment,
          mission: { ...next.mission, phase: cleared ? 'complete' : 'on-site' },
          history: [...item.history, ...next.events, `Simulated drone assistance assessment: ${cleared ? 'no assistance needed' : 'review required'} · ${droneAssessment.confidence} confidence.`, cleared ? 'Case closed. No response needed after simulated drone inspection.' : 'Drone assessment requires operator review.'],
        } satisfies CaseState];
      }
      return [id, next.mission === item.mission ? item : { ...item, mission: next.mission, history: [...item.history, ...next.events] }];
    }))), 200);
    return () => window.clearInterval(timer);
  }, [hasMovingMission, observations]);
  const selected = observations.find((item) => item.id === selectedId) ?? observations[0];
  if (!selected) return <main className="empty-workspace">No observations in the image manifest.</main>;
  const state = cases[selected.id] ?? initialCase();
  const index = observations.findIndex((item) => item.id === selected.id);
  const coordinates = selected.latitude !== null && selected.longitude !== null;
  const closedCount = Object.values(cases).filter((item) => item.status === 'closed' || item.status === 'arrived').length;

  async function runAnalysis(retryFlood = false) {
    if (retryFlood && (state.status !== 'review' || state.droneAssessment || state.floodRetried)) return;
    const current = { ...state, error: undefined, floodRetried: state.floodRetried || retryFlood };
    const observationId = selected.id;
    let history = [...state.history, ...(retryFlood && state.result ? [`Previous flood assessment: ${state.result.finding} · ${state.result.confidence} confidence · ${state.result.source}. ${state.result.reason}`, 'Operator requested the single flood assessment retry.'] : []), 'Flood screening started.'];
    let result: Assessment | undefined = state.result;
    setCases((previous) => ({ ...previous, [observationId]: { ...current, analyzingStage: 'flood', status: 'analyzing', history } }));
    try {
      result = await assess({ observationId, stage: 'flood' });
      const closed = result.finding === 'no' && result.confidence === 'high';
      history = [...history, `Flood assessment: ${result.finding === 'no' ? 'no flooding detected' : result.finding === 'yes' ? 'flooding detected' : 'review required'} · ${result.confidence} confidence.`];
      if (result.finding === 'yes' && result.confidence === 'high') {
        await runAssistance(selected, { ...current, status: 'analyzing', result, history });
        return;
      }
      setCases((previous) => ({ ...previous, [observationId]: {
        ...current, status: closed ? 'closed' : 'review', result,
        history: [...history, closed ? 'Case closed. No drone mission or response notification required.' : 'Assessment requires operator review.'],
      } }));
    } catch (error) {
      setCases((previous) => ({ ...previous, [observationId]: { ...current, status: 'error', result, history: [...history, 'Analysis failed. No automatic case decision made.'], error: error instanceof Error ? error.message : 'Analysis could not be completed.' } }));
    }
  }

  async function runAssistance(observation: Observation, current: CaseState) {
    try {
        const history = [...current.history, 'Assistance assessment started · Initial image.'];
        setCases((previous) => ({ ...previous, [observation.id]: { ...current, analyzingStage: 'assistance', status: 'analyzing', history } }));
        const assistance = await assess({ observationId: observation.id, stage: 'assistance' });
        const response = assistance.finding === 'yes' && assistance.confidence === 'high';
        const possibleDanger = assistance.finding === 'uncertain' || assistance.confidence !== 'high';
        const mission = response || possibleDanger ? startDroneMission(observation, response ? 'response' : 'inspection') : undefined;
        setCases((previous) => ({ ...previous, [observation.id]: {
          ...current, responseBy: response ? 'automatic' : undefined, status: response ? 'response' : possibleDanger ? 'possible-danger' : 'closed', closure: !response && !possibleDanger ? 'no-response' : undefined, assistance, mission,
          history: [...history, `Assistance assessment: ${response ? 'assistance needed' : possibleDanger ? 'possible danger' : 'no assistance needed'} · ${assistance.confidence} confidence.`, response ? 'Simulated response notification sent automatically. No emergency service contacted.' : possibleDanger ? 'Possible danger. A flooded vehicle alone does not confirm assistance is needed. Simulated drone inspection requested.' : 'Case closed. No response needed.', ...(mission ? [mission.assignment ? `Simulated drone launched from ${mission.assignment.base.name.toLowerCase()}.` : 'Simulated drone mission started. Location pending; no geographic route drawn.'] : [])],
        } }));
    } catch (error) {
      setCases((previous) => ({ ...previous, [observation.id]: { ...current, status: 'error', history: [...current.history, 'Assistance assessment failed. No automatic case decision made.'], error: error instanceof Error ? error.message : 'Assessment could not be completed.' } }));
    }
  }

  function confirmFlood() {
    if (state.status !== 'review' || state.droneAssessment || !state.result) return;
    void runAssistance(selected, { ...state, history: [...state.history, 'Operator confirmed flooding. Assistance assessment may proceed.'] });
  }

  function markNoFlood() {
    setCases((previous) => {
      const current = previous[selected.id];
      if (current?.status !== 'review' || current.droneAssessment) return previous;
      return { ...previous, [selected.id]: { ...current, status: 'closed', history: [...current.history, 'Operator marked no flood. Case closed without a drone mission or response notification.'] } };
    });
  }

  function recommendResponse() {
    setCases((previous) => {
      const current = previous[selected.id];
      if (current?.status !== 'review' || !current.droneAssessment || !current.mission) return previous;
      return { ...previous, [selected.id]: { ...current, status: 'response', responseBy: 'operator',
        mission: { ...current.mission, purpose: 'response' },
        history: [...current.history, 'Operator marked assistance needed. Simulated response notification sent. No emergency service contacted.', 'Simulated drone remains on site until the presenter marks response team arrival.'],
      } };
    });
  }

  function closeReview() {
    setCases((previous) => {
      const current = previous[selected.id];
      if (current?.status !== 'review' || !current.droneAssessment) return previous;
      return { ...previous, [selected.id]: { ...current, status: 'closed', closure: 'no-response',
        mission: current.mission ? { ...current.mission, phase: 'complete' } : undefined,
        history: [...current.history, 'Operator closed the case. No response needed. Simulated drone mission ended.'],
      } };
    });
  }

  function retryDroneAssessment() {
    setCases((previous) => {
      const current = previous[selected.id];
      if (current?.status !== 'review' || !current.droneAssessment || current.droneRetried) return previous;
      const droneAssessment = simulatedDroneAssessment(selected.scenario);
      return { ...previous, [selected.id]: { ...current, droneRetried: true, droneAssessment,
        history: [...current.history, `Previous simulated drone assessment: ${current.droneAssessment.finding} · ${current.droneAssessment.confidence} confidence. ${current.droneAssessment.reason}`, 'Operator requested the single simulated drone retry.', `Simulated drone retry: ${droneAssessment.finding} · ${droneAssessment.confidence} confidence. ${droneAssessment.reason}`],
      } };
    });
  }

  function markResponseArrived() {
    setCases((previous) => {
      const current = previous[selected.id];
      if (!current?.mission || current.mission.phase !== 'on-site') return previous;
      return { ...previous, [selected.id]: { ...current, status: 'arrived', mission: { ...current.mission, phase: 'complete' }, history: [...current.history, 'Presenter marked simulated response team arrival. Drone mission ended.'] } };
    });
  }

  return <div className="app-shell">
    <aside className="nav-rail" aria-label="Workspace navigation">
      <a className="brand-mark" href="./" aria-label="RescueBeacon home"><Radio size={27} strokeWidth={1.8}/></a>
      <div className="rail-separator"/>
      <div className="rail-item active" title="Observations"><Layers size={21}/><span>Cases</span></div>
      <div className="rail-bottom"><ShieldCheck size={21}/><span>Demo</span></div>
    </aside>
    <div className="workspace">
      <header className="topbar">
        <div className="wordmark">Rescue<span>Beacon</span><span className="wordmark-divider"/><span className="workspace-name">Operations console</span></div>
        <div className="topbar-right"><span className="demo-pill"><i/>Demo mode</span><span className="operator-avatar" title="Demo operator">OP</span></div>
      </header>
      <div className="simulation-banner"><ShieldCheck size={14}/><span>Simulation workspace</span><span className="banner-copy">Scripted assessments. No live drone or emergency dispatch.</span></div>
      <main className="console">
        <section className="case-panel" aria-label="Observation queue">
          <div className="section-eyebrow">OPERATIONS / HARRIS COUNTY</div>
          <h1>Observations<span className="count-badge">{observations.length}</span></h1>
          <p className="section-description">A clearer picture. A considered response.</p>
          <div className="queue-summary"><span><i className="status-dot teal"/>{observations.length - closedCount} in queue</span><span><i className="status-dot gray"/>{closedCount} closed</span></div>
          <label className="field-label" htmlFor="scenario">SCENARIO</label>
          <div className="select-wrap"><select id="scenario" aria-label="Scenario" value={selected.id} onChange={(event) => setSelectedId(event.target.value)}>{observations.map((item, i) => <option key={item.id} value={item.id}>{String(i + 1).padStart(2, '0')} — {item.title}</option>)}</select><ChevronDown size={15}/></div>
          <div className="list-label"><span>CASE QUEUE</span><span>{observations.length} observations</span></div>
          <div className="case-list">{observations.map((item, i) => {
            const itemState = cases[item.id] ?? initialCase();
            return <button key={item.id} className={`case-card ${selected.id === item.id ? 'selected' : ''}`} onClick={() => setSelectedId(item.id)}>
              <div className="case-card-top"><span className="case-number">OBS–{String(i + 1).padStart(3, '0')}</span>{selected.id === item.id && <ArrowRight size={15}/>}</div>
              <h2>{item.title}</h2><p>{descriptions[i] ?? 'Curated observation'}</p>
              <span className={`case-status ${itemState.status}`}><i className="status-dot"/>{statusLabel(itemState)}</span>
            </button>;
          })}</div>
          <div className="queue-footer"><CircleHelp size={16}/><p>Curated demo observations.<br/>Image handoff is pending.</p></div>
        </section>
        <section className="map-section" aria-label="Harris County observation map">
          <ObservationMap observations={observations} selected={selected} statuses={Object.fromEntries(observations.map((item) => [item.id, statusLabel(cases[item.id] ?? initialCase())]))} onSelect={setSelectedId} missions={Object.fromEntries(Object.entries(cases).flatMap(([id, item]) => item.mission ? [[id, item.mission]] : []))}/>
          <div className="map-heading"><span className="map-kicker"><i/>AREA OF INTEREST</span><h2>Harris County<span>, Texas</span></h2><p><MapPin size={12}/>29.85° N · 95.40° W <span>Map center</span></p></div>
          <div className="map-location-note"><span className="map-note-icon"><Crosshair size={19}/></span><div><strong>{coordinates ? 'Observation location available' : 'Observation location pending'}</strong><p>{coordinates ? 'Marker uses the supplied image coordinates.' : 'No observation markers without supplied coordinates.'}</p></div></div>
          <div className="map-legend" aria-label="Map status legend"><span><i className="status-dot gray"/>No flood / closed</span><span><i className="status-dot yellow"/>Possible danger / review</span><span><i className="status-dot red"/>Response recommended</span></div>
        </section>
        <section className="details-panel" aria-label="Observation details">
          <div className="details-scroll">
            <div className="detail-topline"><span><span className="live-dot"/>SELECTED OBSERVATION</span><span>{String(index + 1).padStart(2, '0')} / {String(observations.length).padStart(2, '0')}</span></div>
            <h2 className="detail-title">{selected.title}</h2>
            <div className="detail-meta"><span>OBS–{String(index + 1).padStart(3, '0')}</span><span>Harris County, TX</span></div>
            <div className="observation-image">{selected.image && imageFailed !== selected.id ? <img src={`/${selected.image}`} alt={`${selected.title} source observation`} onError={() => setImageFailed(selected.id)}/> : <div className="image-placeholder"><div className="placeholder-frame"><ImageOff size={26} strokeWidth={1.25}/></div><strong>{selected.image ? 'Image unavailable' : 'Image pending'}</strong><span>{selected.image ? 'The supplied image could not be loaded.' : 'Curated source image has not been supplied.'}</span><span className="placeholder-label">PLACEHOLDER · NO IMAGE EVIDENCE</span></div>}</div>
            <div className="coordinate-row"><MapPin size={15}/><span>{coordinates ? `${selected.latitude!.toFixed(5)}, ${selected.longitude!.toFixed(5)}` : 'Coordinates pending'}</span><span className="metadata-tag">{coordinates ? 'Supplied metadata' : 'Not geolocated'}</span></div>
            <div className={`outcome-strip ${state.status}`} role="status"><span className="outcome-icon">{state.status === 'closed' ? <CheckCheck size={19}/> : state.status === 'analyzing' ? <Activity className="pulse" size={19}/> : <Waves size={19}/>}</span><div><strong>{statusLabel(state)}</strong><span>{state.status === 'closed' ? 'No further action is required.' : state.status === 'arrived' ? 'Simulated arrival confirmed by the presenter.' : state.status === 'response' ? state.responseBy === 'operator' ? 'Simulated response notified by operator decision.' : 'Simulated response notified automatically.' : state.status === 'possible-danger' ? 'Assistance is uncertain. A simulated drone is gathering more evidence.' : state.status === 'review' ? state.droneAssessment ? 'Resolve assistance uncertainty using the operator controls.' : 'Resolve flood uncertainty before assistance analysis.' : state.status === 'analyzing' ? state.analyzingStage === 'assistance' ? 'Assessing whether assistance is needed…' : 'Screening this observation for flooding…' : 'Start with a flood screening assessment.'}</span></div></div>
            <div className="assessment-heading"><h3>Assessment</h3><span className="source-label">{state.result?.source === 'local-model' ? 'Local model' : 'Demo · scripted'}</span></div>
            <div className="assessment-step"><span className={`step-icon ${state.result ? 'complete' : ''}`}>{state.result ? <Check size={13}/> : '1'}</span><div><div className="step-title"><h4>Flood screening</h4><span className="step-category">INITIAL IMAGE</span></div>{state.result ? <><div className="finding-row"><strong>{state.result.finding === 'no' ? 'No flooding detected' : state.result.finding === 'yes' ? 'Flooding detected' : 'Review required'}</strong><span className="confidence-label">{state.result.confidence.charAt(0).toUpperCase() + state.result.confidence.slice(1)} confidence</span></div><p>{state.result.reason}</p></> : <p>{state.status === 'analyzing' ? 'Analysis in progress…' : 'Waiting for analysis'}</p>}</div></div>
            <div className="assessment-connector"/>
            <div className="assessment-step"><span className={`step-icon ${state.assistance ? 'complete' : ''}`}>{state.assistance ? <Check size={13}/> : '2'}</span><div><div className="step-title"><h4>Assistance assessment</h4><span className="step-category">INITIAL IMAGE</span></div>{state.assistance ? <><div className="finding-row"><strong>{state.assistance.finding === 'yes' ? 'Assistance needed' : state.assistance.finding === 'no' ? 'No assistance needed' : 'Possible danger · Assistance uncertain'}</strong><span className="confidence-label">{state.assistance.confidence.charAt(0).toUpperCase() + state.assistance.confidence.slice(1)} confidence</span></div><p>{state.assistance.reason}</p></> : <p>{state.status === 'closed' ? 'Not required — no flooding detected' : state.status === 'analyzing' && state.analyzingStage === 'assistance' ? 'Assessment in progress…' : 'Follows a confirmed flood finding'}</p>}</div></div>
            {(state.status === 'response' || state.status === 'arrived') && <div className="response-notice"><strong>Simulated response notification sent</strong><p>No emergency service contacted.</p></div>}
            {state.droneAssessment && <div className="assessment-step drone-assessment"><span className="step-icon complete"><Check size={13}/></span><div><div className="step-title"><h4>Drone assistance assessment</h4><span className="step-category">SIMULATED DRONE</span></div><div className="finding-row"><strong>{state.droneAssessment.finding === 'no' ? 'No assistance needed' : 'Review required'}</strong><span className="confidence-label">{state.droneAssessment.confidence.charAt(0).toUpperCase() + state.droneAssessment.confidence.slice(1)} confidence</span></div><p>{state.droneAssessment.reason}</p></div></div>}
            {state.mission && <DroneMissionDetails mission={state.mission}/>}
            <div className="history-heading"><h3>Activity history</h3><span>{state.history.length} {state.history.length === 1 ? 'event' : 'events'}</span></div>
            <ol className="history-list">{state.history.map((event, eventIndex) => <li key={`${selected.id}-${eventIndex}`}><span className={`history-point ${eventIndex === state.history.length - 1 && state.status === 'closed' ? 'finished' : ''}`}>{eventIndex === state.history.length - 1 && state.status === 'closed' && <Check size={9}/>}</span><div><span className="event-label">{eventIndex === 0 ? 'OBSERVATION RECEIVED' : eventIndex === state.history.length - 1 && state.status === 'closed' ? 'CASE CLOSED' : 'ASSESSMENT'}</span><p>{event}</p></div></li>)}</ol>
            {state.error && <div className="error-notice" role="alert">{state.error}</div>}
          </div>
          <div className="detail-actions">{state.status === 'response' ? <button className="primary-button response-button" onClick={markResponseArrived} disabled={state.mission?.phase !== 'on-site'}><CheckCheck size={16}/>Mark response team arrived</button> : state.status === 'arrived' ? <div className="closed-action response-complete"><CheckCheck size={17}/>Simulated arrival confirmed</div> : state.status === 'closed' ? <div className="closed-action"><ShieldCheck size={17}/><span>Assessment complete</span><Check size={15}/></div> : state.status === 'possible-danger' ? <div className="closed-action inspection-action"><Radio size={17}/>Simulated inspection in progress</div> : state.status === 'review' && state.droneAssessment ? <div className="review-actions"><button className="primary-button response-button" onClick={recommendResponse}>Assistance needed</button><button className="secondary-button" onClick={closeReview}>Close case · No response needed</button><button className="secondary-button" onClick={retryDroneAssessment} disabled={state.droneRetried}>{state.droneRetried ? 'Simulated retry used' : 'Retry simulated assessment once'}</button></div> : state.status === 'review' ? <div className="review-actions"><button className="primary-button" onClick={confirmFlood}>Flood confirmed</button><button className="secondary-button" onClick={markNoFlood}>No flood</button><button className="secondary-button" onClick={() => void runAnalysis(true)} disabled={state.floodRetried}>{state.floodRetried ? 'Flood retry used' : 'Retry flood assessment once'}</button></div> : <button className="primary-button" onClick={() => void runAnalysis()} disabled={state.status === 'analyzing'}><Play size={15} fill="currentColor"/>{state.status === 'analyzing' ? 'Analyzing observation…' : state.status === 'error' ? 'Retry analysis' : 'Run analysis'}<ArrowRight size={16}/></button>}<p><span className="status-dot teal"/>Scripted demo · confidence labels are illustrative</p></div>
        </section>
      </main>
      <footer className="workspace-footer"><span><span className="status-dot teal"/>RescueBeacon <span className="footer-separator">/</span> Harris County demo</span><span>OBSERVE <ArrowRight size={10}/> ASSESS <ArrowRight size={10}/> RESPOND</span><span>All actions are simulated</span></footer>
    </div>
  </div>;
}
