import { GoogleGenerativeAI } from "@google/generative-ai"

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

function parseDurationToSeconds(d: any): number {
  if (!d) return 0
  if (typeof d === 'number') return d
  const str = String(d).trim()
  if (!str.includes(":")) return parseInt(str) || 0
  const parts = str.split(":").map(n => parseInt(n) || 0)
  if (parts.length === 3) return parts[0]*3600 + parts[1]*60 + parts[2]
  if (parts.length === 2) return parts[0]*60 + parts[1]
  return 0
}

export async function classifyCallWithGemini(
  transcription: string,
  meta: { campaign: string, duration: any }
) {
  const durationSec = parseDurationToSeconds(meta.duration)

  // FIXED LOGIC: Very strict short call check
  const wordCount = transcription? transcription.trim().split(/\s+/).length : 0

  // Only mark as SHORT_CALL if BOTH conditions
  if (durationSec > 0 && durationSec < 30 && wordCount < 20) {
    return {
      result: "SHORT_CALL",
      reason: `Call too short: ${durationSec}s, only ${wordCount} words`,
      score: 0
    }
  }

  // If transcription is empty but duration is long, don't mark short, let AI decide
  if (!transcription || wordCount < 5) {
    if (durationSec > 0 && durationSec < 15) {
      return {
        result: "SHORT_CALL",
        reason: `No conversation, duration ${durationSec}s`,
        score: 0
      }
    }
  }

  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" })

  const prompt = `
You are a QA analyst for Medicare / ACA calls. Campaign: ${meta.campaign || "Unknown"}
Call Duration: ${durationSec} seconds
Transcription: """
${transcription || "No transcription provided"}
"""

RULES - VERY IMPORTANT:
1. DO NOT mark as SHORT_CALL just because duration is short. Only mark SHORT_CALL if duration < 30s AND transcription has <20 words.
2. If transcription shows a real conversation (agent and customer talking), ALWAYS do full QA. Never mark as SHORT_CALL.
3. QA Criteria:
   - If agent is selling / misleading / not following script -> FAIL
   - If call is good quality, customer interested -> PASS
   - If not sure -> REVIEW

Return ONLY JSON in this format:
{
  "result": "PASS" | "FAIL" | "REVIEW" | "SHORT_CALL",
  "reason": "short explanation in 1-2 lines",
  "score": 0-100
}
`

  const result = await model.generateContent(prompt)
  const text = result.response.text()

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error("No JSON found")
    const parsed = JSON.parse(jsonMatch[0])
    return {
      result: parsed.result || "REVIEW",
      reason: parsed.reason || text.slice(0, 200),
      score: parsed.score?? 50
    }
  } catch (e) {
    console.error("Gemini parse error:", text)
    return {
      result: "REVIEW",
      reason: "AI response parse failed: " + text.slice(0, 200),
      score: 50
    }
  }
}
