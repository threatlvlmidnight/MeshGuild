"use client";

import { useEffect, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { getSupabase, NodeLocation } from "@/lib/supabase";
import { ArrowLeft, MapPin, FloppyDisk, FolderOpen, X, Trash } from "@phosphor-icons/react";
import type { MapNodeData, ExternalNodeData } from "./_map";
import type { PlanNode, PoiResult } from "./_plan";
import { PROFILES, PROFILE_KEYS, haversineM, linkMarginDb, marginColor } from "./_plan-config";

const MapView = dynamic(() => import("./_map"), { ssr: false });

interface SavedPlan {
  id: string;
  name: string;
  created_by: string;
  plan_data: PlanNode[];
  created_at: string;
  updated_at: string;
}

export default function MapPage() {
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [profileRole, setProfileRole] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [nodes, setNodes] = useState<MapNodeData[]>([]);
  const [externalNodes, setExternalNodes] = useState<ExternalNodeData[]>([]);
  const [fogEnabled, setFogEnabled] = useState(true);

  // ── Plan Mode state ────────────────────────────────────────────────────────
  const [planMode, setPlanMode] = useState(false);
  const [planNodes, setPlanNodes] = useState<PlanNode[]>([]);
  const [planName, setPlanName] = useState("");
  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  const [savedPlans, setSavedPlans] = useState<SavedPlan[]>([]);
  const [selectedPlanNodeId, setSelectedPlanNodeId] = useState<string | null>(null);
  const [pois, setPois] = useState<PoiResult[]>([]);
  const [poiLoading, setPoiLoading] = useState(false);
  const [savingPlan, setSavingPlan] = useState(false);

  useEffect(() => {
    async function load() {
      const client = getSupabase();

      // Auth + approval check
      const {
        data: { user },
      } = await client.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const { data: profile } = await client
        .from("profiles")
        .select("approved, role, id")
        .eq("id", user.id)
        .single();

      if (!profile?.approved) {
        setLoading(false);
        return;
      }

      setAuthorized(true);
      setProfileRole(profile.role ?? null);
      setProfileId(profile.id ?? null);

      // Fetch opted-in locations
      const { data: locations, error: locError } = await client
        .from("node_locations")
        .select("*")
        .eq("opt_in", true);

      console.log("[MAP] locations count:", locations?.length ?? "null/undefined");
      console.log("[MAP] locations error:", locError?.message ?? "none");
      console.log("[MAP] locations raw:", JSON.stringify(locations));

      if (locError) {
        console.error("[MAP] node_locations error:", locError);
      }

      if (!locations || locations.length === 0) {
        setLoading(false);
        return; // map still shows — nodes stays []
      }

      const nodeIds = (locations as NodeLocation[]).map((l) => l.node_id);

      const [{ data: nodeData }, { data: ownershipData }] = await Promise.all([
        client
          .from("nodes")
          .select("id, long_name, short_name, is_online, last_seen, uptime_pct")
          .in("id", nodeIds),
        client
          .from("node_ownership")
          .select("node_id, player_id")
          .in("node_id", nodeIds),
      ]);

      // Resolve operator callsigns
      const playerIds = Array.from(
        new Set(
          (ownershipData ?? []).map(
            (o: { node_id: string; player_id: string }) => o.player_id
          )
        )
      );

      const { data: profileData } =
        playerIds.length > 0
          ? await client
              .from("profiles")
              .select("id, callsign")
              .in("id", playerIds)
          : { data: [] };

      type NodeRow = {
        id: string;
        long_name: string | null;
        short_name: string | null;
        is_online: boolean;
        last_seen: string | null;
        uptime_pct: number | null;
      };

      const nodeMap = new Map(
        (nodeData ?? []).map((n: NodeRow) => [n.id, n])
      );
      const callsignMap = new Map(
        (profileData ?? []).map((p: { id: string; callsign: string }) => [p.id, p.callsign])
      );
      const ownerMap = new Map(
        (ownershipData ?? []).map(
          (o: { node_id: string; player_id: string }) => [o.node_id, o.player_id]
        )
      );

      const mapNodes: MapNodeData[] = (locations as NodeLocation[]).map((loc) => {
        const n = nodeMap.get(loc.node_id);
        const ownerId = ownerMap.get(loc.node_id);
        return {
          nodeId: loc.node_id,
          lat: loc.lat,
          lng: loc.lng,
          longName: n?.long_name ?? null,
          shortName: n?.short_name ?? null,
          isOnline: n?.is_online ?? false,
          lastSeen: n?.last_seen ?? null,
          uptimePct: n?.uptime_pct ?? null,
          operatorCallsign: ownerId ? (callsignMap.get(ownerId) ?? null) : null,
        };
      });

      setNodes(mapNodes);

      // Fetch external/ally relay nodes
      const { data: extData } = await client
        .from("external_nodes")
        .select("id, name, lat, lng");
      setExternalNodes(
        (extData ?? []).map((e: { id: string; name: string | null; lat: number; lng: number }) => ({
          id: e.id,
          name: e.name,
          lat: e.lat,
          lng: e.lng,
        }))
      );

      setLoading(false);
    }

    load();
  }, []);

  const isElder =
    profileRole === "elder" || profileRole === "leader";

  // ── Plan helpers ───────────────────────────────────────────────────────────

  const fetchPlans = useCallback(async () => {
    const client = getSupabase();
    const { data } = await client
      .from("map_plans")
      .select("id, name, created_by, plan_data, created_at, updated_at")
      .order("updated_at", { ascending: false });
    setSavedPlans((data ?? []) as SavedPlan[]);
  }, []);

  // Load saved plans when plan mode is opened
  useEffect(() => {
    if (planMode && isElder) fetchPlans();
  }, [planMode, isElder, fetchPlans]);

  async function savePlan() {
    if (!planName.trim() || !profileId) return;
    setSavingPlan(true);
    const client = getSupabase();
    if (activePlanId) {
      await client
        .from("map_plans")
        .update({
          name: planName.trim(),
          plan_data: planNodes,
          updated_at: new Date().toISOString(),
        })
        .eq("id", activePlanId);
    } else {
      const { data } = await client
        .from("map_plans")
        .insert({ name: planName.trim(), created_by: profileId, plan_data: planNodes })
        .select()
        .single();
      if (data) setActivePlanId(data.id);
    }
    await fetchPlans();
    setSavingPlan(false);
  }

  function loadPlan(plan: SavedPlan) {
    setPlanNodes(plan.plan_data);
    setPlanName(plan.name);
    setActivePlanId(plan.id);
    setSelectedPlanNodeId(null);
    setPois([]);
  }

  async function deletePlan(planId: string) {
    const client = getSupabase();
    await client.from("map_plans").delete().eq("id", planId);
    if (activePlanId === planId) {
      setActivePlanId(null);
      setPlanName("");
      setPlanNodes([]);
      setSelectedPlanNodeId(null);
      setPois([]);
    }
    await fetchPlans();
  }

  function newPlan() {
    setActivePlanId(null);
    setPlanName("");
    setPlanNodes([]);
    setSelectedPlanNodeId(null);
    setPois([]);
  }

  async function fetchPois(lat: number, lng: number) {
    setPoiLoading(true);
    setPois([]);
    const radiusM = 1500;
    const query = `
[out:json][timeout:25];
(
  node["man_made"="tower"](around:${radiusM},${lat},${lng});
  node["man_made"="water_tower"](around:${radiusM},${lat},${lng});
  node["man_made"="antenna"](around:${radiusM},${lat},${lng});
  node["natural"="peak"](around:${radiusM},${lat},${lng});
  node["natural"="hill"](around:${radiusM},${lat},${lng});
  node["amenity"="fire_station"](around:${radiusM},${lat},${lng});
  node["amenity"="police"](around:${radiusM},${lat},${lng});
  node["telecom"](around:${radiusM},${lat},${lng});
  way["building"="yes"]["height"](around:${radiusM},${lat},${lng});
);
out center;
    `.trim();
    try {
      const res = await fetch(
        `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`
      );
      const json = await res.json();
      setPois(json.elements ?? []);
    } catch {
      setPois([]);
    }
    setPoiLoading(false);
  }

  // When selected plan node changes, fetch POI nearby
  useEffect(() => {
    if (!selectedPlanNodeId) {
      setPois([]);
      return;
    }
    const node = planNodes.find((n) => n.id === selectedPlanNodeId);
    if (node) fetchPois(node.lat, node.lng);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPlanNodeId]);

  const selectedPlanNode = planNodes.find((n) => n.id === selectedPlanNodeId) ?? null;

  function removeSelectedNode() {
    if (!selectedPlanNodeId) return;
    setPlanNodes((prev) => prev.filter((n) => n.id !== selectedPlanNodeId));
    setSelectedPlanNodeId(null);
    setPois([]);
  }

  function updateSelectedNode(changes: Partial<PlanNode>) {
    if (!selectedPlanNodeId) return;
    setPlanNodes((prev) =>
      prev.map((n) => (n.id === selectedPlanNodeId ? { ...n, ...changes } : n))
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen p-6">
        <div className="max-w-7xl mx-auto text-terminal-muted text-sm font-mono animate-pulse-glow">
          Triangulating mesh positions...
        </div>
      </main>
    );
  }

  if (!authorized) {
    return (
      <main className="min-h-screen p-6">
        <div className="max-w-7xl mx-auto">
          <Link
            href="/"
            className="text-terminal-muted hover:text-terminal-green text-xs mb-6 inline-flex items-center gap-1 font-mono transition-colors"
          >
            <ArrowLeft size={12} weight="bold" />
            OPERATIONS
          </Link>
          <div className="text-terminal-red font-mono text-sm mt-4">
            ACCESS DENIED — Approved operators only
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col">
      {/* Header */}
      <div className="p-4 sm:p-6 flex items-center justify-between border-b border-terminal-border shrink-0">
        <Link
          href="/"
          className="text-terminal-muted hover:text-terminal-green text-xs inline-flex items-center gap-1 font-mono transition-colors"
        >
          <ArrowLeft size={12} weight="bold" />
          OPERATIONS
        </Link>
        <div className="flex items-center gap-2">
          <MapPin size={14} className="text-terminal-green" weight="bold" />
          <h1 className="text-sm font-mono font-bold text-terminal-green uppercase tracking-widest">
            GUILD MAP
          </h1>
        </div>
        <div className="flex items-center gap-3">
          {isElder && (
            <button
              onClick={() => setPlanMode((m) => !m)}
              className={`text-xs font-mono px-3 py-1.5 rounded border transition-colors ${
                planMode
                  ? "border-amber-400 text-black bg-amber-500 hover:bg-amber-400"
                  : "border-amber-600/50 text-amber-400 bg-transparent hover:bg-amber-900/30"
              }`}
            >
              {planMode ? "[ EXIT PLAN MODE ]" : "[ PLAN MODE ]"}
            </button>
          )}
          <button
            onClick={() => setFogEnabled((f) => !f)}
            className={`text-xs font-mono px-3 py-1.5 rounded border transition-colors ${
              fogEnabled
                ? "border-terminal-cyan/40 text-terminal-cyan bg-terminal-cyan/10 hover:bg-terminal-cyan/20"
                : "border-terminal-border text-terminal-muted hover:text-terminal-dim hover:border-terminal-dim/30"
            }`}
          >
            {fogEnabled ? "[ FOG: ON ]" : "[ FOG: OFF ]"}
          </button>
          <div className="text-terminal-muted text-xs font-mono">
            {nodes.length} node{nodes.length !== 1 ? "s" : ""} on map
          </div>
        </div>
      </div>

      {/* Map + optional plan overlay panels */}
      <div className="flex-1 relative" style={{ height: "calc(100vh - 73px)" }}>
        {nodes.length === 0 && !planMode ? (
          <>
            <MapView
              nodes={[]}
              fogEnabled={fogEnabled}
              externalNodes={externalNodes}
              planMode={false}
              planNodes={[]}
              onPlanNodesChange={() => {}}
              selectedPlanNodeId={null}
              onSelectPlanNode={() => {}}
              pois={[]}
            />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[1000]">
              <div className="text-center bg-background/80 border border-terminal-border rounded px-6 py-4 backdrop-blur-sm">
                <MapPin size={32} className="text-terminal-muted mx-auto mb-2" weight="thin" />
                <div className="text-terminal-muted text-sm font-mono">No nodes on the map yet.</div>
                <div className="text-terminal-muted text-xs font-mono mt-1">
                  Visit your node page to share your location.
                </div>
              </div>
            </div>
          </>
        ) : (
          <MapView
            nodes={nodes}
            fogEnabled={fogEnabled}
            externalNodes={externalNodes}
            planMode={planMode}
            planNodes={planNodes}
            onPlanNodesChange={setPlanNodes}
            selectedPlanNodeId={selectedPlanNodeId}
            onSelectPlanNode={setSelectedPlanNodeId}
            pois={pois}
          />
        )}

        {/* ── Plan Mode Overlay Panels ── */}
        {planMode && (
          <>
            {/* Left panel: Save / Load plans */}
            <div className="absolute top-3 left-3 z-[1100] w-64 bg-black/90 border border-amber-600/40 rounded text-xs font-mono text-terminal-dim backdrop-blur-sm">
              <div className="px-3 py-2 border-b border-amber-600/30 text-amber-400 font-bold tracking-widest text-[10px]">
                SIGNAL PLANNING MODE
              </div>

              {/* Save row */}
              <div className="px-3 py-2 border-b border-terminal-border/40 flex gap-2">
                <input
                  type="text"
                  value={planName}
                  onChange={(e) => setPlanName(e.target.value)}
                  placeholder="Plan name..."
                  className="flex-1 bg-terminal-border/20 border border-terminal-border/40 rounded px-2 py-1 text-terminal-dim placeholder-terminal-muted/50 outline-none focus:border-amber-600/60 text-[11px]"
                />
                <button
                  onClick={savePlan}
                  disabled={savingPlan || !planName.trim()}
                  className="px-2 py-1 border border-amber-600/50 text-amber-400 rounded hover:bg-amber-900/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  title="Save plan"
                >
                  <FloppyDisk size={12} weight="bold" />
                </button>
                <button
                  onClick={newPlan}
                  className="px-2 py-1 border border-terminal-border/50 text-terminal-muted rounded hover:text-terminal-dim hover:border-terminal-dim/40 transition-colors"
                  title="New plan"
                >
                  <FolderOpen size={12} weight="bold" />
                </button>
              </div>

              {/* Saved plans list */}
              {savedPlans.length > 0 && (
                <div className="max-h-40 overflow-y-auto">
                  {savedPlans.map((plan) => (
                    <div
                      key={plan.id}
                      className={`px-3 py-1.5 flex items-center gap-2 border-b border-terminal-border/20 hover:bg-terminal-border/10 group ${
                        activePlanId === plan.id ? "bg-amber-900/20" : ""
                      }`}
                    >
                      <button
                        onClick={() => loadPlan(plan)}
                        className="flex-1 text-left truncate text-terminal-dim hover:text-amber-300 transition-colors"
                        title={plan.name}
                      >
                        {activePlanId === plan.id && (
                          <span className="text-amber-500 mr-1">▶</span>
                        )}
                        {plan.name}
                        <span className="ml-1 text-terminal-muted text-[10px]">
                          · {(plan.plan_data as PlanNode[]).length} node
                          {(plan.plan_data as PlanNode[]).length !== 1 ? "s" : ""}
                        </span>
                      </button>
                      <button
                        onClick={() => deletePlan(plan.id)}
                        className="opacity-0 group-hover:opacity-100 text-terminal-red/60 hover:text-terminal-red transition-all"
                        title="Delete plan"
                      >
                        <Trash size={10} weight="bold" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {savedPlans.length === 0 && (
                <div className="px-3 py-2 text-terminal-muted text-[10px]">
                  No saved plans yet. Click the map to place nodes.
                </div>
              )}

              {/* Node count hint */}
              {planNodes.length > 0 && (
                <div className="px-3 py-1.5 border-t border-terminal-border/30 text-terminal-muted text-[10px]">
                  {planNodes.length} planned node{planNodes.length !== 1 ? "s" : ""} · click map to add · drag to move
                </div>
              )}
            </div>

            {/* Right panel: Selected node editor + POI */}
            {selectedPlanNode && (
              <div className="absolute top-3 right-3 z-[1100] w-64 bg-black/90 border border-amber-600/40 rounded text-xs font-mono text-terminal-dim backdrop-blur-sm">
                <div className="px-3 py-2 border-b border-amber-600/30 flex items-center justify-between">
                  <span className="text-amber-400 font-bold tracking-widest text-[10px]">
                    PLANNED NODE
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={removeSelectedNode}
                      className="text-terminal-red/60 hover:text-terminal-red transition-colors"
                      title="Remove node"
                    >
                      <Trash size={11} weight="bold" />
                    </button>
                    <button
                      onClick={() => { setSelectedPlanNodeId(null); setPois([]); }}
                      className="text-terminal-muted hover:text-terminal-dim transition-colors"
                    >
                      <X size={11} weight="bold" />
                    </button>
                  </div>
                </div>

                {/* Label */}
                <div className="px-3 py-2 border-b border-terminal-border/30">
                  <input
                    type="text"
                    value={selectedPlanNode.label}
                    onChange={(e) => updateSelectedNode({ label: e.target.value })}
                    placeholder="Label (optional)..."
                    className="w-full bg-terminal-border/20 border border-terminal-border/40 rounded px-2 py-1 text-terminal-dim placeholder-terminal-muted/50 outline-none focus:border-amber-600/60 text-[11px]"
                  />
                </div>

                {/* Hardware profile selector */}
                <div className="px-3 py-2 border-b border-terminal-border/30">
                  <div className="text-terminal-muted text-[10px] mb-1.5">HARDWARE PROFILE</div>
                  <div className="flex flex-col gap-1">
                    {PROFILE_KEYS.map((key) => {
                      const cfg = PROFILES[key];
                      return (
                        <button
                          key={key}
                          onClick={() => updateSelectedNode({ profile: key })}
                          className={`flex items-center gap-2 px-2 py-1 rounded border text-[10px] transition-colors text-left ${
                            selectedPlanNode.profile === key
                              ? "border-current"
                              : "border-terminal-border/30 hover:border-terminal-border/60"
                          }`}
                          style={
                            selectedPlanNode.profile === key
                              ? { color: cfg.color, borderColor: cfg.color + "88" }
                              : {}
                          }
                        >
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ background: cfg.color }}
                          />
                          <span className="font-bold">{cfg.label}</span>
                          <span className="text-terminal-muted ml-auto">
                            {cfg.rangeM >= 1000
                              ? `~${(cfg.rangeM / 1000).toFixed(0)}km`
                              : `~${cfg.rangeM}m`}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Coords */}
                <div className="px-3 py-1.5 border-b border-terminal-border/30 text-[10px] text-terminal-muted">
                  {selectedPlanNode.lat.toFixed(5)}, {selectedPlanNode.lng.toFixed(5)}
                </div>

                {/* Nearest neighbor link info */}
                {planNodes.length > 1 && (() => {
                  let nearest: PlanNode | null = null;
                  let nearestDist = Infinity;
                  for (const other of planNodes) {
                    if (other.id === selectedPlanNode.id) continue;
                    const d = haversineM(selectedPlanNode.lat, selectedPlanNode.lng, other.lat, other.lng);
                    if (d < nearestDist) { nearestDist = d; nearest = other; }
                  }
                  if (!nearest) return null;
                  const margin = linkMarginDb(selectedPlanNode.profile, nearest.profile, nearestDist);
                  const color = marginColor(margin);
                  return (
                    <div className="px-3 py-1.5 border-b border-terminal-border/30 text-[10px]">
                      <span className="text-terminal-muted">Nearest: </span>
                      <span className="text-terminal-dim">{nearest.label || "unnamed"}</span>
                      <span className="text-terminal-muted"> · {(nearestDist / 1000).toFixed(1)}km · </span>
                      <span style={{ color }}>{margin.toFixed(0)} dB</span>
                    </div>
                  );
                })()}

                {/* POI results */}
                <div className="px-3 py-2">
                  <div className="text-terminal-muted text-[10px] mb-1.5">
                    NEARBY SITES (1.5km)
                    {poiLoading && <span className="ml-1 text-amber-400">loading…</span>}
                  </div>
                  {pois.length === 0 && !poiLoading && (
                    <div className="text-terminal-muted text-[10px]">None found in OSM data.</div>
                  )}
                  <div className="max-h-40 overflow-y-auto flex flex-col gap-1">
                    {pois.map((poi) => {
                      const name =
                        poi.tags?.name ??
                        poi.tags?.["man_made"] ??
                        poi.tags?.["amenity"] ??
                        poi.tags?.["natural"] ??
                        poi.tags?.["telecom"] ??
                        "Unknown";
                      const type =
                        poi.tags?.["man_made"] ??
                        poi.tags?.["amenity"] ??
                        poi.tags?.["natural"] ??
                        poi.tags?.["telecom"] ??
                        poi.tags?.["building"] ??
                        "";
                      return (
                        <div key={poi.id} className="text-[10px]">
                          <span className="text-terminal-dim">{name}</span>
                          {type && type !== name && (
                            <span className="text-terminal-muted ml-1">[{type}]</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
