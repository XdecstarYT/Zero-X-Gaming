/**
 * Static catalog: game copy, controls, categories and badge definitions.
 * Rich presentation data lives in code; the authoritative rows the server
 * enforces against live in Supabase (`games`, `achievements`). Keep slugs
 * and ids in sync with supabase/migrations.
 */
import type { BadgeDef, Game, GameCategory, PlayerSummary } from "./types";

export const CATEGORIES: { id: GameCategory; label: string }[] = [
  { id: "shooter", label: "Shooter" },
  { id: "sim", label: "Sim" },
  { id: "sports", label: "Sports+" },
];

export const GAMES: Game[] = [
  {
    slug: "neon-siege",
    title: "Neon Siege",
    tagline: "Drop in. Loot up. Be the last one standing.",
    description:
      "A battle royale shooter in a fully 3D town. Drop in with 15 AI fighters, loot weapons from common to legendary, crack open chests, outrun the closing storm and fight for the win. Season 1: Ground Zero brings a free 30-tier battle pass with outfits, weapon wraps and banners, plus online deathmatch rooms with friends.",
    category: "shooter",
    tags: ["battle royale", "fps", "3d", "multiplayer", "bots"],
    status: "live",
    palette: ["#ffb321", "#4d6334"],
    rating: 0,
    ratingCount: 0,
    plays: 0,
    releasedAt: "2026-09-29",
    controls: [
      { keys: ["W", "A", "S", "D"], action: "Move / strafe" },
      { keys: ["Mouse"], action: "Look (click the game to lock the pointer)" },
      { keys: ["Click", "Space"], action: "Fire / use item" },
      { keys: ["Right-click", "Z"], action: "Aim down sights" },
      { keys: ["E"], action: "Pick up loot / open chest" },
      { keys: ["1–5", "Wheel"], action: "Switch hotbar slot" },
      { keys: ["R"], action: "Reload" },
      { keys: ["←", "→"], action: "Turn (keyboard only)" },
      { keys: ["Tab"], action: "Scoreboard (online)" },
      { keys: ["Esc", "P"], action: "Pause" },
    ],
    orientation: "landscape",
    touchControls:
      "Left thumb drags a virtual stick to move, right thumb drags to look. Hold FIRE to shoot, R to reload.",
  },
  {
    slug: "trenches",
    title: "Trenches",
    tagline: "Hold the line. Take the flags. Bleed their tickets dry.",
    description:
      "A realistic 3D Great War shooter. Fight at Gallipoli, the Somme, Verdun, Passchendaele, Vimy Ridge and the Argonne Forest, or storm Cape Helles. Three modes: Classic (hold the flags, bleed their tickets), Breakthrough (attack sector by sector) and Frontline (beach, two villages, no-man's-land, then the HQ, with only 3 redeploys). Build your loadout, dig in, throw Mills bombs and call in artillery, supply drops and recon flares. Play in multiplayer lobbies or vs bots. New in the Over the Top update: poison gas and gas masks, bayonet charges, emplaced Vickers guns and medics who revive the fallen.",
    category: "shooter",
    tags: ["war", "fps", "3d", "multiplayer", "lobbies", "conquest", "bots"],
    status: "live",
    palette: ["#c9a24a", "#6b6a45"],
    rating: 0,
    ratingCount: 0,
    plays: 0,
    releasedAt: "2026-09-30",
    controls: [
      { keys: ["W", "A", "S", "D"], action: "Move / strafe" },
      { keys: ["Mouse"], action: "Look (click the game to lock the pointer)" },
      { keys: ["Click", "Space"], action: "Fire / use item" },
      { keys: ["Right-click", "Z"], action: "Aim down sights" },
      { keys: ["1–5", "Wheel"], action: "Switch weapon / item" },
      { keys: ["R"], action: "Reload" },
      { keys: ["V"], action: "Bayonet (charge while sprinting)" },
      { keys: ["M"], action: "Gas mask on / off" },
      { keys: ["E"], action: "Man a Vickers gun · revive a fallen teammate (medics)" },
      { keys: ["B", "N", "T", "H"], action: "Call artillery, supplies, a recon flare, gas shells" },
      { keys: ["Tab"], action: "Scoreboard" },
      { keys: ["Esc", "P"], action: "Pause" },
    ],
    orientation: "landscape",
    touchControls:
      "Left thumb drags a virtual stick to move, right thumb drags to look. Hold FIRE to shoot, R to reload.",
  },
  {
    slug: "code-3",
    title: "Code 3",
    tagline: "Lights. Sirens. Justice. Work the beat in Bayview.",
    description:
      "A police patrol sim in a full 3D city. Suit up, take your cruiser out of the station and work a night or day shift in Bayview: answer dispatch callouts (armed robberies, shots fired, stolen cars, drunk drivers, collisions, domestics, street races and bank jobs), run traffic stops by the book (licence, MDT plate and warrant checks, questions, breathalyzer, consent and probable-cause searches, citations), chase fleeing suspects with PIT manoeuvres and backup, tackle and tase runners, cuff them, and book them at the station. Traffic obeys the lights and pulls over for your siren. Every call is scored: good police work ranks you up from Cadet to Chief and unlocks faster units.",
    category: "sim",
    tags: ["police", "driving", "open world", "3d", "pursuits"],
    status: "live",
    palette: ["#3b82f6", "#ef4444"],
    rating: 0,
    ratingCount: 0,
    plays: 0,
    releasedAt: "2026-10-02",
    controls: [
      { keys: ["W", "S"], action: "Throttle / brake & reverse (walk on foot)" },
      { keys: ["A", "D"], action: "Steer (strafe on foot)" },
      { keys: ["Space"], action: "Handbrake" },
      { keys: ["Q"], action: "Lights → lights + siren → off" },
      { keys: ["H"], action: "Siren yelp" },
      { keys: ["E"], action: "Exit / enter your unit" },
      { keys: ["Mouse"], action: "Look / aim (click the game to lock the pointer)" },
      { keys: ["Click", "F"], action: "Fire taser / sidearm" },
      { keys: ["Right-click"], action: "Aim" },
      { keys: ["X"], action: "Switch taser / sidearm" },
      { keys: ["G"], action: "Shout \"Police! Stop!\"" },
      { keys: ["1–9"], action: "Actions: talk, ID, MDT, search, cite, arrest…" },
      { keys: ["Y", "N"], action: "Respond to / decline a dispatch call" },
      { keys: ["B"], action: "Call for backup" },
      { keys: ["Tab"], action: "Mobile data terminal (MDT)" },
      { keys: ["C"], action: "Camera distance" },
      { keys: ["Esc", "P"], action: "Pause" },
    ],
    orientation: "landscape",
    touchControls:
      "Left thumb drives or walks, right thumb looks around. Buttons for enter/exit, lights, handbrake, fire, aim and backup; tap the action list to talk, search, cite and arrest.",
  },
  {
    slug: "aussie-rules",
    title: "Screamer: Aussie Rules",
    tagline: "Take a screamer. Slot it from 50. Win the flag.",
    description:
      "The first Sports+ game: full 18-a-side Australian rules football on a floodlit 3D oval. Four quarters, centre bounces, kicks, handballs, bounces, marks and set shots, tackles and holding-the-ball, kick-ins, throw-ins and behinds. Play as the whole Harbour Hawks side against a smart AI (Easy, Pro or Legend): lead into space, take a screamer on someone's shoulders and kick the winner after the siren. Goals are 6, behinds 1; your margin, goals and marks score for the leaderboard. Needs the Sports+ pass (50 coins, once).",
    category: "sports",
    tags: ["football", "aussie rules", "3d", "sports+"],
    status: "live",
    palette: ["#e11d48", "#1d4ed8"],
    rating: 0,
    ratingCount: 0,
    plays: 0,
    releasedAt: "2026-10-03",
    pass: "sports-plus",
    controls: [
      { keys: ["W", "A", "S", "D"], action: "Run (camera-relative)" },
      { keys: ["Shift"], action: "Sprint" },
      { keys: ["Space", "Click"], action: "Hold to charge a kick, release to kick (aim with the mouse / at the goals)" },
      { keys: ["F", "Right-click"], action: "Handball to the nearest teammate" },
      { keys: ["E"], action: "Jump for a mark / spoil (without the ball); tackle when close" },
      { keys: ["Q"], action: "Switch to the player nearest the ball" },
      { keys: ["B"], action: "Bounce (every 15 m while running)" },
      { keys: ["C"], action: "Camera: broadcast / behind the player" },
      { keys: ["Esc", "P"], action: "Pause" },
    ],
    orientation: "landscape",
    touchControls:
      "Left thumb runs. Hold KICK and release to kick (longer hold = longer kick), tap HANDBALL to dish off, MARK to leap, TACKLE when close, SWITCH to take the player nearest the ball.",
  },
  {
    slug: "diamond-derby",
    title: "Diamond Derby",
    tagline: "Ten outs. One swing at a time. Clear the wall.",
    description:
      "A Sports+ home run derby in a full 3D ballpark. Aim the plate coverage circle, read the pitch (riding fastballs, fading changeups, 12-to-6 curves, sweeping sliders) and time your swing. Every ball you don't hit out is an out: beat the AI slugger's mark in the quarterfinal, semifinal and final to take the title. Real batted-ball flight with drag and backspin, Statcast readouts for every swing, fireworks for every homer, day, twilight or night. Needs the Sports+ pass (50 coins, once).",
    category: "sports",
    tags: ["baseball", "home run derby", "3d", "sports+"],
    status: "live",
    palette: ["#d61f3a", "#13284d"],
    rating: 0,
    ratingCount: 0,
    plays: 0,
    releasedAt: "2026-10-05",
    pass: "sports-plus",
    controls: [
      { keys: ["Mouse"], action: "Aim the plate coverage circle" },
      { keys: ["W", "A", "S", "D"], action: "Nudge the aim" },
      { keys: ["Click", "Space"], action: "Swing" },
      { keys: ["C"], action: "Camera: batter / centre field" },
      { keys: ["Esc", "P"], action: "Pause" },
    ],
    orientation: "landscape",
    touchControls: "Drag anywhere to move the aim circle, tap SWING as the ball arrives. CAM switches between the batter's view and the centre-field camera.",
  },
  {
    slug: "ace-rally",
    title: "Ace Rally",
    tagline: "Toss. Serve. Rally. Break. Hold. Win it on Centre Court.",
    description:
      "Sports+ singles tennis at the Zero X Open, in a full 3D stadium. Time your toss for a 200 km/h first serve, then slug it out with topspin, slice, lobs and drop shots against touring pros with their own styles. Real ball flight with spin and drag, hard, clay or grass (each bounces its own way), full scoring with deuce, advantage and tiebreaks, Hawk-Eye on close calls, an umpire who calls the score, and men's and women's draws. Needs the Sports+ pass (50 coins, once).",
    category: "sports",
    tags: ["tennis", "3d", "sports+"],
    status: "live",
    palette: ["#15803d", "#d9f99d"],
    rating: 0,
    ratingCount: 0,
    plays: 0,
    releasedAt: "2026-10-06",
    pass: "sports-plus",
    controls: [
      { keys: ["W", "A", "S", "D"], action: "Move (and aim as you hit)" },
      { keys: ["Space", "Click", "J"], action: "Serve (toss, then hit) / topspin" },
      { keys: ["K", "Right-click"], action: "Slice" },
      { keys: ["L"], action: "Lob" },
      { keys: ["I"], action: "Drop shot" },
      { keys: ["C"], action: "Camera: broadcast / player" },
      { keys: ["Esc", "P"], action: "Pause" },
    ],
    orientation: "landscape",
    touchControls: "Left thumb moves you and aims your shot as you hit. SERVE (tap to toss, tap at the top to hit) turns into TOPSPIN in the rally; SLICE, LOB and DROP sit beside it.",
  },
];

export const FEATURED_SLUG = "trenches";

export function getGame(slug: string): Game | undefined {
  return GAMES.find((g) => g.slug === slug);
}

export const BADGES: BadgeDef[] = [
  { id: "first-run", name: "First Run", description: "Finish your first game.", tier: "bronze" },
  { id: "streak-7", name: "On Fire", description: "Log in 7 days in a row.", tier: "silver" },
  { id: "top-10", name: "Top Ten", description: "Place top 10 on any daily board.", tier: "gold" },
  { id: "all-rounder", name: "All-Rounder", description: "Legacy: scored in every launch game.", tier: "neon" },
];

/** Placeholder player shown until auth lands in Phase 2. */
export const MOCK_PLAYER: PlayerSummary = {
  username: "Guest",
  xp: 0,
  streakDays: 0,
  badges: [],
  gamesPlayed: 0,
  totalScore: 0,
};
