export interface MessageCandidateResponse {
  id: string;
  model_name: string;
  content: string;
  sql_snippet?: string | null;
  sql_hash?: string | null;
  is_selected: boolean;
}
