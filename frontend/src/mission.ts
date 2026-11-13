import type { Observation } from './assessment';

export type Coordinate = [number, number];
export type DroneBase = { id: string; name: string; position: Coordinate };
// Approximate demo anchors only. Station addresses were checked against the City list:
// https://www.houstontx.gov/fire/about/firestations.html
export const baseSource = 'https://www.houstontx.gov/fire/about/firestations.html';
export const droneBases: DroneBase[] = [
  { id: 'station-8', name: 'Illustrative base near Station 8', position: [29.7485, -95.3705] },
  { id: 'station-13', name: 'Illustrative base near Station 13', position: [29.8285, -95.4389] },
  { id: 'station-37', name: 'Illustrative base near Station 37', position: [29.7035, -95.4396] },
];

export type DroneMission = {
  phase: 'en-route' | 'inspecting' | 'on-site' | 'complete';
  startedAt: number;
  progress: number;
  assignment: { base: DroneBase; destination: Coordinate; distanceKm: number } | null;
};

function distanceKm(a: Coordinate, b: Coordinate) {
  const radians = Math.PI / 180;
  const deltaLat = (b[0] - a[0]) * radians;
  const deltaLng = (b[1] - a[1]) * radians;
  const arc = Math.sin(deltaLat / 2) ** 2 + Math.cos(a[0] * radians) * Math.cos(b[0] * radians) * Math.sin(deltaLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(arc), Math.sqrt(1 - arc));
}

export function startDroneMission(observation: Observation): DroneMission {
  let assignment: DroneMission['assignment'] = null;
  if (observation.latitude !== null && observation.longitude !== null) {
    const destination: Coordinate = [observation.latitude, observation.longitude];
    assignment = droneBases.map((base) => ({ base, destination, distanceKm: distanceKm(base.position, destination) })).sort((a, b) => a.distanceKm - b.distanceKm)[0];
  }
  return { phase: 'en-route', startedAt: Date.now(), progress: 0, assignment };
}

export const missionLabel = (mission: DroneMission) => ({
  'en-route': 'En route', inspecting: 'Inspecting observation',
  'on-site': 'On site · awaiting response team', complete: 'Mission complete · response team arrived',
})[mission.phase];

// Fixed presentation pacing, unrelated to distance or real travel time.
export function advanceDroneMission(mission: DroneMission, now: number): { mission: DroneMission; events: string[] } {
  if (mission.phase === 'complete' || mission.phase === 'on-site') return { mission, events: [] };
  const elapsed = Math.max(0, now - mission.startedAt);
  const phase = elapsed >= 6000 ? 'on-site' : elapsed >= 4000 ? 'inspecting' : 'en-route';
  const progress = Math.min(1, elapsed / 4000);
  const events: string[] = [];
  if (mission.phase === 'en-route' && phase !== 'en-route') events.push('Simulated drone inspection: maintaining a view of the observation.');
  if (phase === 'on-site') events.push('Simulated drone remains on site until the presenter marks response team arrival.');
  return { mission: { ...mission, phase, progress }, events };
}
