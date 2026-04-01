"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getSupabase, Profile, Node, NodeOwnership, PlayerCommendation, PlayerBadge, getRankForRole } from "@/lib/supabase";
import { format } from "date-fns";
import { ArrowLeft, UserCircle, WifiHigh, WifiSlash } from "@phosphor-icons/react";
import { BadgeArt } from "@/components/badge-art";

interface OwnedNode {
  ownership: NodeOwnership;
  node: Node;
}

interface ReceivedCommendation extends PlayerCommendation {
  fromCallsign: string | null;
  fromRankTitle: string | null;
}

const COMMENDATION_OPTIONS = [
  { key: "RELIABILITY", label: "Reliability", blurb: "Keeps the signal alive" },
  { key: "MENTORSHIP", label: "Mentorship", blurb: "Helps newer operators" },
  { key: "LEADERSHIP", label: "Leadership", blurb: "Coordinates under pressure" },
  { key: "FIELDCRAFT", label: "Fieldcraft", blurb: "Strong deployment instincts" },
  { key: "SIGNAL_BOOST", label: "Signal Boost", blurb: "Raises guild morale" },
] as const;

export default function ProfilePage() {
  const params = useParams();
  const callsign = decodeURIComponent(params.callsign as string);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [ownedNodes, setOwnedNodes] = useState<OwnedNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOwnProfile, setIsOwnProfile] = useState(false);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [commendations, setCommendations] = useState<ReceivedCommendation[]>([]);
  const [selectedCommendation, setSelectedCommendation] = useState<(typeof COMMENDATION_OPTIONS)[number]["key"]>("RELIABILITY");
  const [commendationNote, setCommendationNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [playerBadges, setPlayerBadges] = useState<PlayerBadge[]>([]);

  async function loadCommendations(client: ReturnType<typeof getSupabase>, profileId: string) {
    const { data, error } = await client
      .from("player_commendations")
      .select("id, from_player_id, to_player_id, commendation_type, note, influence_value, created_at")
      .eq("to_player_id", profileId)
      .order("created_at", { ascending: false });

    if (error) {
      if (!error.message.toLowerCase().includes("player_commendations")) {
        console.warn("Unable to load commendations", error.message);
      }
      setCommendations([]);
      return;
    }

    const fromIds = Array.from(new Set((data ?? []).map((row) => row.from_player_id)));
    const { data: fromProfiles } = fromIds.length > 0
      ? await client.from("profiles").select("id, callsign, rank_title").in("id", fromIds)
      : { data: [] as { id: string; callsign: string; rank_title: string }[] };

    const fromById = new Map((fromProfiles ?? []).map((row) => [row.id, row]));

    setCommendations(
      ((data ?? []) as PlayerCommendation[]).map((row) => ({
        ...row,
        fromCallsign: fromById.get(row.from_player_id)?.callsign ?? null,
        fromRankTitle: fromById.get(row.from_player_id)?.rank_title ?? null,
      }))
    );
  }

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
      setViewerId(user?.id ?? null);

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

      await Promise.all([
        loadCommendations(client, prof.id),
        client
          .from("player_badges")
          .select("*")
          .eq("player_id", prof.id)
          .order("awarded_at", { ascending: false })
          .then(({ data }) => setPlayerBadges(data ?? [])),
      ]);
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
  const commendationCount = commendations.length;
  const earnedCommendationTypes = new Set(commendations.map((c) => c.commendation_type));
  const awardedByViewer = new Set(
    commendations
      .filter((commendation) => commendation.from_player_id === viewerId)
      .map((commendation) => commendation.commendation_type)
  );

  async function handleCommend() {
    if (!profile || !viewerId || isOwnProfile) return;

    setSubmitting(true);
    setActionMessage(null);
    const client = getSupabase();

    const { error } = await client.from("player_commendations").insert({
      from_player_id: viewerId,
      to_player_id: profile.id,
      commendation_type: selectedCommendation,
      note: commendationNote.trim() || null,
    });

    if (error) {
      const message = error.message.toLowerCase();
      if (message.includes("duplicate") || message.includes("uq_player_commendations_pair_type")) {
        setActionMessage("You have already issued that commendation to this operator.");
      } else if (message.includes("player_commendations")) {
        setActionMessage("Run the Sprint 13 commendations SQL migration first.");
      } else {
        setActionMessage(`Unable to issue commendation: ${error.message}`);
      }
      setSubmitting(false);
      return;
    }

    setActionMessage("Commendation issued.");
    setCommendationNote("");
    await loadCommendations(client, profile.id);

    const { data: refreshedProfile } = await client
      .from("profiles")
      .select("*")
      .eq("id", profile.id)
      .single();
    if (refreshedProfile) {
      setProfile(refreshedProfile);
    }

    setSubmitting(false);
  }

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
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 border-t border-terminal-border pt-4">
            <div>
              <div className="text-terminal-muted text-[10px] uppercase tracking-widest font-mono">Influence</div>
              <div className="text-foreground text-sm font-mono font-bold mt-0.5">
                {profile.influence.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </div>
            </div>
            <div>
              <div className="text-terminal-muted text-[10px] uppercase tracking-widest font-mono">Nodes</div>
              <div className="text-foreground text-sm font-mono font-bold mt-0.5">
                {ownedNodes.length}
              </div>
            </div>
            <div>
              <div className="text-terminal-muted text-[10px] uppercase tracking-widest font-mono">Commends</div>
              <div className="text-terminal-gold text-sm font-mono font-bold mt-0.5">
                {commendationCount}
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

        {/* Citations & Decorations */}
        {(playerBadges.length > 0 || earnedCommendationTypes.size > 0) && (
          <div className="panel p-4 mb-6">
            <div className="text-[10px] font-mono font-bold text-terminal-muted uppercase tracking-widest mb-4">
              Citations &amp; Decorations
            </div>
            <div className="flex flex-wrap gap-5">
              {playerBadges.map((badge) => (
                <BadgeArt
                  key={badge.id}
                  badgeKey={badge.badge_key}
                  size="lg"
                  showLabel
                />
              ))}
              {Array.from(earnedCommendationTypes).map((type) => (
                <BadgeArt key={type} badgeKey={type} size="md" showLabel />
              ))}
            </div>
          </div>
        )}

        {!isOwnProfile && viewerId && (
          <div className="panel p-4 mb-6">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <h2 className="text-sm font-mono font-bold text-terminal-gold uppercase tracking-widest">
                  Issue Commendation
                </h2>
                <p className="text-terminal-muted text-xs font-mono mt-1">
                  Recognize this operator for a specific strength. Each type can be awarded once per operator.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
              {COMMENDATION_OPTIONS.map((option) => {
                const alreadyGiven = awardedByViewer.has(option.key);
                return (
                  <button
                    key={option.key}
                    onClick={() => setSelectedCommendation(option.key)}
                    disabled={alreadyGiven || submitting}
                    className={`text-left rounded border px-3 py-2 transition-colors ${
                      selectedCommendation === option.key
                        ? "border-terminal-gold/40 bg-terminal-gold/10 text-terminal-gold"
                        : "border-terminal-border text-terminal-muted hover:text-foreground"
                    } ${alreadyGiven ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    <div className="text-xs font-mono font-bold uppercase tracking-wider">{option.label}</div>
                    <div className="text-[10px] font-mono mt-1">{alreadyGiven ? "Already awarded" : option.blurb}</div>
                  </button>
                );
              })}
            </div>

            <textarea
              value={commendationNote}
              onChange={(e) => setCommendationNote(e.target.value)}
              maxLength={180}
              rows={3}
              placeholder="Optional note for the operator dossier..."
              className="w-full bg-terminal-panel border border-terminal-border rounded px-3 py-2 text-sm font-mono text-foreground placeholder:text-terminal-muted/50 focus:outline-none focus:border-terminal-gold/40 transition-colors"
            />

            <div className="flex items-center justify-between gap-3 mt-3">
              <p className="text-[10px] font-mono text-terminal-muted/70">
                {180 - commendationNote.length} chars remaining
              </p>
              <button
                onClick={handleCommend}
                disabled={submitting || awardedByViewer.has(selectedCommendation)}
                className="px-3 py-1.5 rounded border border-terminal-gold/40 bg-terminal-gold/10 text-terminal-gold text-xs font-mono font-bold hover:bg-terminal-gold/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? "ISSUING..." : "AWARD COMMENDATION"}
              </button>
            </div>

            {actionMessage && (
              <p className="text-xs font-mono text-terminal-muted mt-3">{actionMessage}</p>
            )}
          </div>
        )}

        <h2 className="text-sm font-mono font-bold text-terminal-gold uppercase tracking-widest mb-3">
          GUILD COMMENDATIONS ({commendationCount})
        </h2>
        {commendations.length === 0 ? (
          <div className="text-terminal-muted text-sm font-mono mb-8">No operator commendations recorded yet.</div>
        ) : (
          <div className="space-y-2 mb-8">
            {commendations.map((commendation) => (
              <div key={commendation.id} className="panel p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-terminal-gold text-xs font-mono font-bold uppercase tracking-wider">
                      {commendation.commendation_type.replaceAll("_", " ")}
                    </div>
                    <div className="text-terminal-muted text-xs font-mono mt-1">
                      Awarded by {commendation.fromCallsign ?? "Unknown Operator"}
                      {commendation.fromRankTitle ? ` · ${commendation.fromRankTitle}` : ""}
                    </div>
                    {commendation.note && (
                      <p className="text-foreground text-sm font-mono mt-2">“{commendation.note}”</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-terminal-gold text-xs font-mono">+{commendation.influence_value} influence</div>
                    <div className="text-terminal-muted/70 text-[10px] font-mono mt-1">
                      {format(new Date(commendation.created_at), "MMM d, yyyy")}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

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
