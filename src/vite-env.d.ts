/// <reference types="vite/client" />

declare const __APP_VERSION__: string;
declare const __BUILD_ID__: string;

interface AudioTrackListLike {
  readonly length: number;
  [index: number]: { enabled: boolean; label?: string; language?: string };
}

interface HTMLVideoElement {
  audioTracks?: AudioTrackListLike;
}

interface Document {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void>;
}
