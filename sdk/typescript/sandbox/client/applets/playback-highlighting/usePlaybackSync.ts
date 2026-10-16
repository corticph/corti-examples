/**
 * Tracks which transcript segment is active during audio playback using
 * `requestAnimationFrame` for smooth 60fps updates.
 *
 * Why rAF instead of the `timeupdate` event: `timeupdate` fires roughly
 * 4×/second (~250ms gaps), which is too choppy for word-level highlighting.
 * `requestAnimationFrame` gives us a new frame every ~16ms, so the highlight
 * transitions between words are visually seamless.
 *
 * The segments array must be sorted by `start` (ascending). A binary search
 * finds the **last segment whose `start` <= current time** — the word that
 * is currently being or was most recently spoken. This avoids flickering
 * during gaps between words (silence, pauses) where no segment's `[start,
 * end]` range contains the current time. O(log n) per frame, critical for
 * long transcripts with thousands of word entries.
 */

import { type RefObject, useEffect, useRef, useState } from "react";

export interface TimedSegment {
  start: number;
  end: number;
}

function findActiveIndex(segments: TimedSegment[], currentTimeMs: number): number | null {
  if (segments.length === 0 || currentTimeMs < segments[0].start) {
    return null;
  }

  let lo = 0;
  let hi = segments.length - 1;
  let result = 0;

  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (segments[mid].start <= currentTimeMs) {
      result = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  return result;
}

export function usePlaybackSync(
  audioRef: RefObject<HTMLAudioElement | null>,
  segments: TimedSegment[],
): { activeIndex: number | null; isPlaying: boolean } {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const segmentsRef = useRef(segments);

  segmentsRef.current = segments;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    let rafId: number | null = null;

    const tick = () => {
      const currentTimeMs = audio.currentTime * 1000;
      const idx = findActiveIndex(segmentsRef.current, currentTimeMs);
      setActiveIndex((prev) => (prev === idx ? prev : idx));
      rafId = requestAnimationFrame(tick);
    };

    const onPlay = () => {
      setIsPlaying(true);
      rafId = requestAnimationFrame(tick);
    };

    const onPause = () => {
      setIsPlaying(false);
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    };

    const onEnded = () => {
      setIsPlaying(false);
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      setActiveIndex(null);
    };

    const onSeeked = () => {
      const currentTimeMs = audio.currentTime * 1000;
      const idx = findActiveIndex(segmentsRef.current, currentTimeMs);
      setActiveIndex(idx);
    };

    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("seeked", onSeeked);

    if (!audio.paused) {
      setIsPlaying(true);
      rafId = requestAnimationFrame(tick);
    }

    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("seeked", onSeeked);
    };
  }, [audioRef]);

  return { activeIndex, isPlaying };
}
