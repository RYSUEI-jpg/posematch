"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GameCamera, GameCameraHandle } from "@/components/GameCamera";
import {
  POSES,
  ROUNDS_PER_GAME,
  SECONDS_PER_ROUND,
  pickRandomPoses,
} from "@/lib/poses";
import { Pose, RoundResult } from "@/lib/types";

type Phase = "title" | "playing" | "result";
type RoundStage = "ready" | "counting" | "snap" | "judging" | "reveal";

const HIGHSCORE_KEY = "posematch_highscore_v1";
const MAX_TOTAL = ROUNDS_PER_GAME * 100;

interface Rank {
  title: string;
  emoji: string;
  color: string;
}

function getRank(total: number): Rank {
  const ratio = total / MAX_TOTAL;
  if (ratio >= 0.9) return { title: "ポーズの神", emoji: "👑", color: "from-amber-400 to-yellow-300" };
  if (ratio >= 0.75) return { title: "ポーズマスター", emoji: "🏆", color: "from-fuchsia-400 to-pink-300" };
  if (ratio >= 0.55) return { title: "なかなかの腕前", emoji: "✨", color: "from-sky-400 to-cyan-300" };
  if (ratio >= 0.35) return { title: "まだまだ修行中", emoji: "💪", color: "from-emerald-400 to-teal-300" };
  return { title: "ドンマイ！", emoji: "😅", color: "from-slate-400 to-slate-300" };
}

function scoreColor(score: number): string {
  if (score >= 80) return "text-emerald-300";
  if (score >= 50) return "text-yellow-300";
  return "text-rose-300";
}

export default function Home() {
  const [phase, setPhase] = useState<Phase>("title");
  const [rounds, setRounds] = useState<Pose[]>([]);
  const [roundIndex, setRoundIndex] = useState(0);
  const [roundStage, setRoundStage] = useState<RoundStage>("ready");
  const [count, setCount] = useState(SECONDS_PER_ROUND);
  const [results, setResults] = useState<RoundResult[]>([]);
  const [revealResult, setRevealResult] = useState<RoundResult | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [highScore, setHighScore] = useState(0);
  const [isNewRecord, setIsNewRecord] = useState(false);

  const cameraRef = useRef<GameCameraHandle>(null);
  const capturedFileRef = useRef<File | null>(null);

  useEffect(() => {
    const stored = Number(localStorage.getItem(HIGHSCORE_KEY));
    if (Number.isFinite(stored)) setHighScore(stored);
  }, []);

  const startGame = useCallback(() => {
    setRounds(pickRandomPoses(ROUNDS_PER_GAME));
    setRoundIndex(0);
    setResults([]);
    setRevealResult(null);
    setCameraReady(false);
    setCameraError(null);
    setIsNewRecord(false);
    setRoundStage("ready");
    setCount(SECONDS_PER_ROUND);
    setPhase("playing");
  }, []);

  const finishGame = useCallback(
    (finalResults: RoundResult[]) => {
      const total = finalResults.reduce((s, r) => s + r.score, 0);
      if (total > highScore) {
        setHighScore(total);
        setIsNewRecord(true);
        try {
          localStorage.setItem(HIGHSCORE_KEY, String(total));
        } catch {
          /* localStorage 不可でも続行 */
        }
      }
      setPhase("result");
    },
    [highScore]
  );

  // ready → counting（カメラ準備完了後）
  useEffect(() => {
    if (phase !== "playing" || roundStage !== "ready" || !cameraReady) return;
    const t = setTimeout(() => {
      setCount(SECONDS_PER_ROUND);
      setRoundStage("counting");
    }, 1400);
    return () => clearTimeout(t);
  }, [phase, roundStage, cameraReady]);

  // counting カウントダウン
  useEffect(() => {
    if (phase !== "playing" || roundStage !== "counting") return;
    if (count <= 0) {
      setRoundStage("snap");
      return;
    }
    const t = setTimeout(() => setCount((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, roundStage, count]);

  // snap 撮影（フラッシュ表示中にフレームを取得）
  useEffect(() => {
    if (phase !== "playing" || roundStage !== "snap") return;
    let cancelled = false;
    (async () => {
      capturedFileRef.current =
        (await cameraRef.current?.capture()) ?? null;
      if (cancelled) return;
      setTimeout(() => {
        if (!cancelled) setRoundStage("judging");
      }, 450);
    })();
    return () => {
      cancelled = true;
    };
  }, [phase, roundStage, roundIndex]);

  // judging AI判定
  useEffect(() => {
    if (phase !== "playing" || roundStage !== "judging") return;
    let cancelled = false;
    (async () => {
      const pose = rounds[roundIndex];
      const file = capturedFileRef.current;
      let result: RoundResult;
      if (!file) {
        result = { pose, score: 0, comment: "うまく撮れなかった…次いこう！" };
      } else {
        try {
          const fd = new FormData();
          fd.append("image", file);
          fd.append("poseName", pose.name);
          fd.append("poseDescription", pose.description);
          const res = await fetch("/api/judge", { method: "POST", body: fd });
          const json = await res.json();
          if (json.ok) {
            result = { pose, score: json.data.score, comment: json.data.comment };
          } else {
            result = { pose, score: 0, comment: json.error ?? "判定に失敗したよ" };
          }
        } catch {
          result = { pose, score: 0, comment: "通信エラー。電波を確認してね" };
        }
      }
      if (cancelled) return;
      capturedFileRef.current = null;
      setResults((prev) => [...prev, result]);
      setRevealResult(result);
      setRoundStage("reveal");
    })();
    return () => {
      cancelled = true;
    };
  }, [phase, roundStage, roundIndex, rounds]);

  // reveal → 次のラウンド / 結果へ
  useEffect(() => {
    if (phase !== "playing" || roundStage !== "reveal") return;
    const t = setTimeout(() => {
      const next = roundIndex + 1;
      if (next >= rounds.length) {
        finishGame([...results]);
      } else {
        setRoundIndex(next);
        setRevealResult(null);
        setRoundStage("ready");
        setCount(SECONDS_PER_ROUND);
      }
    }, 2900);
    return () => clearTimeout(t);
  }, [phase, roundStage, roundIndex, rounds, results, finishGame]);

  const handleCameraReady = useCallback(() => setCameraReady(true), []);
  const handleCameraError = useCallback((m: string) => setCameraError(m), []);

  // ===== タイトル画面 =====
  if (phase === "title") {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 py-10 pt-safe pb-safe text-center">
        <div className="animate-pop-in text-7xl">🤳</div>
        <h1 className="mt-4 bg-gradient-to-r from-fuchsia-400 via-pink-400 to-amber-300 bg-clip-text text-4xl font-black text-transparent">
          ポーズマスターAI
        </h1>
        <p className="mt-3 text-base leading-relaxed text-slate-300">
          お手本のポーズをマネしてカメラに写すだけ。
          <br />
          AIがあなたのキレを<strong className="text-white">採点</strong>します！
        </p>

        <div className="mt-8 w-full rounded-2xl bg-white/5 p-5 text-left text-sm text-slate-300 ring-1 ring-white/10">
          <p className="font-bold text-white">遊び方</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>お題のポーズが出る</li>
            <li>カウントダウンの間にポーズを決める</li>
            <li>AIが0〜100点で採点！</li>
            <li>全{ROUNDS_PER_GAME}問の合計点で勝負</li>
          </ol>
        </div>

        {highScore > 0 && (
          <p className="mt-6 text-sm text-amber-300">
            🏅 ハイスコア {highScore} 点 / {MAX_TOTAL} 点
          </p>
        )}

        <button
          type="button"
          onClick={startGame}
          className="mt-8 w-full rounded-2xl bg-gradient-to-r from-fuchsia-500 to-pink-500 px-8 py-4 text-xl font-black text-white shadow-lg shadow-fuchsia-500/30 active:scale-95 transition"
        >
          ▶ あそぶ
        </button>
        <p className="mt-3 text-xs text-slate-500">
          カメラの使用許可が必要です（自撮りカメラ）
        </p>
      </main>
    );
  }

  // ===== 結果画面 =====
  if (phase === "result") {
    const total = results.reduce((s, r) => s + r.score, 0);
    const rank = getRank(total);
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col px-6 py-8 pt-safe pb-safe">
        <div className="animate-pop-in text-center">
          <div className="text-6xl">{rank.emoji}</div>
          <div
            className={`mt-2 bg-gradient-to-r ${rank.color} bg-clip-text text-3xl font-black text-transparent`}
          >
            {rank.title}
          </div>
          <div className="mt-4 text-slate-300">合計スコア</div>
          <div className="text-6xl font-black text-white">
            {total}
            <span className="text-2xl text-slate-400"> / {MAX_TOTAL}</span>
          </div>
          {isNewRecord && (
            <div className="mt-2 inline-block animate-float-up rounded-full bg-amber-400/20 px-4 py-1 text-sm font-bold text-amber-300 ring-1 ring-amber-300/40">
              🎉 自己ベスト更新！
            </div>
          )}
        </div>

        <ul className="mt-6 space-y-2">
          {results.map((r, i) => (
            <li
              key={i}
              className="flex items-center gap-3 rounded-xl bg-white/5 px-4 py-3 ring-1 ring-white/10"
            >
              <span className="text-2xl">{r.pose.emoji}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold text-white">
                  {r.pose.name}
                </div>
                <div className="truncate text-xs text-slate-400">
                  {r.comment}
                </div>
              </div>
              <span className={`text-xl font-black ${scoreColor(r.score)}`}>
                {r.score}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-auto pt-6">
          <button
            type="button"
            onClick={startGame}
            className="w-full rounded-2xl bg-gradient-to-r from-fuchsia-500 to-pink-500 px-8 py-4 text-xl font-black text-white shadow-lg shadow-fuchsia-500/30 active:scale-95 transition"
          >
            🔁 もう一回
          </button>
          <button
            type="button"
            onClick={() => setPhase("title")}
            className="mt-3 w-full rounded-2xl bg-white/10 px-8 py-3 text-base font-bold text-white active:scale-95 transition"
          >
            タイトルへ
          </button>
        </div>
      </main>
    );
  }

  // ===== プレイ画面 =====
  const currentPose = rounds[roundIndex];

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-black">
      {cameraError ? (
        <div className="flex h-full flex-col items-center justify-center px-8 text-center">
          <div className="text-5xl">📷❌</div>
          <p className="mt-4 text-lg font-bold text-white">
            カメラを開けませんでした
          </p>
          <p className="mt-2 text-sm text-slate-300">{cameraError}</p>
          <button
            type="button"
            onClick={() => setPhase("title")}
            className="mt-6 rounded-xl bg-white px-6 py-3 font-bold text-black"
          >
            タイトルへ戻る
          </button>
        </div>
      ) : (
        <>
          <GameCamera
            ref={cameraRef}
            onReady={handleCameraReady}
            onError={handleCameraError}
          />

          {/* 上部: 進行状況 + お題 */}
          <div className="pointer-events-none absolute inset-x-0 top-0 pt-safe">
            <div className="bg-gradient-to-b from-black/70 to-transparent px-4 pb-8 pt-3">
              <div className="flex items-center justify-between text-sm text-white/90">
                <span className="font-bold">
                  Q{roundIndex + 1}
                  <span className="text-white/60"> / {rounds.length}</span>
                </span>
                <span className="rounded-full bg-white/15 px-3 py-1 font-bold">
                  これまで {results.reduce((s, r) => s + r.score, 0)} 点
                </span>
              </div>
              {currentPose && (
                <div className="mt-3 text-center">
                  <div className="text-sm text-white/70">マネするポーズ</div>
                  <div className="text-2xl font-black text-white">
                    {currentPose.emoji} {currentPose.name}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* カメラ起動中 */}
          {!cameraReady && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-white">
              <div className="text-center">
                <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-white/30 border-t-white" />
                <p className="mt-3 text-sm">カメラを起動中...</p>
              </div>
            </div>
          )}

          {/* ready: よーい */}
          {cameraReady && roundStage === "ready" && currentPose && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="animate-pop-in text-center">
                <div className="text-7xl">{currentPose.emoji}</div>
                <div className="mt-2 text-3xl font-black text-white drop-shadow-lg">
                  {currentPose.name}
                </div>
                <div className="mt-1 text-lg text-white/80">よーい…</div>
              </div>
            </div>
          )}

          {/* counting: カウントダウン */}
          {roundStage === "counting" && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div
                key={count}
                className="animate-pop-in text-[8rem] font-black leading-none text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.7)]"
              >
                {count}
              </div>
            </div>
          )}

          {/* snap: シャッターフラッシュ */}
          {roundStage === "snap" && (
            <div className="pointer-events-none absolute inset-0 animate-shutter bg-white" />
          )}

          {/* judging: 採点中 */}
          {roundStage === "judging" && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/55">
              <div className="text-center text-white">
                <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-white/30 border-t-fuchsia-400" />
                <p className="mt-4 text-lg font-bold">AIが採点中...</p>
              </div>
            </div>
          )}

          {/* reveal: 結果 */}
          {roundStage === "reveal" && revealResult && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/65 px-8">
              <div className="animate-pop-in text-center">
                <div className="text-sm text-white/70">
                  {revealResult.pose.emoji} {revealResult.pose.name}
                </div>
                <div
                  className={`mt-1 text-8xl font-black ${scoreColor(
                    revealResult.score
                  )}`}
                >
                  {revealResult.score}
                  <span className="text-3xl text-white/60">点</span>
                </div>
                <p className="mx-auto mt-4 max-w-xs animate-float-up text-lg font-bold text-white">
                  {revealResult.comment}
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </main>
  );
}
