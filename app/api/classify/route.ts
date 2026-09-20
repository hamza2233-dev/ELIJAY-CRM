import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { readAllCalls, updateCall } from "@/lib/store";
import { classifyCallWithGemini } from "@/lib/gemini";
import { syncCallsToSheets } from "@/lib/sheets";

// Classifies all PENDING calls (or a single call if `id` is provided).
// Admin-only. Runs sequentially with small batches to stay within
// Gemini free-tier rate limits and Vercel's function time limit.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Admin access required" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const singleId: string | undefined = body?.id;

  const all = readAllCalls();
  const targets = singleId ? all.filter((c) => c.id === singleId) : all.filter((c) => c.qaResult === "PENDING");

  const MAX_PER_RUN = singleId ? 1 : 15; // keep each request short-lived on serverless
  const batch = targets.slice(0, MAX_PER_RUN);

  const results: { id: string; ok: boolean; error?: string }[] = [];

  for (const call of batch) {
    try {
      const classification = await classifyCallWithGemini(call.transcription, {
        campaign: call.campaign,
        duration: call.duration
      });
      updateCall(call.id, {
        qaResult: classification.result,
        qaReason: classification.reason,
        qaScore: classification.score
      });
      results.push({ id: call.id, ok: true });
    } catch (e: any) {
      results.push({ id: call.id, ok: false, error: e.message });
    }
  }

  const updatedAll = readAllCalls();
  const sync = await syncCallsToSheets(updatedAll).catch((e) => ({ synced: false, reason: e.message }));

  return NextResponse.json({
    ok: true,
    processed: results.length,
    remaining: Math.max(0, targets.length - batch.length),
    results,
    sync
  });
}
