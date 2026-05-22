"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

export interface GameCameraHandle {
  capture: () => Promise<File | null>;
}

interface Props {
  onReady: () => void;
  onError: (message: string) => void;
}

const MAX_DIMENSION = 720;

export const GameCamera = forwardRef<GameCameraHandle, Props>(function GameCamera(
  { onReady, onError },
  ref
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        onError("このブラウザはカメラに対応していません");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "user" } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play();
          setReady(true);
          onReady();
        }
      } catch (e) {
        if (e instanceof Error) {
          if (e.name === "NotAllowedError") {
            onError(
              "カメラの使用が許可されませんでした。ブラウザの設定で許可してね。"
            );
          } else if (e.name === "NotFoundError") {
            onError("カメラが見つかりませんでした。");
          } else {
            onError(e.message);
          }
        } else {
          onError("カメラを起動できませんでした");
        }
      }
    }

    start();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useImperativeHandle(ref, () => ({
    async capture() {
      const video = videoRef.current;
      if (!video || !ready || video.videoWidth === 0) return null;

      const scale = Math.min(
        1,
        MAX_DIMENSION / Math.max(video.videoWidth, video.videoHeight)
      );
      const w = Math.round(video.videoWidth * scale);
      const h = Math.round(video.videoHeight * scale);

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(video, 0, 0, w, h);

      return new Promise<File | null>((resolve) => {
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(null);
              return;
            }
            resolve(
              new File([blob], `pose-${Date.now()}.jpg`, { type: "image/jpeg" })
            );
          },
          "image/jpeg",
          0.85
        );
      });
    },
  }));

  return (
    <video
      ref={videoRef}
      playsInline
      muted
      autoPlay
      className="absolute inset-0 h-full w-full object-cover"
      style={{ transform: "scaleX(-1)" }}
    />
  );
});
