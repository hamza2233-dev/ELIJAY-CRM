export async function classifyCall(transcript: string) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY missing");

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://elijay-crm.vercel.app",
      "X-Title": "Elijay CRM"
    },
    body: JSON.stringify({
      model: "google/gemini-2.0-flash-exp:free",
      messages: [
        {
          role: "system",
          content: `You are Elijay CRM classifier. Classify transcript into JSON: { "intent": "lead/support/spam", "score": 0-100, "summary": "..." }. Return ONLY JSON.`
        },
        { role: "user", content: transcript }
      ],
      temperature: 0.2
    })
  });

  if (!response.ok) {
    const err = await response.text();
    console.error("OpenRouter error:", err);
    throw new Error("Classification failed");
  }

  const data = await response.json();
  return data.choices[0].message.content;
}
