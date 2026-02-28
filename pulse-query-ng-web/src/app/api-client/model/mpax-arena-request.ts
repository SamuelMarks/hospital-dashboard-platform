/* v8 ignore start */
/** @docs */
export interface MpaxArenaRequest {
  prompt: string;
  mode: string;
  demand_sql?: string;
  base_capacity?: { [key: string]: number };
}
