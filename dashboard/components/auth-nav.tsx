"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabase, Profile } from "@/lib/supabase";
import { SignOut, Shield, UserCircle, ChatText, Radio } from "@phosphor-icons/react";
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
        className="text-sm font-mono text-terminal-green/70 hover:text-terminal-green transition-colors"
      >
        [ SIGN IN ]
      </Link>
    );
  }

  const isOfficer = profile?.role === "leader" || profile?.role === "elder";

  // Check if user has a primary node (rite completed)
  const hasNode = profile?.primary_node_id !== null && profile?.primary_node_id !== undefined;

  return (
    <div className="flex items-center gap-2">
      {!hasNode && (
        <Link
          href="/onboarding"
          className="flex items-center gap-1 text-xs font-mono text-terminal-amber hover:text-terminal-gold transition-colors animate-pulse-glow"
          title="Complete Rite of First Signal"
        >
          <Radio size={14} weight="bold" />
          <span className="hidden sm:inline">RITE</span>
        </Link>
      )}
      <Link
        href="/messages"
        className="flex items-center gap-1 text-xs font-mono text-terminal-green/70 hover:text-terminal-green transition-colors"
        title="Mesh Shell"
      >
        <ChatText size={14} weight="bold" />
        <span className="hidden sm:inline">SHELL</span>
      </Link>
      {isOfficer && (
        <Link
          href="/admin"
          className="flex items-center gap-1 text-xs font-mono text-terminal-gold hover:text-terminal-amber transition-colors"
          title="Guild Management"
        >
          <Shield size={14} weight="bold" />
          <span className="hidden sm:inline">GUILD</span>
        </Link>
      )}
      <span className="text-terminal-border">|</span>
      {profile?.rank_title && (
        <span className="text-xs font-mono text-terminal-gold/70 hidden sm:inline">
          {profile.rank_title}
        </span>
      )}
      {profile?.callsign ? (
        <Link
          href={`/profile/${encodeURIComponent(profile.callsign)}`}
          className="flex items-center gap-1 text-sm font-mono text-terminal-green hover:text-terminal-green/80 transition-colors glow-green"
          title="Your Profile"
        >
          <UserCircle size={16} weight="bold" />
          {profile.callsign}
        </Link>
      ) : (
        <span className="text-sm font-mono text-terminal-muted">{user.email}</span>
      )}
      <button
        onClick={handleLogout}
        className="text-terminal-muted hover:text-terminal-red transition-colors ml-1"
        title="Sign Out"
      >
        <SignOut size={16} weight="bold" />
      </button>
    </div>
  );
}
