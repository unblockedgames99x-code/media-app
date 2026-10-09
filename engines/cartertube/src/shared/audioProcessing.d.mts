export type AudioProcessingSettings = {
  enabled: boolean;
  bass: number;
  mid: number;
  treble: number;
  balance: number;
  mono: boolean;
};
export function updateAudioProcessing(media: HTMLMediaElement, settings: AudioProcessingSettings): boolean;
export function releaseAudioProcessing(media: HTMLMediaElement): void;
