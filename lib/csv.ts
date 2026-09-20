import Papa from "papaparse";
import { v4 as uuidv4 } from "uuid";
import { CallRecord } from "./types";

// Expected CSV headers (exact, case-insensitive match):
const HEADER_MAP: Record<string, keyof CallRecord> = {
  "call date": "callDate",
  "has recording": "hasRecording",
  campaign: "campaign",
  publisher: "publisher",
  "caller id": "callerId",
  number: "number",
  "time to call": "timeToCall",
  "is duplicate": "isDuplicate",
  "end call source": "endCallSource",
  "time to connect": "timeToConnect",
  target: "target",
  revenue: "revenue",
  payout: "payout",
  duration: "duration",
  recording: "recording",
  transcription: "transcription"
};

// FIX: Convert 00:01:23 or 65 to seconds
function parseDurationToSeconds(val: any): number {
  if (!val) return 0
  const str = String(val).trim()
  if (!str) return 0

  // If pure number like "65" or "65.5"
  if (!str.includes(":")) {
    const num = parseFloat(str.replace(/[^0-9.]/g, ""))
    return isNaN(num)? 0 : Math.floor(num)
  }

  // If HH:MM:SS or MM:SS
  const parts = str.split(":").map(p => parseInt(p) || 0)
  if (parts.length === 3) return parts[0]*3600 + parts[1]*60 + parts[2]
  if (parts.length === 2) return parts[0]*60 + parts[1]
  return 0
}

export function parseCallsCsv(csvText: string): { calls: CallRecord[]; errors: string[] } {
  const result = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true
  });

  const errors: string[] = result.errors.map((e) => `Row ${e.row}: ${e.message}`);

  const calls: CallRecord[] = result.data.map((row) => {
    const record: Partial<CallRecord> = {
      id: uuidv4(),
      qaResult: "PENDING",
      qaReason: "",
      qaScore: null
    };

    for (const rawKey of Object.keys(row)) {
      const key = rawKey.trim().toLowerCase();
      const mapped = HEADER_MAP[key];
      if (!mapped) continue;
      const value = row[rawKey];

      if (mapped === "revenue" || mapped === "payout") {
        (record as any)[mapped] = parseFloat((value || "0").replace(/[^0-9.-]/g, "")) || 0;
      } else if (mapped === "duration") {
        // FIX: Save both original and seconds
        const seconds = parseDurationToSeconds(value)
        ;(record as any)["duration"] = seconds // save as seconds number
        ;(record as any)["rawDuration"] = value
        ;(record as any)["durationSeconds"] = seconds
      } else {
        (record as any)[mapped] = value?? "";
      }
    }

    return record as CallRecord;
  });

  return { calls, errors };
}
