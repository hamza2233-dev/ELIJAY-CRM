export type QAResult =
  | "SALE"
  | "CALLBACK"
  | "NOT INTERESTED"
  | "WRONG INTENT"
  | "CUSTOMER MISBEHAVE"
  | "AGENT MISTAKE"
  | "SHORT CALL"
  | "PENDING";

export interface CallRecord {
  id: string;
  callDate: string;
  hasRecording: string;
  campaign: string;
  publisher: string; // Publisher ID e.g. EINT1031P
  callerId: string;
  number: string;
  timeToCall: string;
  isDuplicate: string;
  endCallSource: string;
  timeToConnect: string;
  target: string; // Buyer ID
  revenue: number;
  payout: number;
  duration: string;
  recording: string; // URL to recording
  transcription: string;
  qaResult: QAResult;
  qaReason: string;
  qaScore: number | null;
}

export type Role = "admin" | "publisher" | "buyer";

export interface SessionData {
  role: Role;
  id: string; // "admin", or Publisher ID, or Target/Buyer ID
}
