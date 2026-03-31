"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getSupabase, Profile, Node, NodeOwnership, getRankForRole } from "@/lib/supabase";
import { format } from "date-fns";

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
      // Fetch profile by callsign
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

      // Check if this is the viewer's own profile
      const { data: { user } } = await client.auth.getUser();
      setIsOwnProfile(user?.id === prof.id);

      // Fetch owned nodes
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
      <main className="min-h-screen bg-gray-900 text-white p-6">
        <div className="max-w-3xl mx-auto text-gray-400 text-sm">Loading...</div>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="min-h-screen bg-gray-900 text-white p-6">
        <div className="max-w-3xl mx-auto">
          <div className="text-gray-400 text-sm">Operator not found</div>
          <Link href="/" className="text-blue-400 text-sm mt-2 inline-block">
            Back to dashboard
          </Link>
        </div>
      </main>
    );
  }

  const rankInfo = getRankForRole(profile.role, profile.renown);

  const ROLE_BADGE: Record<string, string> = {
    member: "bg-gray-700 text-gray-300",
    elder: "bg-amber-900 text-amber-300",
    leader: "bg-purple-900 text-purple-300",
  };

  return (
    <main className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-3xl mx-auto">
        <Link
          href="/"
          className="text-gray-400 hover:text-gray-200 text-sm mb-6 inline-block"
        >
          &larr; Back to dashboard
        </Link>

        {/* Profile header */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 mb-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold font-mono text-amber-400">
                {profile.callsign}
              </h1>
              <div className="text-amber-400/70 text-sm mt-1">
                {rankInfo.rank}
              </div>
              {isOwnProfile && (
                <div className="text-gray-500 text-xs mt-1">{profile.email}</div>
              )}
            </div>
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                ROLE_BADGE[profile.role] ?? ROLE_BADGE.member
              }`}
            >
              {profile.role}
            </span>
          </div>

          {/* Renown progress */}
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
              <span>Renown: {profile.renown.toLocaleString()}</span>
              {rankInfo.nextRenown !== null && (
                <span>Next: {rankInfo.nextRenown.toLocaleString()}</span>
              )}
            </div>
            <div className="w-full bg-gray-700 rounded-full h-2">
              <div
                className="bg-amber-500 h-2 rounded-full transition-all"
                style={{ width: `${Math.min(rankInfo.progress, 100)}%` }}
              />
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-4 mt-4">
            <div>
              <div className="text-gray-500 text-xs uppercase">Influence</div>
              <div className="text-white text-sm font-mono mt-0.5">
                {profile.influence.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-gray-500 text-xs uppercase">Nodes</div>
              <div className="text-white text-sm font-mono mt-0.5">
                {ownedNodes.length}
              </div>
            </div>
            <div>
              <div className="text-gray-500 text-xs uppercase">Joined</div>
              <div className="text-white text-sm font-mono mt-0.5">
                {format(new Date(profile.join_date), "MMM yyyy")}
              </div>
            </div>
          </div>
        </div>

        {/* Owned Nodes */}
        <h2 className="text-lg font-semibold mb-4">
          Operated Nodes ({ownedNodes.length})
        </h2>
        {ownedNodes.length === 0 ? (
          <div className="text-gray-500 text-sm mb-8">No nodes claimed yet.</div>
        ) : (
          <div className="space-y-2 mb-8">
            {ownedNodes.map(({ ownership, node }) => (
              <Link
                key={ownership.id}
                href={`/node/${encodeURIComponent(node.id)}`}
                className="block bg-gray-800 border border-gray-700 rounded-lg p-4 hover:border-gray-600 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-white text-sm font-medium">
                      {node.long_name ?? node.id}
                    </div>
                    {node.short_name && (
                      <div className="text-gray-500 text-xs mt-0.5">
                        {node.short_name}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-gray-400 text-xs font-mono">
                      {(node.xp_total ?? 0).toLocaleString()} XP
                    </span>
                    <span
                      className={`w-2 h-2 rounded-full ${
                        node.is_online ? "bg-green-400" : "bg-red-400"
                      }`}
                    />
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
