"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { getSupabase, MeshMessage } from "@/lib/supabase";
import { loadMessages, appendMessage, clearMessages } from "@/lib/message-store";
import AuthNav from "@/components/auth-nav";
import { ChatText, PaperPlaneTilt, Trash, Hash, ChatsCircle } from "@phosphor-icons/react";
import { motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import type { User } from "@supabase/supabase-js";

type ChannelTab = { label: string; index: number | null };

const CHANNEL_TABS: ChannelTab[] = [
  { label: "ALL", index: null },
  { label: "CH 0", index: 0 },
  { label: "CH 1", index: 1 },
  { label: "CH 2", index: 2 },
  { label: "DMs", index: -1 },
];

export default function MessagesPage() {
  const [messages, setMessages] = useState<MeshMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [activeTab, setActiveTab] = useState<ChannelTab>(CHANNEL_TABS[0]);
  const [sendChannel, setSendChannel] = useState(0);
  const [user, setUser] = useState<User | null>(null);
  const [connected, setConnected] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Load cached messages + auth on mount
  useEffect(() => {
    setMessages(loadMessages());

    const supabase = getSupabase();
    supabase.auth.getUser().then(({ data: { user } }) => setUser(user));
  }, []);

  // Subscribe to Supabase Realtime broadcast
  useEffect(() => {
    const supabase = getSupabase();
    const channel = supabase.channel("mesh-messages");

    channel.on("broadcast", { event: "new_message" }, ({ payload }) => {
      if (payload) {
        const msg = payload as MeshMessage;
        setMessages((prev) => {
          const updated = appendMessage(msg);
          // Only update if actually new
          return updated.length !== prev.length ? updated : prev;
        });
      }
    });

    channel.subscribe((status) => {
      setConnected(status === "SUBSCRIBED");
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Filter messages for active tab
  const filtered = messages.filter((m) => {
    if (activeTab.index === null) return true; // ALL
    if (activeTab.index === -1) return m.to_node_id !== null; // DMs
    return m.channel_index === activeTab.index;
  });

  // Send message
  const handleSend = useCallback(async () => {
    if (!input.trim() || !user || sending) return;
    setSending(true);

    try {
      const supabase = getSupabase();
      const { error } = await supabase.from("outbound_queue").insert({
        content: input.trim(),
        channel_index: sendChannel,
        player_id: user.id,
      });

      if (error) {
        console.error("[send] queue insert failed:", error.message);
      } else {
        // Add to local messages immediately as optimistic update
        const localMsg: MeshMessage = {
          id: `local-${Date.now()}`,
          node_id: "dashboard",
          to_node_id: null,
          channel_index: sendChannel,
          content: input.trim(),
          sender_name: "YOU",
          source: "dashboard",
          received_at: new Date().toISOString(),
        };
        setMessages(() => appendMessage(localMsg));
        setInput("");
      }
    } catch (e) {
      console.error("[send] error:", e);
    } finally {
      setSending(false);
    }
  }, [input, user, sending, sendChannel]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <AuthNav />

      <div className="max-w-4xl mx-auto px-4 pt-6 pb-4 flex flex-col" style={{ height: "calc(100vh - 56px)" }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <ChatText size={24} weight="bold" className="text-terminal-green" />
            <div>
              <h1 className="text-lg font-mono font-bold text-terminal-green tracking-wider">
                MESH SHELL
              </h1>
              <p className="text-terminal-muted text-xs font-mono">
                Live mesh traffic &middot;{" "}
                <span className={connected ? "text-terminal-green" : "text-terminal-red"}>
                  {connected ? "CONNECTED" : "DISCONNECTED"}
                </span>
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              clearMessages();
              setMessages([]);
            }}
            className="text-terminal-muted hover:text-terminal-red transition-colors p-2"
            title="Clear message cache"
          >
            <Trash size={18} />
          </button>
        </div>

        {/* Channel tabs */}
        <div className="flex gap-1 mb-3 border-b border-terminal-border pb-2">
          {CHANNEL_TABS.map((tab) => (
            <button
              key={tab.label}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1 text-xs font-mono font-bold uppercase tracking-wider rounded transition-colors ${
                activeTab.label === tab.label
                  ? "bg-terminal-green/10 text-terminal-green border border-terminal-green/30"
                  : "text-terminal-muted hover:text-foreground border border-transparent"
              }`}
            >
              {tab.index !== null && tab.index >= 0 ? (
                <Hash size={12} weight="bold" className="inline mr-1 -mt-0.5" />
              ) : tab.index === -1 ? (
                <ChatsCircle size={12} weight="bold" className="inline mr-1 -mt-0.5" />
              ) : null}
              {tab.label}
            </button>
          ))}

          <div className="ml-auto text-terminal-muted text-xs font-mono self-center">
            {filtered.length} msg{filtered.length !== 1 ? "s" : ""}
          </div>
        </div>

        {/* Message list */}
        <div className="flex-1 overflow-y-auto space-y-1 pr-1 min-h-0">
          {filtered.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <ChatText size={48} className="text-terminal-muted/30 mx-auto mb-3" />
                <p className="text-terminal-muted font-mono text-sm">Awaiting transmissions&hellip;</p>
                <p className="text-terminal-muted/60 font-mono text-xs mt-1">
                  Messages from the mesh will appear here in real time
                </p>
              </div>
            </div>
          ) : (
            filtered.map((msg, i) => (
              <MessageRow key={msg.id} msg={msg} index={i} />
            ))
          )}
          <div ref={bottomRef} />
        </div>

        {/* Send input */}
        {user ? (
          <div className="mt-3 border-t border-terminal-border pt-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-terminal-muted text-[10px] font-mono uppercase tracking-widest">
                TX CH:
              </span>
              {[0, 1, 2].map((ch) => (
                <button
                  key={ch}
                  onClick={() => setSendChannel(ch)}
                  className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded transition-colors ${
                    sendChannel === ch
                      ? "bg-terminal-gold/10 text-terminal-gold border border-terminal-gold/30"
                      : "text-terminal-muted hover:text-foreground border border-transparent"
                  }`}
                >
                  {ch}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                maxLength={228}
                placeholder="Type message to transmit to mesh..."
                className="flex-1 bg-terminal-panel border border-terminal-border rounded px-3 py-2 text-sm font-mono text-foreground placeholder:text-terminal-muted/50 focus:outline-none focus:border-terminal-green/50 transition-colors"
                disabled={sending}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || sending}
                className="px-4 py-2 bg-terminal-green/10 border border-terminal-green/30 text-terminal-green font-mono font-bold text-sm rounded hover:bg-terminal-green/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <PaperPlaneTilt size={16} weight="bold" />
                TX
              </button>
            </div>
            <p className="text-terminal-muted/50 text-[10px] font-mono mt-1">
              {228 - input.length} chars remaining &middot; Messages relay through your collector → MQTT → mesh
            </p>
          </div>
        ) : (
          <div className="mt-3 border-t border-terminal-border pt-3 text-center">
            <p className="text-terminal-muted font-mono text-sm">
              Authenticate to transmit
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

// --- Message row component ---

function MessageRow({ msg, index }: { msg: MeshMessage; index: number }) {
  const isYou = msg.source === "dashboard";
  const isDM = msg.to_node_id !== null;
  const age = formatDistanceToNow(new Date(msg.received_at), { addSuffix: true });

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.15, delay: Math.min(index * 0.02, 0.5) }}
      className={`group px-3 py-2 rounded text-sm font-mono hover:bg-terminal-panel/50 transition-colors ${
        isYou ? "border-l-2 border-terminal-gold/40" : ""
      } ${isDM ? "border-l-2 border-terminal-amber/40" : ""}`}
    >
      <div className="flex items-baseline gap-2">
        <span
          className={`font-bold text-xs ${
            isYou
              ? "text-terminal-gold"
              : "text-terminal-green"
          }`}
        >
          {msg.sender_name || msg.node_id}
        </span>
        {isDM && (
          <span className="text-[10px] text-terminal-amber font-bold uppercase tracking-wider">
            DM → {msg.to_node_id}
          </span>
        )}
        <span className="text-terminal-muted/40 text-[10px]">
          CH{msg.channel_index}
        </span>
        <span className="text-terminal-muted/30 text-[10px] ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
          {age}
        </span>
      </div>
      <div className={`mt-0.5 ${isYou ? "text-terminal-gold/80" : "text-foreground/80"}`}>
        {msg.content}
      </div>
    </motion.div>
  );
}
