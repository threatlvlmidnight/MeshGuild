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
  hw_model: string | null;
  role: string | null;
  altitude: number | null;
  precision: number | null;
  neighbor_count: number | null;
  last_seen: string | null;
  noted_at: string | null;
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

// ── Radio Noise Fog of War ───────────────────────────────────────────────────
// Two-canvas animated system:
//   noiseCanvas (z-447): scrolling green-tinted static grain — always visible
//   fogCanvas   (z-449): deep navy overlay with reveal holes, edge glow,
//                        scanlines, and sonar ping rings per online node.
//
// In dark areas:  navy overlay (87%) + noise grain (13%) = alive interference
// In reveal area: only noise (13%) bleeds through — feels like a weak signal lock

const NOISE_TILE_SIZE = 512;
const PING_PERIOD_MS  = 4000;  // ms between leading edge of each sonar sweep
const PING_DURATION_MS = 2600; // ms for one ring to expand and fade

/** Generate a one-time offscreen noise tile — sparse green-tinted pixels */
function makeNoiseTile(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = NOISE_TILE_SIZE;
  c.height = NOISE_TILE_SIZE;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(NOISE_TILE_SIZE, NOISE_TILE_SIZE);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (Math.random() > 0.80) {
      const b = Math.random();
      d[i]     = Math.floor(b * 8);           // R: near-black
      d[i + 1] = Math.floor(b * 110 + 30);   // G: 30–140, green tint
      d[i + 2] = Math.floor(b * 35);          // B: slight
      d[i + 3] = Math.floor(Math.random() * 38 + 8); // A: 8–46
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function FogLayer({ nodes, externalNodes }: { nodes: MapNodeData[]; externalNodes: ExternalNodeData[] }) {
  const map = useMap();
  const fogCanvasRef   = useRef<HTMLCanvasElement | null>(null);
  const noiseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef         = useRef<number>(0);
  const nodesRef       = useRef(nodes);
  const extNodesRef    = useRef(externalNodes);
  nodesRef.current    = nodes;         // always fresh inside the rAF loop
  extNodesRef.current = externalNodes;

  useEffect(() => {
    const noiseTile = makeNoiseTile();

    // Canvases live inside leaflet-map-pane so their z-indexes are in the same
    // stacking context as Leaflet panes (popup=700 > canvas=449 > overlay=400 > tile=200).
    // The pane is CSS-transformed during panning, so we:
    //   1. Extend canvases by BUFFER px on each side to avoid edge gaps while panning.
    //   2. Draw using latLngToLayerPoint (pane coordinate space) + BUFFER offset.
    const BUFFER = 512;

    const mapPane = map.getContainer().querySelector(".leaflet-map-pane") as HTMLElement
                    ?? map.getContainer();

    // ── Noise canvas (below fog) ───────────────────────────────────────────
    const nc = document.createElement("canvas");
    nc.style.cssText =
      `position:absolute;top:${-BUFFER}px;left:${-BUFFER}px;pointer-events:none;z-index:447;opacity:0.13;`;
    mapPane.appendChild(nc);
    noiseCanvasRef.current = nc;

    // ── Fog canvas (above noise, below Leaflet markers/popup) ─────────────
    const fc = document.createElement("canvas");
    fc.style.cssText =
      `position:absolute;top:${-BUFFER}px;left:${-BUFFER}px;pointer-events:none;z-index:449;`;
    mapPane.appendChild(fc);
    fogCanvasRef.current = fc;

    const nctx = nc.getContext("2d")!;
    const ctx  = fc.getContext("2d")!;

    let scanPattern: CanvasPattern | null = null;
    let lastW = 0;
    let lastH = 0;

    function buildScanPattern() {
      const sc = document.createElement("canvas");
      sc.width = 4; sc.height = 4;
      const sx = sc.getContext("2d")!;
      sx.fillStyle = "rgba(0,0,0,0.10)";
      sx.fillRect(0, 0, 4, 1);
      scanPattern = ctx.createPattern(sc, "repeat");
    }

    // Convert a lat/lng to canvas pixel coords within the buffered canvas.
    // latLngToLayerPoint gives coords in the pane's own space; adding BUFFER
    // shifts to the canvas's coordinate origin (offset -BUFFER,-BUFFER from pane).
    function toPt(lat: number, lng: number) {
      const lp = map.latLngToLayerPoint([lat, lng]);
      return { x: lp.x + BUFFER, y: lp.y + BUFFER };
    }

    function draw() {
      const now  = performance.now();
      const size = map.getSize();
      const W = size.x;
      const H = size.y;
      const BW = W + 2 * BUFFER; // buffered canvas width
      const BH = H + 2 * BUFFER; // buffered canvas height

      // Resize only on actual dimension change
      if (W !== lastW || H !== lastH) {
        nc.width = BW; nc.height = BH;
        fc.width = BW; fc.height = BH;
        lastW = W; lastH = H;
        buildScanPattern();
      }

      const zoom      = map.getZoom();
      const centerLat = map.getCenter().lat;
      const mPerPx    = (156543.03392 * Math.cos((centerLat * Math.PI) / 180)) / Math.pow(2, zoom);
      const revealPx  = RF_RADIUS_M / mPerPx;
      const online    = nodesRef.current.filter((n) => n.isOnline);

      // ── Noise canvas: slowly drifting static grain ─────────────────────
      nctx.clearRect(0, 0, BW, BH);
      const spd = 0.035;
      const ox  = (now * spd) % NOISE_TILE_SIZE;
      const oy  = (now * spd * 0.58) % NOISE_TILE_SIZE;
      // Breathe the grain density over an ~8-second sine cycle (0.64–1.0 alpha)
      nctx.globalAlpha = 0.82 + Math.sin(now * 0.00078) * 0.18;
      for (let x = -ox; x < BW + NOISE_TILE_SIZE; x += NOISE_TILE_SIZE) {
        for (let y = -oy; y < BH + NOISE_TILE_SIZE; y += NOISE_TILE_SIZE) {
          nctx.drawImage(noiseTile, Math.round(x), Math.round(y));
        }
      }
      nctx.globalAlpha = 1;

      // ── Fog canvas: dark overlay + effects ────────────────────────────
      ctx.clearRect(0, 0, BW, BH);

      // 1. Deep space navy base
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "rgba(3, 7, 20, 0.70)";
      ctx.fillRect(0, 0, BW, BH);

      // 2. Scanlines — drift slowly upward (one 4-px cycle ≈ every 0.67 s)
      if (scanPattern) {
        const sOff = (now * 0.006) % 4;
        ctx.save();
        ctx.translate(0, sOff);
        ctx.fillStyle = scanPattern;
        ctx.fillRect(0, -sOff, BW, BH + 4);
        ctx.restore();
      }

      // 3. Interference bands — two horizontal bands drifting through the fog.
      //    Drawn full-height so gradient coords always match rect coords.
      //    destination-out holes erase them automatically in reveal areas.
      {
        const bands: Array<[number, number, number]> = [
          [0.018, 0,           0.16],  // faster, brighter
          [0.011, BH * 0.55,   0.10],  // slower, dimmer
        ];
        for (const [speed, phase, peak] of bands) {
          // Continuous vertical scroll; wrap across full canvas + bleed
          const bandY = ((now * speed + phase) % (BH + 200)) - 100;
          const g = ctx.createLinearGradient(0, bandY - 90, 0, bandY + 90);
          g.addColorStop(0,    `rgba(80,140,230,0)`);
          g.addColorStop(0.3,  `rgba(80,140,230,${(peak * 0.4).toFixed(3)})`);
          g.addColorStop(0.5,  `rgba(80,140,230,${peak.toFixed(3)})`);
          g.addColorStop(0.7,  `rgba(80,140,230,${(peak * 0.4).toFixed(3)})`);
          g.addColorStop(1,    `rgba(80,140,230,0)`);
          // Fill the whole canvas height so the gradient is never clipped
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, BW, BH);
        }
      }

      // 4. Punch soft reveal holes (destination-out erases the dark overlay)
      ctx.globalCompositeOperation = "destination-out";

      const allRevealPoints: Array<{ lat: number; lng: number }> = [
        ...online,
        ...extNodesRef.current,
      ];

      for (const pt2d of allRevealPoints) {
        const pt    = toPt(pt2d.lat, pt2d.lng);
        const inner = revealPx * 0.28;
        const grad  = ctx.createRadialGradient(pt.x, pt.y, inner, pt.x, pt.y, revealPx);
        grad.addColorStop(0,    "rgba(0,0,0,1)");
        grad.addColorStop(0.55, "rgba(0,0,0,0.97)");
        grad.addColorStop(0.85, "rgba(0,0,0,0.42)");
        grad.addColorStop(1,    "rgba(0,0,0,0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, revealPx, 0, Math.PI * 2);
        ctx.fill();
      }

      // 4. Edge glow rings + signal-lock tint
      ctx.globalCompositeOperation = "source-over";

      function drawGlow(lat: number, lng: number, rgb: string) {
        const pt = toPt(lat, lng);
        const glow = ctx.createRadialGradient(
          pt.x, pt.y, revealPx * 0.78,
          pt.x, pt.y, revealPx * 0.98
        );
        glow.addColorStop(0,   `rgba(${rgb},0)`);
        glow.addColorStop(0.3, `rgba(${rgb},0.18)`);
        glow.addColorStop(0.6, `rgba(${rgb},0.09)`);
        glow.addColorStop(1,   `rgba(${rgb},0)`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, revealPx * 0.98, 0, Math.PI * 2);
        ctx.fill();

        const tint = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, revealPx * 0.42);
        tint.addColorStop(0, `rgba(${rgb},0.08)`);
        tint.addColorStop(1, `rgba(${rgb},0)`);
        ctx.fillStyle = tint;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, revealPx * 0.42, 0, Math.PI * 2);
        ctx.fill();
      }

      for (const node of online) drawGlow(node.lat, node.lng, "0,255,136");
      for (const ext of extNodesRef.current) drawGlow(ext.lat, ext.lng, "96,165,250");

      // 5. Sonar ping rings
      function drawPings(lat: number, lng: number, rgb: string) {
        const pt = toPt(lat, lng);
        const phaseOffset = ((lat * 997 + lng * 1009) * 1000) % PING_PERIOD_MS;

        for (const half of [0, 0.5] as const) {
          const t        = ((now + phaseOffset + half * PING_PERIOD_MS) % PING_PERIOD_MS) / PING_PERIOD_MS;
          const progress = Math.min(t * (PING_PERIOD_MS / PING_DURATION_MS), 1);
          if (progress >= 1) continue;
          const eased   = 1 - Math.pow(1 - progress, 2);
          const pingR   = revealPx * 0.06 + revealPx * 1.18 * eased;
          const opacity = (1 - eased) * (half === 0 ? 0.58 : 0.30);
          ctx.strokeStyle = `rgba(${rgb},${opacity.toFixed(3)})`;
          ctx.lineWidth   = half === 0 ? 1.5 : 1;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, pingR, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // Only guild (online) nodes pulse — ally nodes stay static so our network stands out
      for (const node of online) drawPings(node.lat, node.lng, "0,255,136");

      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafRef.current);
      for (const ref of [noiseCanvasRef, fogCanvasRef]) {
        if (ref.current && ref.current.parentNode) {
          ref.current.parentNode.removeChild(ref.current);
        }
        ref.current = null;
      }
    };
  }, [map]); // nodesRef handles updates; no need to re-mount on node changes

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

      {fogEnabled && <FogLayer nodes={nodes} externalNodes={externalNodes} />}

      {/* Ally/external relay nodes — dashed markers; range shown by canvas fog layer */}
      {externalNodes.map((ext) => (
        <span key={ext.id}>
          {/* Static range ring shown only when fog is off (canvas handles it when fog is on) */}
          {!fogEnabled && (
            <Circle
              center={[ext.lat, ext.lng]}
              radius={RF_RADIUS_M}
              pathOptions={{
                color: "#60a5fa",
                weight: 1,
                opacity: 0.30,
                fillColor: "#60a5fa",
                fillOpacity: 0.05,
              }}
            />
          )}
          <CircleMarker
            center={[ext.lat, ext.lng]}
            radius={11}
            pathOptions={{
              color: "#60a5fa",
              weight: 2,
              dashArray: "5 4",
              fillColor: "#0d1b2e",
              fillOpacity: 0.9,
            }}
          >
          <Popup className="ally-popup">
            <div
              style={{
                fontFamily: "monospace",
                fontSize: "12px",
                color: "#e0e0e0",
                padding: "10px 14px",
                minWidth: "200px",
                lineHeight: "1.7",
              }}
            >
              {/* Header */}
              <div style={{ fontWeight: "bold", marginBottom: "2px", color: "#60a5fa", fontSize: "13px" }}>
                {ext.name ?? ext.id}
              </div>
              {ext.name && (
                <div style={{ color: "#6b7280", fontSize: "10px", marginBottom: "6px" }}>{ext.id}</div>
              )}

              {/* Metadata table */}
              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <tbody>
                  {ext.hw_model && (
                    <tr>
                      <td style={{ color: "#9ca3af", paddingRight: "8px", whiteSpace: "nowrap" }}>Hardware</td>
                      <td style={{ color: "#e0e0e0" }}>{ext.hw_model.replace(/_/g, " ")}</td>
                    </tr>
                  )}
                  {ext.role && (
                    <tr>
                      <td style={{ color: "#9ca3af", paddingRight: "8px" }}>Role</td>
                      <td style={{ color: "#e0e0e0" }}>{ext.role}</td>
                    </tr>
                  )}
                  <tr>
                    <td style={{ color: "#9ca3af", paddingRight: "8px" }}>Location</td>
                    <td style={{ color: "#e0e0e0" }}>{ext.lat.toFixed(5)}, {ext.lng.toFixed(5)}</td>
                  </tr>
                  {ext.altitude != null && (
                    <tr>
                      <td style={{ color: "#9ca3af", paddingRight: "8px" }}>Altitude</td>
                      <td style={{ color: "#e0e0e0" }}>{ext.altitude} m ({Math.round(ext.altitude * 3.281)} ft)</td>
                    </tr>
                  )}
                  {ext.precision != null && (
                    <tr>
                      <td style={{ color: "#9ca3af", paddingRight: "8px" }}>Precision</td>
                      <td style={{ color: "#e0e0e0" }}>
                        {ext.precision} {ext.precision <= 12 ? "⚠ low — approx location" : ""}
                      </td>
                    </tr>
                  )}
                  {ext.neighbor_count != null && (
                    <tr>
                      <td style={{ color: "#9ca3af", paddingRight: "8px" }}>Heard by</td>
                      <td style={{ color: "#e0e0e0" }}>{ext.neighbor_count} node{ext.neighbor_count !== 1 ? "s" : ""}</td>
                    </tr>
                  )}
                  {ext.last_seen && (
                    <tr>
                      <td style={{ color: "#9ca3af", paddingRight: "8px" }}>Last seen</td>
                      <td style={{ color: "#e0e0e0" }}>
                        {formatDistanceToNow(new Date(ext.last_seen), { addSuffix: true })}
                      </td>
                    </tr>
                  )}
                  {ext.noted_at && (
                    <tr>
                      <td style={{ color: "#9ca3af", paddingRight: "8px" }}>Synced</td>
                      <td style={{ color: "#6b7280", fontSize: "10px" }}>
                        {formatDistanceToNow(new Date(ext.noted_at), { addSuffix: true })}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              {/* Footer badge */}
              <div style={{ marginTop: "6px", color: "#60a5fa", fontSize: "10px", borderTop: "1px solid #2d3748", paddingTop: "4px" }}>
                EXTERNAL RELAY — mesh ally
              </div>
            </div>
          </Popup>
          </CircleMarker>
        </span>
      ))}

      {nodes.map((node) => (
        <span key={node.nodeId}>
          {/* Static range ring shown only when fog is off (canvas handles it when fog is on) */}
          {!fogEnabled && node.isOnline && (
            <Circle
              center={[node.lat, node.lng]}
              radius={RF_RADIUS_M}
              pathOptions={{
                color: "#00ff88",
                weight: 1,
                opacity: 0.30,
                fillColor: "#00ff88",
                fillOpacity: 0.05,
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
            <Popup className="guild-popup">
              <div
                style={{
                  fontFamily: "monospace",
                  fontSize: "12px",
                  color: "#e0e0e0",
                  padding: "10px 14px",
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
