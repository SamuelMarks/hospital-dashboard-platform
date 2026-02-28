export interface MpaxArenaCandidate {
  id: string;
  model_name: string;
  content: string;
  is_selected?: boolean;
  mpax_result?: any;
  mpax_score?: number;
  sql_snippet?: string;
}
