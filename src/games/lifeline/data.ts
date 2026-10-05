/**
 * Lifeline's catalogue: what can be built, who can be hired, what walks in the door.
 * Everything the rules and the renderer share lives here as plain data.
 */

export const GAME_SLUG = "lifeline";
export const SAVE_KEY = "zx-lifeline-save";
export const SAVE_VERSION = 1;

/** Plot size in cells (1 cell = 1 m). The bottom rows are pavement and road. */
export const W = 64;
export const H = 48;
export const ROAD_Z = H - 3;
export const PAVEMENT_Z = H - 4;
/** Where people and vehicles enter from the street. */
export const GATE = { x: 6, z: PAVEMENT_Z };
/** Game minutes per real second at 1×. */
export const MINUTES_PER_SECOND = 2;
export const START_CASH = 60_000;

// ------------------------------------------------------------------ floors

export type FloorId = "concrete" | "tile" | "lino" | "carpet" | "wood" | "path";
export const FLOORS: Record<FloorId, { name: string; cost: number; color: string; line: string; clean: number }> = {
  concrete: { name: "Concrete", cost: 6, color: "#a9a9a4", line: "#999994", clean: 0.8 },
  tile: { name: "White tile", cost: 14, color: "#e9eef0", line: "#c9d3d8", clean: 1.3 },
  lino: { name: "Hospital lino", cost: 10, color: "#bfe3dc", line: "#a5d0c8", clean: 1.15 },
  carpet: { name: "Carpet", cost: 12, color: "#6b7fa8", line: "#61759d", clean: 0.7 },
  wood: { name: "Wood", cost: 16, color: "#b98a5a", line: "#a87b4e", clean: 0.9 },
  path: { name: "Paving", cost: 5, color: "#c9c2b4", line: "#b7b0a2", clean: 1 },
};
export const WALL_COST = 18;
export const DOOR_COST = 80;

// ----------------------------------------------------------------- objects

export type ObjectId =
  | "receptionDesk"
  | "chair"
  | "seats"
  | "desk"
  | "examBed"
  | "bed"
  | "monitor"
  | "opTable"
  | "surgicalLight"
  | "anesthesia"
  | "xray"
  | "leadScreen"
  | "pharmacyCounter"
  | "medCabinet"
  | "traumaBed"
  | "defib"
  | "sofa"
  | "coffee"
  | "vending"
  | "table"
  | "toilet"
  | "sink"
  | "lockers"
  | "generator"
  | "plant"
  | "tv"
  | "bench"
  | "tree"
  | "filing"
  | "icuBed"
  | "ventilator"
  | "incubator"
  | "birthingBed"
  | "mriScanner"
  | "mriConsole"
  | "therapyCouch"
  | "armchair"
  | "labBench"
  | "microscope"
  | "bookshelf"
  | "helipad"
  | "fountain";

export type ObjectCat = "medical" | "furniture" | "facilities" | "outdoor";

export interface ObjectDef {
  name: string;
  cat: ObjectCat;
  cost: number;
  /** Footprint in cells (width along x, depth along z) before rotation. */
  w: number;
  d: number;
  /** Power drawn (or supplied, negative). */
  power?: number;
  /** People can walk through it (rugs, plants are not). */
  walkable?: boolean;
  /** Seconds of a workman's time to install. */
  build: number;
  /** Must be indoors (on a foundation). */
  indoor?: boolean;
  desc: string;
}

export const OBJECTS: Record<ObjectId, ObjectDef> = {
  receptionDesk: { name: "Reception desk", cat: "furniture", cost: 900, w: 3, d: 1, build: 8, indoor: true, desc: "Where every walk-in patient checks in." },
  chair: { name: "Chair", cat: "furniture", cost: 60, w: 1, d: 1, build: 2, walkable: true, desc: "Staff sit here at desks." },
  seats: { name: "Waiting seats", cat: "furniture", cost: 240, w: 3, d: 1, build: 4, desc: "Three seats. Patients wait more patiently sitting down." },
  desk: { name: "Office desk", cat: "furniture", cost: 400, w: 2, d: 1, build: 5, indoor: true, desc: "For consulting rooms and offices." },
  examBed: { name: "Examination couch", cat: "medical", cost: 1_100, w: 2, d: 1, build: 6, indoor: true, desc: "Doctors examine patients here." },
  bed: { name: "Hospital bed", cat: "medical", cost: 1_400, w: 1, d: 2, build: 6, indoor: true, desc: "For patients staying on a ward." },
  monitor: { name: "Patient monitor", cat: "medical", cost: 1_800, w: 1, d: 1, power: 1, build: 4, indoor: true, desc: "Ward patients beside one recover faster." },
  opTable: { name: "Operating table", cat: "medical", cost: 6_000, w: 1, d: 2, build: 10, indoor: true, desc: "The heart of an operating theatre." },
  surgicalLight: { name: "Surgical lights", cat: "medical", cost: 2_500, w: 1, d: 1, power: 2, build: 6, indoor: true, desc: "Bright, shadowless light over the table." },
  anesthesia: { name: "Anaesthesia machine", cat: "medical", cost: 4_000, w: 1, d: 1, power: 3, build: 8, indoor: true, desc: "Keeps the patient under during surgery." },
  xray: { name: "X-ray machine", cat: "medical", cost: 9_000, w: 2, d: 2, power: 6, build: 12, indoor: true, desc: "Sees fractures, stones and chests." },
  leadScreen: { name: "Lead screen", cat: "medical", cost: 700, w: 1, d: 1, build: 3, indoor: true, desc: "Protects the radiographer." },
  pharmacyCounter: { name: "Pharmacy counter", cat: "medical", cost: 1_500, w: 2, d: 1, build: 6, indoor: true, desc: "Where prescriptions are handed out." },
  medCabinet: { name: "Medicine cabinet", cat: "medical", cost: 1_200, w: 1, d: 1, build: 4, indoor: true, desc: "Stock for the pharmacy and wards." },
  traumaBed: { name: "Trauma bed", cat: "medical", cost: 3_500, w: 1, d: 2, build: 8, indoor: true, desc: "For the critical cases off the ambulance." },
  defib: { name: "Defibrillator cart", cat: "medical", cost: 2_800, w: 1, d: 1, power: 1, build: 4, indoor: true, desc: "Restarts hearts. Emergency rooms need one." },
  sofa: { name: "Sofa", cat: "furniture", cost: 500, w: 2, d: 1, build: 4, desc: "Staff rest here between patients." },
  coffee: { name: "Coffee machine", cat: "facilities", cost: 650, w: 1, d: 1, power: 1, build: 3, indoor: true, desc: "Staff rest faster with coffee." },
  vending: { name: "Vending machine", cat: "facilities", cost: 800, w: 1, d: 1, power: 1, build: 3, desc: "Snacks for hungry patients. Earns a little." },
  table: { name: "Café table", cat: "furniture", cost: 300, w: 1, d: 1, build: 3, desc: "Somewhere to eat." },
  toilet: { name: "Toilet", cat: "facilities", cost: 450, w: 1, d: 1, build: 4, indoor: true, desc: "Everyone needs one eventually." },
  sink: { name: "Sink", cat: "facilities", cost: 300, w: 1, d: 1, build: 3, indoor: true, desc: "Hand washing cuts infections." },
  lockers: { name: "Lockers", cat: "facilities", cost: 350, w: 2, d: 1, build: 3, indoor: true, desc: "A janitors' closet needs them." },
  generator: { name: "Generator", cat: "facilities", cost: 7_000, w: 2, d: 2, power: -24, build: 10, desc: "Powers 24 units of equipment." },
  plant: { name: "Pot plant", cat: "furniture", cost: 80, w: 1, d: 1, build: 1, desc: "Makes any room a little nicer." },
  tv: { name: "Television", cat: "furniture", cost: 600, w: 1, d: 1, power: 1, build: 2, indoor: true, desc: "Waiting goes faster with something to watch." },
  bench: { name: "Garden bench", cat: "outdoor", cost: 150, w: 2, d: 1, build: 2, desc: "Fresh air for patients." },
  tree: { name: "Tree", cat: "outdoor", cost: 120, w: 1, d: 1, build: 2, desc: "Shade and calm." },
  filing: { name: "Filing cabinet", cat: "furniture", cost: 250, w: 1, d: 1, build: 2, indoor: true, desc: "Paperwork for the offices." },
  icuBed: { name: "ICU bed", cat: "medical", cost: 4_200, w: 1, d: 2, power: 2, build: 8, indoor: true, desc: "A bed with everything wired in, for the sickest patients." },
  ventilator: { name: "Ventilator", cat: "medical", cost: 5_500, w: 1, d: 1, power: 3, build: 6, indoor: true, desc: "Breathes for patients who can't." },
  incubator: { name: "Incubator", cat: "medical", cost: 3_800, w: 1, d: 1, power: 2, build: 6, indoor: true, desc: "Keeps newborns warm and safe." },
  birthingBed: { name: "Birthing bed", cat: "medical", cost: 3_000, w: 1, d: 2, build: 7, indoor: true, desc: "Where babies are born." },
  mriScanner: { name: "MRI scanner", cat: "medical", cost: 24_000, w: 2, d: 3, power: 12, build: 16, indoor: true, desc: "Sees brains, spines and soft tissue in detail." },
  mriConsole: { name: "MRI console", cat: "medical", cost: 3_000, w: 2, d: 1, power: 1, build: 5, indoor: true, desc: "Where the radiographer runs the scan." },
  therapyCouch: { name: "Therapy couch", cat: "medical", cost: 900, w: 2, d: 1, build: 4, indoor: true, desc: "Patients talk things through here." },
  armchair: { name: "Armchair", cat: "furniture", cost: 450, w: 1, d: 1, build: 3, walkable: true, desc: "The psychiatrist's chair." },
  labBench: { name: "Lab bench", cat: "medical", cost: 3_200, w: 2, d: 1, power: 1, build: 7, indoor: true, desc: "Where research happens." },
  microscope: { name: "Microscope", cat: "medical", cost: 2_400, w: 1, d: 1, power: 1, build: 4, indoor: true, desc: "Speeds research up." },
  bookshelf: { name: "Bookshelf", cat: "furniture", cost: 350, w: 2, d: 1, build: 3, indoor: true, desc: "Calm, quiet, and full of answers." },
  helipad: { name: "Helipad", cat: "outdoor", cost: 15_000, w: 4, d: 4, build: 14, walkable: true, desc: "Air ambulances land here with major trauma cases." },
  fountain: { name: "Fountain", cat: "outdoor", cost: 1_800, w: 2, d: 2, build: 6, desc: "A garden centrepiece. Patients love it." },
};

// ------------------------------------------------------------------- rooms

export type RoomId =
  | "reception"
  | "waiting"
  | "gp"
  | "ward"
  | "theatre"
  | "radiology"
  | "pharmacy"
  | "emergency"
  | "staffRoom"
  | "cafe"
  | "toilets"
  | "janitor"
  | "office"
  | "deliveries"
  | "garden"
  | "icu"
  | "maternity"
  | "psychiatry"
  | "mri"
  | "research"
  | "helipad";

export type Role = "doctor" | "nurse" | "surgeon" | "midwife" | "psychiatrist" | "receptionist" | "janitor" | "workman" | "director" | "accountant" | "chief" | "facilities";

export interface RoomDef {
  name: string;
  color: string;
  /** Smallest floor area in cells. */
  min: number;
  /** Objects it must contain (counts). */
  needs: Partial<Record<ObjectId, number>>;
  /** Must be enclosed by walls with a door. */
  enclosed: boolean;
  indoor: boolean;
  /** Who works here (one each), if anyone. */
  staff?: Role[];
  /** Unlocked by a bureaucracy hire. */
  unlock?: Role;
  /** Unlocked by a research project. */
  research?: ResearchId;
  desc: string;
}

export const ROOMS: Record<RoomId, RoomDef> = {
  reception: { name: "Reception", color: "#22e5ff", min: 9, needs: { receptionDesk: 1, chair: 1 }, enclosed: false, indoor: true, staff: ["receptionist"], desc: "Walk-ins check in here first." },
  waiting: { name: "Waiting room", color: "#93c5fd", min: 12, needs: { seats: 1 }, enclosed: false, indoor: true, desc: "Patients wait here between steps." },
  gp: { name: "Consulting room", color: "#4ade80", min: 9, needs: { desk: 1, chair: 1, examBed: 1 }, enclosed: true, indoor: true, staff: ["doctor"], desc: "A doctor diagnoses and treats simple cases." },
  ward: { name: "Ward", color: "#f9a8d4", min: 12, needs: { bed: 2 }, enclosed: true, indoor: true, staff: ["nurse"], desc: "Patients recover in bed under a nurse's eye." },
  theatre: { name: "Operating theatre", color: "#34d399", min: 16, needs: { opTable: 1, surgicalLight: 1, anesthesia: 1, sink: 1 }, enclosed: true, indoor: true, staff: ["surgeon", "nurse"], unlock: "chief", desc: "Surgery. Needs a surgeon and a nurse." },
  radiology: { name: "Radiology", color: "#c4b5fd", min: 12, needs: { xray: 1, leadScreen: 1 }, enclosed: true, indoor: true, staff: ["doctor"], desc: "X-rays for fractures, stones and chests." },
  pharmacy: { name: "Pharmacy", color: "#fde047", min: 6, needs: { pharmacyCounter: 1, medCabinet: 1 }, enclosed: false, indoor: true, staff: ["nurse"], desc: "Hands out medicine." },
  emergency: { name: "Emergency room", color: "#f87171", min: 12, needs: { traumaBed: 1, defib: 1 }, enclosed: true, indoor: true, staff: ["doctor"], desc: "Where ambulances bring the critical cases." },
  staffRoom: { name: "Staff room", color: "#fdba74", min: 9, needs: { sofa: 1 }, enclosed: true, indoor: true, desc: "Tired staff rest here." },
  cafe: { name: "Café", color: "#fb923c", min: 9, needs: { vending: 1, table: 1 }, enclosed: false, indoor: true, desc: "Hungry patients eat here." },
  toilets: { name: "Toilets", color: "#67e8f9", min: 4, needs: { toilet: 1, sink: 1 }, enclosed: true, indoor: true, desc: "Toilets and a sink." },
  janitor: { name: "Janitor's closet", color: "#a3a3a3", min: 4, needs: { lockers: 1 }, enclosed: true, indoor: true, desc: "Janitors clean faster with a closet." },
  office: { name: "Office", color: "#e5e7eb", min: 9, needs: { desk: 1, chair: 1, filing: 1 }, enclosed: true, indoor: true, desc: "Each administrator needs one." },
  deliveries: { name: "Deliveries", color: "#facc15", min: 6, needs: {}, enclosed: false, indoor: false, desc: "Trucks drop building materials here." },
  garden: { name: "Garden", color: "#86efac", min: 12, needs: { bench: 1 }, enclosed: false, indoor: false, desc: "Patients relax outside." },
  icu: { name: "Intensive care", color: "#ef4444", min: 16, needs: { icuBed: 1, ventilator: 1 }, enclosed: true, indoor: true, staff: ["doctor", "nurse"], research: "intensiveCare", desc: "Round-the-clock care for the critically ill." },
  maternity: { name: "Maternity", color: "#f0abfc", min: 16, needs: { birthingBed: 1, incubator: 1, sink: 1 }, enclosed: true, indoor: true, staff: ["midwife"], research: "maternity", desc: "Babies are born here, with a midwife." },
  psychiatry: { name: "Psychiatry", color: "#a5b4fc", min: 9, needs: { therapyCouch: 1, armchair: 1, bookshelf: 1 }, enclosed: true, indoor: true, staff: ["psychiatrist"], research: "psychiatry", desc: "Talking therapy for anxious and low patients." },
  mri: { name: "MRI suite", color: "#38bdf8", min: 16, needs: { mriScanner: 1, mriConsole: 1 }, enclosed: true, indoor: true, staff: ["doctor"], research: "mri", desc: "Scans brains and spines." },
  research: { name: "Research lab", color: "#c084fc", min: 12, needs: { labBench: 1 }, enclosed: true, indoor: true, staff: ["doctor"], desc: "Doctors here work on research projects." },
  helipad: { name: "Helipad zone", color: "#fde68a", min: 16, needs: { helipad: 1 }, enclosed: false, indoor: false, research: "airAmbulance", desc: "Air ambulances land here." },
};

// ------------------------------------------------------------------- staff

export interface RoleDef {
  name: string;
  wage: number;
  color: string;
  /** Hiring needs a bureaucracy unlock first. */
  unlock?: Role;
  /** Hiring needs a research project first. */
  research?: ResearchId;
  /** An administrator: needs an office and unlocks something. */
  admin?: { unlocks: string };
  desc: string;
}

export const ROLES: Record<Role, RoleDef> = {
  doctor: { name: "Doctor", wage: 420, color: "#f8fafc", desc: "Diagnoses in consulting rooms, radiology and emergency." },
  nurse: { name: "Nurse", wage: 260, color: "#2dd4bf", desc: "Runs wards and the pharmacy; assists in surgery." },
  surgeon: { name: "Surgeon", wage: 650, color: "#16a34a", unlock: "chief", desc: "Operates in the theatre." },
  midwife: { name: "Midwife", wage: 320, color: "#e879f9", research: "maternity", desc: "Delivers babies in maternity." },
  psychiatrist: { name: "Psychiatrist", wage: 520, color: "#818cf8", research: "psychiatry", desc: "Runs talking therapy in psychiatry." },
  receptionist: { name: "Receptionist", wage: 160, color: "#a78bfa", desc: "Checks in walk-in patients." },
  janitor: { name: "Janitor", wage: 130, color: "#94a3b8", desc: "Cleans floors, keeping infections down." },
  workman: { name: "Workman", wage: 150, color: "#f97316", desc: "Carries materials and builds everything." },
  director: { name: "Hospital director", wage: 600, color: "#1e293b", admin: { unlocks: "Grants beyond the first two, and staff reports" }, desc: "Runs the place." },
  accountant: { name: "Accountant", wage: 380, color: "#334155", unlock: "director", admin: { unlocks: "Bank loans, and 5% off wages" }, desc: "Keeps the books." },
  chief: { name: "Chief of medicine", wage: 750, color: "#0f766e", unlock: "director", admin: { unlocks: "Operating theatres and surgeons" }, desc: "Leads the doctors." },
  facilities: { name: "Head of facilities", wage: 400, color: "#7c2d12", unlock: "director", admin: { unlocks: "Faster building and cleaning (+30%)" }, desc: "Runs maintenance." },
};

export const ADMINS: Role[] = ["director", "accountant", "chief", "facilities"];

// -------------------------------------------------------------- conditions

export type Step = "gp" | "radiology" | "pharmacy" | "ward" | "theatre" | "emergency" | "icu" | "maternity" | "psych" | "mri";

export interface ConditionDef {
  name: string;
  /** Rooms in order. The first is where it's diagnosed. */
  path: Step[];
  /** Hours in a ward bed when the path includes a ward. */
  wardHours?: number;
  /** Hours in intensive care when the path includes it. */
  icuHours?: number;
  /** Only arrives by air ambulance. */
  air?: boolean;
  /** Health lost per game hour while untreated. */
  decay: number;
  fee: number;
  /** Comes in by ambulance, straight to Emergency. */
  critical?: boolean;
  /** Relative frequency. */
  weight: number;
  /** Spreads dirt (and infection) where they go. */
  messy?: boolean;
}

export type ConditionId =
  | "flu"
  | "migraine"
  | "sprain"
  | "fracture"
  | "foodPoisoning"
  | "pneumonia"
  | "concussion"
  | "appendicitis"
  | "kidneyStones"
  | "allergy"
  | "burns"
  | "heartAttack"
  | "infection"
  | "stroke"
  | "pregnancy"
  | "prematureLabour"
  | "anxiety"
  | "depression"
  | "sepsis"
  | "backInjury"
  | "majorTrauma";

export const CONDITIONS: Record<ConditionId, ConditionDef> = {
  flu: { name: "Flu", path: ["gp", "pharmacy"], decay: 2, fee: 320, weight: 14, messy: true },
  migraine: { name: "Migraine", path: ["gp", "pharmacy"], decay: 1.5, fee: 260, weight: 10 },
  sprain: { name: "Sprained ankle", path: ["gp", "pharmacy"], decay: 1, fee: 220, weight: 10 },
  fracture: { name: "Broken arm", path: ["gp", "radiology", "emergency"], decay: 3, fee: 900, weight: 8 },
  foodPoisoning: { name: "Food poisoning", path: ["gp", "ward"], wardHours: 6, decay: 3, fee: 800, weight: 7, messy: true },
  pneumonia: { name: "Pneumonia", path: ["gp", "radiology", "ward", "pharmacy"], wardHours: 14, decay: 4, fee: 1_700, weight: 5 },
  concussion: { name: "Concussion", path: ["gp", "radiology", "ward"], wardHours: 10, decay: 4, fee: 1_200, weight: 5 },
  appendicitis: { name: "Appendicitis", path: ["gp", "radiology", "theatre", "ward"], wardHours: 8, decay: 6, fee: 2_800, weight: 4 },
  kidneyStones: { name: "Kidney stones", path: ["gp", "radiology", "theatre", "ward"], wardHours: 6, decay: 4, fee: 2_600, weight: 3 },
  allergy: { name: "Allergic reaction", path: ["emergency", "pharmacy"], decay: 10, fee: 700, weight: 4, critical: true },
  burns: { name: "Burns", path: ["emergency", "ward", "pharmacy"], wardHours: 10, decay: 8, fee: 1_900, weight: 3, critical: true },
  heartAttack: { name: "Heart attack", path: ["emergency", "theatre", "ward"], wardHours: 20, decay: 14, fee: 5_200, weight: 2, critical: true },
  // Caught in a dirty hospital, not walked in with.
  infection: { name: "Hospital infection", path: ["ward", "pharmacy"], wardHours: 12, decay: 3, fee: 0, weight: 0 },
  stroke: { name: "Stroke", path: ["emergency", "mri", "icu"], icuHours: 16, decay: 12, fee: 6_400, weight: 2, critical: true },
  pregnancy: { name: "In labour", path: ["gp", "maternity"], decay: 1.5, fee: 2_600, weight: 6 },
  prematureLabour: { name: "Premature labour", path: ["emergency", "maternity", "icu"], icuHours: 10, decay: 9, fee: 5_800, weight: 1.5, critical: true },
  anxiety: { name: "Anxiety", path: ["gp", "psych"], decay: 0.8, fee: 650, weight: 6 },
  depression: { name: "Depression", path: ["gp", "psych", "pharmacy"], decay: 1, fee: 950, weight: 5 },
  sepsis: { name: "Sepsis", path: ["emergency", "icu", "pharmacy"], icuHours: 12, decay: 11, fee: 4_600, weight: 2, critical: true },
  backInjury: { name: "Back injury", path: ["gp", "mri", "pharmacy"], decay: 1.5, fee: 1_400, weight: 4 },
  majorTrauma: { name: "Major trauma", path: ["emergency", "theatre", "icu"], icuHours: 18, decay: 16, fee: 11_000, weight: 3, critical: true, air: true },
};

/** Which room each step needs. */
export const STEP_ROOM: Record<Step, RoomId> = { gp: "gp", radiology: "radiology", pharmacy: "pharmacy", ward: "ward", theatre: "theatre", emergency: "emergency", icu: "icu", maternity: "maternity", psych: "psychiatry", mri: "mri" };
/** Game minutes a step takes once the patient is in the room with staff (ward and ICU stays use the condition's hours). */
export const STEP_MINUTES: Record<Exclude<Step, "ward" | "icu">, number> = { gp: 30, radiology: 40, pharmacy: 15, theatre: 120, emergency: 60, maternity: 180, psych: 60, mri: 50 };

// ---------------------------------------------------------------- research

export type ResearchId = "diagnostics" | "intensiveCare" | "maternity" | "psychiatry" | "mri" | "antibiotics" | "robotics" | "airAmbulance" | "telehealth" | "ergonomics";
export const RESEARCH: Record<ResearchId, { name: string; desc: string; cost: number; needs?: ResearchId }> = {
  diagnostics: { name: "Rapid diagnostics", desc: "Consulting rooms and radiology work 25% faster.", cost: 40 },
  ergonomics: { name: "Ergonomics", desc: "Staff tire 30% more slowly.", cost: 40 },
  intensiveCare: { name: "Intensive care", desc: "Unlocks the ICU: ICU beds and ventilators for sepsis, strokes and trauma.", cost: 60 },
  maternity: { name: "Maternity", desc: "Unlocks maternity wards, birthing beds, incubators and midwives.", cost: 50 },
  psychiatry: { name: "Psychiatry", desc: "Unlocks psychiatry and psychiatrists for anxiety and depression.", cost: 50 },
  antibiotics: { name: "New antibiotics", desc: "Hospital infections are half as likely.", cost: 70 },
  mri: { name: "MRI", desc: "Unlocks the MRI suite for strokes and back injuries.", cost: 90, needs: "diagnostics" },
  telehealth: { name: "Telehealth", desc: "20% more patients come to you.", cost: 80 },
  robotics: { name: "Surgical robotics", desc: "Operations take 30% less time.", cost: 110, needs: "intensiveCare" },
  airAmbulance: { name: "Air ambulance", desc: "Unlocks the helipad: helicopters bring major trauma cases (and big fees).", cost: 130, needs: "intensiveCare" },
};
export const RESEARCH_ORDER: ResearchId[] = ["diagnostics", "ergonomics", "intensiveCare", "maternity", "psychiatry", "antibiotics", "mri", "telehealth", "robotics", "airAmbulance"];

// --------------------------------------------------------------- scenarios

export type ScenarioId = "rural" | "cityGeneral" | "epidemic" | "disaster" | "institute";
export type Metric = "treated" | "er" | "research" | "air";
export interface ScenarioDef {
  name: string;
  blurb: string;
  start: "empty" | "starter" | "full";
  cash: number;
  days: number;
  metric: Metric;
  /** Bronze, silver, gold. */
  goals: [number, number, number];
  /** Something special about this scenario. */
  twist?: "flu" | "crashes" | "rich";
}
export const SCENARIOS: Record<ScenarioId, ScenarioDef> = {
  rural: { name: "Rural clinic", blurb: "An empty field outside a small town. Build a clinic from nothing.", start: "empty", cash: 50_000, days: 3, metric: "treated", goals: [12, 22, 35] },
  cityGeneral: { name: "City General", blurb: "Take over a small hospital and turn it into the city's best.", start: "starter", cash: 35_000, days: 5, metric: "treated", goals: [50, 80, 120] },
  epidemic: { name: "Flu epidemic", blurb: "Flu season never ends. Keep the floors clean and the queues moving.", start: "starter", cash: 40_000, days: 4, metric: "treated", goals: [60, 90, 130], twist: "flu" },
  disaster: { name: "Disaster response", blurb: "A run of road crashes: ambulances every day. Save as many as you can.", start: "full", cash: 45_000, days: 3, metric: "er", goals: [12, 20, 30], twist: "crashes" },
  institute: { name: "Research institute", blurb: "A well-funded teaching hospital. Push medicine forward.", start: "full", cash: 120_000, days: 6, metric: "research", goals: [2, 4, 6], twist: "rich" },
};
export const SCENARIO_ORDER: ScenarioId[] = ["rural", "cityGeneral", "epidemic", "disaster", "institute"];
export const METRIC_NAME: Record<Metric, string> = { treated: "lives saved", er: "emergency cases treated", research: "research projects finished", air: "air ambulance patients" };

// ------------------------------------------------------------------ grants

export interface GrantDef {
  name: string;
  desc: string;
  reward: number;
  /** Needs the director first (after the first two). */
  director?: boolean;
}
export type GrantId = "opening" | "firstTen" | "pharmacy" | "ward" | "radiology" | "emergency" | "surgery" | "clean" | "fifty" | "stars" | "hundred" | "discovery" | "newborns" | "airlift";
export const GRANTS: Record<GrantId, GrantDef> = {
  opening: { name: "Open the doors", desc: "Build a reception, a waiting room and a consulting room, and hire a receptionist and a doctor.", reward: 12_000 },
  firstTen: { name: "First ten", desc: "Treat ten patients.", reward: 8_000 },
  pharmacy: { name: "Dispensary", desc: "Build a pharmacy and hand out medicine to five patients.", reward: 7_000, director: true },
  ward: { name: "Overnight stays", desc: "Run a ward with four beds and discharge three ward patients.", reward: 12_000, director: true },
  radiology: { name: "See inside", desc: "Build radiology and scan five patients.", reward: 14_000, director: true },
  emergency: { name: "Blue lights", desc: "Treat five ambulance cases in the emergency room.", reward: 18_000, director: true },
  surgery: { name: "Under the knife", desc: "Perform three operations.", reward: 25_000, director: true },
  clean: { name: "Spotless", desc: "Keep hygiene above 85% for a whole day with three janitors.", reward: 10_000, director: true },
  fifty: { name: "Fifty lives", desc: "Treat fifty patients.", reward: 30_000, director: true },
  stars: { name: "Four stars", desc: "Reach a four-star reputation.", reward: 40_000, director: true },
  hundred: { name: "A hundred lives", desc: "Treat a hundred patients.", reward: 60_000, director: true },
  discovery: { name: "Discovery", desc: "Finish your first research project.", reward: 15_000, director: true },
  newborns: { name: "New arrivals", desc: "Deliver three babies in maternity.", reward: 14_000, director: true },
  airlift: { name: "Airlift", desc: "Treat three patients flown in by air ambulance.", reward: 35_000, director: true },
};
export const GRANT_ORDER: GrantId[] = ["opening", "firstTen", "pharmacy", "ward", "radiology", "emergency", "surgery", "clean", "discovery", "newborns", "fifty", "stars", "airlift", "hundred"];

// ------------------------------------------------------------------ events

export type EventId = "fluSeason" | "busCrash" | "inspection" | "donation" | "heatwave" | "outbreak" | "babyBoom" | "breakdowns";
export const EVENTS: Record<EventId, { name: string; desc: string }> = {
  fluSeason: { name: "Flu season", desc: "Twice as many flu cases for two days." },
  busCrash: { name: "Bus crash", desc: "A bus has crashed nearby. Ambulances are on their way." },
  inspection: { name: "Health inspection", desc: "An inspector is checking hygiene today." },
  donation: { name: "Charity donation", desc: "A grateful family has made a donation." },
  heatwave: { name: "Heatwave", desc: "More burns and more thirsty patients for a day." },
  outbreak: { name: "Infection outbreak", desc: "Dirty floors are making patients sick. Hire janitors." },
  babyBoom: { name: "Baby boom", desc: "Three times as many births for two days." },
  breakdowns: { name: "Power surge", desc: "A surge has worn down every machine. Workmen will be busy." },
};

/** First names for staff and patients (invented city, everyday names). */
export const FIRST = ["Alex", "Sam", "Jo", "Priya", "Tom", "Mia", "Leo", "Ana", "Omar", "Grace", "Ben", "Zoe", "Kai", "Nina", "Ravi", "Lucy", "Theo", "Ivy", "Hugo", "Maya", "Finn", "Rosa", "Eli", "Aisha", "Noah", "Ella", "Max", "Lena", "Yusuf", "Chloe"];
export const LAST = ["Hart", "Okafor", "Silva", "Novak", "Reid", "Chen", "Patel", "Moreau", "Kowalski", "Ahmed", "Brooks", "Larsen", "Ortiz", "Byrne", "Sato", "Mensah", "Varga", "Quinn", "Haddad", "Fischer"];
