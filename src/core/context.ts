/** Shared app context passed to each view. Keeps views free of circular imports. */

import type { Player, Playable } from './player';
import type { MediaItem } from './store';

export type ViewId = 'home' | 'player' | 'library' | 'streams' | 'history' | 'settings' | 'shortcuts' | 'about';
export type TvLibraryFilter = 'all' | 'video' | 'audio' | 'favorites' | 'playlists';

export interface AppContext {
  player: Player;
  navigate(view: ViewId, tvFilter?: TvLibraryFilter): void;
  refreshNav(): void;
  openLocalFiles(): Promise<void>;
  playMedia(item: MediaItem): Promise<void>;
  playMediaQueue(items: MediaItem[], startIndex?: number): Promise<void>;
  addFilesToLibrary(files: File[]): Promise<void>;
  playPlayable(item: Playable): Promise<void>;
  /** object URLs created this session, keyed by media id */
  session: Map<string, { url: string; name: string; size: number }>;
}
