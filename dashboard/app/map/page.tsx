"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { getSupabase, NodeLocation } from "@/lib/supabase";
import { ArrowLeft, MapPin } from "@phosphor-icons/react";
import type { MapNodeData } from "./_map";

const MapView = dynamic(() => import("./_map"), { ssr: false });

export default function MapPage() {
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [nodes, setNodes] = useState<MapNodeData[]>([]);

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
        .select("approved")
        .eq("id", user.id)
        .single();

      if (!profile?.approved) {
        setLoading(false);
        return;
      }

      setAuthorized(true);

      // Fetch opted-in locations
      const { data: locations } = await client
        .from("node_locations")
        .select("*")
        .eq("opt_in", true);

      if (!locations || locations.length === 0) {
        setLoading(false);
        return;
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
      setLoading(false);
    }

    load();
  }, []);

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
        <div className="text-terminal-muted text-xs font-mono">
          {nodes.length} node{nodes.length !== 1 ? "s" : ""} on map
        </div>
      </div>

      {nodes.length === 0 ? (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center">
            <MapPin
              size={40}
              className="text-terminal-muted mx-auto mb-4"
              weight="thin"
            />
            <div className="text-terminal-muted text-sm font-mono">
              No nodes have shared their location yet.
            </div>
            <div className="text-terminal-muted text-xs font-mono mt-2">
              Visit your node page to place yourself on the map.
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1" style={{ minHeight: "calc(100vh - 73px)" }}>
          <MapView nodes={nodes} />
        </div>
      )}
    </main>
  );
}
