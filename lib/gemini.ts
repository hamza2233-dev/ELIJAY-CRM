import { GoogleGenerativeAI } from "@google/generative-ai";
import { QAResult } from "./types";

const VALID_RESULTS: QAResult[] = [
  "SALE",
  "CALLBACK",
  "NOT INTERESTED",
  "WRONG INTENT",
  "CUSTOMER MISBEHAVE",
  "AGENT MISTAKE",
  "SHORT CALL"
];

export interface QAClassification {
  result: QAResult;
  reason: string;
  score: number;
}

function parseDurationToSeconds(d: any): number {
  if (!d) return 0
  if (typeof d === 'number') return d
  const str = String(d).trim()
  if (!str) return 0
  if (!str.includes(":")) {
    const num = parseFloat(str.replace(/[^0-9.]/g, ""))
    return isNaN(num)? 0 : Math.floor(num)
  }
  const parts = str.split(":").map(p => parseInt(p) || 0)
  if (parts.length === 3) return parts[0]*3600 + parts[1]*60 + parts[2]
  if (parts.length === 2) return parts[0]*60 + parts[1]
  return 0
}

export async function classifyCallWithGemini(
  transcription: string,
  meta: { campaign?: string; duration?: string }
): Promise<QAClassification> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set.");
  }

  const durationSec = parseDurationToSeconds(meta.duration)
  const wordCount = transcription? transcription.trim().split(/\s+/).length : 0

  // FIX 1: Sirf tabhi SHORT CALL jab duration bhi kam ho AUR transcription bhi khali ho
  if (durationSec > 0 && durationSec < 30 && wordCount < 15) {
    return { result: "SHORT CALL", reason: `Too short: ${durationSec}s, ${wordCount} words`, score: 0 };
  }

  // Agar transcription khali hai lekin duration lambi hai to SHORT mat karo, AI ko check karne do
  const safeTranscription = transcription && transcription.trim().length > 5
   ? transcription
    : `[No transcription available, but call duration is ${durationSec} seconds. Use duration and campaign context. If duration > 30s, DO NOT classify as SHORT CALL.]`

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const prompt = `You are a strict call-center QA analyst.

Classify into EXACTLY ONE:
SALE, CALLBACK, NOT INTERESTED, WRONG INTENT, CUSTOMER MISBEHAVE, AGENT MISTAKE, SHORT CALL

Definitions:
- SALE: customer agreed to purchase / convert
- CALLBACK: needs to call back later
- NOT INTERESTED: customer explicitly declined
- WRONG INTENT: caller wanted something unrelated
- CUSTOMER MISBEHAVE: abusive/prank
- AGENT MISTAKE: agent mishandled, broke compliance
- SHORT CALL: ONLY if duration < 30 seconds AND almost no conversation (<15 words). NEVER use SHORT CALL if duration > 30s.

Campaign: ${meta.campaign || "unknown"}
Duration: ${durationSec} seconds (${durationSec} is the real duration, use this)
Word Count: ${wordCount}

Transcript:
"""
${safeTranscription.slice(0, 12000)}
"""

CRITICAL RULES:
- If Duration > 30 seconds, YOU ARE FORBIDDEN from returning SHORT CALL. Choose from other 6 categories.
- If transcript shows real conversation, NEVER return SHORT CALL.
- SHORT CALL is only for calls <30s with no real talk.

Respond ONLY minified JSON:
{"result":"<category>","reason":"<one sentence>","score":<0-100>}`;

  const response = await model.generateContent(prompt);
  const text = response.response.text().trim();
  const cleaned = text.replace(/```json|```/g, "").trim();

  try {
    const parsed = JSON.parse(cleaned);
    let result: QAResult = VALID_RESULTS.includes(parsed.result)? parsed.result : "WRONG INTENT";

    // FIX 2: Safety net - if AI still returns SHORT CALL but duration >30s, force to REVIEW
    if (result === "SHORT CALL" && durationSec > 30) {
      result = "CALLBACK" // or REVIEW if you have it, but in your list use CALLBACK as fallback
    }

    const score = Math.max(0, Math.min(100, Number(parsed.score) || 50));
    return { result, reason: String(parsed.reason || "").slice(0, 500), score };
  } catch {
    // FIX 3: Parse fail par SHORT CALL nahi, WRONG INTENT bhejo taake dubara check ho sake
    return { result: "WRONG INTENT", reason: `AI parse failed. Raw: ${cleaned.slice(0,100)}`, score: 50 };
  }
}
