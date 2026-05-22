export interface Pose {
  id: string;
  name: string;
  emoji: string;
  /** AIへの判定指示に使う、ポーズの具体的な説明 */
  description: string;
}

export interface JudgeResult {
  score: number; // 0-100
  comment: string;
}

export type JudgeResponse =
  | { ok: true; data: JudgeResult }
  | { ok: false; error: string };

export interface RoundResult {
  pose: Pose;
  score: number;
  comment: string;
}
