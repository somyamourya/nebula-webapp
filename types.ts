
export interface LyricLine {
  time: number; // seconds
  text: string;
}

export interface Track {
  id: string;
  file: File;
  title: string;
  artist: string;
  album: string;
  url: string;
  duration: number;
  isLiked: boolean;
  lyrics?: LyricLine[];
}

export enum PlayState {
  STOPPED,
  PLAYING,
  PAUSED
}

export interface AIState {
  isLoading: boolean;
  error: string | null;
  generatedText: string | null;
  isPlayingVoice: boolean;
  isFetchingLyrics: boolean;
}

export type VisualizerMode = 'bars' | 'wave' | 'circle';

export interface GeminiResponse {
  text?: string;
  audioData?: string; // base64
}

export type Theme = 'midnight' | 'burgundy' | 'forest' | 'ocean';

export interface AppSettings {
  theme: Theme;
  crossfadeDuration: number; // in seconds
  showNavBar: boolean;
  playerThemeMode: 'solid' | 'adaptive';
  // New Adaptive Settings
  adaptiveBrightness: number; // 0-100
  adaptiveSaturation: number; // 0-100
  enableAmbientEffect: boolean;
}

export type LibraryTab = 'songs' | 'albums' | 'artists' | 'liked';
