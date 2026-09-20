import fs from "fs";
import path from "path";
import { CallRecord } from "./types";

// NOTE ON PERSISTENCE:
// Vercel's serverless filesystem is read-only in production except /tmp,
// and /tmp is NOT shared across function instances or deployments.
// This JSON file store is fine for local dev and demoing, but for real
// production use you should either (a) treat the Google Sheet as the
// source of truth and read/write through lib/sheets.ts, or (b) swap this
// module for a real database (Postgres/Supabase/PlanetScale all work
// great on Vercel). The read/write API below is intentionally small so
// you can swap the implementation later without touching the rest of
// the app.

const isProd = process.env.VERCEL === "1";
const DATA_FILE = isProd
  ? path.join("/tmp", "elijay-calls.json")
  : path.join(process.cwd(), "data", "calls.json");

function ensureFile() {
  if (!fs.existsSync(DATA_FILE)) {
    const seedPath = path.join(process.cwd(), "data", "calls.json");
    if (fs.existsSync(seedPath) && DATA_FILE !== seedPath) {
      fs.copyFileSync(seedPath, DATA_FILE);
    } else {
      fs.writeFileSync(DATA_FILE, "[]", "utf-8");
    }
  }
}

export function readAllCalls(): CallRecord[] {
  ensureFile();
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf-8");
    return JSON.parse(raw) as CallRecord[];
  } catch {
    return [];
  }
}

export function writeAllCalls(calls: CallRecord[]) {
  ensureFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(calls, null, 2), "utf-8");
}

export function appendCalls(newCalls: CallRecord[]) {
  const existing = readAllCalls();
  const merged = [...existing, ...newCalls];
  writeAllCalls(merged);
  return merged;
}

export function updateCall(id: string, patch: Partial<CallRecord>) {
  const calls = readAllCalls();
  const idx = calls.findIndex((c) => c.id === id);
  if (idx === -1) return null;
  calls[idx] = { ...calls[idx], ...patch };
  writeAllCalls(calls);
  return calls[idx];
}

export function getCallsForRole(role: "admin" | "publisher" | "buyer", id: string): CallRecord[] {
  const all = readAllCalls();
  if (role === "admin") return all;
  if (role === "publisher") return all.filter((c) => c.publisher === id);
  return all.filter((c) => c.target === id);
}

export function listPublisherIds(): string[] {
  const all = readAllCalls();
  return Array.from(new Set(all.map((c) => c.publisher).filter(Boolean)));
}

export function listTargetIds(): string[] {
  const all = readAllCalls();
  return Array.from(new Set(all.map((c) => c.target).filter(Boolean)));
}
