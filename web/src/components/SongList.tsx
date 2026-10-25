import { AlertCircle, Loader2, Music2 } from "lucide-react";

import type { Song } from "@/api/client";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<Song["status"], string> = {
  queued: "En attente",
  processing: "Séparation…",
  ready: "Prête",
  error: "Erreur",
};

export function SongList({
  songs,
  currentId,
  onSelect,
}: {
  songs: Song[];
  currentId: string | null;
  onSelect: (song: Song) => void;
}) {
  if (songs.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Aucune chanson pour l'instant. Commence par en déposer une.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-1">
      {songs.map((song) => {
        const ready = song.status === "ready";
        return (
          <li key={song.id}>
            <button
              type="button"
              disabled={!ready}
              onClick={() => onSelect(song)}
              title={song.error ?? undefined}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                ready ? "hover:bg-muted" : "cursor-default",
                currentId === song.id && "bg-muted",
              )}
            >
              {song.status === "error" ? (
                <AlertCircle className="size-4 shrink-0 text-destructive" />
              ) : ready ? (
                <Music2 className="size-4 shrink-0 text-music" />
              ) : (
                <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
              )}
              <span className="min-w-0 flex-1 truncate font-semibold">{song.title}</span>
              {!ready && (
                <Badge variant={song.status === "error" ? "destructive" : "secondary"}>
                  {STATUS_LABEL[song.status]}
                </Badge>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
