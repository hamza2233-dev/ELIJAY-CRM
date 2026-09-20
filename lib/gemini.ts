import { GoogleGenerativeAI } from "@google/generative-ai";

const VALID = ["SALE","CALLBACK","NOT INTERESTED","WRONG INTENT","CUSTOMER MISBEHAVE","AGENT MISTAKE","SHORT CALL"] as const;

function toSeconds(d:any){
  if(!d) return 0;
  if(typeof d==='number') return d;
  const s=String(d).trim();
  if(!s) return 0;
  if(!s.includes(":")) return parseInt(s)||0;
  const p=s.split(":").map(x=>parseInt(x)||0);
  if(p.length===3) return p[0]*3600+p[1]*60+p[2];
  if(p.length===2) return p[0]*60+p[1];
  return 0;
}

export async function classifyCallWithGemini(transcription:string, meta:any){
  try{
    const durationSec=toSeconds(meta?.duration);
    const wordCount=transcription?transcription.trim().split(/\s+/).length:0;

    console.log(`Classifying: ${durationSec}s, ${wordCount} words`);

    if(durationSec>0 && durationSec<20 && wordCount<10){
      return {result:"SHORT CALL", reason:`Very short ${durationSec}s`, score:5};
    }

    const apiKey=process.env.GEMINI_API_KEY;
    if(!apiKey){
      console.error("GEMINI_API_KEY missing");
      return {result:"WRONG INTENT", reason:"API key missing", score:0};
    }

    const genAI=new GoogleGenerativeAI(apiKey);
    const model=genAI.getGenerativeModel({model:"gemini-1.5-flash"});

    const safeText=wordCount>3? transcription.slice(0,8000) : `[No proper transcript, duration ${durationSec}s. DO NOT mark SHORT CALL if >30s. Mark as CALLBACK or NOT INTERESTED]`;

    const prompt=`You are QA for Medicare calls. Classify into ONE: SALE,CALLBACK,NOT INTERESTED,WRONG INTENT,CUSTOMER MISBEHAVE,AGENT MISTAKE,SHORT CALL
RULES:
- SHORT CALL ONLY if duration <30s AND words <15. If duration >30s NEVER return SHORT CALL
- SALE=customer agreed to buy/enroll
- CALLBACK=wants to call later
- NOT INTERESTED=declined
- WRONG INTENT=wrong topic/spam
- CUSTOMER MISBEHAVE=abuse/prank
- AGENT MISTAKE=agent error

Campaign:${meta?.campaign||"unknown"} Duration:${durationSec}s
Transcript:${safeText}
Return JSON only: {"result":"...","reason":"...","score":0-100}`;

    const res=await model.generateContent(prompt);
    const txt=res.response.text().trim().replace(/```json|```/g,"").trim();
    const jsonStr=txt.match(/\{[\s\S]*\}/)?.[0]||txt;
    const parsed=JSON.parse(jsonStr);

    let result=VALID.includes(parsed.result)?parsed.result:"CALLBACK";
    if(result==="SHORT CALL" && durationSec>30) result="CALLBACK";

    return {result, reason:String(parsed.reason||"classified").slice(0,300), score: Number(parsed.score)||50};

  }catch(e:any){
    console.error("Gemini error:", e.message);
    // Never throw - return fallback so loop doesn't break
    return {result:"CALLBACK", reason:`AI error fallback: ${e.message.slice(0,100)}`, score:50};
  }
}
