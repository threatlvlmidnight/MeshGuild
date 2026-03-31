"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabase, Profile } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

export default function AuthNav() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = getSupabase();

    async function loadAuth() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUser(user);

      if (user) {
        const { data } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .single();
        setProfile(data);
      }
      setLoading(false);
    }

    loadAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        const { data } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", session.user.id)
          .single();
        setProfile(data);
      } else {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function handleLogout() {
    const supabase = getSupabase();
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    window.location.href = "/";
  }

  if (loading) return null;

  if (!user) {
    return (
      <Link
        href="/login"
        className="text-sm text-gray-400 hover:text-gray-200 transition-colors"
      >
        Sign In
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-3">
      {profile?.role === "admin" && (
        <Link
          href="/admin"
          className="text-xs bg-purple-900 text-purple-300 px-2 py-0.5 rounded-full hover:bg-purple-800 transition-colors"
        >
          Admin
        </Link>
      )}
      <span className="text-sm text-gray-400">{user.email}</span>
      <button
        onClick={handleLogout}
        className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
      >
        Sign Out
      </button>
    </div>
  );
}
