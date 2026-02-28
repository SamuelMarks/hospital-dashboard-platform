/* v8 ignore start */
/** @docs */
import { MpaxArenaCandidate } from './mpax-arena-candidate';

/** @docs */
export interface MpaxArenaResponse {
  experiment_id: string;
  mode: string;
  ground_truth_mpax?: any;
  candidates: MpaxArenaCandidate[];
}
