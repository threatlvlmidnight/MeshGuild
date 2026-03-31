"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase, Profile } from "@/lib/supabase";
import AuthNav from "@/components/auth-nav";
import { Broadcast, CheckCircle, Circle, Radio, Lightning, Plugs } from "@phosphor-icons/react";
import { motion } from "framer-motion";
import type { User } from "@supabase/supabase-js";

interface RiteStep {
  key: string;
  label: string;
  description: string;
  icon: React.ReactNode;
}

const STEPS: RiteStep[] = [
  {
    key: "authenticate",
    label: "AUTHENTICATE",
    description: "Sign in to The Signal with your operator credentials.",
    icon: <Lightning size={20} weight="bold" />,
  },
  {
    key: "configure",
    label: "CONFIGURE DEVICE",
    description: "Set up your Meshtastic node with the guild MQTT settings. See the Field Manual for details.",
    icon: <Plugs size={20} weight="bold" />,
  },
  {
    key: "transmit",
    label: "FIRST TRANSMISSION",
    description: "Power on your node and send a message on the mesh. The system will detect your signal.",
    icon: <Radio size={20} weight="bold" />,
  },
  {
    key: "claim",
    label: "CLAIM NODE",
    description: "Select your node from the network to bind it to your operator profile.",
    icon: <Broadcast size={20} weight="bold" />,
  },
];

export default function OnboardingPage() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [riteComplete, setRiteComplete] = useState(false);
  const [unclaimedNodes, setUnclaimedNodes] = useState<{ id: string; short_name: string | null; long_name: string | null }[]>([]);
  const [claiming, setClaiming] = useState(false);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const supabase = getSupabase();

    async function load() {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        router.push("/login");
        return;
      }
      setUser(authUser);

      // Get profile
      const { data: prof } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", authUser.id)
        .single();
      setProfile(prof);

      // Check if rite already completed
      const { data: rite } = await supabase
        .from("rite_completions")
        .select("id")
        .eq("player_id", authUser.id)
        .limit(1);
      if (rite && rite.length > 0) {
        setRiteComplete(true);
      }

      // Get unclaimed nodes (nodes not in node_ownership)
      const { data: allNodes } = await supabase
        .from("nodes")
        .select("id, short_name, long_name")
        .order("long_name");

      const { data: claimed } = await supabase
        .from("node_ownership")
        .select("node_id");

      const claimedIds = new Set((claimed ?? []).map((c) => c.node_id));
      setUnclaimedNodes(
        (allNodes ?? []).filter((n) => !claimedIds.has(n.id))
      );

      setLoading(false);
    }
    load();
  }, [router]);

  // Determine completed steps
  const completedSteps = new Set<string>();
  if (user) completedSteps.add("authenticate");
  // We can't detect device config from the dashboard, so we mark it complete if they have any node data
  if (unclaimedNodes.length > 0 || riteComplete) completedSteps.add("configure");
  if (unclaimedNodes.length > 0 || riteComplete) completedSteps.add("transmit");
  if (riteComplete) completedSteps.add("claim");

  // Determine active step
  let activeStep = "authenticate";
  if (completedSteps.has("authenticate")) activeStep = "configure";
  if (completedSteps.has("configure")) activeStep = "transmit";
  if (completedSteps.has("transmit")) activeStep = "claim";
  if (riteComplete) activeStep = "done";

  async function claimNode(nodeId: string) {
    if (!user || claiming) return;
    setClaiming(true);

    const supabase = getSupabase();

    // Insert node_ownership
    const { error: ownershipError } = await supabase
      .from("node_ownership")
      .insert({ player_id: user.id, node_id: nodeId });

    if (ownershipError) {
      alert("Failed to claim node: " + ownershipError.message);
      setClaiming(false);
      return;
    }

    // Set primary node
    await supabase
      .from("profiles")
      .update({ primary_node_id: nodeId })
      .eq("id", user.id);

    // Complete the rite
    const { error: riteError } = await supabase
      .from("rite_completions")
      .insert({ player_id: user.id, node_id: nodeId });

    if (riteError && !riteError.message.includes("duplicate")) {
      console.error("Rite completion error:", riteError.message);
    }

    setRiteComplete(true);
    setClaiming(false);
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-terminal-muted text-sm font-mono animate-pulse-glow">
          Initializing rite protocol...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <AuthNav />

      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <Broadcast size={36} weight="bold" className="text-terminal-green mx-auto mb-3" />
          <h1 className="text-xl font-bold font-mono text-terminal-green glow-green tracking-wider">
            RITE OF FIRST SIGNAL
          </h1>
          <p className="text-terminal-muted text-xs font-mono mt-2">
            Complete the rite to join The Signal as an operator
          </p>
          {profile?.callsign && (
            <p className="text-terminal-gold text-sm font-mono font-bold mt-1">
              Your callsign: {profile.callsign}
            </p>
          )}
        </div>

        {/* Rite Complete */}
        {riteComplete && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="panel p-6 text-center mb-8 border-terminal-green/30"
          >
            <CheckCircle size={48} weight="bold" className="text-terminal-green mx-auto mb-3" />
            <h2 className="text-lg font-mono font-bold text-terminal-green mb-2">
              RITE COMPLETE
            </h2>
            <p className="text-terminal-muted text-sm font-mono mb-1">
              You have been inducted into The Signal. +50 Renown awarded.
            </p>
            <p className="text-terminal-muted/60 text-xs font-mono mb-4">
              Your node is now bound to your operator profile.
            </p>
            <button
              onClick={() => router.push("/")}
              className="px-6 py-2 bg-terminal-green/10 border border-terminal-green/30 text-terminal-green font-mono font-bold text-sm rounded-lg hover:bg-terminal-green/20 transition-colors"
            >
              ENTER OPERATIONS →
            </button>
          </motion.div>
        )}

        {/* Steps */}
        <div className="space-y-4">
          {STEPS.map((step, i) => {
            const isCompleted = completedSteps.has(step.key);
            const isActive = activeStep === step.key && !riteComplete;

            return (
              <motion.div
                key={step.key}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1, duration: 0.3 }}
                className={`panel p-4 transition-colors ${
                  isActive ? "border-terminal-green/40" : ""
                } ${isCompleted ? "border-terminal-green/20 bg-terminal-green/5" : ""}`}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">
                    {isCompleted ? (
                      <CheckCircle size={20} weight="bold" className="text-terminal-green" />
                    ) : isActive ? (
                      <div className="text-terminal-green animate-pulse-glow">{step.icon}</div>
                    ) : (
                      <Circle size={20} className="text-terminal-muted/30" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-terminal-muted uppercase tracking-widest">
                        STEP {i + 1}
                      </span>
                      <h3 className={`text-sm font-mono font-bold ${
                        isCompleted ? "text-terminal-green" : isActive ? "text-foreground" : "text-terminal-muted/50"
                      }`}>
                        {step.label}
                      </h3>
                    </div>
                    <p className={`text-xs font-mono mt-1 ${
                      isCompleted || isActive ? "text-terminal-muted" : "text-terminal-muted/30"
                    }`}>
                      {step.description}
                    </p>

                    {/* Step 2: Link to Field Manual */}
                    {step.key === "configure" && isActive && (
                      <a
                        href="/field-manual"
                        className="inline-block mt-2 text-xs font-mono text-terminal-gold hover:text-terminal-amber transition-colors"
                      >
                        → Open Field Manual for setup instructions
                      </a>
                    )}

                    {/* Step 4: Node claim selector */}
                    {step.key === "claim" && isActive && (
                      <div className="mt-3 space-y-2">
                        {unclaimedNodes.length === 0 ? (
                          <p className="text-terminal-amber text-xs font-mono">
                            No unclaimed nodes detected. Power on your device and wait for it to appear.
                          </p>
                        ) : (
                          <>
                            <p className="text-terminal-muted text-[10px] font-mono uppercase tracking-widest mb-2">
                              SELECT YOUR NODE:
                            </p>
                            <div className="grid gap-2 max-h-48 overflow-y-auto">
                              {unclaimedNodes.map((node) => (
                                <button
                                  key={node.id}
                                  onClick={() => claimNode(node.id)}
                                  disabled={claiming}
                                  className="panel p-3 text-left hover:border-terminal-green/40 transition-colors disabled:opacity-50 flex items-center justify-between"
                                >
                                  <div>
                                    <div className="text-sm font-mono font-bold text-foreground">
                                      {node.long_name ?? node.id}
                                    </div>
                                    {node.short_name && (
                                      <div className="text-xs font-mono text-terminal-muted">{node.short_name}</div>
                                    )}
                                  </div>
                                  <span className="text-[10px] font-mono text-terminal-green font-bold">
                                    CLAIM →
                                  </span>
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
