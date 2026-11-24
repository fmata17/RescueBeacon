import { Radio } from 'lucide-react';
import { getMissionLabel, type DroneMission } from './mission';

export default function DroneMissionDetails({ mission }: { mission: DroneMission }) {
  return (
    <section className="mission-card" aria-label="Simulated drone mission">
      <div className="mission-top">
        <Radio size={17} />
        <strong>Drone {mission.assignment?.base.id.split('-')[1] ?? 'inspection'}</strong>
        <span>SIMULATED</span>
      </div>
      <p role="status">{getMissionLabel(mission)}</p>
      {mission.phase === 'en-route' && (
        <div
          className="flight-progress"
          role="progressbar"
          aria-label="Drone flight progress"
          aria-valuenow={Math.round(mission.progress * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span style={{ width: `${mission.progress * 100}%` }} />
        </div>
      )}
      {mission.assignment && (
        <small>
          Hub {mission.assignment.base.id.split('-')[1]} → photo location ·{' '}
          {mission.assignment.distanceKm.toFixed(1)} km
        </small>
      )}
    </section>
  );
}
