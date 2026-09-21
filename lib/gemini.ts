async function classifyCall(transcript) {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://elijay-crm.vercel.app",
      "X-Title": "Elijay CRM"
    },
    body: JSON.stringify({
      model: "google/gemini-2.0-flash-exp:free",
      messages: [
        {
          role: "system",
          content: "You are a call classifier for Elijay CRM. Classify the call into lead, support, spam, etc. Return JSON only."
        },
        {
          role: "user",
          content: transcript
        }
      ]
    })
  });

  const data = await res.json();
  return data.choices[0].message.content;
}
