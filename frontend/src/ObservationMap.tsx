import { useEffect, useState } from 'react';
import { MapContainer, Marker, TileLayer, Tooltip, useMap } from 'react-leaflet';
import { divIcon } from 'leaflet';
import type { Observation } from './assessment';
import 'leaflet/dist/leaflet.css';

function Focus({ observation }: { observation: Observation }) {
  const map = useMap();
  useEffect(() => {
    map.setView(observation.latitude !== null && observation.longitude !== null ? [observation.latitude, observation.longitude] : [29.85, -95.4], 10);
  }, [map, observation]);
  return null;
}

export default function ObservationMap({ observations, selected, statuses, onSelect }: { observations: Observation[]; selected: Observation; statuses: Record<string, string>; onSelect: (id: string) => void }) {
  const [tileError, setTileError] = useState(false);
  return <>
    <MapContainer center={[29.85, -95.4]} zoom={10} zoomControl={false} className="county-map" scrollWheelZoom>
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" eventHandlers={{ tileerror: () => setTileError(true), load: () => setTileError(false) }}/>
      <Focus observation={selected}/>
      {observations.filter((item) => item.latitude !== null && item.longitude !== null).map((item) => <Marker key={`${item.id}-${statuses[item.id]}`} position={[item.latitude!, item.longitude!]} title={`${item.title} · ${statuses[item.id]} · ${item.latitude}, ${item.longitude}`} icon={divIcon({ className: `observation-marker ${statuses[item.id].startsWith('Closed') ? 'closed' : 'pending'}`, html: '<span></span>', iconSize: [22, 22], iconAnchor: [11, 11] })} eventHandlers={{ click: () => onSelect(item.id) }}><Tooltip permanent direction="top" offset={[0, -10]}>{item.title} · {statuses[item.id]}</Tooltip></Marker>)}
      <MapControls/>
    </MapContainer>
    {tileError && <div className="map-error" role="status">Basemap unavailable. Check your internet connection.</div>}
  </>;
}

function MapControls() {
  const map = useMap();
  return <div className="map-controls"><button aria-label="Zoom in" onClick={() => map.zoomIn()}>+</button><button aria-label="Zoom out" onClick={() => map.zoomOut()}>−</button><button className="reset-map" aria-label="Reset to Harris County" onClick={() => map.setView([29.85, -95.4], 10)}>⌖</button></div>;
}
