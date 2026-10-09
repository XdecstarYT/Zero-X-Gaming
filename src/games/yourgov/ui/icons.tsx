/** YourGov's line icons (24 × 24, drawn with the current colour). */
const P: Record<string, string> = {
  career: "M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8-4.3-4.1 5.9-.9z",
  write: "M5 19.5l1-4 9.8-9.8a2 2 0 012.8 0l.7.7a2 2 0 010 2.8L9.5 19l-4.5.5zM14 7.5l2.5 2.5M4 22h16",
  bills: "M7 3h8l4 4v13a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1zM15 3v4h4M9 11h7M9 14.5h7M9 18h4",
  events: "M4 10v4a1 1 0 001 1h2l5 4V5L7 9H5a1 1 0 00-1 1zM16 8.5a5 5 0 010 7M18.5 6a8.5 8.5 0 010 12",
  parliament: "M3 21h18M5 21v-9M9.5 21v-9M14.5 21v-9M19 21v-9M3 10l9-6 9 6z",
  parties: "M12 3a9 9 0 109 9h-9zM14 3.2V10h6.8A9 9 0 0014 3.2z",
  party: "M5 21V4M5 4h11l-2 3.5L16 11H5",
  country: "M12 3a9 9 0 100 18 9 9 0 000-18zM3.5 9h17M3.5 15h17M12 3c2.5 2.6 3.7 5.6 3.7 9s-1.2 6.4-3.7 9c-2.5-2.6-3.7-5.6-3.7-9S9.5 5.6 12 3z",
  news: "M4 5h13v14a2 2 0 002 2H6a2 2 0 01-2-2zM17 9h3v10a2 2 0 01-2 2M7.5 8.5h6M7.5 12h6M7.5 15.5h4",
  settings: "M12 9a3 3 0 100 6 3 3 0 000-6zM19.4 13.5l1.6 1.2-2 3.4-1.9-.7a7.6 7.6 0 01-1.8 1l-.3 2h-4l-.3-2a7.6 7.6 0 01-1.8-1l-1.9.7-2-3.4 1.6-1.2a7.4 7.4 0 010-3L3 9.3l2-3.4 1.9.7a7.6 7.6 0 011.8-1l.3-2h4l.3 2a7.6 7.6 0 011.8 1l1.9-.7 2 3.4-1.6 1.2a7.4 7.4 0 010 3z",
  map: "M9 4L3 6.5v13.5L9 17.5l6 2.5 6-2.5V4l-6 2.5zM9 4v13.5M15 6.5V20",
  chamber: "M3 19h18M5 19a7 7 0 0114 0M8.5 19a3.5 3.5 0 017 0M12 5v3M12 5l3 1.2L12 7.4",
  hourglass: "M7 3h10M7 21h10M8 3c0 4.5 4 5.5 4 9s-4 4.5-4 9M16 3c0 4.5-4 5.5-4 9s4 4.5 4 9M9.5 18.5h5",
  close: "M6 6l12 12M18 6L6 18",
  plus: "M12 5v14M5 12h14",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  edit: "M4 20l1-4L15.5 5.5a2.1 2.1 0 013 3L8 19zM13.5 7.5l3 3",
  check: "M5 12.5l4.5 4.5L19 7.5",
  back: "M15 5l-7 7 7 7",
  chevron: "M9 6l6 6-6 6",
  sound: "M4 9.5v5h3.5L12 18.5v-13L7.5 9.5zM15.5 9a4 4 0 010 6M18 6.5a7.5 7.5 0 010 11",
  mute: "M4 9.5v5h3.5L12 18.5v-13L7.5 9.5zM16 9.5l5 5M21 9.5l-5 5",
  pin: "M12 21s-6.5-6.4-6.5-11a6.5 6.5 0 0113 0c0 4.6-6.5 11-6.5 11zM12 7.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z",
  sparkle: "M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6",
  user: "M12 12a4 4 0 100-8 4 4 0 000 8zM4.5 21a7.5 7.5 0 0115 0",
  vote: "M4 12l5 5L20 6",
  info: "M12 3a9 9 0 100 18 9 9 0 000-18zM12 11v6M12 7.5v.5",
  chart: "M4 20h16M6 16l4-5 3 3 5-7",
  coins: "M8 9.5c3.3 0 6-1.1 6-2.5S11.3 4.5 8 4.5 2 5.6 2 7s2.7 2.5 6 2.5zM2 7v5c0 1.4 2.7 2.5 6 2.5M14 7v2.5M10 14.5c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5-2.7-2.5-6-2.5-6 1.1-6 2.5zM10 14.5v4c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-4",
  people: "M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2.5 20a6.5 6.5 0 0113 0M16 4.3a3.5 3.5 0 010 6.4M18 14a6.5 6.5 0 013.5 6",
  smile: "M12 3a9 9 0 100 18 9 9 0 000-18zM8.5 14.5a4.5 4.5 0 007 0M9 9.5h.01M15 9.5h.01",
  thumb: "M7 10v11H4V10zM7 10l4-7a2 2 0 012 2.3L12.4 9H19a2 2 0 012 2.3l-1.3 7.5A2.5 2.5 0 0117.2 21H7",
  growth: "M3 17l6-6 4 4 8-8M15 7h6v6",
  handshake: "M3 12l4-4 3 2 3-3 4 1 4 4M7 8l5 9a1.5 1.5 0 002.4.3L19 13M10 15l1.5 1.5M8 17l1.2 1.2",
  seats: "M4 20v-4a8 8 0 0116 0v4M8 20v-3a4 4 0 018 0v3",
  globe: "M12 3a9 9 0 100 18 9 9 0 000-18zM3 12h18M12 3c2.5 2.6 3.7 5.6 3.7 9s-1.2 6.4-3.7 9c-2.5-2.6-3.7-5.6-3.7-9S9.5 5.6 12 3z",
  play: "M8 5l11 7-11 7z",
  cabinet: "M4 8h16v11a1 1 0 01-1 1H5a1 1 0 01-1-1zM9 8V5.5A1.5 1.5 0 0110.5 4h3A1.5 1.5 0 0115 5.5V8M4 13h16M11 13v2h2v-2",
  calendar: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4M8 14h2M12 14h2M8 17h2",
  target: "M12 3a9 9 0 100 18 9 9 0 000-18zM12 7a5 5 0 100 10 5 5 0 000-10zM12 11a1 1 0 100 2 1 1 0 000-2z",
  alert: "M12 3.5l9 16H3zM12 10v4.5M12 17.2v.3",
  mic: "M12 3a3 3 0 013 3v5a3 3 0 01-6 0V6a3 3 0 013-3zM6 11a6 6 0 0012 0M12 17v4M8.5 21h7",
  bolt: "M13 3L5 13.5h6L10 21l8-10.5h-6z",
  crown: "M3 18h18M4 16L3 7l5 4 4-6 4 6 5-4-1 9z",
};

export type IconName = keyof typeof P;

export function Icon({ name, size = 20, stroke = 1.8, className, style }: { name: string; size?: number; stroke?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className} style={{ flex: "none", ...style }}>
      <path d={P[name] ?? P.info} />
    </svg>
  );
}
