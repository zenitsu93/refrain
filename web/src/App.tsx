import { useCallback, useEffect, useState } from "react";
import { AlertCircle } from "lucide-react";

import { listSongs, stemUrl, uploadSong, type Song } from "@/api/client";
import { useKaraoke } from "@/audio/useKaraoke";
import { Logo } from "@/components/Logo";
import { Player } from "@/components/Player";
import { SongList } from "@/components/SongList";
import { UploadZone } from "@/components/UploadZone";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const POLL_MS = 3000;

export default function App() {
  const karaoke = useKaraoke();
  const [songs, setSongs] = useState<Song[]>([]);
  const [current, setCurrent] = useState<Song | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setSongs(await listSongs());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Serveur injoignable");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Tant qu'une séparation est en cours, on interroge le serveur régulièrement.
  const pending = songs.some((s) => s.status === "queued" || s.status === "processing");
  useEffect(() => {
    if (!pending) return;
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [pending, refresh]);

  const upload = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      await uploadSong(file);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Envoi impossible");
    } finally {
      setUploading(false);
    }
  };

  const select = (song: Song) => {
    setCurrent(song);
    void karaoke.load(stemUrl(song.id, "vocals"), stemUrl(song.id, "music"));
  };

  const shownError = error ?? karaoke.error;

  return (
    <div className="mx-auto flex min-h-svh max-w-5xl flex-col gap-8 px-4 py-6 sm:px-6">
      <header className="flex items-center justify-between">
        <Logo />
        <span className="text-sm text-muted-foreground">Prototype</span>
      </header>

      {shownError && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm">
          <AlertCircle className="size-4 shrink-0 text-destructive" />
          {shownError}
        </div>
      )}

      <main className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Bibliothèque</CardTitle>
            <CardDescription>Tes chansons, prêtes à chanter.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <UploadZone onFile={upload} busy={uploading} />
            <SongList songs={songs} currentId={current?.id ?? null} onSelect={select} />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-1 flex-col justify-center">
            {current ? (
              <Player
                title={current.title}
                loading={karaoke.loading}
                playing={karaoke.playing}
                position={karaoke.position}
                duration={karaoke.duration}
                mix={karaoke.mix}
                onToggle={karaoke.toggle}
                onSeek={karaoke.seek}
                onMix={karaoke.updateMix}
              />
            ) : (
              <div className="flex flex-col items-center gap-3 py-12 text-center">
                <img src="/refrain-mark.svg" alt="" className="size-16 opacity-80" />
                <h2 className="text-xl font-semibold">Choisis une chanson</h2>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Règle la voix originale et la musique séparément, change la tonalité, et chante.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
