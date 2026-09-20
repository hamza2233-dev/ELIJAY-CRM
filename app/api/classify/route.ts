import { NextRequest, NextResponse } from "next/server";
import { classifyCallWithGemini } from "@/lib/gemini";
import { getCalls, saveCalls } from "@/lib/store";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const singleId = body.id || body.callId;

    let calls = await getCalls();

    let toProcess = singleId
     ? calls.filter((c: any) => c.id === singleId)
      : calls.filter((c: any) =>!c.qaResult || c.result === "PENDING" || c.qaStatus === "PENDING");

    if (toProcess.length === 0) {
      return NextResponse.json({ message: "No pending calls", processed: 0, remaining: 0 });
    }

    const MAX_PER_RUN = singleId? 1 : 15;
    toProcess = toProcess.slice(0, MAX_PER_RUN);

    for (const call of toProcess) {
      try {
        const transcription = call.transcription || call.transcript || "";
        const meta = {
          campaign: call.campaign || call.buyer || "unknown",
          duration: call.duration || call.call_duration || "0"
        };

        const qa = await classifyCallWithGemini(transcription, meta);

        const idx = calls.findIndex((x: any) => x.id === call.id);
        if (idx >= 0) {
          calls[idx] = {
           ...calls[idx],
            qaResult: qa.result,
            result: qa.result,
            qaReason: qa.reason,
            reason: qa.reason,
            qaScore: qa.score,
            score: qa.score,
            qaStatus: "DONE",
            resultStatus: "DONE"
          };
        }

        await new Promise(r => setTimeout(r, 800));

      } catch (err: any) {
        console.error("QA failed for", call.id, err.message);
      }
    }

    await saveCalls(calls);

    const remaining = calls.filter((c: any) =>!c.qaResult || c.qaStatus === "PENDING").length;

    return NextResponse.json({
      success: true,
      processed: toProcess.length,
      remaining
    });

  } catch (error: any) {
    console.error("Classify API error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ message: "POST /api/classify to run QA" });
}
