import { useState } from "react";
import { Mic, Minus, Music, Pause, Play, Plus, RotateCcw } from "lucide-react";

import type { MixSettings } from "@/audio/useKaraoke";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { formatTime } from "@/lib/utils";

interface PlayerProps {
  title: string;
  loading: boolean;
  playing: boolean;
  position: number;
  duration: number;
  mix: MixSettings;
  onToggle: () => void;
  onSeek: (t: number) => void;
  onMix: (patch: Partial<MixSettings>) => void;
}

export function Player({
  title,
  loading,
  playing,
  position,
  duration,
  mix,
  onToggle,
  onSeek,
  onMix,
}: PlayerProps) {
  const disabled = loading || duration === 0;
  // Pendant qu'on fait glisser le curseur, on n'affiche que la valeur visée
  // et on ne relance la lecture qu'au relâchement.
  const [scrub, setScrub] = useState<number | null>(null);
  const shown = scrub ?? position;
  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center gap-4">
        <Button
          size="icon-lg"
          onClick={onToggle}
          disabled={disabled}
          aria-label={playing ? "Pause" : "Lecture"}
        >
          {playing ? <Pause className="size-6" /> : <Play className="size-6 translate-x-0.5" />}
        </Button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-xl font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">
            {loading ? "Chargement des pistes…" : "Prête à chanter"}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Slider
          value={[shown]}
          max={duration || 1}
          step={0.1}
          disabled={disabled}
          onValueChange={([t]) => setScrub(t)}
          onValueCommit={([t]) => {
            setScrub(null);
            onSeek(t);
          }}
          aria-label="Position"
        />
        <div className="flex justify-between font-mono text-xs text-muted-foreground">
          <span>{formatTime(shown)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <VolumeControl
          icon={<Mic className="size-4 text-voice" />}
          label="Voix originale"
          tone="voice"
          value={mix.voice}
          onChange={(voice) => onMix({ voice })}
        />
        <VolumeControl
          icon={<Music className="size-4 text-music" />}
          label="Musique"
          tone="music"
          value={mix.music}
          onChange={(music) => onMix({ music })}
        />
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <Stepper
          label="Tonalité"
          display={`${mix.semitones > 0 ? "+" : ""}${mix.semitones} demi-ton${Math.abs(mix.semitones) > 1 ? "s" : ""}`}
          onMinus={() => onMix({ semitones: Math.max(-12, mix.semitones - 1) })}
          onPlus={() => onMix({ semitones: Math.min(12, mix.semitones + 1) })}
          onReset={() => onMix({ semitones: 0 })}
        />
        <Stepper
          label="Tempo"
          display={`${Math.round(mix.tempo * 100)} %`}
          onMinus={() => onMix({ tempo: Math.max(0.75, round2(mix.tempo - 0.05)) })}
          onPlus={() => onMix({ tempo: Math.min(1.25, round2(mix.tempo + 0.05)) })}
          onReset={() => onMix({ tempo: 1 })}
        />
      </div>
    </div>
  );
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function VolumeControl({
  icon,
  label,
  tone,
  value,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  tone: "voice" | "music";
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-semibold">
          {icon}
          {label}
        </span>
        <span className="font-mono text-xs text-muted-foreground">{Math.round(value * 100)} %</span>
      </div>
      <Slider
        tone={tone}
        value={[value]}
        max={1}
        step={0.01}
        onValueChange={([v]) => onChange(v)}
        aria-label={label}
      />
    </div>
  );
}

function Stepper({
  label,
  display,
  onMinus,
  onPlus,
  onReset,
}: {
  label: string;
  display: string;
  onMinus: () => void;
  onPlus: () => void;
  onReset: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <span className="text-sm font-semibold">{label}</span>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={onMinus} aria-label={`${label} −`}>
          <Minus />
        </Button>
        <span className="min-w-28 text-center font-mono text-sm">{display}</span>
        <Button variant="outline" size="icon" onClick={onPlus} aria-label={`${label} +`}>
          <Plus />
        </Button>
        <Button variant="ghost" size="icon" onClick={onReset} aria-label={`Réinitialiser ${label}`}>
          <RotateCcw />
        </Button>
      </div>
    </div>
  );
}
