/**
 * Jobs in Harbour City: part-time work for teenagers and students, and
 * careers that need a diploma or a degree, each with a ladder of titles and
 * salaries. Some have a playable shift in the 3D world (`shift`).
 */

export type Degree = "none" | "high" | "business" | "medicine" | "law" | "engineering" | "arts" | "education" | "nursing" | "science";
export type Shift = "cashier" | "delivery" | "barista" | "office";

export interface Career {
  id: string;
  name: string;
  /** Titles from entry level up. */
  ladder: string[];
  /** Yearly salary at each level. */
  pay: number[];
  needs: Degree;
  minSmarts: number;
  minAge: number;
  partTime?: boolean;
  /** Where you work in town, and the shift you can play. */
  place: string;
  shift: Shift;
  blurb: string;
}

const C = (id: string, name: string, ladder: string[], pay: number[], needs: Degree, minSmarts: number, place: string, shift: Shift, blurb: string, o: Partial<Career> = {}): Career => ({ id, name, ladder, pay, needs, minSmarts, minAge: 18, place, shift, blurb, ...o });

export const CAREERS: Career[] = [
  // Part-time (14+ and students).
  C("cashier", "Cashier", ["Cashier", "Senior Cashier", "Shift Supervisor"], [14000, 17000, 22000], "none", 0, "freshmart", "cashier", "Scan, bag, smile. Fresh Mart on Main St.", { partTime: true, minAge: 14 }),
  C("barista", "Barista", ["Barista", "Head Barista", "Café Manager"], [15000, 19000, 30000], "none", 0, "cafe", "barista", "Bean There Café: lattes, flat whites and regulars.", { partTime: true, minAge: 14 }),
  C("delivery", "Pizza Delivery", ["Delivery Driver", "Senior Driver", "Dispatch Lead"], [16000, 20000, 26000], "none", 0, "pizza", "delivery", "Slice of Heaven: get it there hot. Tips if you're quick.", { partTime: true, minAge: 16 }),
  C("lifeguard", "Lifeguard", ["Pool Lifeguard", "Beach Lifeguard", "Head Lifeguard"], [15000, 19000, 25000], "none", 20, "beach", "office", "Sun, sand and the odd rescue.", { partTime: true, minAge: 15 }),
  // Full-time, no degree.
  C("retail", "Retail", ["Sales Associate", "Department Lead", "Store Manager", "Regional Manager"], [28000, 34000, 52000, 78000], "high", 20, "freshmart", "cashier", "From the shop floor to running the region."),
  C("mechanic", "Mechanic", ["Apprentice Mechanic", "Mechanic", "Master Mechanic", "Garage Owner"], [26000, 42000, 58000, 85000], "high", 25, "garage", "office", "Engines, brakes and a lot of grease."),
  C("police", "Police", ["Constable", "Senior Constable", "Sergeant", "Inspector", "Commissioner"], [52000, 62000, 76000, 98000, 160000], "high", 35, "police", "office", "Keep Harbour City safe. Shifts out of the Harbour St station."),
  C("firefighter", "Firefighter", ["Firefighter", "Senior Firefighter", "Station Officer", "Fire Chief"], [50000, 61000, 78000, 130000], "high", 30, "fire", "office", "Run toward the smoke."),
  C("chef", "Chef", ["Line Cook", "Sous Chef", "Head Chef", "Executive Chef"], [30000, 45000, 68000, 110000], "high", 25, "pizza", "office", "Heat, knives and Saturday-night rushes."),
  C("musician", "Musician", ["Busker", "Session Musician", "Touring Artist", "Headliner", "Superstar"], [9000, 30000, 70000, 250000, 2000000], "none", 10, "studio", "office", "Talent helps. So do looks and luck.", { minAge: 16 }),
  C("actor", "Actor", ["Extra", "Bit Player", "Supporting Actor", "Lead Actor", "Movie Star"], [12000, 35000, 90000, 400000, 3000000], "none", 10, "studio", "office", "Auditions, callbacks, red carpets.", { minAge: 16 }),
  // Degrees.
  C("teacher", "Teacher", ["Graduate Teacher", "Teacher", "Head of Department", "Principal"], [62000, 74000, 90000, 140000], "education", 55, "school", "office", "Shape the next lot of Harbour City kids."),
  C("nurse", "Nurse", ["Graduate Nurse", "Registered Nurse", "Clinical Nurse", "Nurse Unit Manager"], [64000, 78000, 92000, 120000], "nursing", 55, "hospital", "office", "Long shifts, real difference."),
  C("doctor", "Doctor", ["Resident", "Registrar", "Consultant", "Head of Surgery"], [80000, 120000, 260000, 420000], "medicine", 80, "hospital", "office", "Save lives at Harbour General."),
  C("lawyer", "Lawyer", ["Paralegal", "Associate", "Senior Associate", "Partner"], [60000, 105000, 170000, 420000], "law", 75, "office", "office", "Contracts, courtrooms, billable hours."),
  C("engineer", "Software Engineer", ["Junior Developer", "Developer", "Senior Developer", "Engineering Manager", "CTO"], [75000, 105000, 145000, 210000, 380000], "engineering", 70, "office", "office", "Ship it. Fix it. Ship it again."),
  C("accountant", "Accountant", ["Graduate Accountant", "Accountant", "Senior Accountant", "CFO"], [62000, 80000, 110000, 300000], "business", 60, "office", "office", "Numbers that add up."),
  C("architect", "Architect", ["Graduate Architect", "Architect", "Senior Architect", "Principal Architect"], [65000, 90000, 130000, 240000], "engineering", 70, "office", "office", "Design the houses everyone else builds."),
  C("scientist", "Scientist", ["Research Assistant", "Scientist", "Senior Scientist", "Lab Director"], [60000, 85000, 120000, 190000], "science", 75, "hospital", "office", "Questions, experiments, the occasional breakthrough."),
  C("journalist", "Journalist", ["Cadet Reporter", "Reporter", "Senior Reporter", "Editor"], [48000, 62000, 85000, 140000], "arts", 55, "office", "office", "Chase the story."),
  C("pilot", "Pilot", ["First Officer", "Senior First Officer", "Captain"], [90000, 150000, 280000], "science", 70, "airport", "office", "See the world from 38 000 feet."),
  C("ceo", "Business", ["Management Trainee", "Manager", "Director", "Vice President", "CEO"], [58000, 90000, 160000, 320000, 1200000], "business", 65, "office", "office", "Climb the ladder at Meridian Group."),
];

export const careerById = (id: string) => CAREERS.find((c) => c.id === id);

export const DEGREES: { id: Exclude<Degree, "none" | "high">; name: string; minSmarts: number; cost: number; years: number }[] = [
  { id: "business", name: "Business", minSmarts: 50, cost: 32000, years: 3 },
  { id: "engineering", name: "Engineering", minSmarts: 65, cost: 38000, years: 4 },
  { id: "science", name: "Science", minSmarts: 60, cost: 34000, years: 3 },
  { id: "medicine", name: "Medicine", minSmarts: 82, cost: 70000, years: 6 },
  { id: "law", name: "Law", minSmarts: 72, cost: 52000, years: 5 },
  { id: "nursing", name: "Nursing", minSmarts: 50, cost: 26000, years: 3 },
  { id: "education", name: "Education", minSmarts: 45, cost: 24000, years: 4 },
  { id: "arts", name: "Arts", minSmarts: 35, cost: 26000, years: 3 },
];

/** Cars you can buy (the model kind used in the 3D world). */
export const CARS: { id: string; name: string; price: number; kind: "sedan" | "van" | "suv" | "sports" | "pickup"; color: string }[] = [
  { id: "hatch", name: "Brisa Compact", price: 18000, kind: "sedan", color: "#d4d4d8" },
  { id: "sedan", name: "Norden Aria", price: 32000, kind: "sedan", color: "#1e3a8a" },
  { id: "pickup", name: "Mesa Ranger", price: 46000, kind: "pickup", color: "#7f1d1d" },
  { id: "suv", name: "Halvor Trek", price: 58000, kind: "suv", color: "#111827" },
  { id: "sports", name: "Vanta GT", price: 145000, kind: "sports", color: "#facc15" },
];
