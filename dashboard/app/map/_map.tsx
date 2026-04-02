"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, CircleMarker, Circle, Popup, useMap } from "react-leaflet";
import { formatDistanceToNow } from "date-fns";
import PlanLayer from "./_plan";
import type { PlanNode, PoiResult } from "./_plan";

export interface ExternalNodeData {
  id: string;
  name: string | null;
  lat: number;
  lng: number;
}

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
// OKC range estimate: T-Beam/Heltec stock rubber duck (2.15 dBi), 17 dBm Tx,
// LongFast SF11 sensitivity −126 dBm → 143 dB link budget.
// Suburban flat-terrain path loss n≈2.8 → ~4.5 km. Rounded to 4 km for
// conservative desk-level indoor placement in OKC metro.
const RF_RADIUS_M = 4000;

// ── Fog of War ──────────────────────────────────────────────────────────────
// Canvas layer that covers the map with a dark overlay and punches soft-edged
// reveal holes at online node coverage zones using destination-out compositing.
function FogLayer({ nodes }: { nodes: MapNodeData[] }) {
  const map = useMap();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = document.createElement("canvas");
    canvas.style.cssText =
      "position:absolute;top:0;left:0;pointer-events:none;z-index:450;";
    map.getContainer().appendChild(canvas);
    canvasRef.current = canvas;

    function redraw() {
      const size = map.getSize();
      canvas.width = size.x;
      canvas.height = size.y;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.clearRect(0, 0, size.x, size.y);

      // Dark fog fill
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "rgba(8, 10, 16, 0.82)";
      ctx.fillRect(0, 0, size.x, size.y);

      // Punch soft-edged holes at online node positions
      ctx.globalCompositeOperation = "destination-out";

      const zoom = map.getZoom();
      const centerLat = map.getCenter().lat;
      const metersPerPx =
        (156543.03392 * Math.cos((centerLat * Math.PI) / 180)) /
        Math.pow(2, zoom);
      const revealPx = RF_RADIUS_M / metersPerPx;

      for (const node of nodes.filter((n) => n.isOnline)) {
        const pt = map.latLngToContainerPoint([node.lat, node.lng]);
        const inner = revealPx * 0.35;

        const grad = ctx.createRadialGradient(
          pt.x, pt.y, inner,
          pt.x, pt.y, revealPx
        );
        grad.addColorStop(0, "rgba(0,0,0,1)");
        grad.addColorStop(0.65, "rgba(0,0,0,0.95)");
        grad.addColorStop(1, "rgba(0,0,0,0)");

        ctx.beginPath();
        ctx.arc(pt.x, pt.y, revealPx, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
      }

      ctx.globalCompositeOperation = "source-over";
    }

    map.on("move", redraw);
    map.on("resize", redraw);
    redraw();

    return () => {
      map.off("move", redraw);
      map.off("resize", redraw);
      if (canvasRef.current && map.getContainer().contains(canvasRef.current)) {
        map.getContainer().removeChild(canvasRef.current);
      }
      canvasRef.current = null;
    };
  }, [map, nodes]);

  return null;
}

export default function MapView({
  nodes,
  fogEnabled,
  externalNodes = [],
  planMode = false,
  planNodes = [],
  onPlanNodesChange,
  selectedPlanNodeId = null,
  onSelectPlanNode,
  pois = [],
}: {
  nodes: MapNodeData[];
  fogEnabled: boolean;
  externalNodes?: ExternalNodeData[];
  planMode?: boolean;
  planNodes?: PlanNode[];
  onPlanNodesChange?: (nodes: PlanNode[]) => void;
  selectedPlanNodeId?: string | null;
  onSelectPlanNode?: (id: string | null) => void;
  pois?: PoiResult[];
}) {
  return (
    <MapContainer
      center={OKC_CENTER}
      zoom={11}
      style={{ height: "calc(100vh - 73px)", width: "100%", background: "#111318" }}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        maxZoom={19}
      />

      {fogEnabled && <FogLayer nodes={nodes} />}

      {/* Ally/external relay nodes — visible dashed markers with range ring */}
      {externalNodes.map((ext) => (
        <span key={ext.id}>
          {/* Faint range ring — same 4km estimate as guild nodes */}
          <Circle
            center={[ext.lat, ext.lng]}
            radius={RF_RADIUS_M}
            pathOptions={{
              color: "#94a3b8",
              weight: 1,
              opacity: 0.18,
              fillColor: "#94a3b8",
              fillOpacity: 0.03,
            }}
          />
          <CircleMarker
            center={[ext.lat, ext.lng]}
            radius={11}
            pathOptions={{
              color: "#94a3b8",
              weight: 2,
              dashArray: "5 4",
              fillColor: "#1e2535",
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
              <div style={{ fontWeight: "bold", marginBottom: "4px", color: "#94a3b8" }}>
                {ext.name ?? ext.id}
              </div>
              <div style={{ color: "#94a3b8", fontSize: "11px" }}>EXTERNAL RELAY</div>
              <div style={{ color: "#6b7280", fontSize: "10px", marginTop: "2px" }}>Not in guild — mesh ally</div>
            </div>
          </Popup>
          </CircleMarker>
        </span>
      ))}

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

      {planMode && (
        <PlanLayer
          nodes={planNodes}
          onNodesChange={onPlanNodesChange ?? (() => {})}
          selectedNodeId={selectedPlanNodeId}
          onSelectNode={onSelectPlanNode ?? (() => {})}
          pois={pois}
        />
      )}
    </MapContainer>
  );
}
