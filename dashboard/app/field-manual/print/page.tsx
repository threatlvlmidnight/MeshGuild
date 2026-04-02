"use client";

import { useEffect } from "react";

export default function FieldManualPrintPage() {
  useEffect(() => {
    window.print();
  }, []);

  return (
    <div style={{ fontFamily: "Georgia, serif", maxWidth: 680, margin: "0 auto", padding: "40px 24px", color: "#111", background: "#fff", fontSize: 12 }}>
      <h1 style={{ fontFamily: "monospace", fontSize: 20, borderBottom: "2px solid #111", paddingBottom: 8, marginBottom: 4 }}>THE FIELD MANUAL</h1>
      <p style={{ fontFamily: "monospace", fontSize: 10, color: "#555", marginBottom: 32 }}>Operator&apos;s guide to The Signal — meshguild.vercel.app</p>

      {/* WHAT IS THE SIGNAL */}
      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontFamily: "monospace", fontSize: 13, borderBottom: "1px solid #ccc", paddingBottom: 4, marginBottom: 10 }}>WHAT IS THE SIGNAL</h2>
        <p style={{ marginBottom: 8 }}>The Signal is a fraternal order of signal operators dedicated to building and maintaining a decentralized Meshtastic mesh communication network.</p>
        <p style={{ marginBottom: 8 }}>Our adversary is The Silence — the absence that grows when the mesh goes dark. Every node online pushes back The Silence. Every operator who maintains their signal strengthens the order.</p>
        <p>Through Renown, Commendations, and Relics, operators progress through the ranks — from Initiate to Grand Architect. The mesh is our shared infrastructure. The game is our shared purpose.</p>
      </section>

      {/* GETTING STARTED */}
      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontFamily: "monospace", fontSize: 13, borderBottom: "1px solid #ccc", paddingBottom: 4, marginBottom: 10 }}>GETTING STARTED</h2>
        <p style={{ marginBottom: 8, fontWeight: "bold" }}>Requirements:</p>
        <ul style={{ marginLeft: 20, marginBottom: 12 }}>
          <li>A Meshtastic-compatible radio (Heltec V3, T-Beam, RAK, etc.)</li>
          <li>The Meshtastic app (iOS / Android / desktop)</li>
          <li>WiFi access for MQTT uplink (or a companion phone)</li>
        </ul>
        <p style={{ marginBottom: 8, fontWeight: "bold" }}>Steps:</p>
        <ol style={{ marginLeft: 20 }}>
          <li style={{ marginBottom: 4 }}>Create an account at meshguild.vercel.app/login</li>
          <li style={{ marginBottom: 4 }}>Flash your Meshtastic device with the latest firmware</li>
          <li style={{ marginBottom: 4 }}>Configure MQTT settings (see Device Configuration below)</li>
          <li style={{ marginBottom: 4 }}>Power on your node and send a test message</li>
          <li>Complete the Rite of First Signal to claim your node</li>
        </ol>
      </section>

      {/* HARDWARE GUIDE */}
      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontFamily: "monospace", fontSize: 13, borderBottom: "1px solid #ccc", paddingBottom: 4, marginBottom: 10 }}>HARDWARE GUIDE</h2>
        <p style={{ marginBottom: 8 }}>Any Meshtastic-compatible radio will work. Below are recommended boards.</p>

        <p style={{ fontWeight: "bold", marginBottom: 4 }}>FOUNDER&apos;S BOARD — YELUFT ESP32 LoRa V3</p>
        <p style={{ marginBottom: 8 }}>ESP32-S3 · SX1262 · 915 MHz · 0.96″ OLED · WiFi + BLE · Type-C · battery interface. ~$22. Flash via flasher.meshtastic.org in Chrome. Amazon: amazon.com/dp/B0FT7WR12P</p>

        <p style={{ fontWeight: "bold", marginBottom: 4 }}>① PORTABLE — LILYGO T-Beam Supreme</p>
        <p style={{ marginBottom: 8 }}>ESP32-S3 · SX1262 · L76K GPS · 18650 battery slot · OLED. lilygo.cc/products/t-beam-s3-supreme</p>

        <p style={{ fontWeight: "bold", marginBottom: 4 }}>② RELAY — SenseCAP Solar Node P1-Pro</p>
        <p style={{ marginBottom: 8 }}>Solar-powered · outdoor weatherproof · GPS. amazon.com/dp/B0FMDHBWX8</p>

        <p style={{ fontWeight: "bold", marginBottom: 4 }}>③ ALL-IN-ONE — LILYGO T-Deck</p>
        <p>ESP32-S3 · SX1262 · built-in QWERTY keyboard · 2.8″ display · battery. lilygo.cc/products/t-deck</p>
      </section>

      {/* NODE SETUP */}
      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontFamily: "monospace", fontSize: 13, borderBottom: "1px solid #ccc", paddingBottom: 4, marginBottom: 10 }}>NODE SETUP: YELUFT V3</h2>
        <ol style={{ marginLeft: 20 }}>
          <li style={{ marginBottom: 6 }}><strong>ATTACH ANTENNA FIRST</strong> — Screw the included 915 MHz whip antenna onto the connector before powering on. Running without an antenna can permanently damage the SX1262 radio.</li>
          <li style={{ marginBottom: 6 }}><strong>FLASH FIRMWARE</strong> — Open flasher.meshtastic.org in Chrome. Connect via USB-C. Select &quot;Heltec V3&quot; and click Flash.</li>
          <li style={{ marginBottom: 6 }}><strong>PAIR WITH APP</strong> — Install the Meshtastic app. Tap + to add a radio, scan for Bluetooth, select your device (Meshtastic_XXXX). No PIN required.</li>
          <li style={{ marginBottom: 6 }}><strong>SET REGION</strong> — Radio Config → LoRa → Region → United States. The board will not transmit until this is set.</li>
          <li style={{ marginBottom: 6 }}><strong>CHOOSE BLUETOOTH OR WIFI</strong> — The V3 cannot use both simultaneously. WiFi recommended for fixed nodes with MQTT uplink. Configure under Radio Config → Network.</li>
          <li style={{ marginBottom: 6 }}><strong>CONFIGURE MQTT</strong> — See Device Configuration below.</li>
          <li><strong>SEND A TEST MESSAGE</strong> — Send any message on the Primary channel (LongFast). It will appear in the guild&apos;s Mesh Shell within seconds.</li>
        </ol>
      </section>

      {/* DEVICE CONFIGURATION */}
      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontFamily: "monospace", fontSize: 13, borderBottom: "1px solid #ccc", paddingBottom: 4, marginBottom: 10 }}>DEVICE CONFIGURATION</h2>
        <p style={{ marginBottom: 8 }}>Configure your Meshtastic device under Radio Config → MQTT with these settings:</p>
        <table style={{ fontFamily: "monospace", fontSize: 11, borderCollapse: "collapse", width: "100%" }}>
          <tbody>
            {[
              ["MQTT Enabled", "ON"],
              ["MQTT Server", "mqtt.meshtastic.org"],
              ["Username", "meshdev"],
              ["Password", "large4cats"],
              ["Root Topic", "msh/US/2/json"],
              ["Encryption", "ON"],
              ["JSON Enabled", "ON"],
            ].map(([k, v]) => (
              <tr key={k} style={{ borderBottom: "1px solid #eee" }}>
                <td style={{ padding: "4px 8px 4px 0", color: "#555", width: "40%" }}>{k}</td>
                <td style={{ padding: "4px 0" }}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ marginTop: 8, fontSize: 11, color: "#555" }}>Note: Replace with your guild&apos;s private broker settings if self-hosting.</p>
      </section>

      {/* RITE OF FIRST SIGNAL */}
      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontFamily: "monospace", fontSize: 13, borderBottom: "1px solid #ccc", paddingBottom: 4, marginBottom: 10 }}>RITE OF FIRST SIGNAL</h2>
        <ol style={{ marginLeft: 20 }}>
          <li style={{ marginBottom: 6 }}><strong>AUTHENTICATE</strong> — Create your operator account. You&apos;ll receive a NATO callsign automatically (e.g., BRAVO-42).</li>
          <li style={{ marginBottom: 6 }}><strong>CONFIGURE DEVICE</strong> — Set up your Meshtastic radio with the guild MQTT settings.</li>
          <li style={{ marginBottom: 6 }}><strong>FIRST TRANSMISSION</strong> — Power on your node and send a message. The network will detect your signal.</li>
          <li><strong>CLAIM NODE</strong> — Select your node from the unclaimed list to bind it to your profile.</li>
        </ol>
        <p style={{ marginTop: 8 }}>Upon completion you&apos;ll receive +50 Renown and begin your journey as Initiate I.</p>
      </section>

      {/* RANKS */}
      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontFamily: "monospace", fontSize: 13, borderBottom: "1px solid #ccc", paddingBottom: 4, marginBottom: 10 }}>RANKS & PROGRESSION</h2>
        <p style={{ marginBottom: 8 }}>Operators progress through three role tiers:</p>
        <p style={{ marginBottom: 4 }}><strong>MEMBER RANKS (12):</strong> Initiate I–III → Signal Runner I–III → Relay Adept I–III → Circuit Warden I–III</p>
        <p style={{ marginBottom: 4 }}><strong>ELDER RANKS (9):</strong> Sentinel I–III → Signal Marshal I–III → High Warden I–III</p>
        <p style={{ marginBottom: 8 }}><strong>LEADER RANKS (7):</strong> Architect I–III → Grand Architect I–III → Founder</p>
        <p style={{ fontSize: 11, color: "#555" }}>Renown (XP) is earned through node uptime, packet volume, and completing Operations. Ranks auto-promote within your tier. Promotion to Elder or Leader requires manual elevation by guild leadership.</p>
      </section>

      {/* MESH SHELL */}
      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontFamily: "monospace", fontSize: 13, borderBottom: "1px solid #ccc", paddingBottom: 4, marginBottom: 10 }}>MESH SHELL</h2>
        <p style={{ marginBottom: 8 }}>The Mesh Shell is the web interface to the mesh radio network. Messages travel over actual Meshtastic radio links.</p>
        <p style={{ marginBottom: 4 }}><strong>Inbound:</strong> Mesh → MQTT → Collector → Realtime broadcast → Browser</p>
        <p style={{ marginBottom: 8 }}><strong>Outbound:</strong> Browser → Queue → Collector → MQTT → Mesh radio</p>
        <p style={{ fontSize: 11, color: "#555" }}>Messages are cached locally in your browser. They are not stored on the server. Channel tabs correspond to Meshtastic channels (CH0 = Primary/LongFast).</p>
      </section>

      {/* LORE */}
      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontFamily: "monospace", fontSize: 13, borderBottom: "1px solid #ccc", paddingBottom: 4, marginBottom: 10 }}>THE LORE</h2>
        <p style={{ fontStyle: "italic", marginBottom: 8, color: "#333" }}>&quot;In the beginning, there was only The Silence — a world of dead airwaves and severed links. Then came the first signal. A single packet, bouncing between two nodes, proving that communication could exist without permission, without infrastructure, without authority.&quot;</p>
        <p style={{ marginBottom: 10 }}>The Signal is a self-aware techno-fraternal order. We use the pageantry of ranks, rites, and relics as a fun wrapper around a serious mission: maintaining resilient off-grid communications.</p>
        <table style={{ fontFamily: "monospace", fontSize: 11, borderCollapse: "collapse" }}>
          <tbody>
            {[
              ["Members", "Operators"],
              ["XP", "Renown"],
              ["Achievements", "Commendations"],
              ["Cards", "Relics"],
              ["Challenges", "Operations (Ops)"],
              ["Leaderboard", "The Registry"],
              ["Node offline", '"Going dark"'],
              ["Adversary", "The Silence"],
            ].map(([k, v]) => (
              <tr key={k}>
                <td style={{ padding: "2px 16px 2px 0", color: "#555" }}>{k}:</td>
                <td style={{ padding: "2px 0" }}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <hr style={{ borderTop: "1px solid #ccc", marginTop: 32, marginBottom: 12 }} />
      <p style={{ fontFamily: "monospace", fontSize: 10, color: "#888", textAlign: "center" }}>
        THE SIGNAL — meshguild.vercel.app — Printed {new Date().toLocaleDateString()}
      </p>
    </div>
  );
}
