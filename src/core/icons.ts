/**
 * ROZH Player — icon set.
 * A curated subset of Lucide (ISC) redrawn as inline SVG so the app has zero
 * icon-font weight and every glyph inherits currentColor.
 */

const P: Record<string, string> = {
  play: '<polygon points="6 3.5 20 12 6 20.5" fill="currentColor" stroke="none"/>',
  pause:
    '<rect x="6.2" y="4" width="4" height="16" rx="1.3" fill="currentColor" stroke="none"/><rect x="13.8" y="4" width="4" height="16" rx="1.3" fill="currentColor" stroke="none"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="1.6" fill="currentColor" stroke="none"/>',
  'skip-back':
    '<polygon points="19 19.5 9 12 19 4.5" fill="currentColor" stroke="none"/><rect x="4.4" y="4.5" width="2.6" height="15" rx="1.2" fill="currentColor" stroke="none"/>',
  'skip-forward':
    '<polygon points="5 4.5 15 12 5 19.5" fill="currentColor" stroke="none"/><rect x="17" y="4.5" width="2.6" height="15" rx="1.2" fill="currentColor" stroke="none"/>',
  'step-back':
    '<polygon points="18 19 8 12 18 5" fill="currentColor" stroke="none"/><line x1="4" y1="5" x2="4" y2="19"/>',
  'step-forward':
    '<polygon points="6 5 16 12 6 19" fill="currentColor" stroke="none"/><line x1="20" y1="5" x2="20" y2="19"/>',
  'volume-2':
    '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" stroke="none"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.8 5.2a9.4 9.4 0 0 1 0 13.6"/>',
  'volume-1':
    '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" stroke="none"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/>',
  'volume-x':
    '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" stroke="none"/><line x1="22" y1="9" x2="16" y2="15"/><line x1="16" y1="9" x2="22" y2="15"/>',
  'volume-mute':
    '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" stroke="none"/><line x1="22" y1="9" x2="16" y2="15"/><line x1="16" y1="9" x2="22" y2="15"/>',
  maximize:
    '<path d="M8 3H5.5A2.5 2.5 0 0 0 3 5.5V8"/><path d="M21 8V5.5A2.5 2.5 0 0 0 18.5 3H16"/><path d="M3 16v2.5A2.5 2.5 0 0 0 5.5 21H8"/><path d="M16 21h2.5a2.5 2.5 0 0 0 2.5-2.5V16"/>',
  minimize:
    '<path d="M8 3v2.5A2.5 2.5 0 0 1 5.5 8H3"/><path d="M21 8h-2.5A2.5 2.5 0 0 1 16 5.5V3"/><path d="M3 16h2.5A2.5 2.5 0 0 1 8 18.5V21"/><path d="M16 21v-2.5a2.5 2.5 0 0 1 2.5-2.5H21"/>',
  'fullscreen-exit':
    '<path d="M8 3v2.5A2.5 2.5 0 0 1 5.5 8H3"/><path d="M21 8h-2.5A2.5 2.5 0 0 1 16 5.5V3"/><path d="M3 16h2.5A2.5 2.5 0 0 1 8 18.5V21"/><path d="M16 21v-2.5a2.5 2.5 0 0 1 2.5-2.5H21"/>',
  gear:
    '<circle cx="12" cy="12" r="3.1"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  sliders:
    '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
  folder:
    '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z"/>',
  'folder-open':
    '<path d="M6 14l1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/>',
  film: '<rect x="2.5" y="3" width="19" height="18" rx="2.5"/><line x1="7" y1="3" x2="7" y2="21"/><line x1="17" y1="3" x2="17" y2="21"/><line x1="2.5" y1="12" x2="21.5" y2="12"/><line x1="2.5" y1="7.5" x2="7" y2="7.5"/><line x1="2.5" y1="16.5" x2="7" y2="16.5"/><line x1="17" y1="7.5" x2="21.5" y2="7.5"/><line x1="17" y1="16.5" x2="21.5" y2="16.5"/>',
  music: '<path d="M9 18V5l12-2v13"/><circle cx="6.2" cy="18" r="3.2"/><circle cx="18.2" cy="16" r="3.2"/>',
  radio: '<circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none"/><path d="M7.8 16.2a6 6 0 0 1 0-8.4"/><path d="M16.2 7.8a6 6 0 0 1 0 8.4"/><path d="M4.6 19.4a10.5 10.5 0 0 1 0-14.8"/><path d="M19.4 4.6a10.5 10.5 0 0 1 0 14.8"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7.5V12l3.2 2"/>',
  keyboard:
    '<rect x="2" y="5.5" width="20" height="13" rx="2.4"/><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 12.5h.01M18 12.5h.01M9 16h6"/>',
  info: '<circle cx="12" cy="12" r="9.2"/><path d="M12 16.5v-5"/><path d="M12 7.6h.01"/>',
  search: '<circle cx="11" cy="11" r="7.4"/><line x1="16.5" y1="16.5" x2="21" y2="21"/>',
  x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  'chevron-right': '<polyline points="9 5 16 12 9 19"/>',
  'chevron-left': '<polyline points="15 5 8 12 15 19"/>',
  'chevron-down': '<polyline points="5 9 12 16 19 9"/>',
  'chevron-up': '<polyline points="5 15 12 8 19 15"/>',
  'arrow-right': '<line x1="4" y1="12" x2="19" y2="12"/><polyline points="13 6 19 12 13 18"/>',
  'arrow-left': '<line x1="20" y1="12" x2="5" y2="12"/><polyline points="11 6 5 12 11 18"/>',
  upload: '<path d="M21 15v3.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 18.5V15"/><polyline points="7 9 12 4 17 9"/><line x1="12" y1="4" x2="12" y2="16"/>',
  download:
    '<path d="M21 15v3.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 18.5V15"/><polyline points="7 11 12 16 17 11"/><line x1="12" y1="16" x2="12" y2="4"/>',
  link: '<path d="M10.5 13.5a4.5 4.5 0 0 0 6.4 0l2.6-2.6a4.5 4.5 0 0 0-6.4-6.4l-1.4 1.4"/><path d="M13.5 10.5a4.5 4.5 0 0 0-6.4 0l-2.6 2.6a4.5 4.5 0 0 0 6.4 6.4l1.4-1.4"/>',
  list: '<line x1="8.5" y1="6" x2="21" y2="6"/><line x1="8.5" y1="12" x2="21" y2="12"/><line x1="8.5" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1.2" fill="currentColor" stroke="none"/><circle cx="4" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="4" cy="18" r="1.2" fill="currentColor" stroke="none"/>',
  repeat: '<polyline points="17 2 21 6 17 10"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 22 3 18 7 14"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
  'repeat-1':
    '<polyline points="17 2 21 6 17 10"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 22 3 18 7 14"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/><path d="M11 15.5V11l-1.6 1"/>',
  shuffle:
    '<polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/>',
  subtitles:
    '<rect x="2.5" y="4.5" width="19" height="15" rx="2.4"/><path d="M6.5 13h4M13.5 13h4M6.5 16.5h7"/>',
  'audio-wave': '<path d="M3 12h2"/><path d="M7.5 7v10"/><path d="M12 4v16"/><path d="M16.5 7.5v9"/><path d="M21 10.5v3"/>',
  gauge:
    '<path d="M12 15.5l4.2-4.7"/><circle cx="12" cy="15.6" r="1.6" fill="currentColor" stroke="none"/><path d="M4.2 17.5A8.6 8.6 0 0 1 12 4.4a8.6 8.6 0 0 1 7.8 13.1"/>',
  pip: '<rect x="2.5" y="4.5" width="19" height="15" rx="2.4"/><rect x="12" y="11.5" width="7.5" height="6" rx="1.2" fill="currentColor" stroke="none"/>',
  camera:
    '<path d="M20 6.5h-2.2l-1.3-2.1a1.6 1.6 0 0 0-1.36-.74H8.86A1.6 1.6 0 0 0 7.5 4.4L6.2 6.5H4A1.9 1.9 0 0 0 2 8.4v9.3a1.9 1.9 0 0 0 2 1.9h16a1.9 1.9 0 0 0 2-1.9V8.4a1.9 1.9 0 0 0-2-1.9z"/><circle cx="12" cy="13" r="3.6"/>',
  scissors:
    '<circle cx="6" cy="6" r="2.6"/><circle cx="6" cy="18" r="2.6"/><line x1="20" y1="4" x2="8.2" y2="15.8"/><line x1="14.8" y1="14.8" x2="20" y2="20"/><line x1="8.2" y1="8.2" x2="12" y2="12"/>',
  monitor: '<rect x="2.5" y="3.5" width="19" height="13" rx="2.2"/><line x1="8" y1="20.5" x2="16" y2="20.5"/><line x1="12" y1="16.5" x2="12" y2="20.5"/>',
  smartphone: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.6"/><line x1="10.5" y1="18.5" x2="13.5" y2="18.5"/>',
  apple:
    '<path d="M16.2 3.2c.15 1.5-.5 2.9-1.5 3.95-1 1.05-2.5 1.8-3.9 1.7-.18-1.42.55-2.9 1.52-3.9.98-1.02 2.6-1.72 3.88-1.75z"/><path d="M19.2 16.6c-.55 1.25-.82 1.8-1.53 2.9-1 1.55-2.4 3.5-4.15 3.5-1.55.02-1.95-1-4.05-.98-2.1.02-2.54 1-4.1.98-1.75 0-3.08-1.78-4.08-3.33-2.8-4.34-3.1-9.42-1.37-12.12 1.23-1.92 3.17-3.05 5-3.05 1.85 0 3 1.02 4.53 1.02 1.48 0 2.38-1.02 4.5-1.02 1.63 0 3.36.9 4.6 2.44-4.04 2.22-3.38 8 .65 9.66z"/>',
  linux:
    '<path d="M9 6.5c0-2 1.35-3.6 3-3.6s3 1.6 3 3.6c0 1.5.3 2.4 1.2 3.6 1.1 1.4 1.8 2.6 1.8 4.4a6 6 0 0 1-12 0c0-1.8.7-3 1.8-4.4.9-1.2 1.2-2.1 1.2-3.6z"/><circle cx="10.3" cy="7" r="' +
    '0.9" fill="currentColor" stroke="none"/><circle cx="13.7" cy="7" r="0.9" fill="currentColor" stroke="none"/><path d="M10.6 9.6 12 8.8l1.4.8"/>',
  tv: '<rect x="2.5" y="6.5" width="19" height="12.5" rx="2.2"/><path d="M8 3l4 3.5L16 3"/>',
  windows:
    '<rect x="3" y="3.5" width="8" height="8" rx="0.8"/><rect x="13" y="3.5" width="8" height="8" rx="0.8"/><rect x="3" y="13.5" width="8" height="8" rx="0.8"/><rect x="13" y="13.5" width="8" height="8" rx="0.8"/>',
  globe: '<circle cx="12" cy="12" r="9.2"/><line x1="2.8" y1="12" x2="21.2" y2="12"/><path d="M12 2.8a15 15 0 0 1 0 18.4 15 15 0 0 1 0-18.4z"/>',
  zap: '<polygon points="13 2 4.5 13.5 11 13.5 10 22 19 10.5 12.5 10.5 13 2" fill="currentColor" stroke="none"/>',
  star: '<path d="M12 2.8l2.9 5.9 6.5.95-4.7 4.6 1.1 6.5-5.8-3-5.8 3 1.1-6.5-4.7-4.6 6.5-.95z"/>',
  check: '<polyline points="4 12.5 9.5 18 20 6.5"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  trash:
    '<polyline points="3.5 6.5 20.5 6.5"/><path d="M8.5 6.5V4.6A1.6 1.6 0 0 1 10.1 3h3.8a1.6 1.6 0 0 1 1.6 1.6v1.9"/><path d="M6 6.5l.9 12.4A2 2 0 0 0 8.9 21h6.2a2 2 0 0 0 2-1.9L18 6.5"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>',
  clock: '<circle cx="12" cy="12" r="9.2"/><polyline points="12 6.8 12 12 15.5 14"/>',
  sun: '<circle cx="12" cy="12" r="4.2"/><line x1="12" y1="1.8" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22.2"/><line x1="4.2" y1="4.2" x2="5.8" y2="5.8"/><line x1="18.2" y1="18.2" x2="19.8" y2="19.8"/><line x1="1.8" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22.2" y2="12"/><line x1="4.2" y1="19.8" x2="5.8" y2="18.2"/><line x1="18.2" y1="5.8" x2="19.8" y2="4.2"/>',
  palette:
    '<path d="M12 2.8a9.2 9.2 0 1 0 0 18.4c1.1 0 1.9-.85 1.9-1.9 0-.5-.2-.95-.5-1.3-.3-.35-.5-.8-.5-1.3 0-1.05.85-1.9 1.9-1.9h1.6a4.8 4.8 0 0 0 4.8-4.8c0-4-4.2-7.2-9.2-7.2z"/><circle cx="7.3" cy="12" r="1.25" fill="currentColor" stroke="none"/><circle cx="9.6" cy="7.9" r="1.25" fill="currentColor" stroke="none"/><circle cx="14.6" cy="7.6" r="1.25" fill="currentColor" stroke="none"/>',
  layers: '<polygon points="12 2.6 22.4 8.4 12 14.2 1.6 8.4"/><polyline points="1.6 13 12 18.8 22.4 13"/><polyline points="1.6 17.4 12 23.2 22.4 17.4" transform="translate(0 -1.4)"/>',
  wifi: '<path d="M2 8.6a15.5 15.5 0 0 1 20 0"/><path d="M5.2 12.3a10.8 10.8 0 0 1 13.6 0"/><path d="M8.4 16a6 6 0 0 1 7.2 0"/><circle cx="12" cy="19.6" r="1.3" fill="currentColor" stroke="none"/>',
  cast: '<path d="M2.5 16.5a5 5 0 0 1 5 5"/><path d="M2.5 11a10.5 10.5 0 0 1 10.5 10.5"/><line x1="2.5" y1="21.5" x2="2.6" y2="21.5"/><path d="M8.5 4.5h11a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-4"/><path d="M2.5 8.5v-2a2 2 0 0 1 2-2"/>',
  rotate: '<polyline points="2.5 4 2.5 9.5 8 9.5"/><path d="M4.6 15.6a8 8 0 1 0 1.9-9.1L2.5 9.5"/>',
  lock: '<rect x="4.5" y="10.5" width="15" height="10.5" rx="2.2"/><path d="M8 10.5V7.2a4 4 0 0 1 8 0v3.3"/>',
  eye: '<path d="M2.2 12S5.6 5.5 12 5.5 21.8 12 21.8 12 18.4 18.5 12 18.5 2.2 12 2.2 12z"/><circle cx="12" cy="12" r="3.1"/>',
  sparkles:
    '<path d="M11.5 3l1.6 4.3 4.3 1.6-4.3 1.6-1.6 4.3-1.6-4.3L5.6 8.9l4.3-1.6z" fill="currentColor" stroke="none"/><path d="M17.8 14.2l.85 2.2 2.2.85-2.2.85-.85 2.2-.85-2.2-2.2-.85 2.2-.85z" fill="currentColor" stroke="none"/><path d="M5.4 15.4l.62 1.6 1.6.62-1.6.62-.62 1.6-.62-1.6-1.6-.62 1.6-.62z" fill="currentColor" stroke="none"/>',
  cpu:
    '<rect x="5" y="5" width="14" height="14" rx="2.2"/><rect x="9" y="9" width="6" height="6" rx="1"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/>',
  'hard-drive':
    '<line x1="2.5" y1="12" x2="21.5" y2="12"/><path d="M5.6 5h12.8a2 2 0 0 1 1.8 1.1L22 12v4.5a2.5 2.5 0 0 1-2.5 2.5h-15A2.5 2.5 0 0 1 2 16.5V12l1.8-5.9A2 2 0 0 1 5.6 5z"/><line x1="6" y1="16.2" x2="6.1" y2="16.2"/><line x1="10" y1="16.2" x2="10.1" y2="16.2"/>',
  droplet: '<path d="M12 2.8s6.2 6.6 6.2 11.1a6.2 6.2 0 1 1-12.4 0C5.8 9.4 12 2.8 12 2.8z"/>',
  rocket:
    '<path d="M5.5 14.5c-1.5 1.3-2 5.5-2 5.5s4.2-.5 5.5-2"/><path d="M14.8 3.5c2.6-.6 5-.4 5.7.3.7.7.9 3.1.3 5.7-.7 2.9-2.4 6.2-5.4 9.2l-4.3 1.2-1.2-4.3c3-3 6.3-4.7 9.2-5.4"/><circle cx="15.6" cy="8.4" r="1.7"/>',
  shield: '<path d="M12 22s8-3.4 8-9.6V5.7L12 2.6 4 5.7v6.7C4 18.6 12 22 12 22z"/>',
  type: '<polyline points="4.5 7 4.5 4.5 19.5 4.5 19.5 7"/><line x1="12" y1="4.5" x2="12" y2="19.5"/><line x1="8.5" y1="19.5" x2="15.5" y2="19.5"/>',
  languages: '<path d="M3 5h9"/><path d="M7.5 5v3"/><path d="M4.5 11.5c1.6 2.6 4 4.3 6.5 5"/><path d="M11.5 11.5c-.5 2.4-2.2 4.6-4.5 6"/><path d="M12.5 21l4-9 4 9"/><path d="M14 18h5"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.6"/><circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none"/>',
  bookmark: '<path d="M18.5 21l-6.5-4.6L5.5 21V5.6a2.6 2.6 0 0 1 2.6-2.6h7.8a2.6 2.6 0 0 1 2.6 2.6z"/>',
  grid: '<rect x="3" y="3" width="7.5" height="7.5" rx="1.6"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.6"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.6"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.6"/>',
  'list-video': '<rect x="2.5" y="5.5" width="13" height="10" rx="1.8"/><polygon points="7 8 11.5 10.5 7 13" fill="currentColor" stroke="none"/><line x1="18" y1="7" x2="21.5" y2="7"/><line x1="18" y1="11" x2="21.5" y2="11"/><line x1="18" y1="15" x2="21.5" y2="15"/><line x1="2.5" y1="19" x2="17.5" y2="19"/>',
  heart: '<path d="M20.4 5.6a5.2 5.2 0 0 0-7.4 0l-1 1-1-1a5.2 5.2 0 1 0-7.4 7.4l8.4 8.4 8.4-8.4a5.2 5.2 0 0 0 0-7.4z"/>',
  minus: '<line x1="5" y1="12" x2="19" y2="12"/>',
  'corner-up-right': '<polyline points="15 4 20 9 15 14"/><path d="M4 20v-6a4 4 0 0 1 4-4h12"/>',
  'external-link':
    '<path d="M18 13.5v5a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 2 18.5v-11A2.5 2.5 0 0 1 4.5 5h5"/><polyline points="14 2.5 21.5 2.5 21.5 10"/><line x1="10.5" y1="13.5" x2="21.5" y2="2.5"/>',
  rotateccw: '<polyline points="21.5 4 21.5 9.5 16 9.5"/><path d="M19.4 15.6a8 8 0 1 1-1.9-9.1L21.5 9.5"/>',
  disc: '<circle cx="12" cy="12" r="9.2"/><circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none"/>',
  broadcast:
    '<circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/><path d="M8.4 15.6a5 5 0 0 1 0-7.2"/><path d="M15.6 8.4a5 5 0 0 1 0 7.2"/><path d="M5.4 18.6a9.4 9.4 0 0 1 0-13.2"/><path d="M18.6 5.4a9.4 9.4 0 0 1 0 13.2"/>',
};

export type IconName = keyof typeof P | string;

export function icon(name: IconName, cls = ''): string {
  const body = P[name] ?? P['info'];
  const isSolid = /\bfill="currentColor"/.test(body) && !/stroke=/.test(body);
  return `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="${
    isSolid ? 1.7 : 1.8
  }" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}

/** Replace every <i data-icon="name"> in a root with the matching SVG. */
export function hydrateIcons(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-icon]').forEach((node) => {
    const name = node.dataset.icon!;
    const cls = node.dataset.iconClass ?? '';
    const svg = icon(name, cls);
    const tmp = document.createElement('div');
    tmp.innerHTML = svg;
    const child = tmp.firstElementChild as Element;
    // keep accessible label if present
    const label = node.getAttribute('aria-label');
    if (label && child) child.setAttribute('aria-label', label);
    node.replaceWith(child);
  });
}

export const iconNames = Object.keys(P);
