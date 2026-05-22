import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { JudgeResponse } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_IMAGE_BYTES = 7 * 1024 * 1024;
const MAX_NAME_LENGTH = 100;
const MAX_DESC_LENGTH = 300;

function bad(error: string, status = 400): NextResponse<JudgeResponse> {
  return NextResponse.json({ ok: false, error }, { status });
}

function buildPrompt(poseName: string, poseDescription: string): string {
  return `あなたは「ポーズマネっこゲーム」の楽しい審査員です。
お手本のポーズは「${poseName}」です。
具体的には「${poseDescription}」という動作です。

この写真に写っている人物が、そのお手本ポーズをどれだけ上手にマネできているかを採点してください。

【採点基準（0〜100点）】
- 90〜100: お手本そっくりで完璧。キレもある
- 70〜89: ポーズは合っている。良い出来
- 50〜69: だいたい合っているが少し惜しい
- 25〜49: なんとなく近いが違う部分が多い
- 0〜24: 全然違う、またはポーズが確認できない／人が写っていない

【コメント】
高校生が読んで盛り上がる、明るく楽しい口調の短い一言（40文字以内）。
良いときはほめて、惜しいときはツッコミや励ましを入れる。

必ず次のJSON形式だけを返してください（前後に余計な文章を付けない）:
{"score": 数値, "comment": "コメント"}`;
}

export async function POST(
  req: NextRequest
): Promise<NextResponse<JudgeResponse>> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return bad("サーバー設定エラー: APIキーが未設定です", 500);

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return bad("リクエストの読み取りに失敗しました");
  }

  const image = formData.get("image");
  const poseName = (formData.get("poseName") as string | null)?.trim() ?? "";
  const poseDescription =
    (formData.get("poseDescription") as string | null)?.trim() ?? "";

  if (!(image instanceof File)) return bad("画像が含まれていません");
  if (image.size === 0) return bad("画像が空です");
  if (image.size > MAX_IMAGE_BYTES) {
    return bad(
      `画像サイズが大きすぎます（${(image.size / 1024 / 1024).toFixed(1)}MB / 上限7MB）`
    );
  }
  if (!poseName || poseName.length > MAX_NAME_LENGTH) {
    return bad("ポーズ指定が不正です");
  }
  if (!poseDescription || poseDescription.length > MAX_DESC_LENGTH) {
    return bad("ポーズ説明が不正です");
  }

  let imagePart: { inlineData: { mimeType: string; data: string } };
  try {
    const buf = Buffer.from(await image.arrayBuffer());
    imagePart = {
      inlineData: {
        mimeType: image.type || "image/jpeg",
        data: buf.toString("base64"),
      },
    };
  } catch {
    return bad("画像の処理に失敗しました", 500);
  }

  const ai = new GoogleGenAI({ apiKey });
  const prompt = buildPrompt(poseName, poseDescription);
  const contents = [imagePart, { text: prompt }];

  const RETRYABLE_PATTERNS = [
    "UNAVAILABLE",
    "RESOURCE_EXHAUSTED",
    "DEADLINE_EXCEEDED",
    "503",
    "429",
    "504",
  ];
  const MAX_RETRIES = 2;
  const BACKOFF_MS = [1200, 3000];

  let rawText = "";
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents,
        config: {
          responseMimeType: "application/json",
          temperature: 0.4,
        },
      });
      rawText = response.text ?? "";
      lastError = null;
      break;
    } catch (e) {
      lastError = e;
      const msg = e instanceof Error ? e.message : String(e);
      const isRetryable = RETRYABLE_PATTERNS.some((p) => msg.includes(p));
      if (!isRetryable || attempt === MAX_RETRIES) break;
      await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt] ?? 3000));
    }
  }

  if (lastError) {
    const msg = lastError instanceof Error ? lastError.message : "不明なエラー";
    if (RETRYABLE_PATTERNS.some((p) => msg.includes(p))) {
      return bad("AIが混雑しています。少し待ってもう一度試してね", 503);
    }
    if (msg.includes("PERMISSION_DENIED") || msg.includes("403")) {
      return bad("AIへのアクセスが拒否されました（管理者に連絡してください）", 502);
    }
    return bad(`AI呼び出しに失敗しました: ${msg}`, 502);
  }

  if (!rawText.trim()) return bad("AIから応答が得られませんでした", 502);

  try {
    const obj = JSON.parse(rawText) as Record<string, unknown>;
    let score = Number(obj.score);
    if (!Number.isFinite(score)) score = 0;
    score = Math.max(0, Math.min(100, Math.round(score)));
    const comment =
      typeof obj.comment === "string" && obj.comment.trim()
        ? obj.comment.trim().slice(0, 80)
        : "判定したよ！";
    return NextResponse.json({ ok: true, data: { score, comment } });
  } catch {
    return bad("AI応答の解析に失敗しました", 502);
  }
}
