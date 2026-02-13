import { MessageCandidateResponse } from './message-candidate';

export interface MessageResponse {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  created_at: string;
  sql_snippet?: string | null;
  candidates?: Array<MessageCandidateResponse>;
}
