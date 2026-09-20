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

/**
 * Classifies a single call transcription using Gemini 1.5 Flash.
 * Requires GEMINI_API_KEY to be set in the environment.
 */
export async function classifyCallWithGemini(
  transcription: string,
  meta: { campaign?: string; duration?: string }
): Promise<QAClassification> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set. Add it to your environment variables.");
  }
  if (!transcription || transcription.trim().length < 5) {
    return { result: "SHORT CALL", reason: "No usable transcription available.", score: 0 };
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const prompt = `You are a strict call-center QA analyst for a pay-per-call marketing company.
Classify the following call transcript into EXACTLY ONE of these categories:
SALE, CALLBACK, NOT INTERESTED, WRONG INTENT, CUSTOMER MISBEHAVE, AGENT MISTAKE, SHORT CALL

Definitions:
- SALE: the customer agreed to purchase / convert.
- CALLBACK: the agent needs to call the customer back later.
- NOT INTERESTED: the customer explicitly declined.
- WRONG INTENT: the caller wanted something unrelated to the campaign.
- CUSTOMER MISBEHAVE: the customer was abusive, hostile, or the call was a prank.
- AGENT MISTAKE: the agent mishandled the call, gave wrong info, or broke script/compliance.
- SHORT CALL: the call was too short to determine an outcome.

Campaign: ${meta.campaign || "unknown"}
Duration: ${meta.duration || "unknown"}

Transcript:
"""
${transcription.slice(0, 12000)}
"""

Respond with ONLY minified JSON, no markdown, no code fences, in exactly this shape:
{"result":"<one of the categories above>","reason":"<one sentence reason>","score":<integer 0-100 call quality score>}`;

  const response = await model.generateContent(prompt);
  const text = response.response.text().trim();
  const cleaned = text.replace(/```json|```/g, "").trim();

  try {
    const parsed = JSON.parse(cleaned);
    const result: QAResult = VALID_RESULTS.includes(parsed.result) ? parsed.result : "SHORT CALL";
    const score = Math.max(0, Math.min(100, Number(parsed.score) || 0));
    return { result, reason: String(parsed.reason || "").slice(0, 500), score };
  } catch {
    return { result: "SHORT CALL", reason: "Could not parse AI response.", score: 0 };
  }
}
