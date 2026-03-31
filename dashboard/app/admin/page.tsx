"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabase, Profile } from "@/lib/supabase";

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

    // Get current user's profile
    const { data: myProfile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (!myProfile || myProfile.role !== "admin") {
      setError("Access denied — admin role required");
      setLoading(false);
      return;
    }

    setCurrentProfile(myProfile);

    // Get all profiles
    const { data: allProfiles } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: true });

    setProfiles(allProfiles ?? []);
    setLoading(false);
  }

  async function toggleRole(profileId: string, currentRole: string) {
    if (profileId === currentProfile?.id) return; // Can't demote yourself
    const newRole = currentRole === "admin" ? "viewer" : "admin";
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
      prev.map((p) => (p.id === profileId ? { ...p, role: newRole as "admin" | "viewer" } : p))
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

  return (
    <main className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-4xl mx-auto">
        <Link
          href="/"
          className="text-gray-400 hover:text-gray-200 text-sm mb-6 inline-block"
        >
          &larr; Back to dashboard
        </Link>

        <h1 className="text-2xl font-bold mb-6">Admin Settings</h1>

        {/* User management */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-200 mb-4">Users</h2>
          <div className="space-y-2">
            {profiles.map((profile) => (
              <div
                key={profile.id}
                className="bg-gray-800 border border-gray-700 rounded-lg p-4 flex items-center justify-between"
              >
                <div>
                  <div className="text-white text-sm font-medium">
                    {profile.email}
                  </div>
                  <div className="text-gray-500 text-xs font-mono mt-0.5">
                    {profile.id.slice(0, 8)}...
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      profile.role === "admin"
                        ? "bg-purple-900 text-purple-300"
                        : "bg-gray-700 text-gray-400"
                    }`}
                  >
                    {profile.role}
                  </span>
                  {profile.id !== currentProfile?.id && (
                    <button
                      onClick={() => toggleRole(profile.id, profile.role)}
                      className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 px-2 py-1 rounded transition-colors"
                    >
                      {profile.role === "admin"
                        ? "Demote to viewer"
                        : "Promote to admin"}
                    </button>
                  )}
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
          <h3 className="text-sm font-semibold text-gray-300 mb-2">Notes</h3>
          <ul className="text-xs text-gray-400 space-y-1">
            <li>
              &bull; Admin users can dismiss alerts and manage user roles.
            </li>
            <li>
              &bull; Viewer users can view the dashboard but cannot dismiss alerts.
            </li>
            <li>
              &bull; You cannot demote yourself.
            </li>
            <li>
              &bull; The collector service uses a service role key and bypasses RLS.
            </li>
          </ul>
        </div>
      </div>
    </main>
  );
}
