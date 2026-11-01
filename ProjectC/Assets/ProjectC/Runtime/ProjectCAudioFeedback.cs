using System;
using ProjectC.Core;
using UnityEngine;

namespace ProjectC.Runtime
{
    /// <summary>Procedural BGM and event sounds; only the selected, actively producing facility hums.</summary>
    internal sealed class ProjectCAudioFeedback : MonoBehaviour
    {
        private const int SampleRate = 22050;
        private AudioSource musicSource;
        private AudioSource effectsSource;
        private AudioSource machineSource;
        private AudioClip musicClip;
        private AudioClip dockClip;
        private AudioClip departClip;
        private AudioClip machineClip;
        private GameWorld currentWorld;
        private int nextEventIndex;
        private string lastMachineFacilityId;
        private int lastMachineProgress;
        private float lastMachineProgressTime;

        public void Initialize(GameWorld world)
        {
            if (world == null) throw new ArgumentNullException(nameof(world));

            musicSource = CreateSource(true);
            effectsSource = CreateSource(false);
            machineSource = CreateSource(true);
            musicClip = CreateAmbientLoop();
            dockClip = CreateChime("Project C Dock", new[] { 659.25f, 880f });
            departClip = CreateChime("Project C Depart", new[] { 880f, 659.25f, 523.25f });
            machineClip = CreateMachineLoop();
            musicSource.clip = musicClip;
            machineSource.clip = machineClip;
            musicSource.Play();
            currentWorld = world;
            nextEventIndex = world.Events.Count;
        }

        public void UpdateFeedback(GameWorld world, FacilityState selected, ProductionSystem production,
            float masterVolume, float bgmVolume, float effectsVolume)
        {
            if (world == null || musicSource == null) return;
            if (world != currentWorld)
            {
                currentWorld = world;
                nextEventIndex = world.Events.Count;
            }

            AudioListener.volume = Mathf.Clamp01(masterVolume);
            musicSource.volume = Mathf.Clamp01(bgmVolume);
            effectsSource.volume = Mathf.Clamp01(effectsVolume);
            machineSource.volume = Mathf.Clamp01(effectsVolume) * 0.22f;

            while (nextEventIndex < world.Events.Count)
            {
                SimulationEvent item = world.Events[nextEventIndex++];
                if (item.Category != "ship") continue;
                if (item.Detail.Contains(":docked:")) effectsSource.PlayOneShot(dockClip);
                else if (item.Detail.Contains(":departed:")) effectsSource.PlayOneShot(departClip);
            }

            bool machineCanRun = selected != null && production != null &&
                !selected.IsUnderConstruction && !selected.IsDemolishing && !selected.IsDestroyed &&
                IsProductionFacility(selected.Kind) && production.GetProgress(selected.Id).ProgressMilliseconds > 0;
            if (machineCanRun)
            {
                int progress = production.GetProgress(selected.Id).ProgressMilliseconds;
                if (lastMachineFacilityId != selected.Id || lastMachineProgress != progress)
                {
                    lastMachineFacilityId = selected.Id;
                    lastMachineProgress = progress;
                    lastMachineProgressTime = Time.unscaledTime;
                }
            }
            else lastMachineFacilityId = null;

            // Progress must keep advancing; a paused simulation eventually silences the hum.
            bool machineRunning = machineCanRun && Time.unscaledTime - lastMachineProgressTime <= 0.2f;
            if (machineRunning && !machineSource.isPlaying) machineSource.Play();
            else if (!machineRunning && machineSource.isPlaying) machineSource.Stop();
        }

        private void OnDestroy()
        {
            if (musicClip != null) Destroy(musicClip);
            if (dockClip != null) Destroy(dockClip);
            if (departClip != null) Destroy(departClip);
            if (machineClip != null) Destroy(machineClip);
        }

        private AudioSource CreateSource(bool loop)
        {
            AudioSource source = gameObject.AddComponent<AudioSource>();
            source.playOnAwake = false;
            source.loop = loop;
            source.spatialBlend = 0f;
            return source;
        }

        private static bool IsProductionFacility(FacilityKind kind) => kind == FacilityKind.Ironworks ||
            kind == FacilityKind.AmmunitionFactory || kind == FacilityKind.Refinery;

        private static AudioClip CreateAmbientLoop()
        {
            const int seconds = 12;
            int sampleCount = SampleRate * seconds;
            var samples = new float[sampleCount];
            for (int i = 0; i < sampleCount; i++)
            {
                float time = (float)i / SampleRate;
                float swell = 0.72f + 0.28f * Mathf.Sin(2f * Mathf.PI * time / 6f);
                float chord = 0.36f * Mathf.Sin(2f * Mathf.PI * 55f * time) +
                              0.23f * Mathf.Sin(2f * Mathf.PI * 82.5f * time) +
                              0.17f * Mathf.Sin(2f * Mathf.PI * 110f * time) +
                              0.06f * Mathf.Sin(2f * Mathf.PI * 165f * time);
                samples[i] = chord * swell * 0.16f;
            }
            return CreateClip("Project C Ambient", samples);
        }

        private static AudioClip CreateMachineLoop()
        {
            const float seconds = 1.2f;
            int sampleCount = (int)(SampleRate * seconds);
            var samples = new float[sampleCount];
            for (int i = 0; i < sampleCount; i++)
            {
                float time = (float)i / SampleRate;
                float pulse = 0.78f + 0.22f * Mathf.Sin(2f * Mathf.PI * 5f * time);
                samples[i] = pulse * (0.65f * Mathf.Sin(2f * Mathf.PI * 60f * time) +
                    0.25f * Mathf.Sin(2f * Mathf.PI * 120f * time) +
                    0.1f * Mathf.Sin(2f * Mathf.PI * 240f * time)) * 0.08f;
            }
            return CreateClip("Project C Machine Hum", samples);
        }

        private static AudioClip CreateChime(string name, float[] notes)
        {
            const float noteDuration = 0.12f;
            int sampleCount = Mathf.CeilToInt(SampleRate * noteDuration * notes.Length);
            var samples = new float[sampleCount];
            for (int i = 0; i < sampleCount; i++)
            {
                float time = (float)i / SampleRate;
                float noteTime = time % noteDuration;
                float envelope = Mathf.Min(1f, noteTime * 100f) * Mathf.Clamp01((noteDuration - noteTime) * 12f);
                float frequency = notes[Mathf.Min(notes.Length - 1, (int)(time / noteDuration))];
                samples[i] = Mathf.Sin(2f * Mathf.PI * frequency * time) * envelope * 0.18f;
            }
            return CreateClip(name, samples);
        }

        private static AudioClip CreateClip(string name, float[] samples)
        {
            AudioClip clip = AudioClip.Create(name, samples.Length, 1, SampleRate, false);
            clip.SetData(samples, 0);
            return clip;
        }
    }
}
