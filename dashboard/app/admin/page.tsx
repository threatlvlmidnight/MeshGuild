"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabase, Profile, PlayerBadge } from "@/lib/supabase";
import { ArrowLeft, Shield, CheckCircle, UserCircle } from "@phosphor-icons/react";
import { BadgeArt, SPECIAL_BADGE_OPTIONS } from "@/components/badge-art";

type Role = "member" | "elder" | "leader";

const ROLE_COLORS: Record<Role, string> = {
  member: "border-terminal-muted/50 text-terminal-muted bg-terminal-muted/10",
  elder: "border-terminal-gold/40 text-terminal-gold bg-terminal-gold/10",
  leader: "border-terminal-green/40 text-terminal-green bg-terminal-green/10",
};

export default function AdminPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playerBadgesMap, setPlayerBadgesMap] = useState<Map<string, PlayerBadge[]>>(new Map());
  const [badgeTarget, setBadgeTarget] = useState("");
  const [badgeKey, setBadgeKey] = useState<string>(SPECIAL_BADGE_OPTIONS[0]?.key ?? "FOUNDER");
  const [badgeNote, setBadgeNote] = useState("");
  const [awardingBadge, setAwardingBadge] = useState(false);
  const [badgeMessage, setBadgeMessage] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const supabase = getSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("Not authenticated");
      setLoading(false);
      return;
    }

    const { data: myProfile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (!myProfile || (myProfile.role !== "leader" && myProfile.role !== "elder")) {
      setError("Access denied — elder or leader role required");
      setLoading(false);
      return;
    }

    setCurrentProfile(myProfile);

    const { data: allProfiles } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: true });

    setProfiles(allProfiles ?? []);

    const { data: allBadges } = await supabase
      .from("player_badges")
      .select("*")
      .order("awarded_at", { ascending: false });
    const badgeMap = new Map<string, PlayerBadge[]>();
    for (const badge of allBadges ?? []) {
      const list = badgeMap.get(badge.player_id) ?? [];
      list.push(badge);
      badgeMap.set(badge.player_id, list);
    }
    setPlayerBadgesMap(badgeMap);

    setLoading(false);
  }

  function canManage(target: Profile): boolean {
    if (!currentProfile || target.id === currentProfile.id) return false;
    if (currentProfile.role === "leader") return true;
    // Elders can only manage members
    if (currentProfile.role === "elder" && target.role === "member") return true;
    return false;
  }

  function availableRoles(target: Profile): Role[] {
    if (!currentProfile) return [];
    const all: Role[] = ["member", "elder", "leader"];
    if (currentProfile.role === "elder") {
      // Elders can only set to member or elder
      return all.filter((r) => r !== "leader" && r !== target.role);
    }
    return all.filter((r) => r !== target.role);
  }

  async function setRole(profileId: string, newRole: Role) {
    const supabase = getSupabase();
    const { error } = await supabase
      .from("profiles")
      .update({ role: newRole })
      .eq("id", profileId);

    if (error) {
      setError(`Failed to update role: ${error.message}`);
      return;
    }

    setProfiles((prev) =>
      prev.map((p) => (p.id === profileId ? { ...p, role: newRole } : p))
    );
  }

  async function awardBadge() {
    if (!badgeTarget || !currentProfile) return;
    setAwardingBadge(true);
    setBadgeMessage(null);
    const supabase = getSupabase();
    const target = profiles.find((p) => p.id === badgeTarget);
    const option = SPECIAL_BADGE_OPTIONS.find((o) => o.key === badgeKey);
    const { error: insertError } = await supabase.from("player_badges").insert({
      player_id: badgeTarget,
      badge_key: badgeKey,
      badge_label: option?.label ?? badgeKey,
      note: badgeNote.trim() || null,
      awarded_by: currentProfile.id,
    });
    if (insertError) {
      if (insertError.message.includes("player_badges_unique") || insertError.message.includes("duplicate")) {
        setBadgeMessage(`${target?.callsign ?? "Operator"} already holds the ${option?.label ?? badgeKey} badge.`);
      } else {
        setBadgeMessage(`Error: ${insertError.message}`);
      }
    } else {
      setBadgeMessage(`${option?.label ?? badgeKey} badge awarded to ${target?.callsign ?? "operator"}.`);
      setBadgeNote("");
      const { data: refreshed } = await supabase
        .from("player_badges")
        .select("*")
        .eq("player_id", badgeTarget);
      setPlayerBadgesMap((prev) => {
        const next = new Map(prev);
        next.set(badgeTarget, refreshed ?? []);
        return next;
      });
    }
    setAwardingBadge(false);
  }

  async function toggleApproval(profileId: string, currentApproved: boolean) {
    const supabase = getSupabase();
    const { error } = await supabase
      .from("profiles")
      .update({ approved: !currentApproved })
      .eq("id", profileId);

    if (error) {
      setError(`Failed to update approval: ${error.message}`);
      return;
    }

    setProfiles((prev) =>
      prev.map((p) =>
        p.id === profileId ? { ...p, approved: !currentApproved } : p
      )
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen p-6">
        <div className="max-w-4xl mx-auto text-terminal-muted text-sm font-mono animate-pulse-glow">Accessing guild records...</div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen p-6">
        <div className="max-w-4xl mx-auto">
          <div className="border border-terminal-red/30 bg-terminal-red/5 rounded-lg p-4 text-terminal-red text-sm font-mono mb-4">
            {error}
          </div>
          <Link href="/" className="text-terminal-green text-xs font-mono hover:text-terminal-green/80">
            ← Return to operations
          </Link>
        </div>
      </main>
    );
  }

  const pending = profiles.filter((p) => !p.approved);
  const approved = profiles.filter((p) => p.approved);

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <div className="max-w-4xl mx-auto">
        <Link
          href="/"
          className="text-terminal-muted hover:text-terminal-green text-xs mb-6 inline-flex items-center gap-1 font-mono transition-colors"
        >
          <ArrowLeft size={12} weight="bold" />
          OPERATIONS
        </Link>

        <h1 className="text-xl sm:text-2xl font-bold font-mono text-terminal-green glow-green mb-6 flex items-center gap-2">
          <Shield size={20} weight="bold" />
          GUILD MANAGEMENT
        </h1>

        {/* Pending approval */}
        {pending.length > 0 && (
          <div className="mb-8">
            <h2 className="text-sm font-mono font-bold text-terminal-amber uppercase tracking-widest mb-3">
              PENDING APPROVAL ({pending.length})
            </h2>
            <div className="space-y-2">
              {pending.map((profile) => (
                <div
                  key={profile.id}
                  className="border border-terminal-amber/30 bg-terminal-amber/5 rounded-lg p-4 flex items-center justify-between"
                >
                  <div>
                    <div className="text-foreground text-sm font-mono font-bold">
                      {profile.callsign ?? "No callsign"}
                    </div>
                    <div className="text-terminal-muted text-xs font-mono mt-0.5">
                      {profile.email}
                    </div>
                  </div>
                  <button
                    onClick={() => toggleApproval(profile.id, false)}
                    className="text-xs font-mono border border-terminal-green/30 bg-terminal-green/10 text-terminal-green hover:bg-terminal-green/20 px-3 py-1 rounded transition-colors flex items-center gap-1"
                  >
                    <CheckCircle size={12} weight="bold" />
                    APPROVE
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Members */}
        <div className="mb-8">
          <h2 className="text-sm font-mono font-bold text-terminal-dim uppercase tracking-widest mb-3">
            OPERATORS ({approved.length})
          </h2>
          <div className="space-y-2">
            {approved.map((profile) => (
              <div
                key={profile.id}
                className="panel p-4 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <UserCircle size={20} weight="bold" className="text-terminal-muted" />
                  <div>
                    <div className="text-foreground text-sm font-mono font-bold">
                      {profile.callsign ?? "—"}
                    </div>
                    <div className="text-terminal-muted text-xs font-mono mt-0.5">
                      {profile.email}
                    </div>
                    {profile.rank_title && (
                      <div className="text-terminal-gold/70 text-[10px] font-mono mt-0.5">
                        {profile.rank_title}
                      </div>
                    )}
                    {(playerBadgesMap.get(profile.id) ?? []).length > 0 && (
                      <div className="flex gap-1.5 mt-1.5 flex-wrap">
                        {(playerBadgesMap.get(profile.id) ?? []).map((b) => (
                          <BadgeArt key={b.id} badgeKey={b.badge_key} size="sm" />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${
                      ROLE_COLORS[profile.role as Role] ?? ROLE_COLORS.member
                    }`}
                  >
                    {profile.role}
                  </span>
                  {canManage(profile) &&
                    availableRoles(profile).map((r) => (
                      <button
                        key={r}
                        onClick={() => setRole(profile.id, r)}
                        className="text-[10px] font-mono border border-terminal-border text-terminal-muted hover:text-foreground hover:border-terminal-green/30 px-2 py-1 rounded transition-colors"
                      >
                        → {r}
                      </button>
                    ))}
                  {profile.id === currentProfile?.id && (
                    <span className="text-[10px] text-terminal-muted font-mono">(you)</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Special Badge Award */}
        <div className="mb-8">
          <h2 className="text-sm font-mono font-bold text-terminal-gold uppercase tracking-widest mb-3">
            SPECIAL BADGE AWARD
          </h2>
          <div className="panel p-4">
            <p className="text-xs font-mono text-terminal-muted mb-4">
              Award special recognition badges. Milestone badges (Reliability, Fieldcraft, etc.) are granted automatically when operators hit set targets.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-[10px] font-mono text-terminal-muted uppercase tracking-widest block mb-1.5">Operator</label>
                <select
                  value={badgeTarget}
                  onChange={(e) => setBadgeTarget(e.target.value)}
                  className="w-full bg-terminal-panel border border-terminal-border rounded px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:border-terminal-gold/40 transition-colors"
                >
                  <option value="">— select operator —</option>
                  {approved.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.callsign ?? p.email}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-mono text-terminal-muted uppercase tracking-widest block mb-1.5">Badge</label>
                <div className="flex items-center gap-2">
                  {badgeKey && <BadgeArt badgeKey={badgeKey} size="sm" />}
                  <select
                    value={badgeKey}
                    onChange={(e) => setBadgeKey(e.target.value)}
                    className="flex-1 bg-terminal-panel border border-terminal-border rounded px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:border-terminal-gold/40 transition-colors"
                  >
                    {SPECIAL_BADGE_OPTIONS.map((o) => (
                      <option key={o.key} value={o.key}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <textarea
              value={badgeNote}
              onChange={(e) => setBadgeNote(e.target.value)}
              maxLength={200}
              rows={2}
              placeholder="Optional citation note..."
              className="w-full bg-terminal-panel border border-terminal-border rounded px-3 py-2 text-sm font-mono text-foreground placeholder:text-terminal-muted/50 focus:outline-none focus:border-terminal-gold/40 transition-colors mb-3"
            />
            <div className="flex items-center justify-between gap-3">
              {badgeMessage ? (
                <p className="text-xs font-mono text-terminal-muted">{badgeMessage}</p>
              ) : <div />}
              <button
                onClick={awardBadge}
                disabled={!badgeTarget || awardingBadge}
                className="px-4 py-1.5 rounded border border-terminal-gold/40 bg-terminal-gold/10 text-terminal-gold text-xs font-mono font-bold hover:bg-terminal-gold/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {awardingBadge ? "AWARDING..." : "AWARD BADGE"}
              </button>
            </div>
          </div>
        </div>

        {/* Info */}
        <div className="panel p-4">
          <h3 className="text-xs font-mono font-bold text-terminal-dim uppercase tracking-widest mb-2">ROLE PERMISSIONS</h3>
          <ul className="text-xs text-terminal-muted font-mono space-y-1">
            <li>• <span className="text-foreground">Members</span> — view dashboard, earn renown, claim nodes</li>
            <li>• <span className="text-terminal-gold">Elders</span> — approve new members, promote members to elder</li>
            <li>• <span className="text-terminal-green">Leaders</span> — full guild management, assign any role</li>
            <li>• You cannot change your own role.</li>
          </ul>
        </div>
      </div>
    </main>
  );
}
