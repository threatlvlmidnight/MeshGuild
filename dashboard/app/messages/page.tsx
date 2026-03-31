"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { getSupabase, MeshMessage } from "@/lib/supabase";
import { loadMessages, appendMessage, clearMessages } from "@/lib/message-store";
import AuthNav from "@/components/auth-nav";
import { ChatText, PaperPlaneTilt, Trash, Hash, ChatsCircle, Terminal, CaretDown } from "@phosphor-icons/react";
import { motion, AnimatePresence } from "framer-motion";
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

type LogEntry = {
  ts: string;
  level: "info" | "warn" | "error";
  msg: string;
};

export default function MessagesPage() {
  const [messages, setMessages] = useState<MeshMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [activeTab, setActiveTab] = useState<ChannelTab>(CHANNEL_TABS[0]);
  const [sendChannel, setSendChannel] = useState(0);
  const [user, setUser] = useState<User | null>(null);
  const [connected, setConnected] = useState(false);
  const [ownedNodes, setOwnedNodes] = useState<{ node_id: string; short_name: string | null }[]>([]);
  const [selectedNode, setSelectedNode] = useState<string>("");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const logBottomRef = useRef<HTMLDivElement>(null);

  const addLog = useCallback((level: LogEntry["level"], msg: string) => {
    const entry: LogEntry = {
      ts: new Date().toLocaleTimeString("en-US", { hour12: false, fractionalSecondDigits: 3 }),
      level,
      msg,
    };
    setLogs((prev) => [...prev.slice(-200), entry]);
  }, []);

  // Load cached messages + auth + owned nodes on mount
  useEffect(() => {
    setMessages(loadMessages());

    const supabase = getSupabase();
    supabase.auth.getUser().then(({ data: { user: u } }) => {
      setUser(u);
      if (u) {
        addLog("info", `Authenticated as ${u.email}`);

        // Fetch owned nodes with their short_names
        supabase
          .from("node_ownership")
          .select("node_id, nodes(short_name)")
          .eq("player_id", u.id)
          .then(({ data, error }) => {
            if (error) {
              addLog("error", `Failed to load owned nodes: ${error.message}`);
              return;
            }
            if (data && data.length > 0) {
              const nodes = data.map((d: Record<string, unknown>) => ({
                node_id: d.node_id as string,
                short_name: (d.nodes as Record<string, unknown> | null)?.short_name as string | null,
              }));
              setOwnedNodes(nodes);
              setSelectedNode(nodes[0].node_id);
              addLog("info", `Loaded ${nodes.length} owned node(s): ${nodes.map((n: { node_id: string; short_name: string | null }) => n.short_name || n.node_id).join(", ")}`);
            } else {
              addLog("warn", "No owned nodes found — claim a node via the Rite of First Signal");
            }
          });
      }
    });
  }, [addLog]);

  // Subscribe to Supabase Realtime broadcast
  useEffect(() => {
    const supabase = getSupabase();
    const channel = supabase.channel("mesh-messages");

    addLog("info", "Subscribing to Realtime channel: mesh-messages");

    channel.on("broadcast", { event: "new_message" }, ({ payload }) => {
      if (payload) {
        const msg = payload as MeshMessage;
        addLog("info", `[RX] ${msg.sender_name || msg.node_id}: ${msg.content.slice(0, 60)}`);
        setMessages((prev) => {
          const updated = appendMessage(msg);
          return updated.length !== prev.length ? updated : prev;
        });
      }
    });

    channel.subscribe((status) => {
      setConnected(status === "SUBSCRIBED");
      addLog(status === "SUBSCRIBED" ? "info" : "warn", `Realtime status: ${status}`);
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [addLog]);

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-scroll log panel
  useEffect(() => {
    logBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // Filter messages for active tab
  const filtered = messages.filter((m) => {
    if (activeTab.index === null) return true;
    if (activeTab.index === -1) return m.to_node_id !== null;
    return m.channel_index === activeTab.index;
  });

  // Send message
  const handleSend = useCallback(async () => {
    if (!input.trim() || !user || sending) return;
    setSending(true);
    addLog("info", `[TX] Queuing message on CH ${sendChannel}${selectedNode ? ` from ${selectedNode}` : ""}: ${input.trim().slice(0, 60)}`);

    try {
      const supabase = getSupabase();
      const insertData: Record<string, unknown> = {
        content: input.trim(),
        channel_index: sendChannel,
        player_id: user.id,
      };

      // Try with from_node_id first, fall back without if column doesn't exist yet
      if (selectedNode) {
        insertData.from_node_id = selectedNode;
      }

      let result = await supabase.from("outbound_queue").insert(insertData);

      // If from_node_id column doesn't exist yet, retry without it
      if (result.error && result.error.message.includes("from_node_id")) {
        addLog("warn", "from_node_id column not found — sending without node selector (run migration)");
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { from_node_id: _unused, ...fallback } = insertData;
        result = await supabase.from("outbound_queue").insert(fallback);
      }

      const { error } = result;

      if (error) {
        addLog("error", `Queue insert failed: ${error.message}`);
      } else {
        addLog("info", `[TX] Queued successfully — collector will relay to mesh`);
        const localMsg: MeshMessage = {
          id: `local-${Date.now()}`,
          node_id: selectedNode || "dashboard",
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
      addLog("error", `Send error: ${e}`);
    } finally {
      setSending(false);
    }
  }, [input, user, sending, sendChannel, selectedNode, addLog]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <main className="min-h-screen bg-background text-foreground flex flex-col">
      <AuthNav />

      <div className="flex-1 flex flex-col max-w-4xl w-full mx-auto px-4 pt-4 pb-3 min-h-0" style={{ height: "calc(100vh - 56px)" }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-3 flex-shrink-0">
          <div className="flex items-center gap-3">
            <ChatText size={22} weight="bold" className="text-terminal-green" />
            <div>
              <h1 className="text-base font-mono font-bold text-terminal-green tracking-wider leading-tight">
                MESH SHELL
              </h1>
              <p className="text-terminal-muted text-[10px] font-mono leading-tight">
                Live mesh traffic &middot;{" "}
                <span className={connected ? "text-terminal-green" : "text-terminal-red"}>
                  {connected ? "CONNECTED" : "DISCONNECTED"}
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowLogs((v) => !v)}
              className={`text-xs font-mono px-2 py-1 rounded border transition-colors ${
                showLogs
                  ? "bg-terminal-amber/10 text-terminal-amber border-terminal-amber/30"
                  : "text-terminal-muted hover:text-terminal-amber border-terminal-border"
              }`}
              title="Toggle debug log"
            >
              <Terminal size={14} className="inline mr-1 -mt-0.5" />
              LOG
            </button>
            <button
              onClick={() => {
                clearMessages();
                setMessages([]);
                addLog("info", "Message cache cleared");
              }}
              className="text-terminal-muted hover:text-terminal-red transition-colors p-1.5"
              title="Clear message cache"
            >
              <Trash size={16} />
            </button>
          </div>
        </div>

        {/* Channel tabs */}
        <div className="flex gap-1 mb-2 border-b border-terminal-border pb-2 flex-shrink-0">
          {CHANNEL_TABS.map((tab) => (
            <button
              key={tab.label}
              onClick={() => setActiveTab(tab)}
              className={`px-2.5 py-1 text-[10px] font-mono font-bold uppercase tracking-wider rounded transition-colors ${
                activeTab.label === tab.label
                  ? "bg-terminal-green/10 text-terminal-green border border-terminal-green/30"
                  : "text-terminal-muted hover:text-foreground border border-transparent"
              }`}
            >
              {tab.index !== null && tab.index >= 0 ? (
                <Hash size={10} weight="bold" className="inline mr-1 -mt-0.5" />
              ) : tab.index === -1 ? (
                <ChatsCircle size={10} weight="bold" className="inline mr-1 -mt-0.5" />
              ) : null}
              {tab.label}
            </button>
          ))}

          <div className="ml-auto text-terminal-muted text-[10px] font-mono self-center">
            {filtered.length} msg{filtered.length !== 1 ? "s" : ""}
          </div>
        </div>

        {/* Main content area */}
        <div className="flex-1 flex flex-col min-h-0 gap-2">
          {/* Message list */}
          <div className="flex-1 overflow-y-auto space-y-0.5 pr-1 min-h-0">
            {filtered.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <ChatText size={40} className="text-terminal-muted/30 mx-auto mb-2" />
                  <p className="text-terminal-muted font-mono text-sm">Awaiting transmissions&hellip;</p>
                  <p className="text-terminal-muted/60 font-mono text-[10px] mt-1">
                    Messages from the mesh will appear here in real time
                  </p>
                </div>
              </div>
            ) : (
              filtered.map((msg) => (
                <MessageRow key={msg.id} msg={msg} />
              ))
            )}
            <div ref={bottomRef} />
          </div>

          {/* Debug log panel */}
          <AnimatePresence>
            {showLogs && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 160, opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="flex-shrink-0 overflow-hidden border border-terminal-amber/20 rounded bg-black/40"
              >
                <div className="flex items-center justify-between px-2 py-1 border-b border-terminal-amber/10">
                  <span className="text-[10px] font-mono text-terminal-amber uppercase tracking-widest">
                    Debug Log
                  </span>
                  <button
                    onClick={() => setLogs([])}
                    className="text-[10px] font-mono text-terminal-muted hover:text-terminal-amber transition-colors"
                  >
                    CLEAR
                  </button>
                </div>
                <div className="h-[132px] overflow-y-auto px-2 py-1 space-y-0.5">
                  {logs.length === 0 ? (
                    <p className="text-terminal-muted/40 text-[10px] font-mono">No log entries</p>
                  ) : (
                    logs.map((entry, i) => (
                      <div key={i} className="text-[10px] font-mono leading-tight">
                        <span className="text-terminal-muted/50">{entry.ts}</span>{" "}
                        <span
                          className={
                            entry.level === "error"
                              ? "text-terminal-red"
                              : entry.level === "warn"
                              ? "text-terminal-amber"
                              : "text-terminal-green/70"
                          }
                        >
                          [{entry.level.toUpperCase()}]
                        </span>{" "}
                        <span className="text-foreground/70">{entry.msg}</span>
                      </div>
                    ))
                  )}
                  <div ref={logBottomRef} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Send input */}
        {user ? (
          <div className="flex-shrink-0 mt-2 border-t border-terminal-border pt-2">
            <div className="flex items-center gap-3 mb-2">
              {/* Node selector */}
              {ownedNodes.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-terminal-muted text-[10px] font-mono uppercase tracking-widest">
                    FROM:
                  </span>
                  <div className="relative">
                    <select
                      value={selectedNode}
                      onChange={(e) => setSelectedNode(e.target.value)}
                      className="appearance-none bg-terminal-panel border border-terminal-border rounded pl-2 pr-6 py-0.5 text-[11px] font-mono text-terminal-green focus:outline-none focus:border-terminal-green/50 transition-colors cursor-pointer"
                    >
                      {ownedNodes.map((n) => (
                        <option key={n.node_id} value={n.node_id}>
                          {n.short_name || n.node_id}
                        </option>
                      ))}
                    </select>
                    <CaretDown size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-terminal-muted pointer-events-none" />
                  </div>
                </div>
              )}

              {/* Channel selector */}
              <div className="flex items-center gap-1.5">
                <span className="text-terminal-muted text-[10px] font-mono uppercase tracking-widest">
                  CH:
                </span>
                {[0, 1, 2].map((ch) => (
                  <button
                    key={ch}
                    onClick={() => setSendChannel(ch)}
                    className={`px-1.5 py-0.5 text-[10px] font-mono font-bold rounded transition-colors ${
                      sendChannel === ch
                        ? "bg-terminal-gold/10 text-terminal-gold border border-terminal-gold/30"
                        : "text-terminal-muted hover:text-foreground border border-transparent"
                    }`}
                  >
                    {ch}
                  </button>
                ))}
              </div>
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
              {228 - input.length} chars remaining &middot; Messages relay through collector → MQTT → mesh
            </p>
          </div>
        ) : (
          <div className="flex-shrink-0 mt-2 border-t border-terminal-border pt-3 text-center">
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

function MessageRow({ msg }: { msg: MeshMessage }) {
  const isYou = msg.source === "dashboard";
  const isDM = msg.to_node_id !== null;
  const age = formatDistanceToNow(new Date(msg.received_at), { addSuffix: true });

  return (
    <motion.div
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.12 }}
      className={`group px-3 py-1.5 rounded text-sm font-mono hover:bg-terminal-panel/50 transition-colors ${
        isYou ? "border-l-2 border-terminal-gold/40" : ""
      } ${isDM && !isYou ? "border-l-2 border-terminal-amber/40" : ""}`}
    >
      <div className="flex items-baseline gap-2">
        <span
          className={`font-bold text-xs shrink-0 ${
            isYou ? "text-terminal-gold" : "text-terminal-green"
          }`}
        >
          {msg.sender_name || msg.node_id}
        </span>
        {isDM && (
          <span className="text-[10px] text-terminal-amber font-bold uppercase tracking-wider shrink-0">
            DM → {msg.to_node_id}
          </span>
        )}
        <span className="text-terminal-muted/40 text-[10px] shrink-0">
          CH{msg.channel_index}
        </span>
        <span className="text-terminal-muted/30 text-[10px] ml-auto shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          {age}
        </span>
      </div>
      <div className={`mt-0.5 break-words ${isYou ? "text-terminal-gold/80" : "text-foreground/80"}`}>
        {msg.content}
      </div>
    </motion.div>
  );
}
