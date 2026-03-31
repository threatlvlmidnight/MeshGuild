"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { Broadcast } from "@phosphor-icons/react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    const supabase = getSupabase();

    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setError(error.message);
      } else {
        router.push("/");
        router.refresh();
      }
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
      });
      if (error) {
        setError(error.message);
      } else {
        setMessage("Check your email to confirm your account.");
      }
    }

    setLoading(false);
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Broadcast size={32} weight="bold" className="text-terminal-green mx-auto mb-3" />
          <h1 className="text-xl font-bold font-mono text-terminal-green glow-green">
            THE SIGNAL
          </h1>
          <p className="text-terminal-muted text-xs font-mono mt-2">
            {mode === "login" ? "AUTHENTICATE TO ACCESS OPERATIONS" : "REQUEST OPERATOR ACCESS"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-[10px] text-terminal-muted font-mono uppercase tracking-widest mb-1">
              EMAIL
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full bg-terminal-panel border border-terminal-border rounded-lg px-3 py-2 text-foreground text-sm font-mono focus:outline-none focus:border-terminal-green/50 transition-colors"
              placeholder="operator@signal.order"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-[10px] text-terminal-muted font-mono uppercase tracking-widest mb-1">
              PASSWORD
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full bg-terminal-panel border border-terminal-border rounded-lg px-3 py-2 text-foreground text-sm font-mono focus:outline-none focus:border-terminal-green/50 transition-colors"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="border border-terminal-red/30 bg-terminal-red/5 rounded-lg p-3 text-terminal-red text-xs font-mono">
              {error}
            </div>
          )}

          {message && (
            <div className="border border-terminal-green/30 bg-terminal-green/5 rounded-lg p-3 text-terminal-green text-xs font-mono">
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full border border-terminal-green/40 bg-terminal-green/10 hover:bg-terminal-green/20 disabled:opacity-50 text-terminal-green font-mono font-bold py-2 px-4 rounded-lg transition-colors text-sm"
          >
            {loading
              ? "AUTHENTICATING..."
              : mode === "login"
              ? "[ SIGN IN ]"
              : "[ REQUEST ACCESS ]"}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={() => {
              setMode(mode === "login" ? "signup" : "login");
              setError(null);
              setMessage(null);
            }}
            className="text-terminal-muted hover:text-terminal-green text-xs font-mono transition-colors"
          >
            {mode === "login"
              ? "Need access? Request operator credentials"
              : "Already an operator? Sign in"}
          </button>
        </div>

        <div className="mt-4 text-center">
          <a href="/" className="text-terminal-muted/50 hover:text-terminal-muted text-[10px] font-mono transition-colors">
            ← Return to operations
          </a>
        </div>
      </div>
    </main>
  );
}
