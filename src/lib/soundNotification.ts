// src/lib/soundNotification.ts

/**
 * Utility functions for playing sound notifications
 */

// Audio sample types and their configurations
export type AudioSampleType = 'classic' | 'bell' | 'chime' | 'pop' | 'ding' | 'success' | 'gentle' | 'modern';

interface AudioSampleConfig {
  name: string;
  description: string;
  frequencies: number[];
  duration: number;
  type: OscillatorType;
  envelope: { attack: number; decay: number; sustain: number; release: number };
}

const AUDIO_SAMPLES: Record<AudioSampleType, AudioSampleConfig> = {
  classic: {
    name: 'Classic',
    description: 'Simple single tone',
    frequencies: [523.25], // C5
    duration: 0.3,
    type: 'sine',
    envelope: { attack: 0.1, decay: 0.1, sustain: 0.1, release: 0.1 }
  },
  bell: {
    name: 'Bell',
    description: 'Soft bell chime',
    frequencies: [523.25, 659.25, 783.99], // C5, E5, G5
    duration: 0.8,
    type: 'sine',
    envelope: { attack: 0.05, decay: 0.2, sustain: 0.3, release: 0.25 }
  },
  chime: {
    name: 'Chime',
    description: 'Ascending chime',
    frequencies: [261.63, 329.63, 392.00, 523.25], // C4, E4, G4, C5
    duration: 0.6,
    type: 'sine',
    envelope: { attack: 0.1, decay: 0.1, sustain: 0.2, release: 0.2 }
  },
  pop: {
    name: 'Pop',
    description: 'Quick pop sound',
    frequencies: [800],
    duration: 0.15,
    type: 'square',
    envelope: { attack: 0.02, decay: 0.05, sustain: 0.03, release: 0.05 }
  },
  ding: {
    name: 'Ding',
    description: 'Notification ding',
    frequencies: [1000],
    duration: 0.2,
    type: 'triangle',
    envelope: { attack: 0.05, decay: 0.05, sustain: 0.05, release: 0.05 }
  },
  success: {
    name: 'Success',
    description: 'Success fanfare',
    frequencies: [523.25, 659.25, 783.99, 1046.50], // C5, E5, G5, C6
    duration: 0.7,
    type: 'sine',
    envelope: { attack: 0.1, decay: 0.2, sustain: 0.2, release: 0.2 }
  },
  gentle: {
    name: 'Gentle',
    description: 'Soft gentle tone',
    frequencies: [440], // A4
    duration: 0.4,
    type: 'sine',
    envelope: { attack: 0.15, decay: 0.1, sustain: 0.1, release: 0.05 }
  },
  modern: {
    name: 'Modern',
    description: 'Contemporary beep',
    frequencies: [1200],
    duration: 0.25,
    type: 'sawtooth',
    envelope: { attack: 0.05, decay: 0.1, sustain: 0.05, release: 0.05 }
  }
};

// Create a notification sound using Web Audio API with configurable sample
function createNotificationSound(sampleType: AudioSampleType = 'classic'): AudioContext | null {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const config = AUDIO_SAMPLES[sampleType];
    
    // Create oscillators for each frequency
    const oscillators = config.frequencies.map(frequency => {
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
      oscillator.type = config.type;
      
      // Apply envelope
      const { attack, decay, sustain, release } = config.envelope;
      const now = audioContext.currentTime;
      
      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(0.3, now + attack);
      gainNode.gain.linearRampToValueAtTime(0.2, now + attack + decay);
      gainNode.gain.setValueAtTime(0.2, now + attack + decay + sustain);
      gainNode.gain.linearRampToValueAtTime(0, now + attack + decay + sustain + release);
      
      return { oscillator, gainNode };
    });
    
    // Start all oscillators with slight delays for chime effects
    oscillators.forEach(({ oscillator }, index) => {
      const delay = index * 0.05; // 50ms delay between notes
      oscillator.start(audioContext.currentTime + delay);
      oscillator.stop(audioContext.currentTime + config.duration + delay);
    });
    
    return audioContext;
  } catch (error) {
    console.warn('Could not create notification sound:', error);
    return null;
  }
}

// Alternative: Use a data URL for a simple beep sound
function createBeepSound(): HTMLAudioElement | null {
  try {
    // Create a simple beep sound using data URL
    const audio = new Audio();
    
    // Generate a simple beep sound using Web Audio API and convert to data URL
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const sampleRate = audioContext.sampleRate;
    const duration = 0.3; // 300ms
    const frequency = 800; // 800Hz
    const samples = Math.floor(sampleRate * duration);
    const buffer = audioContext.createBuffer(1, samples, sampleRate);
    const data = buffer.getChannelData(0);
    
    // Generate sine wave
    for (let i = 0; i < samples; i++) {
      const t = i / sampleRate;
      const envelope = Math.exp(-t * 8); // Exponential decay
      data[i] = Math.sin(2 * Math.PI * frequency * t) * envelope * 0.3;
    }
    
    // Convert to WAV and create data URL
    const wav = encodeWAV(data, sampleRate);
    const blob = new Blob([wav], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    
    audio.src = url;
    audio.volume = 0.5;
    
    return audio;
  } catch (error) {
    console.warn('Could not create beep sound:', error);
    return null;
  }
}

// Simple WAV encoder
function encodeWAV(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const length = samples.length;
  const buffer = new ArrayBuffer(44 + length * 2);
  const view = new DataView(buffer);
  
  // WAV header
  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };
  
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, length * 2, true);
  
  // Convert float samples to 16-bit PCM
  let offset = 44;
  for (let i = 0; i < length; i++) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, sample * 0x7FFF, true);
    offset += 2;
  }
  
  return buffer;
}

/**
 * Play a notification sound when a recipe card is generated
 * Uses Web Audio API for a pleasant notification sound
 */
export function playRecipeNotificationSound(sampleType?: AudioSampleType): void {
  // Check if user has disabled sound notifications
  const soundEnabled = localStorage.getItem('chef-stacks-sound-enabled');
  if (soundEnabled === 'false') {
    return;
  }
  
  // Get the selected audio sample type
  const selectedSample = sampleType || (localStorage.getItem('chef-stacks-audio-sample') as AudioSampleType) || 'bell';
  
  // Try to play the notification sound
  try {
    // First try the Web Audio API approach
    const audioContext = createNotificationSound(selectedSample);
    if (audioContext) {
      return;
    }
    
    // Fallback to beep sound
    const audio = createBeepSound();
    if (audio) {
      audio.play().catch(error => {
        console.warn('Could not play notification sound:', error);
        // Try simple notification as next fallback
        playSimpleNotification();
      });
    } else {
      playSimpleNotification();
    }
  } catch (error) {
    console.warn('Notification sound failed:', error);
    playSimpleNotification();
  }
}

/**
 * Fallback: Try to play a system beep using the Bell character
 */
function playSystemBeep(): void {
  try {
    // This is a very basic fallback that might work in some environments
    // Playing system beep fallback
    // Note: This won't work in most modern browsers, but it's worth trying
    process.stdout?.write('\u0007'); // Bell character
  } catch (error) {
    console.warn('System beep also failed:', error);
  }
}

/**
 * Alternative: Simple HTML5 audio notification using data URL
 */
function playSimpleNotification(): void {
  try {
    // Trying simple HTML5 audio notification
    
    // Create a simple notification sound using data URL
    const audio = new Audio();
    
    // Generate a simple beep sound using Web Audio API and convert to data URL
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const sampleRate = audioContext.sampleRate;
    const duration = 0.2; // 200ms
    const frequency = 800; // 800Hz
    const samples = Math.floor(sampleRate * duration);
    const buffer = audioContext.createBuffer(1, samples, sampleRate);
    const data = buffer.getChannelData(0);
    
    // Generate sine wave with envelope
    for (let i = 0; i < samples; i++) {
      const t = i / sampleRate;
      const envelope = Math.exp(-t * 10); // Exponential decay
      data[i] = Math.sin(2 * Math.PI * frequency * t) * envelope * 0.2;
    }
    
    // Convert to WAV and create data URL
    const wav = encodeWAV(data, sampleRate);
    const blob = new Blob([wav], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    
    audio.src = url;
    audio.volume = 0.3;
    
    audio.play().then(() => {
      // Clean up the object URL after playing
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }).catch(error => {
      console.warn('Simple notification sound failed:', error);
      URL.revokeObjectURL(url);
    });
  } catch (error) {
    console.warn('Simple notification creation failed:', error);
  }
}

/**
 * Initialize audio context with user interaction
 * This is required by modern browsers for autoplay policies
 */
let audioContextInitialized = false;
let globalAudioContext: AudioContext | null = null;

export function initializeAudioContext(): void {
  if (audioContextInitialized) return;
  
  try {
    globalAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    audioContextInitialized = true;
    // Audio context initialized
  } catch (error) {
    console.warn('Failed to initialize audio context:', error);
  }
}

/**
 * Set user preference for sound notifications
 */
export function setSoundNotificationPreference(enabled: boolean): void {
  localStorage.setItem('chef-stacks-sound-enabled', enabled.toString());
  
  // If enabling sound, try to initialize audio context
  if (enabled) {
    initializeAudioContext();
  }
}

/**
 * Get user preference for sound notifications (defaults to true)
 */
export function getSoundNotificationPreference(): boolean {
  const preference = localStorage.getItem('chef-stacks-sound-enabled');
  return preference !== 'false'; // Default to true if not set
}

/**
 * Get available audio samples
 */
export function getAvailableAudioSamples(): AudioSampleConfig[] {
  return Object.values(AUDIO_SAMPLES);
}

/**
 * Get current audio sample preference
 */
export function getAudioSamplePreference(): AudioSampleType {
  const preference = localStorage.getItem('chef-stacks-audio-sample') as AudioSampleType;
  return preference && AUDIO_SAMPLES[preference] ? preference : 'bell';
}

/**
 * Set audio sample preference
 */
export function setAudioSamplePreference(sampleType: AudioSampleType): void {
  if (AUDIO_SAMPLES[sampleType]) {
    localStorage.setItem('chef-stacks-audio-sample', sampleType);
  }
}

/**
 * Preview an audio sample
 */
export function previewAudioSample(sampleType: AudioSampleType): void {
  console.log(`🎵 Previewing audio sample: ${sampleType}`);
  playRecipeNotificationSound(sampleType);
}
