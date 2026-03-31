import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        terminal: {
          green: "#00ff88",
          dim: "#00cc6a",
          gold: "#d4a746",
          amber: "#f0b429",
          red: "#ff4444",
          bg: "#111318",
          panel: "#181b22",
          border: "#2a2f3a",
          muted: "#6b7280",
        },
      },
      fontFamily: {
        mono: ["var(--font-geist-mono)", "Menlo", "monospace"],
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
      },
      keyframes: {
        scanline: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100vh)" },
        },
        pulse_glow: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.6" },
        },
        flicker: {
          "0%, 100%": { opacity: "1" },
          "92%": { opacity: "1" },
          "93%": { opacity: "0.8" },
          "94%": { opacity: "1" },
          "96%": { opacity: "0.9" },
          "97%": { opacity: "1" },
        },
      },
      animation: {
        scanline: "scanline 8s linear infinite",
        "pulse-glow": "pulse_glow 2s ease-in-out infinite",
        flicker: "flicker 4s linear infinite",
      },
    },
  },
  plugins: [],
};
export default config;
