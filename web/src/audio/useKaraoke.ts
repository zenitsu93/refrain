import { useCallback, useEffect, useRef, useState } from "react";

import { KaraokeEngine } from "./engine";

export interface MixSettings {
  voice: number; // 0..1
  music: number; // 0..1
  semitones: number; // -12..12
  tempo: number; // 0.75..1.25
}

export const DEFAULT_MIX: MixSettings = { voice: 0.15, music: 1, semitones: 0, tempo: 1 };

/** Hook React autour du moteur audio : chargement, lecture, position et réglages. */
export function useKaraoke() {
  const engineRef = useRef<KaraokeEngine | null>(null);
  if (!engineRef.current) engineRef.current = new KaraokeEngine();
  const engine = engineRef.current;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [mix, setMix] = useState<MixSettings>(DEFAULT_MIX);
  const mixRef = useRef(mix);
  mixRef.current = mix;

  const applyMix = useCallback(
    (m: MixSettings) => {
      engine.setVoiceVolume(m.voice);
      engine.setMusicVolume(m.music);
      engine.setSemitones(m.semitones);
      engine.setTempo(m.tempo);
    },
    [engine],
  );

  useEffect(() => {
    engine.onEnded = () => {
      setPlaying(false);
      setPosition(engine.duration);
    };
    return () => {
      void engine.dispose();
    };
  }, [engine]);

  // Met à jour la position à chaque image pendant la lecture.
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const tick = () => {
      setPosition(engine.position);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, engine]);

  const load = useCallback(
    async (voiceUrl: string, musicUrl: string) => {
      setLoading(true);
      setError(null);
      setPlaying(false);
      try {
        await engine.load(voiceUrl, musicUrl);
        applyMix(mixRef.current);
        setDuration(engine.duration);
        setPosition(0);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [engine, applyMix],
  );

  const toggle = useCallback(async () => {
    if (engine.isPlaying) {
      engine.pause();
      setPlaying(false);
    } else {
      await engine.play();
      setPlaying(engine.isPlaying);
    }
  }, [engine]);

  const seek = useCallback(
    async (t: number) => {
      await engine.seek(t);
      setPosition(engine.position);
    },
    [engine],
  );

  const updateMix = useCallback(
    (patch: Partial<MixSettings>) => {
      const next = { ...mixRef.current, ...patch };
      mixRef.current = next;
      applyMix(next);
      setMix(next);
    },
    [applyMix],
  );

  return { loading, error, playing, position, duration, mix, load, toggle, seek, updateMix };
}
