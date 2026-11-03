/** Safe, declarative add-on registry. Packs may describe sources, but never execute code. */

import { storage } from './util';

export interface SourcePackEntry {
  name: string;
  playlistUrl: string;
  epgUrl?: string;
}

export interface SourcePack {
  id: string;
  name: string;
  version: string;
  description?: string;
  sources: SourcePackEntry[];
  installedAt: number;
}

const STORAGE_KEY = 'sourcePacks.v1';
const MAX_PACK_BYTES = 64 * 1024;
const MAX_PACKS = 32;
const MAX_SOURCES = 16;

function httpsOrHttp(raw: unknown): string | undefined {
  if (typeof raw !== 'string' || raw.length > 4096) return undefined;
  try {
    const url = new URL(raw);
    if (!['https:', 'http:'].includes(url.protocol) || !url.hostname || url.username || url.password) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function nonEmpty(raw: unknown, max: number): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const value = raw.trim();
  return value && value.length <= max ? value : undefined;
}

export function listSourcePacks(): SourcePack[] {
  const value = storage.get<unknown>(STORAGE_KEY, []);
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
    const pack = raw as Record<string, unknown>;
    const id = nonEmpty(pack.id, 64)?.toLowerCase();
    const name = nonEmpty(pack.name, 100);
    const version = nonEmpty(pack.version, 32);
    if (!id || !/^[a-z0-9][a-z0-9.-]{0,63}$/.test(id) || !name || !version || !Array.isArray(pack.sources)) return [];
    const sources = pack.sources.flatMap((rawSource) => {
      if (!rawSource || typeof rawSource !== 'object' || Array.isArray(rawSource)) return [];
      const source = rawSource as Record<string, unknown>;
      const sourceName = nonEmpty(source.name, 100);
      const playlistUrl = httpsOrHttp(source.playlistUrl);
      const epgUrl = source.epgUrl === undefined ? undefined : httpsOrHttp(source.epgUrl);
      if (!sourceName || !playlistUrl || (source.epgUrl !== undefined && !epgUrl)) return [];
      return [{ name: sourceName, playlistUrl, ...(epgUrl ? { epgUrl } : {}) }];
    }).slice(0, MAX_SOURCES);
    if (!sources.length) return [];
    const description = nonEmpty(pack.description, 300);
    return [{ id, name, version, ...(description ? { description } : {}), sources, installedAt: Number(pack.installedAt) || 0 }];
  }).slice(0, MAX_PACKS);
}

export function parseSourcePack(raw: string): SourcePack {
  if (raw.length > MAX_PACK_BYTES) throw new Error('large');
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error('json');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('schema');
  const input = value as Record<string, unknown>;
  if (input.schema !== 'rozh.source-pack/v1') throw new Error('schema');
  const id = nonEmpty(input.id, 64)?.toLowerCase();
  const name = nonEmpty(input.name, 100);
  const version = nonEmpty(input.version, 32);
  const description = input.description === undefined ? undefined : nonEmpty(input.description, 300);
  if (!id || !/^[a-z0-9][a-z0-9.-]{0,63}$/.test(id) || !name || !version || (input.description !== undefined && !description)) {
    throw new Error('schema');
  }
  if (!Array.isArray(input.sources) || input.sources.length < 1 || input.sources.length > MAX_SOURCES) throw new Error('sources');
  const sources: SourcePackEntry[] = input.sources.map((source) => {
    if (!source || typeof source !== 'object' || Array.isArray(source)) throw new Error('sources');
    const entry = source as Record<string, unknown>;
    const sourceName = nonEmpty(entry.name, 100);
    const playlistUrl = httpsOrHttp(entry.playlistUrl);
    const epgUrl = entry.epgUrl === undefined ? undefined : httpsOrHttp(entry.epgUrl);
    if (!sourceName || !playlistUrl || (entry.epgUrl !== undefined && !epgUrl)) throw new Error('sources');
    return { name: sourceName, playlistUrl, ...(epgUrl ? { epgUrl } : {}) };
  });
  if (new Set(sources.map((source) => source.playlistUrl)).size !== sources.length) throw new Error('sources');
  return { id, name, version, ...(description ? { description } : {}), sources, installedAt: Date.now() };
}

export function installSourcePack(pack: SourcePack): void {
  const packs = listSourcePacks();
  const exists = packs.some((installed) => installed.id === pack.id);
  if (!exists && packs.length >= MAX_PACKS) throw new Error('limit');
  storage.set(STORAGE_KEY, [...packs.filter((installed) => installed.id !== pack.id), pack]);
}

export function removeSourcePack(id: string): void {
  storage.set(STORAGE_KEY, listSourcePacks().filter((pack) => pack.id !== id));
}

/**
 * Format for a pack.json file:
 * {"schema":"rozh.source-pack/v1","id":"example","name":"Example","version":"1.0.0",
 *  "sources":[{"name":"Channels","playlistUrl":"https://example.org/live.m3u","epgUrl":"https://example.org/guide.xml"}]}
 */
