import audioManifest from '../data/audio.json';

export const SOUND_EFFECT_IDS = [
  'sfx.weapon.direct-fire',
  'sfx.weapon.arc-fire',
  'sfx.weapon.impact',
  'sfx.weapon.explosion',
  'sfx.enemy.death',
  'sfx.ui.upgrade-confirm',
] as const;

export type SoundEffectId = (typeof SOUND_EFFECT_IDS)[number];

export const MUSIC_IDS = ['music.gameplay.default'] as const;

export type MusicId = (typeof MUSIC_IDS)[number];

interface AudioManifestEntry {
  src: string;
  kind: string;
  bus: string;
  licenseStatus: string;
  licenseName: string;
  sourceUrl: string;
  licenseUrl: string;
  creator: string;
  downloadedAt: string | null;
  originalSha256: string | null;
  runtimeSha256: string | null;
  modified: boolean;
  modificationSummary: string;
  attribution: string;
  reviewNote: string;
}

interface AudioManifest {
  version: number;
  sounds: Record<string, AudioManifestEntry>;
}

interface SoundPolicy {
  cooldownMs: number;
  maxVoices: number;
  gain: number;
}

interface Voice {
  gain: GainNode;
  release: () => void;
}

interface StoredAudioSettings {
  masterVolume?: number;
  sfxVolume?: number;
  musicVolume?: number;
  muted?: boolean;
}

type AudioContextConstructor = new () => AudioContext;
type AudioWindow = Window & {
  AudioContext?: AudioContextConstructor;
  webkitAudioContext?: AudioContextConstructor;
};

const manifest = audioManifest as AudioManifest;

const SOUND_POLICY: Record<SoundEffectId, SoundPolicy> = {
  'sfx.weapon.direct-fire': { cooldownMs: 35, maxVoices: 4, gain: 0.24 },
  'sfx.weapon.arc-fire': { cooldownMs: 120, maxVoices: 2, gain: 0.28 },
  'sfx.weapon.impact': { cooldownMs: 25, maxVoices: 6, gain: 0.2 },
  'sfx.weapon.explosion': { cooldownMs: 100, maxVoices: 3, gain: 0.34 },
  'sfx.enemy.death': { cooldownMs: 25, maxVoices: 6, gain: 0.2 },
  'sfx.ui.upgrade-confirm': { cooldownMs: 150, maxVoices: 1, gain: 0.3 },
};

export class AudioManager {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private musicBuffer: AudioBuffer | null = null;
  private musicSource: AudioBufferSourceNode | null = null;
  private readonly activeSources = new Set<AudioScheduledSourceNode>();
  private readonly activeVoices = new Map<SoundEffectId, number>();
  private readonly cooldowns = new Map<string, number>();
  private readonly validationErrors: string[] = [];
  private masterVolume = 1;
  private sfxVolume = 0.8;
  private musicVolume = 0.4;
  private muted = false;
  private musicRequested = false;
  private requestedMusicId: MusicId = 'music.gameplay.default';
  private musicDucked = false;
  private userGestureSeen = false;
  private resumePending = false;
  private gestureTarget: Window | null = null;

  private readonly unlockAudio = (): void => {
    this.userGestureSeen = true;
    void this.ensureReady();
  };

  public constructor() {
    this.loadSettings();
    if (!Number.isInteger(manifest.version)) {
      this.validationErrors.push('Audio manifest version is invalid.');
    }

    for (const id of [...SOUND_EFFECT_IDS, ...MUSIC_IDS]) {
      const entry = manifest.sounds?.[id];
      if (!entry) {
        this.validationErrors.push('Missing audio manifest entry: ' + id);
        continue;
      }
      const expectedKind = MUSIC_IDS.includes(id as MusicId) ? 'music' : 'sfx';
      if (entry.kind !== expectedKind || entry.bus !== expectedKind) {
        this.validationErrors.push('Audio entry has an invalid kind or bus: ' + id);
      }
      if (entry.licenseStatus !== 'approved') {
        this.validationErrors.push('Audio entry is not approved: ' + id);
      }
      if (entry.src.indexOf('procedural://') !== 0) {
        this.validationErrors.push('Audio entry is not project-authored synthesis: ' + id);
      }
    }
  }

  public getValidationErrors(): readonly string[] {
    return this.validationErrors;
  }

  public async preload(): Promise<void> {
    if (this.validationErrors.length > 0) {
      console.warn('[Audio] preload blocked by manifest validation', this.validationErrors);
    }
  }

  public attachUserGestureListeners(target?: Window): void {
    if (this.gestureTarget) return;
    const owner = target ?? (typeof window !== 'undefined' ? window : null);
    if (!owner) return;

    this.gestureTarget = owner;
    owner.addEventListener('pointerdown', this.unlockAudio, { passive: true });
    owner.addEventListener('keydown', this.unlockAudio);
    owner.addEventListener('touchstart', this.unlockAudio, { passive: true });
    owner.addEventListener('visibilitychange', () => {
      if (!owner.document.hidden) void this.ensureReady();
    });
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain) this.masterGain.gain.value = muted ? 0 : this.masterVolume;
    this.applyMusicGain();
    this.saveSettings();
  }

  public setMasterVolume(volume: number): void {
    this.masterVolume = Math.max(0, Math.min(1, volume));
    if (this.masterGain) this.masterGain.gain.value = this.muted ? 0 : this.masterVolume;
    this.saveSettings();
  }

  public setSfxVolume(volume: number): void {
    this.sfxVolume = Math.max(0, Math.min(1, volume));
    if (this.sfxGain) this.sfxGain.gain.value = this.sfxVolume;
    this.saveSettings();
  }

  public setMusicVolume(volume: number): void {
    this.musicVolume = Math.max(0, Math.min(1, volume));
    this.applyMusicGain();
    this.saveSettings();
  }

  public getMusicVolume(): number {
    return this.musicVolume;
  }

  public isMusicMuted(): boolean {
    return this.muted || this.musicVolume <= 0;
  }

  public cycleMusicVolume(): void {
    const levels = [0, 0.2, 0.4];
    const currentIndex = levels.findIndex((level) => Math.abs(level - this.musicVolume) < 0.01);
    this.setMusicVolume(levels[currentIndex >= 0 ? (currentIndex + 1) % levels.length : 0]);
  }

  public setMusicDucked(ducked: boolean): void {
    this.musicDucked = ducked;
    this.applyMusicGain(0.12);
  }

  public playMusic(id: MusicId = 'music.gameplay.default'): void {
    const entry = manifest.sounds?.[id];
    if (!entry || entry.kind !== 'music' || entry.bus !== 'music' ||
      entry.licenseStatus !== 'approved' || entry.src.indexOf('procedural://') !== 0) return;

    this.requestedMusicId = id;
    this.musicRequested = true;
    this.startMusicIfReady();
  }

  public stopMusic(): void {
    this.musicRequested = false;
    this.stopMusicSource();
  }

  private loadSettings(): void {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem('pvd.audio.settings');
      if (!raw) return;
      const stored = JSON.parse(raw) as StoredAudioSettings;
      if (typeof stored.masterVolume === 'number' && Number.isFinite(stored.masterVolume)) {
        this.masterVolume = Math.max(0, Math.min(1, stored.masterVolume));
      }
      if (typeof stored.sfxVolume === 'number' && Number.isFinite(stored.sfxVolume)) {
        this.sfxVolume = Math.max(0, Math.min(1, stored.sfxVolume));
      }
      if (typeof stored.musicVolume === 'number' && Number.isFinite(stored.musicVolume)) {
        this.musicVolume = Math.max(0, Math.min(1, stored.musicVolume));
      }
      if (typeof stored.muted === 'boolean') this.muted = stored.muted;
    } catch {
      // Private browsing and malformed settings fall back to defaults.
    }
  }

  private saveSettings(): void {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem('pvd.audio.settings', JSON.stringify({
        masterVolume: this.masterVolume,
        sfxVolume: this.sfxVolume,
        musicVolume: this.musicVolume,
        muted: this.muted,
      }));
    } catch {
      // Storage failure must not interrupt audio or gameplay.
    }
  }

  public ensureReady(): AudioContext | null {
    if (!this.userGestureSeen) return null;
    if (this.context) {
      this.resumeIfNeeded();
      return this.context;
    }

    if (typeof window === 'undefined') return null;

    const owner = window as AudioWindow;
    const ContextConstructor = owner.AudioContext ?? owner.webkitAudioContext;
    if (!ContextConstructor) return null;

    try {
      const context = new ContextConstructor();
      const masterGain = context.createGain();
      const sfxGain = context.createGain();
      const musicGain = context.createGain();
      masterGain.gain.value = this.muted ? 0 : this.masterVolume;
      sfxGain.gain.value = this.sfxVolume;
      musicGain.gain.value = 0;
      sfxGain.connect(masterGain);
      musicGain.connect(masterGain);
      masterGain.connect(context.destination);
      this.context = context;
      this.masterGain = masterGain;
      this.sfxGain = sfxGain;
      this.musicGain = musicGain;
      this.resumeIfNeeded();
      return context;
    } catch {
      return null;
    }
  }

  private resumeIfNeeded(): void {
    const context = this.context;
    if (!context) return;
    if (context.state !== 'suspended') {
      this.startMusicIfReady();
      return;
    }
    if (this.resumePending) return;
    this.resumePending = true;
    void context.resume()
      .then(() => {
        this.resumePending = false;
        this.startMusicIfReady();
      })
      .catch(() => {
        this.resumePending = false;
      });
  }

  public playSfx(
    id: SoundEffectId,
    options: {
      gain?: number;
      cooldownGroup?: string;
      cooldownMs?: number;
      maxVoices?: number;
    } = {}
  ): void {
    const entry = manifest.sounds?.[id];
    if (!entry || entry.licenseStatus !== 'approved' || entry.src.indexOf('procedural://') !== 0) return;

    const context = this.ensureReady();
    if (!context || this.muted) return;
    if (context.state === 'suspended') return;

    const policy = SOUND_POLICY[id];
    const now = context.currentTime;
    const group = options.cooldownGroup ?? id;
    const cooldownMs = options.cooldownMs ?? policy.cooldownMs;
    const lastPlayedAt = this.cooldowns.get(group) ?? Number.NEGATIVE_INFINITY;
    if ((now - lastPlayedAt) * 1000 < cooldownMs) return;

    const maxVoices = options.maxVoices ?? policy.maxVoices;
    const voice = this.beginVoice(id, maxVoices);
    if (!voice) return;

    this.cooldowns.set(group, now);
    voice.gain.gain.setValueAtTime(Math.max(0, options.gain ?? policy.gain), now);
    const duration = this.synthesize(id, voice.gain, now);
    this.scheduleRelease(voice.release, duration);
  }

  public stopAll(): void {
    for (const source of this.activeSources) {
      try {
        source.stop();
      } catch {
        // The source may already have ended.
      }
    }
    this.activeSources.clear();
    this.activeVoices.clear();
    this.cooldowns.clear();
    this.stopMusic();
  }

  private applyMusicGain(fadeSeconds = 0.06): void {
    const context = this.context;
    const gain = this.musicGain;
    if (!context || !gain) return;

    const target = this.muted ? 0 : this.musicVolume * (this.musicDucked ? 0.2 : 1);
    const now = context.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setTargetAtTime(target, now, Math.max(0.01, fadeSeconds));
  }

  private startMusicIfReady(): void {
    const context = this.context;
    const musicGain = this.musicGain;
    if (!context || !musicGain || context.state !== 'running' || !this.musicRequested || this.musicSource) return;
    const entry = manifest.sounds?.[this.requestedMusicId];
    if (!entry || entry.licenseStatus !== 'approved' || entry.src.indexOf('procedural://') !== 0) return;

    const buffer = this.getMusicBuffer(context);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(musicGain);
    source.onended = () => {
      if (this.musicSource === source) this.musicSource = null;
    };
    try {
      source.start();
      this.musicSource = source;
      this.applyMusicGain(0.2);
    } catch {
      source.disconnect();
    }
  }

  private stopMusicSource(): void {
    const source = this.musicSource;
    this.musicSource = null;
    if (!source) return;
    try {
      source.stop();
    } catch {
      // The source may already have ended.
    }
    source.disconnect();
  }

  private beginVoice(id: SoundEffectId, maxVoices: number): Voice | null {
    const context = this.context;
    const bus = this.sfxGain;
    if (!context || !bus) return null;

    const active = this.activeVoices.get(id) ?? 0;
    if (active >= maxVoices) return null;

    const gain = context.createGain();
    gain.connect(bus);
    this.activeVoices.set(id, active + 1);

    let released = false;
    const release = (): void => {
      if (released) return;
      released = true;
      const next = (this.activeVoices.get(id) ?? 1) - 1;
      if (next > 0) this.activeVoices.set(id, next);
      else this.activeVoices.delete(id);
      try {
        gain.disconnect();
      } catch {
        // The gain may already be disconnected.
      }
    };

    return { gain, release };
  }

  private scheduleRelease(release: () => void, duration: number): void {
    globalThis.setTimeout(release, Math.ceil((duration + 0.08) * 1000));
  }

  private synthesize(id: SoundEffectId, target: GainNode, now: number): number {
    switch (id) {
      case 'sfx.weapon.direct-fire':
        this.addTone(target, now, 'sawtooth', 720, 1250, 0.09, 0.8);
        return 0.11;
      case 'sfx.weapon.arc-fire':
        this.addTone(target, now, 'square', 170, 95, 0.16, 0.55);
        this.addTone(target, now, 'triangle', 620, 340, 0.13, 0.35);
        return 0.18;
      case 'sfx.weapon.impact':
        this.addNoise(target, now, 0.07, 0.85, 1800);
        this.addTone(target, now, 'sine', 210, 75, 0.08, 0.55);
        return 0.1;
      case 'sfx.weapon.explosion':
        this.addNoise(target, now, 0.32, 0.9, 900);
        this.addTone(target, now, 'triangle', 95, 35, 0.34, 0.75);
        return 0.38;
      case 'sfx.enemy.death':
        this.addTone(target, now, 'triangle', 280, 85, 0.18, 0.7);
        return 0.21;
      case 'sfx.ui.upgrade-confirm':
        this.addTone(target, now, 'triangle', 440, 660, 0.11, 0.7);
        this.addTone(target, now, 'triangle', 660, 990, 0.14, 0.7, 0.105);
        return 0.29;
    }
  }

  private addTone(
    target: GainNode,
    now: number,
    type: OscillatorType,
    startFrequency: number,
    endFrequency: number,
    duration: number,
    peak: number,
    delay = 0
  ): void {
    const context = this.context;
    if (!context) return;

    const start = now + delay;
    const end = start + duration;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(Math.max(1, startFrequency), start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), end);
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), start + 0.006);
    envelope.gain.exponentialRampToValueAtTime(0.0001, end);
    oscillator.connect(envelope);
    envelope.connect(target);
    this.trackSource(oscillator);
    oscillator.start(start);
    oscillator.stop(end + 0.02);
  }

  private addNoise(
    target: GainNode,
    now: number,
    duration: number,
    peak: number,
    cutoffFrequency: number
  ): void {
    const context = this.context;
    if (!context) return;

    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const envelope = context.createGain();
    source.buffer = this.getNoiseBuffer(context);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoffFrequency, now);
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), now + 0.008);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(target);
    this.trackSource(source);
    source.start(now);
    source.stop(now + duration);
  }

  private getMusicBuffer(context: AudioContext): AudioBuffer {
    if (this.musicBuffer && this.musicBuffer.sampleRate === context.sampleRate) {
      return this.musicBuffer;
    }

    const duration = 8;
    const length = Math.floor(context.sampleRate * duration);
    const buffer = context.createBuffer(2, length, context.sampleRate);
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);
    const roots = [65.406, 73.416, 77.782, 58.27];
    const melody = [
      261.626, 311.127, 349.228, 392,
      349.228, 311.127, 261.626, 233.082,
      261.626, 293.665, 311.127, 349.228,
      392, 349.228, 293.665, 233.082,
    ];
    const twoPi = Math.PI * 2;

    for (let index = 0; index < length; index++) {
      const time = index / context.sampleRate;
      const bar = Math.floor((time / 2) % roots.length);
      const root = roots[bar];
      const noteIndex = Math.min(melody.length - 1, Math.floor((time % duration) / 0.5));
      const noteTime = (time % 0.5) / 0.5;
      const noteEnvelope = Math.pow(Math.max(0, 1 - noteTime), 1.8);
      const beatEnvelope = Math.max(0, 1 - ((time % 0.5) / 0.5));
      const pad = Math.sin(twoPi * root * time)
        + 0.45 * Math.sin(twoPi * root * Math.pow(2, 3 / 12) * time)
        + 0.35 * Math.sin(twoPi * root * Math.pow(2, 7 / 12) * time);
      const bass = Math.sin(twoPi * root * 0.5 * time) * (0.04 + beatEnvelope * 0.07);
      const lead = Math.sin(twoPi * melody[noteIndex] * time) * noteEnvelope * 0.06;
      const edgeFade = Math.min(1, Math.min(time, duration - time) * 12);
      const signal = (pad * 0.045 + bass + lead) * edgeFade;
      const pan = Math.sin(twoPi * time / 4) * 0.025;
      left[index] = signal * (0.97 - pan);
      right[index] = signal * (0.97 + pan);
    }

    this.musicBuffer = buffer;
    return buffer;
  }

  private getNoiseBuffer(context: AudioContext): AudioBuffer {
    if (this.noiseBuffer && this.noiseBuffer.sampleRate === context.sampleRate) {
      return this.noiseBuffer;
    }

    const length = Math.floor(context.sampleRate);
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < length; index++) {
      channel[index] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buffer;
    return buffer;
  }

  private trackSource(source: AudioScheduledSourceNode): void {
    this.activeSources.add(source);
    source.addEventListener('ended', () => this.activeSources.delete(source), { once: true });
  }
}
