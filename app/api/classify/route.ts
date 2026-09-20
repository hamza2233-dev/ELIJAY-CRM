import { NextRequest, NextResponse } from "next/server";
import { classifyCallWithGemini } from "@/lib/gemini";
import { getCalls, saveCalls } from "@/lib/storage"; // agar aapka storage alag hai to batao

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const singleId = body.id || body.callId;

    let calls = await getCalls();

    let toProcess = singleId 
      ? calls.filter((c: any) => c.id === singleId)
      : calls.filter((c: any) => c.qaStatus === "PENDING" || c.result === "PENDING");

    if (toProcess.length === 0) {
      return NextResponse.json({ message: "No pending calls", processed: 0 });
    }

    // Vercel timeout se bachne ke liye max 15 per request
    const MAX_PER_RUN = singleId ? 1 : 15;
    toProcess = toProcess.slice(0, MAX_PER_RUN);

    for (const call of toProcess) {
      try {
        const transcription = call.transcription || call.transcript || "";
        const meta = {
          campaign: call.campaign || call.buyer || "unknown",
          duration: call.duration || call.call_duration || "0"
        };

        const qa = await classifyCallWithGemini(transcription, meta);

        call.qaResult = qa.result;
        call.result = qa.result;
        call.qaReason = qa.reason;
        call.reason = qa.reason;
        call.qaScore = qa.score;
        call.score = qa.score;
        call.qaStatus = "DONE";
        
        // Delay to avoid Gemini rate limit
        await new Promise(r => setTimeout(r, 800));

      } catch (err: any) {
        console.error("QA failed for", call.id, err);
        call.qaStatus = "PENDING";
        call.qaReason = err.message;
      }
    }

    await saveCalls(calls);

    return NextResponse.json({ 
      success: true, 
      processed: toProcess.length,
      remaining: calls.filter((c:any) => c.qaStatus === "PENDING").length
    });

  } catch (error: any) {
    console.error("Classify API error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// GET bhi allow karo taake 405 na aaye
export async function GET() {
  return NextResponse.json({ message: "Use POST to classify" });
}
