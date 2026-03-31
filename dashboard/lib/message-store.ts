import { MeshMessage } from "./supabase";

const STORAGE_KEY = "meshguild_messages";
const MAX_MESSAGES = 500;

export function loadMessages(): MeshMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveMessages(messages: MeshMessage[]) {
  if (typeof window === "undefined") return;
  // Keep only the most recent MAX_MESSAGES
  const trimmed = messages.slice(-MAX_MESSAGES);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
}

export function appendMessage(msg: MeshMessage): MeshMessage[] {
  const existing = loadMessages();
  // Deduplicate by id
  if (existing.some((m) => m.id === msg.id)) return existing;
  const updated = [...existing, msg].slice(-MAX_MESSAGES);
  saveMessages(updated);
  return updated;
}

export function clearMessages() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}
