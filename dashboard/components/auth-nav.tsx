"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getSupabase, Profile, getRankForRole } from "@/lib/supabase";
import { SignOut, Shield, UserCircle, ChatText, Radio, Wrench, GearSix, Check } from "@phosphor-icons/react";
import type { User } from "@supabase/supabase-js";

type RolePreview = "live" | "member" | "elder" | "leader";

const PREVIEW_OPTIONS: { value: RolePreview; label: string }[] = [
  { value: "live", label: "Actual Role" },
  { value: "member", label: "Member View" },
  { value: "elder", label: "Elder View" },
  { value: "leader", label: "Leader View" },
];

export default function AuthNav() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [rolePreview, setRolePreview] = useState<RolePreview>("live");
  const settingsRef = useRef<HTMLDivElement>(null);

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

    function syncRolePreview() {
      if (typeof window === "undefined") return;
      const stored = window.localStorage.getItem("meshguild-role-preview");
      if (stored === "member" || stored === "elder" || stored === "leader" || stored === "live") {
        setRolePreview(stored);
      } else {
        setRolePreview("live");
      }
    }

    function handleClickOutside(event: MouseEvent) {
      if (settingsRef.current && event.target instanceof Node && !settingsRef.current.contains(event.target)) {
        setShowSettings(false);
      }
    }

    loadAuth();
    syncRolePreview();

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

    window.addEventListener("meshguild-settings-changed", syncRolePreview);
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener("meshguild-settings-changed", syncRolePreview);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  async function handleLogout() {
    const supabase = getSupabase();
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    window.location.href = "/";
  }

  function updateRolePreview(next: RolePreview) {
    setRolePreview(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("meshguild-role-preview", next);
      window.dispatchEvent(new Event("meshguild-settings-changed"));
    }
    setShowSettings(false);
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

  const effectiveRole = rolePreview === "live" ? (profile?.role ?? "member") : rolePreview;
  const isOfficer = effectiveRole === "leader" || effectiveRole === "elder";
  const previewActive = rolePreview !== "live" && effectiveRole !== profile?.role;
  const previewRank = profile ? getRankForRole(effectiveRole, profile.renown ?? 0).rank : null;

  // Check if user has a primary node (rite completed)
  const hasNode = profile?.primary_node_id !== null && profile?.primary_node_id !== undefined;

  return (
    <div className="flex items-center gap-2 flex-wrap justify-end">
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
          href="/ops"
          className="flex items-center gap-1 text-xs font-mono text-terminal-amber hover:text-terminal-gold transition-colors"
          title="Ops Control"
        >
          <Wrench size={14} weight="bold" />
          <span className="hidden sm:inline">OPS</span>
        </Link>
      )}
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
      <div className="relative" ref={settingsRef}>
        <button
          onClick={() => setShowSettings((prev) => !prev)}
          className={`flex items-center gap-1 text-xs font-mono transition-colors ${
            showSettings || previewActive
              ? "text-terminal-dim"
              : "text-terminal-muted hover:text-terminal-dim"
          }`}
          title="Interface settings"
        >
          <GearSix size={14} weight="bold" />
          <span className="hidden sm:inline">SET</span>
        </button>

        {showSettings && (
          <div className="absolute right-0 top-full mt-2 w-56 rounded-lg border border-terminal-border bg-[#161a20] shadow-xl z-50 p-2">
            <div className="text-[10px] font-mono uppercase tracking-widest text-terminal-muted mb-2 px-1">
              Interface Settings
            </div>
            <div className="space-y-1">
              {PREVIEW_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => updateRolePreview(option.value)}
                  className={`w-full flex items-center justify-between rounded px-2 py-1.5 text-xs font-mono transition-colors ${
                    rolePreview === option.value
                      ? "bg-terminal-dim/10 text-terminal-dim"
                      : "text-terminal-muted hover:bg-terminal-panel hover:text-foreground"
                  }`}
                >
                  <span>{option.label}</span>
                  {rolePreview === option.value && <Check size={12} weight="bold" />}
                </button>
              ))}
            </div>
            <p className="text-[10px] font-mono text-terminal-muted/70 mt-2 px-1 leading-relaxed">
              UI preview only — permissions stay unchanged.
            </p>
          </div>
        )}
      </div>
      <span className="text-terminal-border">|</span>
      {previewRank && (
        <span className="text-xs font-mono text-terminal-gold/70 hidden sm:inline">
          {previewRank}
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
