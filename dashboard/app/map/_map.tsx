"use client";

import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, CircleMarker, Circle, Popup } from "react-leaflet";
import { formatDistanceToNow } from "date-fns";

export interface MapNodeData {
  nodeId: string;
  lat: number;
  lng: number;
  longName: string | null;
  shortName: string | null;
  isOnline: boolean;
  lastSeen: string | null;
  uptimePct: number | null;
  operatorCallsign: string | null;
}

const OKC_CENTER: [number, number] = [35.4676, -97.5164];
const RF_RADIUS_M = 8046; // ~5 miles — approx LoRa range halo

export default function MapView({ nodes }: { nodes: MapNodeData[] }) {
  return (
    <MapContainer
      center={OKC_CENTER}
      zoom={11}
      style={{ height: "100%", width: "100%", background: "#111318" }}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        maxZoom={19}
      />

      {nodes.map((node) => (
        <span key={node.nodeId}>
          {/* RF influence halo — online nodes only */}
          {node.isOnline && (
            <Circle
              center={[node.lat, node.lng]}
              radius={RF_RADIUS_M}
              pathOptions={{
                color: "#f0b429",
                weight: 1,
                opacity: 0.25,
                fillColor: "#f0b429",
                fillOpacity: 0.06,
              }}
            />
          )}

          {/* Node marker */}
          <CircleMarker
            center={[node.lat, node.lng]}
            radius={node.isOnline ? 8 : 6}
            pathOptions={{
              color: node.isOnline ? "#00ff88" : "#ff4444",
              weight: 2,
              fillColor: node.isOnline ? "#00ff88" : "#ff4444",
              fillOpacity: 0.85,
            }}
          >
            <Popup>
              <div
                style={{
                  fontFamily: "monospace",
                  fontSize: "12px",
                  color: "#e0e0e0",
                  background: "#181b22",
                  padding: "4px 0",
                  minWidth: "160px",
                  lineHeight: "1.6",
                }}
              >
                <div style={{ fontWeight: "bold", marginBottom: "4px", color: "#e0e0e0" }}>
                  {node.longName ?? node.shortName ?? node.nodeId}
                </div>
                {node.operatorCallsign && (
                  <div style={{ color: "#d4a746", marginBottom: "4px" }}>
                    OP: {node.operatorCallsign}
                  </div>
                )}
                <div style={{ color: node.isOnline ? "#00ff88" : "#ff4444", marginBottom: "4px" }}>
                  {node.isOnline ? "● ONLINE" : "○ OFFLINE"}
                </div>
                {node.uptimePct !== null && (
                  <div style={{ color: "#6b7280" }}>
                    UPTIME: {node.uptimePct.toFixed(1)}%
                  </div>
                )}
                {node.lastSeen && (
                  <div style={{ color: "#6b7280" }}>
                    {formatDistanceToNow(new Date(node.lastSeen), { addSuffix: true })}
                  </div>
                )}
              </div>
            </Popup>
          </CircleMarker>
        </span>
      ))}
    </MapContainer>
  );
}
