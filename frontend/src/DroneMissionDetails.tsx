import { Radio } from 'lucide-react';
import { baseSource, missionLabel, type DroneMission } from './mission';

export default function DroneMissionDetails({ mission }: { mission: DroneMission }) {
  return <section className="mission-card" aria-label="Simulated drone mission">
    <div className="mission-heading"><Radio size={15}/><h3>Drone mission</h3><span>SIMULATED</span></div>
    <strong className="mission-status" role="status">{missionLabel(mission)}</strong>
    {mission.assignment ? <><p className="mission-base">{mission.assignment.base.name}</p><p>{mission.assignment.distanceKm.toFixed(1)} km straight-line distance</p><a href={baseSource} target="_blank" rel="noreferrer">Illustrative station anchors</a></> : <p>Location pending · scripted mission only</p>}
    <p className="mission-disclaimer">{mission.assignment ? 'Approximate demo base. Animation uses scripted pacing, with no measured ETA or real resource availability.' : 'No base assignment, distance, or map route without supplied coordinates. Status messages remain scripted.'}</p>
  </section>;
}
