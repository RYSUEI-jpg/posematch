import { Pose } from "./types";

/**
 * 前面カメラ（自撮り）で、静止画から判定できるポーズだけを採用。
 * description はGeminiへの判定指示に使うので具体的に書く。
 */
export const POSES: Pose[] = [
  {
    id: "peace",
    name: "ピースサイン",
    emoji: "✌️",
    description: "片手で人差し指と中指を立ててVサイン（ピース）をしている",
  },
  {
    id: "banzai",
    name: "両手バンザイ",
    emoji: "🙌",
    description: "両腕をまっすぐ上に高く挙げてバンザイしている",
  },
  {
    id: "thumbsup",
    name: "グッドサイン",
    emoji: "👍",
    description: "片手の親指を立ててグッド（いいね）のポーズをしている",
  },
  {
    id: "muscle",
    name: "ガッツポーズ",
    emoji: "💪",
    description: "腕を曲げて拳を握り、力こぶを作るガッツポーズをしている",
  },
  {
    id: "heart",
    name: "両手でハート",
    emoji: "🫶",
    description: "両手の指を合わせて顔の近くで小さなハートの形を作っている",
  },
  {
    id: "salute",
    name: "敬礼",
    emoji: "🫡",
    description: "片手をまっすぐ伸ばして額やこめかみに当てて敬礼している",
  },
  {
    id: "think",
    name: "考えるポーズ",
    emoji: "🤔",
    description: "片手をあごに添えて、考え込んでいるポーズをしている",
  },
  {
    id: "pray",
    name: "お祈り",
    emoji: "🙏",
    description: "両手のひらを胸の前で合わせてお祈りのポーズをしている",
  },
  {
    id: "cheek",
    name: "ほっぺを包む",
    emoji: "😊",
    description: "両手のひらで自分の両頬を包み込むようにしている",
  },
  {
    id: "stop",
    name: "ストップ！",
    emoji: "✋",
    description: "片手の手のひらをカメラに向けて大きく開き「ストップ」のポーズをしている",
  },
  {
    id: "cross",
    name: "バツ印",
    emoji: "🙅",
    description: "両腕を胸の前で交差させて大きなバツ（×）印を作っている",
  },
  {
    id: "telescope",
    name: "望遠鏡",
    emoji: "🔭",
    description: "両手を丸めて筒のようにし、目に当てて望遠鏡をのぞくポーズをしている",
  },
];

/** 配列をシャッフルして先頭n件を返す（非破壊） */
export function pickRandomPoses(n: number): Pose[] {
  const shuffled = [...POSES];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, Math.min(n, shuffled.length));
}

export const ROUNDS_PER_GAME = 5;
export const SECONDS_PER_ROUND = 5;
