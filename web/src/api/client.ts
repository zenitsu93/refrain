export type SongStatus = "queued" | "processing" | "ready" | "error";

export interface Song {
  id: string;
  title: string;
  status: SongStatus;
  error: string | null;
  created_at: string;
}

const BASE = import.meta.env.VITE_API_URL ?? "";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.detail ?? `Erreur serveur (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export async function listSongs() {
  return json<Song[]>(await fetch(`${BASE}/api/songs`));
}

export async function getSong(id: string) {
  return json<Song>(await fetch(`${BASE}/api/songs/${id}`));
}

/** Envoie un fichier audio. Le serveur sépare la voix et la musique une seule fois par fichier. */
export async function uploadSong(file: File) {
  const body = new FormData();
  body.append("file", file);
  return json<Song>(await fetch(`${BASE}/api/songs`, { method: "POST", body }));
}

export function stemUrl(id: string, stem: "vocals" | "music") {
  return `${BASE}/api/songs/${id}/stems/${stem}`;
}
