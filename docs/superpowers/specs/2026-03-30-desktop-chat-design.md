# Meshtastic Desktop Chat App — Design Spec

**Date:** 2026-03-30
**Status:** Approved

---

## Goal

A tkinter desktop chat app that connects to a Meshtastic radio over USB serial and supports both channel broadcast and direct node messaging in a Discord/Slack-style sidebar layout.

---

## Architecture

Single file `meshtastic_app.py`. Two threads:

- **Background thread** — runs `SerialInterface`, subscribes to incoming text packets via pubsub, pushes them onto a thread-safe `queue.Queue`
- **Main thread** — runs tkinter event loop, polls the queue every 100ms via `root.after()`, updates UI

```
SerialInterface (background thread)
    ↓ packets → queue.Queue → root.after() poll → UI update
    ↑ sendText() ← tkinter input bar (main thread)
```

---

## UI Layout

```
┌─────────────────────────────────────────────┐
│  Meshtastic                          [COM5]  │  ← title bar
├───────────────┬─────────────────────────────┤
│  # OKC-CREW   │  # OKC-CREW                 │  ← active conversation header
│               │                             │
│  ● EP-VLG-01  │  [10:32] V01: hey there     │
│  ○ !ab12cd34  │  [10:33] You: hi!           │
│               │                             │
│               │                             │
│               │                             │
├───────────────┴─────────────────────────────┤
│  → #OKC-CREW    [message input    ] [Send]  │
└─────────────────────────────────────────────┘
```

---

## Components

### Sidebar
- `#OKC-CREW` channel entry always at top
- One entry per node discovered on the mesh, prefixed with `@`
- Green dot (●) if node `last_seen` within 10 minutes, grey (○) otherwise
- Clicking any entry sets the active conversation
- Selected entry highlighted

### Chat Panel
- Scrollable text area (read-only)
- Per-conversation message history stored in memory (dict keyed by conversation ID)
- Message format: `[HH:MM] SENDER: text`
- Color coding:
  - Incoming channel messages: sender name in green (`#4ade80`)
  - Incoming DMs: sender in blue (`#38bdf8`)
  - Your own messages: white (`#e2e8f0`)
  - Timestamps: muted grey (`#64748b`)

### Input Bar
- Label showing active target: `→ #OKC-CREW` or `→ EP-VLG-01`
- Text entry field
- Send button (also triggered by Enter key)
- Clears after send
- Disabled with message "Connecting..." until serial connection is established

---

## Data Model (in-memory only)

```python
conversations = {
    "channel": [{"time": "10:32", "sender": "V01", "text": "hey", "own": False}, ...],
    "!abc123":  [{"time": "10:33", "sender": "You", "text": "hi",  "own": True},  ...],
}

nodes = {
    "!abc123": {"long_name": "EP-VLG-01", "short_name": "V01", "last_seen": 1234567890}
}
```

---

## Sending Messages

- If active conversation is `"channel"`: `interface.sendText(text, destinationId="^all", channelIndex=0)`
- If active conversation is a node ID: `interface.sendText(text, destinationId=node_id, channelIndex=0)`

---

## Connection

- Port: `COM5` (hardcoded, can be changed at top of file as `PORT = "COM5"`)
- Connects on startup in a daemon thread
- If connection fails: show error in chat panel, disable input
- No reconnect logic for v1

---

## File

```
c:/dev/meshtastic/
  meshtastic_app.py    # entire app — single file
  mesh.bat             # launcher: python meshtastic_app.py
```

---

## Out of Scope

- Message persistence across sessions
- Multiple channels
- Settings UI for port selection
- Encryption indicators
- File/image transfer
