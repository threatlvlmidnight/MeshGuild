"use client";

import Link from "next/link";
import { Broadcast, BookOpen, Plugs, Radio, Lightning, Shield, ChatText, Scroll } from "@phosphor-icons/react";
import { motion } from "framer-motion";

interface Section {
  id: string;
  title: string;
  icon: React.ReactNode;
  content: React.ReactNode;
}

const SECTIONS: Section[] = [
  {
    id: "what-is-the-signal",
    title: "WHAT IS THE SIGNAL",
    icon: <Broadcast size={18} weight="bold" />,
    content: (
      <div className="space-y-3 text-sm font-mono text-terminal-muted">
        <p>
          <span className="text-terminal-green">The Signal</span> is a fraternal order of signal operators
          dedicated to building and maintaining a decentralized Meshtastic mesh communication network.
        </p>
        <p>
          Our adversary is <span className="text-terminal-red">The Silence</span> — the absence that grows
          when the mesh goes dark. Every node online pushes back The Silence. Every operator who
          maintains their signal strengthens the order.
        </p>
        <p>
          Through Renown, Commendations, and Relics, operators progress through the ranks — from
          Initiate to Grand Architect. The mesh is our shared infrastructure. The game is our shared purpose.
        </p>
      </div>
    ),
  },
  {
    id: "getting-started",
    title: "GETTING STARTED",
    icon: <Lightning size={18} weight="bold" />,
    content: (
      <div className="space-y-3 text-sm font-mono text-terminal-muted">
        <p className="text-terminal-amber font-bold">Requirements:</p>
        <ul className="list-none space-y-1">
          <li>▸ A Meshtastic-compatible radio (Heltec V3, T-Beam, RAK, etc.)</li>
          <li>▸ The Meshtastic app (iOS / Android / desktop)</li>
          <li>▸ WiFi access for MQTT uplink (or a companion phone)</li>
        </ul>
        <p className="text-terminal-amber font-bold mt-4">Steps:</p>
        <ol className="list-none space-y-2">
          <li>
            <span className="text-terminal-green">1.</span>{" "}
            Create an account at{" "}
            <Link href="/login" className="text-terminal-green hover:underline">
              meshguild.vercel.app/login
            </Link>
          </li>
          <li>
            <span className="text-terminal-green">2.</span>{" "}
            Flash your Meshtastic device with the latest firmware
          </li>
          <li>
            <span className="text-terminal-green">3.</span>{" "}
            Configure MQTT settings (see Device Configuration below)
          </li>
          <li>
            <span className="text-terminal-green">4.</span>{" "}
            Power on your node and send a test message
          </li>
          <li>
            <span className="text-terminal-green">5.</span>{" "}
            Complete the{" "}
            <Link href="/onboarding" className="text-terminal-green hover:underline">
              Rite of First Signal
            </Link>{" "}
            to claim your node
          </li>
        </ol>
      </div>
    ),
  },
  {
    id: "device-configuration",
    title: "DEVICE CONFIGURATION",
    icon: <Plugs size={18} weight="bold" />,
    content: (
      <div className="space-y-3 text-sm font-mono text-terminal-muted">
        <p>Configure your Meshtastic device with these MQTT settings to connect to the guild network:</p>
        <div className="panel p-4 space-y-2 border-terminal-green/20">
          <div className="flex justify-between">
            <span className="text-terminal-muted/60">MQTT Enabled:</span>
            <span className="text-terminal-green">ON</span>
          </div>
          <div className="flex justify-between">
            <span className="text-terminal-muted/60">MQTT Server:</span>
            <span className="text-foreground">mqtt.meshtastic.org</span>
          </div>
          <div className="flex justify-between">
            <span className="text-terminal-muted/60">Username:</span>
            <span className="text-foreground">meshdev</span>
          </div>
          <div className="flex justify-between">
            <span className="text-terminal-muted/60">Password:</span>
            <span className="text-foreground">large4cats</span>
          </div>
          <div className="flex justify-between">
            <span className="text-terminal-muted/60">Root Topic:</span>
            <span className="text-foreground">msh/US/2/json</span>
          </div>
          <div className="flex justify-between">
            <span className="text-terminal-muted/60">Encryption:</span>
            <span className="text-terminal-green">ON (JSON mode)</span>
          </div>
          <div className="flex justify-between">
            <span className="text-terminal-muted/60">JSON Enabled:</span>
            <span className="text-terminal-green">ON</span>
          </div>
        </div>
        <p className="text-terminal-amber text-xs">
          Note: Replace MQTT server details with your guild&apos;s private broker if self-hosting.
        </p>
      </div>
    ),
  },
  {
    id: "rite-of-first-signal",
    title: "RITE OF FIRST SIGNAL",
    icon: <Radio size={18} weight="bold" />,
    content: (
      <div className="space-y-3 text-sm font-mono text-terminal-muted">
        <p>
          The Rite of First Signal is your induction ceremony. It consists of four steps:
        </p>
        <ol className="list-none space-y-2">
          <li>
            <span className="text-terminal-green font-bold">① AUTHENTICATE</span> — Create your operator
            account. You&apos;ll receive a NATO callsign automatically (e.g., BRAVO-42).
          </li>
          <li>
            <span className="text-terminal-green font-bold">② CONFIGURE DEVICE</span> — Set up your
            Meshtastic radio with the guild MQTT settings.
          </li>
          <li>
            <span className="text-terminal-green font-bold">③ FIRST TRANSMISSION</span> — Power on your
            node and send a message. The network will detect your signal.
          </li>
          <li>
            <span className="text-terminal-green font-bold">④ CLAIM NODE</span> — Select your node from
            the unclaimed list to bind it to your profile.
          </li>
        </ol>
        <p>
          Upon completion, you&apos;ll receive <span className="text-terminal-gold font-bold">+50 Renown</span> and
          begin your journey as <span className="text-terminal-green">Initiate I</span>.
        </p>
      </div>
    ),
  },
  {
    id: "ranks",
    title: "RANKS & PROGRESSION",
    icon: <Shield size={18} weight="bold" />,
    content: (
      <div className="space-y-3 text-sm font-mono text-terminal-muted">
        <p>Operators progress through three role tiers, each with its own rank ladder:</p>

        <div className="space-y-4">
          <div>
            <p className="text-terminal-green font-bold mb-1">MEMBER RANKS (12)</p>
            <p className="text-xs">
              Initiate I–III → Signal Runner I–III → Relay Adept I–III → Circuit Warden I–III
            </p>
          </div>
          <div>
            <p className="text-terminal-gold font-bold mb-1">ELDER RANKS (9)</p>
            <p className="text-xs">
              Sentinel I–III → Signal Marshal I–III → High Warden I–III
            </p>
          </div>
          <div>
            <p className="text-terminal-amber font-bold mb-1">LEADER RANKS (7)</p>
            <p className="text-xs">
              Architect I–III → Grand Architect I–III → Founder
            </p>
          </div>
        </div>

        <p className="text-xs mt-2">
          Renown (XP) is earned through node uptime, packet volume, and completing Operations.
          Ranks auto-promote within your role tier. Promotion to Elder or Leader requires manual
          elevation by guild leadership.
        </p>
      </div>
    ),
  },
  {
    id: "mesh-shell",
    title: "MESH SHELL",
    icon: <ChatText size={18} weight="bold" />,
    content: (
      <div className="space-y-3 text-sm font-mono text-terminal-muted">
        <p>
          The <Link href="/messages" className="text-terminal-green hover:underline">Mesh Shell</Link> is
          your web interface to the mesh radio network. Messages travel over the actual Meshtastic
          radio links — the dashboard is just a convenient shell for reading and composing.
        </p>
        <p className="text-terminal-amber font-bold">How it works:</p>
        <ul className="list-none space-y-1 text-xs">
          <li>▸ <span className="text-terminal-green">Inbound:</span> Mesh → MQTT → Collector → Realtime broadcast → Your browser</li>
          <li>▸ <span className="text-terminal-gold">Outbound:</span> Your browser → Queue → Collector → MQTT → Mesh radio</li>
        </ul>
        <p className="text-xs">
          Messages are cached locally in your browser. They are not stored on the server.
          Channel tabs correspond to Meshtastic channels (CH0 = Primary/LongFast).
        </p>
      </div>
    ),
  },
  {
    id: "lore",
    title: "THE LORE",
    icon: <Scroll size={18} weight="bold" />,
    content: (
      <div className="space-y-3 text-sm font-mono text-terminal-muted">
        <p className="text-terminal-green italic">
          &quot;In the beginning, there was only The Silence — a world of dead airwaves and severed links.
          Then came the first signal. A single packet, bouncing between two nodes, proving that
          communication could exist without permission, without infrastructure, without authority.&quot;
        </p>
        <p>
          The Signal is a self-aware techno-fraternal order. We use the pageantry of ranks, rites,
          and relics as a fun wrapper around a serious mission: maintaining resilient off-grid communications.
        </p>
        <p className="text-terminal-amber font-bold">Vocabulary:</p>
        <div className="grid grid-cols-2 gap-1 text-xs">
          <span className="text-terminal-muted/60">Members:</span><span>Operators</span>
          <span className="text-terminal-muted/60">XP:</span><span>Renown</span>
          <span className="text-terminal-muted/60">Achievements:</span><span>Commendations</span>
          <span className="text-terminal-muted/60">Cards:</span><span>Relics</span>
          <span className="text-terminal-muted/60">Challenges:</span><span>Operations (Ops)</span>
          <span className="text-terminal-muted/60">Leaderboard:</span><span>The Registry</span>
          <span className="text-terminal-muted/60">Node offline:</span><span>&quot;Going dark&quot;</span>
          <span className="text-terminal-muted/60">Adversary:</span><span className="text-terminal-red">The Silence</span>
        </div>
      </div>
    ),
  },
];

export default function FieldManualPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="border-b border-terminal-border">
        <div className="max-w-3xl mx-auto px-4 py-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BookOpen size={24} weight="bold" className="text-terminal-gold" />
            <div>
              <h1 className="text-lg font-mono font-bold text-terminal-gold tracking-wider">
                THE FIELD MANUAL
              </h1>
              <p className="text-terminal-muted text-xs font-mono">
                Operator&apos;s guide to The Signal
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => window.print()}
              className="text-xs font-mono text-terminal-muted hover:text-terminal-green transition-colors hidden sm:inline"
            >
              [ PRINT / PDF ]
            </button>
            <Link
              href="/"
              className="text-xs font-mono text-terminal-muted hover:text-terminal-green transition-colors"
            >
              [ HOME ]
            </Link>
          </div>
        </div>
      </div>

      {/* Table of contents */}
      <div className="max-w-3xl mx-auto px-4 py-4 border-b border-terminal-border">
        <p className="text-[10px] font-mono text-terminal-muted uppercase tracking-widest mb-2">
          CONTENTS
        </p>
        <div className="flex flex-wrap gap-2">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="text-xs font-mono text-terminal-green/70 hover:text-terminal-green transition-colors"
            >
              [{s.title}]
            </a>
          ))}
        </div>
      </div>

      {/* Sections */}
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-8">
        {SECTIONS.map((section, i) => (
          <motion.section
            key={section.id}
            id={section.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05, duration: 0.3 }}
          >
            <div className="flex items-center gap-2 mb-4 pb-2 border-b border-terminal-border">
              <span className="text-terminal-green">{section.icon}</span>
              <h2 className="text-sm font-mono font-bold text-terminal-green tracking-wider">
                {section.title}
              </h2>
            </div>
            {section.content}
          </motion.section>
        ))}
      </div>

      {/* Footer */}
      <div className="border-t border-terminal-border mt-8 p-6 text-center">
        <p className="text-terminal-muted/40 text-[10px] font-mono uppercase tracking-widest">
          The Signal &middot; Hold the signal &middot; Push back The Silence
        </p>
      </div>
    </main>
  );
}
