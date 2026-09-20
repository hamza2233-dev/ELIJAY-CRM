import Papa from "papaparse";
import { v4 as uuidv4 } from "uuid";
import { CallRecord } from "./types";

// Expected CSV headers (exact, case-insensitive match):
// Call Date, Has Recording, Campaign, Publisher, Caller ID, Number,
// Time To Call, Is Duplicate, End Call Source, Time To Connect, Target,
// Revenue, Payout, Duration, Recording, Transcription

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
      } else {
        (record as any)[mapped] = value ?? "";
      }
    }

    return record as CallRecord;
  });

  return { calls, errors };
}
