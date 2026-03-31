"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getSupabase, Profile, Node, NodeOwnership, getRankForRole } from "@/lib/supabase";
import { format } from "date-fns";
import { ArrowLeft, UserCircle, WifiHigh, WifiSlash } from "@phosphor-icons/react";

interface OwnedNode {
  ownership: NodeOwnership;
  node: Node;
}

export default function ProfilePage() {
  const params = useParams();
  const callsign = decodeURIComponent(params.callsign as string);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [ownedNodes, setOwnedNodes] = useState<OwnedNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOwnProfile, setIsOwnProfile] = useState(false);

  useEffect(() => {
    const client = getSupabase();

    async function load() {
      const { data: prof } = await client
        .from("profiles")
        .select("*")
        .eq("callsign", callsign)
        .single();

      if (!prof) {
        setLoading(false);
        return;
      }

      setProfile(prof);

      const { data: { user } } = await client.auth.getUser();
      setIsOwnProfile(user?.id === prof.id);

      const { data: ownershipData } = await client
        .from("node_ownership")
        .select("*")
        .eq("player_id", prof.id);

      if (ownershipData && ownershipData.length > 0) {
        const nodeIds = ownershipData.map((o) => o.node_id);
        const { data: nodes } = await client
          .from("nodes")
          .select("*")
          .in("id", nodeIds);

        const merged: OwnedNode[] = ownershipData.map((o) => ({
          ownership: o,
          node: (nodes ?? []).find((n) => n.id === o.node_id)!,
        })).filter((m) => m.node);

        setOwnedNodes(merged);
      }

      setLoading(false);
    }

    load();
  }, [callsign]);

  if (loading) {
    return (
      <main className="min-h-screen p-6">
        <div className="max-w-3xl mx-auto text-terminal-muted text-sm font-mono animate-pulse-glow">Loading operator dossier...</div>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="min-h-screen p-6">
        <div className="max-w-3xl mx-auto">
          <div className="text-terminal-muted text-sm font-mono">Operator not found — no signal record</div>
          <Link href="/" className="text-terminal-green text-sm mt-2 inline-block font-mono">
            ← Return to operations
          </Link>
        </div>
      </main>
    );
  }

  const rankInfo = getRankForRole(profile.role, profile.renown);

  const ROLE_BADGE: Record<string, string> = {
    member: "border-terminal-muted/50 text-terminal-muted bg-terminal-muted/10",
    elder: "border-terminal-gold/40 text-terminal-gold bg-terminal-gold/10",
    leader: "border-terminal-green/40 text-terminal-green bg-terminal-green/10",
  };

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="max-w-3xl mx-auto">
        <Link
          href="/"
          className="text-terminal-muted hover:text-terminal-green text-xs mb-6 inline-flex items-center gap-1 font-mono transition-colors"
        >
          <ArrowLeft size={12} weight="bold" />
          OPERATIONS
        </Link>

        {/* Profile header */}
        <div className="panel p-6 mb-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <UserCircle size={32} weight="bold" className="text-terminal-gold" />
              <div>
                <h1 className="text-xl sm:text-2xl font-bold font-mono text-terminal-gold glow-gold">
                  {profile.callsign}
                </h1>
                <div className="text-terminal-gold/70 text-xs font-mono mt-1">
                  {rankInfo.rank}
                </div>
                {isOwnProfile && (
                  <div className="text-terminal-muted text-[10px] font-mono mt-1">{profile.email}</div>
                )}
              </div>
            </div>
            <span
              className={`text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${
                ROLE_BADGE[profile.role] ?? ROLE_BADGE.member
              }`}
            >
              {profile.role}
            </span>
          </div>

          {/* Renown progress */}
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs text-terminal-muted font-mono mb-1">
              <span>Renown: {profile.renown.toLocaleString()}</span>
              {rankInfo.nextRenown !== null && (
                <span>Next: {rankInfo.nextRenown.toLocaleString()}</span>
              )}
            </div>
            <div className="w-full bg-terminal-border rounded-full h-2">
              <div
                className="bg-terminal-gold h-2 rounded-full transition-all"
                style={{ width: `${Math.min(rankInfo.progress, 100)}%` }}
              />
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-4 mt-4 border-t border-terminal-border pt-4">
            <div>
              <div className="text-terminal-muted text-[10px] uppercase tracking-widest font-mono">Influence</div>
              <div className="text-foreground text-sm font-mono font-bold mt-0.5">
                {profile.influence.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-terminal-muted text-[10px] uppercase tracking-widest font-mono">Nodes</div>
              <div className="text-foreground text-sm font-mono font-bold mt-0.5">
                {ownedNodes.length}
              </div>
            </div>
            <div>
              <div className="text-terminal-muted text-[10px] uppercase tracking-widest font-mono">Joined</div>
              <div className="text-foreground text-sm font-mono font-bold mt-0.5">
                {format(new Date(profile.join_date), "MMM yyyy")}
              </div>
            </div>
          </div>
        </div>

        {/* Owned Nodes */}
        <h2 className="text-sm font-mono font-bold text-terminal-green uppercase tracking-widest mb-3">
          OPERATED NODES ({ownedNodes.length})
        </h2>
        {ownedNodes.length === 0 ? (
          <div className="text-terminal-muted text-sm font-mono mb-8">No nodes claimed yet.</div>
        ) : (
          <div className="space-y-2 mb-8">
            {ownedNodes.map(({ ownership, node }) => (
              <Link
                key={ownership.id}
                href={`/node/${encodeURIComponent(node.id)}`}
                className="block panel p-4 hover:border-terminal-green/30 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {node.is_online ? (
                      <WifiHigh size={14} weight="bold" className="text-terminal-green" />
                    ) : (
                      <WifiSlash size={14} weight="bold" className="text-terminal-red" />
                    )}
                    <div>
                      <div className="text-foreground text-sm font-mono font-bold">
                        {node.long_name ?? node.id}
                      </div>
                      {node.short_name && (
                        <div className="text-terminal-muted text-xs font-mono mt-0.5">
                          {node.short_name}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-terminal-muted text-xs font-mono">
                      {(node.xp_total ?? 0).toLocaleString()} RN
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
