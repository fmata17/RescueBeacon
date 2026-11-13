import { useEffect, useState } from 'react';
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet';
import { divIcon, latLngBounds } from 'leaflet';
import type { Observation } from './assessment';
import { droneBases, missionLabel, type DroneMission, type Coordinate } from './mission';
import 'leaflet/dist/leaflet.css';

const names: Record<string, string> = { 'no-flood': 'Dry roadway', assistance: 'People on rooftop', 'drone-clear': 'Flooded parking lot', 'operator-review': 'Flooded neighborhood' };
const droneSvg = '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2"><path d="m10 10 12 12M22 10 10 22"/><rect x="12" y="12" width="8" height="8" rx="2" fill="currentColor"/><circle cx="8" cy="8" r="5"/><circle cx="24" cy="8" r="5"/><circle cx="8" cy="24" r="5"/><circle cx="24" cy="24" r="5"/></svg>';
const droneIcon = divIcon({ className: 'flying-drone', html: droneSvg, iconSize: [42, 42], iconAnchor: [21, 21] });

function Focus({ observations, selected, mission }: { observations: Observation[]; selected: Observation; mission?: DroneMission }) {
  const map = useMap();
  useEffect(() => {
    const points: Coordinate[] = mission?.assignment ? [mission.assignment.base.position, mission.assignment.destination] : observations.flatMap((item) => item.latitude !== null && item.longitude !== null ? [[item.latitude, item.longitude] as Coordinate] : []);
    if (points.length) map.flyToBounds(latLngBounds(points), { paddingTopLeft: [80, 110], paddingBottomRight: [80, 170], maxZoom: mission?.assignment ? 14 : 12, duration: .8 });
    else map.setView([29.85, -95.4], 10);
  }, [map, selected.id, mission?.startedAt]);
  return null;
}

export default function ObservationMap({ observations, selected, statuses, tones, onSelect, missions = {} }: { observations: Observation[]; selected: Observation; statuses: Record<string, string>; tones: Record<string, string>; onSelect: (id: string) => void; missions?: Record<string, DroneMission> }) {
  const [tileError, setTileError] = useState(false);
  return <>
    <MapContainer center={[29.78, -95.4]} zoom={12} zoomControl={false} className="county-map" scrollWheelZoom>
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" eventHandlers={{ tileerror: () => setTileError(true), load: () => setTileError(false) }}/>
      <Focus observations={observations} selected={selected} mission={missions[selected.id]}/>
      {observations.filter((item) => item.latitude !== null && item.longitude !== null).map((item, i) => {
        const tone = tones[item.id] ?? 'neutral';
        return <Marker key={`${item.id}-${statuses[item.id]}`} position={[item.latitude!, item.longitude!]} title={`${item.title} · ${statuses[item.id]} · ${item.latitude}, ${item.longitude}`} zIndexOffset={selected.id === item.id ? 200 : 0} icon={divIcon({ className: `hotspot ${tone} ${selected.id === item.id ? 'selected' : ''}`, html: `<span aria-hidden="true">${tone === 'urgent' ? '!' : String(i + 1).padStart(2, '0')}</span>`, iconSize: [34, 34], iconAnchor: [17, 17] })} eventHandlers={{ click: () => onSelect(item.id) }}><Tooltip permanent direction="top" offset={[0, -23]} className={`hotspot-tag ${tone} ${selected.id === item.id ? 'selected' : ''}`}><span>{names[item.scenario] ?? item.title}</span>{selected.id === item.id && <small>{tone === 'urgent' ? 'Support needed' : tone === 'warning' ? 'Drone inspection' : tone === 'clear' ? 'No response needed' : 'Photo selected'}</small>}</Tooltip></Marker>;
      })}
      {droneBases.map((base) => <Marker key={base.id} position={base.position} title={`Drone hub ${base.id.split('-')[1]}`} icon={divIcon({ className: 'hub-marker', html: '<span>H</span>', iconSize: [26, 26], iconAnchor: [13, 13] })}><Tooltip>Drone hub {base.id.split('-')[1]} · illustrative base</Tooltip></Marker>)}
      {Object.entries(missions).map(([id, mission]) => <MissionMap key={id} mission={mission}/>)}
      <MapControls/>
    </MapContainer>
    {tileError && <div className="map-error" role="status">Map tiles unavailable. Check your internet connection.</div>}
  </>;
}

function MissionMap({ mission }: { mission: DroneMission }) {
  if (!mission.assignment) return null;
  const { base, destination } = mission.assignment;
  const position: Coordinate = [base.position[0] + (destination[0] - base.position[0]) * mission.progress, base.position[1] + (destination[1] - base.position[1]) * mission.progress];
  return <>
    <Polyline positions={[base.position, destination]} pathOptions={{ color: '#237a98', weight: 2, dashArray: '5 8', opacity: .45 }}/>
    {mission.phase !== 'complete' && <><Polyline positions={[base.position, position]} pathOptions={{ color: '#167e9c', weight: 4, opacity: .85 }}/><Marker position={position} zIndexOffset={1000} title={`Simulated drone · ${missionLabel(mission)}`} icon={droneIcon}><Tooltip direction="bottom" className="drone-tag">{mission.phase === 'en-route' ? 'Drone en route' : mission.phase === 'inspecting' ? 'Inspecting photo location' : 'Drone on site'}</Tooltip></Marker></>}
  </>;
}

function MapControls() {
  const map = useMap();
  return <div className="map-controls"><button aria-label="Zoom in" onClick={() => map.zoomIn()}>+</button><button aria-label="Zoom out" onClick={() => map.zoomOut()}>−</button></div>;
}
