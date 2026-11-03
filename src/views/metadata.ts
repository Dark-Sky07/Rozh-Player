/** Local library metadata scraper using public, keyless TVmaze and Apple Search APIs. */

import { icon, hydrateIcons } from '../core/icons';
import { t } from '../core/i18n';
import { store, type MediaItem, type ScrapedMetadata } from '../core/store';
import { openModal, toast } from '../core/ui';
import { escapeHtml, platform } from '../core/util';

interface Candidate {
  metadata: ScrapedMetadata;
  detail: string;
}

interface TvMazeResult {
  score?: number;
  show?: {
    id?: number;
    name?: string;
    premiered?: string | null;
    summary?: string | null;
    genres?: string[];
    image?: { medium?: string | null; original?: string | null } | null;
    rating?: { average?: number | null };
    url?: string;
  };
}

interface AppleResult {
  trackId?: number;
  trackName?: string;
  releaseDate?: string;
  longDescription?: string;
  primaryGenreName?: string;
  artworkUrl100?: string;
  trackViewUrl?: string;
}

function stripHtml(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const text = new DOMParser().parseFromString(raw, 'text/html').body.textContent?.replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, 1600) : undefined;
}

function yearOf(date?: string | null): number | undefined {
  const match = date?.match(/^(\d{4})/);
  return match ? Number(match[1]) : undefined;
}

async function getJson<T>(url: string): Promise<T> {
  const response = platform.tauri
    ? await (await import('@tauri-apps/plugin-http')).fetch(url)
    : await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const contentLength = Number(response.headers.get('content-length') ?? 0);
  if (contentLength > 2 * 1024 * 1024) throw new Error('Metadata response too large');
  const text = await response.text();
  if (text.length > 2 * 1024 * 1024) throw new Error('Metadata response too large');
  return JSON.parse(text) as T;
}

async function searchTvMaze(query: string): Promise<Candidate[]> {
  const results = await getJson<TvMazeResult[]>(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(query)}`);
  return results.slice(0, 8).flatMap(({ show }) => {
    if (!show?.name) return [];
    const year = yearOf(show.premiered);
    return [{
      metadata: {
        provider: 'TVmaze',
        title: show.name.slice(0, 240),
        ...(year ? { year } : {}),
        ...(stripHtml(show.summary) ? { summary: stripHtml(show.summary) } : {}),
        ...(show.genres?.length ? { genres: show.genres.slice(0, 8).map((genre) => genre.slice(0, 80)) } : {}),
        ...(show.image?.original || show.image?.medium ? { posterUrl: show.image.original || show.image.medium! } : {}),
        ...(typeof show.rating?.average === 'number' ? { rating: show.rating.average } : {}),
        ...(show.url ? { externalUrl: show.url } : {}),
        scrapedAt: Date.now(),
      },
      detail: [year, show.genres?.slice(0, 3).join(' · '), typeof show.rating?.average === 'number' ? `★ ${show.rating.average}` : ''].filter(Boolean).join(' · '),
    }];
  });
}

async function searchApple(query: string): Promise<Candidate[]> {
  const results = await getJson<{ results?: AppleResult[] }>(
    `https://itunes.apple.com/search?media=movie&entity=movie&limit=8&term=${encodeURIComponent(query)}`,
  );
  return (results.results ?? []).flatMap((movie) => {
    if (!movie.trackName) return [];
    const year = yearOf(movie.releaseDate);
    const posterUrl = movie.artworkUrl100?.replace(/\d+x\d+bb/, '600x600bb');
    return [{
      metadata: {
        provider: 'Apple iTunes',
        title: movie.trackName.slice(0, 240),
        ...(year ? { year } : {}),
        ...(movie.longDescription ? { summary: movie.longDescription.slice(0, 1600) } : {}),
        ...(movie.primaryGenreName ? { genres: [movie.primaryGenreName.slice(0, 80)] } : {}),
        ...(posterUrl ? { posterUrl } : {}),
        ...(movie.trackViewUrl ? { externalUrl: movie.trackViewUrl } : {}),
        scrapedAt: Date.now(),
      },
      detail: [year, movie.primaryGenreName].filter(Boolean).join(' · '),
    }];
  });
}

function candidateCard(candidate: Candidate, index: number): string {
  const { metadata } = candidate;
  return `<article class="metadata-result">
    ${metadata.posterUrl ? `<img src="${escapeHtml(metadata.posterUrl)}" alt="" loading="lazy" />` : `<span class="metadata-result-poster">${icon('film')}</span>`}
    <div class="metadata-result-copy"><b>${escapeHtml(metadata.title)}${metadata.year ? ` (${metadata.year})` : ''}</b>
      <small>${escapeHtml(metadata.provider)}${candidate.detail ? ` · ${escapeHtml(candidate.detail)}` : ''}</small>
      ${metadata.summary ? `<p>${escapeHtml(metadata.summary)}</p>` : ''}</div>
    <button class="btn btn-primary" data-metadata-apply="${index}">${escapeHtml(t('metadata.apply'))}</button>
  </article>`;
}

export function openMetadataScraper(item: MediaItem, host?: HTMLElement, rerender?: () => void): void {
  let results: Candidate[] = [];
  openModal({
    title: t('metadata.title'),
    icon: 'search',
    width: 850,
    body: `<p class="modal-hint">${escapeHtml(t('metadata.notice'))}</p>
      <label class="form-label">${escapeHtml(t('metadata.query'))}</label>
      <input class="input" data-metadata-query maxlength="160" value="${escapeHtml(item.metadata?.title ?? item.title)}" />
      <div class="metadata-search-actions"><button class="btn" data-search-tv>${icon('tv')}<span>${escapeHtml(t('metadata.searchTv'))}</span></button>
        <button class="btn btn-primary" data-search-movie>${icon('film')}<span>${escapeHtml(t('metadata.searchMovies'))}</span></button></div>
      <div class="metadata-results" data-metadata-results></div>`,
    footer: `<button class="btn" data-close>${escapeHtml(t('common.close'))}</button>`,
    onMount: (root, close) => {
      const queryInput = root.querySelector<HTMLInputElement>('[data-metadata-query]');
      const resultsHost = root.querySelector<HTMLElement>('[data-metadata-results]');
      const search = async (provider: 'tv' | 'movie'): Promise<void> => {
        const query = queryInput?.value.trim() ?? '';
        if (!query || !resultsHost) return;
        resultsHost.innerHTML = `<p class="muted">${escapeHtml(t('metadata.loading'))}</p>`;
        const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-search-tv], [data-search-movie]'));
        buttons.forEach((button) => (button.disabled = true));
        try {
          results = provider === 'tv' ? await searchTvMaze(query) : await searchApple(query);
          resultsHost.innerHTML = results.length
            ? results.map(candidateCard).join('')
            : `<p class="muted">${escapeHtml(t('metadata.noResults'))}</p>`;
          hydrateIcons(resultsHost);
          resultsHost.querySelectorAll<HTMLButtonElement>('[data-metadata-apply]').forEach((button) => {
            button.addEventListener('click', () => {
              const candidate = results[Number(button.dataset.metadataApply)];
              if (!candidate) return;
              store.updateMedia(item.id, { metadata: candidate.metadata });
              toast(t('metadata.saved'), 'ok');
              close();
              if (host) rerender?.();
            });
          });
        } catch {
          resultsHost.innerHTML = `<p class="metadata-error">${escapeHtml(t('metadata.error'))}</p>`;
        } finally {
          buttons.forEach((button) => (button.disabled = false));
        }
      };
      root.querySelector('[data-search-tv]')?.addEventListener('click', () => void search('tv'));
      root.querySelector('[data-search-movie]')?.addEventListener('click', () => void search('movie'));
      queryInput?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          void search('movie');
        }
      });
      requestAnimationFrame(() => queryInput?.focus());
    },
  });
}
