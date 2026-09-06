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
  private noiseBuffer: AudioBuffer | null = null;
  private readonly activeSources = new Set<AudioScheduledSourceNode>();
  private readonly activeVoices = new Map<SoundEffectId, number>();
  private readonly cooldowns = new Map<string, number>();
  private readonly validationErrors: string[] = [];
  private masterVolume = 1;
  private sfxVolume = 0.8;
  private muted = false;
  private gestureTarget: Window | null = null;

  private readonly unlockAudio = (): void => {
    void this.ensureReady();
  };

  public constructor() {
    if (!Number.isInteger(manifest.version)) {
      this.validationErrors.push('Audio manifest version is invalid.');
    }

    for (const id of SOUND_EFFECT_IDS) {
      const entry = manifest.sounds?.[id];
      if (!entry) {
        this.validationErrors.push('Missing audio manifest entry: ' + id);
        continue;
      }
      if (entry.kind !== 'sfx' || entry.bus !== 'sfx') {
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
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.sfxGain) this.sfxGain.gain.value = muted ? 0 : this.sfxVolume;
  }

  public setMasterVolume(volume: number): void {
    this.masterVolume = Math.max(0, Math.min(1, volume));
    if (this.masterGain) this.masterGain.gain.value = this.muted ? 0 : this.masterVolume;
  }

  public setSfxVolume(volume: number): void {
    this.sfxVolume = Math.max(0, Math.min(1, volume));
    if (this.sfxGain) this.sfxGain.gain.value = this.muted ? 0 : this.sfxVolume;
  }

  public ensureReady(): AudioContext | null {
    if (this.context) {
      if (this.context.state === 'suspended') {
        void this.context.resume().catch(() => undefined);
      }
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
      masterGain.gain.value = this.masterVolume;
      sfxGain.gain.value = this.muted ? 0 : this.sfxVolume;
      sfxGain.connect(masterGain);
      masterGain.connect(context.destination);
      this.context = context;
      this.masterGain = masterGain;
      this.sfxGain = sfxGain;
      void context.resume().catch(() => undefined);
      return context;
    } catch {
      return null;
    }
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
