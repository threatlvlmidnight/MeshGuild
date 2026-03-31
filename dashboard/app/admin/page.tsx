"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabase, Profile } from "@/lib/supabase";

type Role = "member" | "elder" | "leader";

const ROLE_COLORS: Record<Role, string> = {
  member: "bg-gray-700 text-gray-300",
  elder: "bg-amber-900 text-amber-300",
  leader: "bg-purple-900 text-purple-300",
};

export default function AdminPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      <main className="min-h-screen bg-gray-900 text-white p-6">
        <div className="max-w-4xl mx-auto text-gray-400 text-sm">Loading...</div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-gray-900 text-white p-6">
        <div className="max-w-4xl mx-auto">
          <div className="bg-red-900/50 border border-red-700 rounded-lg p-4 text-red-300 text-sm mb-4">
            {error}
          </div>
          <Link href="/" className="text-blue-400 text-sm hover:text-blue-300">
            &larr; Back to dashboard
          </Link>
        </div>
      </main>
    );
  }

  const pending = profiles.filter((p) => !p.approved);
  const approved = profiles.filter((p) => p.approved);

  return (
    <main className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-4xl mx-auto">
        <Link
          href="/"
          className="text-gray-400 hover:text-gray-200 text-sm mb-6 inline-block"
        >
          &larr; Back to dashboard
        </Link>

        <h1 className="text-2xl font-bold mb-6">Guild Management</h1>

        {/* Pending approval */}
        {pending.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-amber-400 mb-4">
              Pending Approval ({pending.length})
            </h2>
            <div className="space-y-2">
              {pending.map((profile) => (
                <div
                  key={profile.id}
                  className="bg-amber-950/30 border border-amber-800/50 rounded-lg p-4 flex items-center justify-between"
                >
                  <div>
                    <div className="text-white text-sm font-mono">
                      {profile.callsign ?? "No callsign"}
                    </div>
                    <div className="text-gray-500 text-xs mt-0.5">
                      {profile.email}
                    </div>
                  </div>
                  <button
                    onClick={() => toggleApproval(profile.id, false)}
                    className="text-xs bg-green-900 hover:bg-green-800 text-green-300 px-3 py-1 rounded transition-colors"
                  >
                    Approve
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Members */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-200 mb-4">
            Members ({approved.length})
          </h2>
          <div className="space-y-2">
            {approved.map((profile) => (
              <div
                key={profile.id}
                className="bg-gray-800 border border-gray-700 rounded-lg p-4 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div>
                    <div className="text-white text-sm font-mono">
                      {profile.callsign ?? "—"}
                    </div>
                    <div className="text-gray-500 text-xs mt-0.5">
                      {profile.email}
                    </div>
                    {profile.rank_title && (
                      <div className="text-amber-400/70 text-xs mt-0.5">
                        {profile.rank_title}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full ${
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
                        className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 px-2 py-1 rounded transition-colors"
                      >
                        → {r}
                      </button>
                    ))}
                  {profile.id === currentProfile?.id && (
                    <span className="text-xs text-gray-600">(you)</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Info */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-300 mb-2">Role Permissions</h3>
          <ul className="text-xs text-gray-400 space-y-1">
            <li>&bull; <span className="text-gray-300">Members</span> — view dashboard, earn renown, claim nodes</li>
            <li>&bull; <span className="text-amber-300">Elders</span> — approve new members, promote members to elder</li>
            <li>&bull; <span className="text-purple-300">Leaders</span> — full guild management, assign any role</li>
            <li>&bull; You cannot change your own role.</li>
          </ul>
        </div>
      </div>
    </main>
  );
}
