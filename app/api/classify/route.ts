import { NextRequest, NextResponse } from "next/server";
import { classifyCallWithGemini } from "@/lib/gemini";

function parseDurationToSeconds(d: any): number {
  if (!d) return 0;
  if (typeof d === 'number') return d;
  const str = String(d).trim();
  if (!str) return 0;
  if (!str.includes(":")) return parseInt(str) || 0;
  const parts = str.split(":").map(n => parseInt(n) || 0);
  if (parts.length === 3) return parts[0]*3600 + parts[1]*60 + parts[2];
  if (parts.length === 2) return parts[0]*60 + parts[1];
  return 0;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    // Try to import your actual storage dynamically
    let getCalls: any, saveCalls: any;
    try {
      const mod = await import("@/lib/calls");
      getCalls = mod.getCalls || mod.getAllCalls;
      saveCalls = mod.saveCalls || mod.saveAllCalls || mod.updateCalls;
    } catch {}

    if (!getCalls) {
      try {
        const mod2 = await import("@/lib/db");
        getCalls = mod2.getCalls;
        saveCalls = mod2.saveCalls;
      } catch {}
    }

    // Fallback if no storage found - check calls.ts, db.ts names
    if (!getCalls) {
      return NextResponse.json({
        error: "Storage module not found. Tell me what files are in src/lib/ folder"
      }, { status: 500 });
    }

    let calls = await getCalls();
    const singleId = body.id;

    let toProcess = singleId
     ? calls.filter((c: any) => c.id === singleId)
      : calls.filter((c: any) =>!c.qaResult || c.qaResult === "PENDING" || c.result === "PENDING" || c.qaStatus === "PENDING");

    toProcess = toProcess.slice(0, singleId? 1 : 15);

    if (toProcess.length === 0) {
      return NextResponse.json({ message: "No pending", processed: 0, remaining: 0 });
    }

    for (const call of toProcess) {
      const transcription = call.transcription || call.transcript || "";
      const meta = {
        campaign: call.campaign || call.buyer || "unknown",
        duration: call.duration || "0"
      };

      const qa = await classifyCallWithGemini(transcription, meta);

      // Update the original array
      const idx = calls.findIndex((x: any) => x.id === call.id);
      if (idx >= 0) {
        calls[idx] = {...calls[idx], qaResult: qa.result, result: qa.result, qaReason: qa.reason, reason: qa.reason, score: qa.score, qaStatus: "DONE" };
      }

      await new Promise(r => setTimeout(r, 800));
    }

    if (saveCalls) await saveCalls(calls);

    return NextResponse.json({ success: true, processed: toProcess.length, remaining: calls.filter((c:any) => c.qaStatus === "PENDING" ||!c.qaResult).length });

  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true });
}
