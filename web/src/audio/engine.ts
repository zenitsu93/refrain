import { SoundTouchNode } from "@soundtouchjs/audio-worklet";
import processorUrl from "@soundtouchjs/audio-worklet/processor?url";

/**
 * Moteur audio du karaoké.
 *
 * Graphe : voix → gain voix ┐
 *                           ├→ SoundTouch (tonalité) → volume général → sortie
 *          musique → gain musique ┘
 *
 * Les deux pistes partagent la même horloge (AudioContext) et sont démarrées
 * au même instant, ce qui les garde synchronisées à l'échantillon près.
 * Le tempo passe par playbackRate des sources ; SoundTouch compense la hauteur.
 */
export class KaraokeEngine {
  private ctx: AudioContext | null = null;
  private soundTouch: SoundTouchNode | null = null;
  private voiceGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private master: GainNode | null = null;

  private voiceBuffer: AudioBuffer | null = null;
  private musicBuffer: AudioBuffer | null = null;
  private sources: AudioBufferSourceNode[] = [];

  private playing = false;
  private startedAt = 0; // ctx.currentTime au dernier démarrage
  private offset = 0; // position (s) dans le morceau au dernier démarrage
  private tempo = 1;

  /** Appelé quand le morceau arrive à la fin tout seul. */
  onEnded: (() => void) | null = null;

  /** Crée le contexte audio. À appeler après un geste de l'utilisateur. */
  private async ensureContext() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") await this.ctx.resume();
      return this.ctx;
    }
    const ctx = new AudioContext({ latencyHint: "interactive" });
    await SoundTouchNode.register(ctx, processorUrl);

    this.soundTouch = new SoundTouchNode({ context: ctx });
    this.voiceGain = ctx.createGain();
    this.musicGain = ctx.createGain();
    this.master = ctx.createGain();

    this.voiceGain.connect(this.soundTouch);
    this.musicGain.connect(this.soundTouch);
    this.soundTouch.connect(this.master);
    this.master.connect(ctx.destination);

    this.ctx = ctx;
    return ctx;
  }

  /** Télécharge et décode les deux pistes. */
  async load(voiceUrl: string, musicUrl: string) {
    const ctx = await this.ensureContext();
    this.stopSources();
    this.playing = false;
    this.offset = 0;
    const decode = async (url: string) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Téléchargement impossible : ${url}`);
      return ctx.decodeAudioData(await res.arrayBuffer());
    };
    [this.voiceBuffer, this.musicBuffer] = await Promise.all([
      decode(voiceUrl),
      decode(musicUrl),
    ]);
  }

  get duration() {
    return Math.max(this.voiceBuffer?.duration ?? 0, this.musicBuffer?.duration ?? 0);
  }

  get isPlaying() {
    return this.playing;
  }

  /** Position actuelle dans le morceau, en secondes. */
  get position() {
    if (!this.playing || !this.ctx) return this.offset;
    const t = this.offset + (this.ctx.currentTime - this.startedAt) * this.tempo;
    return Math.min(t, this.duration);
  }

  async play() {
    if (this.playing || !this.voiceBuffer || !this.musicBuffer) return;
    const ctx = await this.ensureContext();
    if (this.offset >= this.duration) this.offset = 0;

    const when = ctx.currentTime + 0.05; // petite marge pour démarrer ensemble
    this.sources = [
      this.makeSource(this.voiceBuffer, this.voiceGain!),
      this.makeSource(this.musicBuffer, this.musicGain!),
    ];
    for (const s of this.sources) s.start(when, this.offset);
    this.sources[1].onended = () => {
      // onended se déclenche aussi sur stop() : on ne réagit qu'à une vraie fin.
      if (this.playing && this.position >= this.duration - 0.1) {
        this.playing = false;
        this.offset = this.duration;
        this.sources = [];
        this.onEnded?.();
      }
    };
    this.startedAt = when;
    this.playing = true;
  }

  pause() {
    if (!this.playing) return;
    this.offset = this.position;
    this.playing = false;
    this.stopSources();
  }

  async seek(seconds: number) {
    const wasPlaying = this.playing;
    this.pause();
    this.offset = Math.max(0, Math.min(seconds, this.duration));
    if (wasPlaying) await this.play();
  }

  /** Volume de la voix originale, de 0 à 1. */
  setVoiceVolume(v: number) {
    this.ramp(this.voiceGain, v);
  }

  /** Volume de la musique, de 0 à 1. */
  setMusicVolume(v: number) {
    this.ramp(this.musicGain, v);
  }

  setMasterVolume(v: number) {
    this.ramp(this.master, v);
  }

  /** Décalage de tonalité en demi-tons (−12 à +12). */
  setSemitones(semitones: number) {
    if (this.soundTouch) this.soundTouch.pitchSemitones.value = semitones;
  }

  /** Vitesse de lecture (1 = normal). La tonalité reste inchangée. */
  setTempo(tempo: number) {
    if (this.playing && this.ctx) {
      // On repart de la position actuelle pour garder un calcul de position juste.
      this.offset = this.position;
      this.startedAt = this.ctx.currentTime;
    }
    this.tempo = tempo;
    for (const s of this.sources) s.playbackRate.value = tempo;
    if (this.soundTouch) this.soundTouch.playbackRate.value = tempo;
  }

  async dispose() {
    this.stopSources();
    this.playing = false;
    const ctx = this.ctx;
    this.ctx = null;
    this.soundTouch = this.voiceGain = this.musicGain = this.master = null;
    await ctx?.close();
  }

  private makeSource(buffer: AudioBuffer, destination: AudioNode) {
    const s = this.ctx!.createBufferSource();
    s.buffer = buffer;
    s.playbackRate.value = this.tempo;
    if (this.soundTouch) this.soundTouch.playbackRate.value = this.tempo;
    s.connect(destination);
    return s;
  }

  private stopSources() {
    for (const s of this.sources) {
      s.onended = null;
      try {
        s.stop();
      } catch {
        // déjà arrêtée
      }
      s.disconnect();
    }
    this.sources = [];
  }

  private ramp(node: GainNode | null, value: number) {
    if (!node || !this.ctx) return;
    node.gain.setTargetAtTime(value, this.ctx.currentTime, 0.02);
  }
}
