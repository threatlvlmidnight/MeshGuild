"use client";

// _plan.tsx
// Network Planning Mode map overlay.
// Rendered inside <MapContainer> only when plan mode is active.
// Handles: click-to-place nodes, draggable markers, colored coverage rings,
//          nearest-neighbor link lines colored by link margin,
//          and gray POI markers from Overpass API results.

import { useEffect, useRef } from "react";
import { useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import {
  PROFILES,
  HardwareProfile,
  haversineM,
  linkMarginDb,
  marginColor,
  nearestNeighborLinks,
} from "./_plan-config";

export interface PlanNode {
  id: string;
  lat: number;
  lng: number;
  profile: HardwareProfile;
  label: string;
}

export interface PoiResult {
  id: number;
  lat: number;
  lon: number;
  center?: { lat: number; lon: number };
  tags: Record<string, string>;
}

interface Props {
  nodes: PlanNode[];
  onNodesChange: (nodes: PlanNode[]) => void;
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
  pois: PoiResult[];
}

// ── Map click handler: add a new relay node on click ─────────────────────────
function ClickToPlace({
  onPlace,
}: {
  onPlace: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      onPlace(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

// ── DivIcon factory for a plan node marker ────────────────────────────────────
function makePlanIcon(color: string, selected: boolean): L.DivIcon {
  const size = selected ? 16 : 12;
  const border = selected ? `3px solid #ffffff` : `2px solid ${color}`;
  return L.divIcon({
    className: "",
    iconAnchor: [size / 2, size / 2],
    html: `<div style="
      width:${size}px;height:${size}px;
      border-radius:50%;
      background:${color};
      border:${border};
      box-shadow:0 0 8px ${color}88;
      cursor:grab;
    "></div>`,
  });
}

// ── Main overlay layer ────────────────────────────────────────────────────────
export default function PlanLayer({
  nodes,
  onNodesChange,
  selectedNodeId,
  onSelectNode,
  pois,
}: Props) {
  const map = useMap();

  // Keep stable refs so Leaflet event callbacks always see latest values
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const onNodesChangeRef = useRef(onNodesChange);
  onNodesChangeRef.current = onNodesChange;
  const onSelectNodeRef = useRef(onSelectNode);
  onSelectNodeRef.current = onSelectNode;

  // Imperative Leaflet layer group for markers (draggable requires L.Marker)
  const markerGroupRef = useRef<L.LayerGroup | null>(null);
  // Layer groups for rings, link lines, POI — rebuilt on every render
  const ringsGroupRef = useRef<L.LayerGroup | null>(null);
  const linksGroupRef = useRef<L.LayerGroup | null>(null);
  const poisGroupRef = useRef<L.LayerGroup | null>(null);

  // Create layer groups once
  useEffect(() => {
    const mG = L.layerGroup().addTo(map);
    const rG = L.layerGroup().addTo(map);
    const lG = L.layerGroup().addTo(map);
    const pG = L.layerGroup().addTo(map);
    markerGroupRef.current = mG;
    ringsGroupRef.current = rG;
    linksGroupRef.current = lG;
    poisGroupRef.current = pG;
    return () => {
      mG.remove();
      rG.remove();
      lG.remove();
      pG.remove();
    };
  }, [map]);

  // ── Sync markers whenever nodes or selectedNodeId changes ──────────────────
  useEffect(() => {
    const mG = markerGroupRef.current;
    if (!mG) return;

    // Track which node IDs already have a marker
    const existing = new Map<string, L.Marker>();
    mG.eachLayer((layer) => {
      const m = layer as L.Marker & { _planNodeId?: string };
      if (m._planNodeId) existing.set(m._planNodeId, m);
    });

    // Remove stale markers
    for (const [id, marker] of Array.from(existing)) {
      if (!nodes.find((n) => n.id === id)) {
        mG.removeLayer(marker);
        existing.delete(id);
      }
    }

    for (const node of nodes) {
      const cfg = PROFILES[node.profile];
      const icon = makePlanIcon(cfg.color, node.id === selectedNodeId);

      if (existing.has(node.id)) {
        // Update existing marker icon and position
        const m = existing.get(node.id)!;
        m.setIcon(icon);
        m.setLatLng([node.lat, node.lng]);
      } else {
        // Create new draggable marker
        const marker = L.marker([node.lat, node.lng], {
          icon,
          draggable: true,
          autoPan: true,
        }) as L.Marker & { _planNodeId?: string };
        marker._planNodeId = node.id;

        marker.on("click", () => {
          onSelectNodeRef.current(node.id);
        });

        marker.on("dragend", () => {
          const pos = marker.getLatLng();
          const updated = nodesRef.current.map((n) =>
            n.id === node.id ? { ...n, lat: pos.lat, lng: pos.lng } : n
          );
          onNodesChangeRef.current(updated);
        });

        mG.addLayer(marker);
      }
    }
  }, [nodes, selectedNodeId]);

  // ── Sync coverage rings ────────────────────────────────────────────────────
  useEffect(() => {
    const rG = ringsGroupRef.current;
    if (!rG) return;
    rG.clearLayers();
    for (const node of nodes) {
      const cfg = PROFILES[node.profile];
      L.circle([node.lat, node.lng], {
        radius: cfg.rangeM,
        color: cfg.color,
        weight: 1.5,
        dashArray: "6 4",
        opacity: 0.6,
        fillColor: cfg.color,
        fillOpacity: 0.07,
      }).addTo(rG);
    }
  }, [nodes]);

  // ── Sync nearest-neighbor link lines ──────────────────────────────────────
  useEffect(() => {
    const lG = linksGroupRef.current;
    if (!lG) return;
    lG.clearLayers();
    const links = nearestNeighborLinks(nodes);
    for (const [a, b] of links) {
      const distM = haversineM(a.lat, a.lng, b.lat, b.lng);
      const margin = linkMarginDb(a.profile, b.profile, distM);
      const color = marginColor(margin);
      const distKm = (distM / 1000).toFixed(1);
      const poly = L.polyline(
        [
          [a.lat, a.lng],
          [b.lat, b.lng],
        ],
        {
          color,
          weight: 2,
          dashArray: "6 4",
          opacity: 0.8,
        }
      );
      poly.bindTooltip(
        `${distKm} km · margin ${margin.toFixed(0)} dB`,
        { sticky: true, className: "plan-link-tooltip" }
      );
      poly.addTo(lG);
    }
  }, [nodes]);

  // ── Sync POI markers ───────────────────────────────────────────────────────
  useEffect(() => {
    const pG = poisGroupRef.current;
    if (!pG) return;
    pG.clearLayers();
    for (const poi of pois) {
      const lat = poi.lat ?? poi.center?.lat;
      const lon = poi.lon ?? poi.center?.lon;
      if (lat == null || lon == null) continue;
      const label =
        poi.tags?.name ??
        poi.tags?.["man_made"] ??
        poi.tags?.["amenity"] ??
        poi.tags?.["natural"] ??
        poi.tags?.["telecom"] ??
        "POI";
      const icon = L.divIcon({
        className: "",
        iconAnchor: [6, 6],
        html: `<div style="
          width:8px;height:8px;
          background:#6b7280;
          border:1.5px solid #9ca3af;
          border-radius:1px;
          transform:rotate(45deg);
        "></div>`,
      });
      L.marker([lat, lon], { icon })
        .bindTooltip(label, { sticky: true })
        .addTo(pG);
    }
  }, [pois]);

  return (
    <ClickToPlace
      onPlace={(lat, lng) => {
        const newNode: PlanNode = {
          id: crypto.randomUUID(),
          lat,
          lng,
          profile: "relay",
          label: "",
        };
        onNodesChange([...nodesRef.current, newNode]);
        onSelectNode(newNode.id);
      }}
    />
  );
}
