import { MpaxArenaCandidate } from './mpax-arena-candidate';

export interface MpaxArenaResponse {
  experiment_id: string;
  mode: string;
  ground_truth_mpax?: any;
  candidates: MpaxArenaCandidate[];
}
