/** "What's new" on the home page: the latest updates, newest first. Add a line when something ships. */
export interface Update {
  tag: string;
  title: string;
  body: string;
  href: string;
}

export const UPDATES: Update[] = [
  { tag: "Update", title: "Lifeline: Quick rooms and the emergency department", body: "24 ready-made rooms you place in one click, triage and ambulance bays, an incoming radio that shows every ambulance and helicopter before it arrives, and emergencies: Code Blues, major incidents and fires.", href: "/games/lifeline" },
  { tag: "Mega update", title: "Lifeline: the mega update", body: "Research, six new departments (ICU, maternity, psychiatry, MRI, a lab and a helipad), air ambulances, eight new conditions, machines that break down, staff who level up, a five-scenario campaign with medals and weekly awards.", href: "/games/lifeline" },
  { tag: "New game", title: "Lifeline", body: "Build a hospital in 3D: foundations, walls and rooms built by your workmen, doctors and nurses to hire, and patients with real conditions to diagnose, treat and send home. Lives saved is your score.", href: "/games/lifeline" },
  { tag: "ZLink+", title: "Zero City: Mayor mode", body: "Run Zero City as its mayor: a real budget and taxes, five groups of voters, a council that votes on your policies, dilemmas, promises and an election every term. Plus a new liquid-glass interface.", href: "/games/zero-city" },
  { tag: "ZLink+", title: "Zero City", body: "A new members-only city builder: ten maps, roads in eight draw modes with bridges and roundabouts, four kinds of zone, and a living low-poly city of cars, buses and people. Eight languages.", href: "/games/zero-city" },
  { tag: "New app", title: "Cash Cup", body: "Neon Siege tournaments for ZX Cash: 55 fighters on a map four times the size, 250 for the win and 3 per elimination. 10 to enter; the battle pass gives two free entries.", href: "/cash-cup" },
  { tag: "Mega update", title: "Coins are now ZX Cash", body: "A fresh start for everyone: balances, ZLink+, the battle pass, unlocks, XP and game saves are back to zero. Earn ZX Cash from daily rewards, the free lane and Cash Cups.", href: "/shop" },
  { tag: "ZLink+", title: "Zenith: build a city", body: "The ZLink+ flagship: a photoreal city builder. Roads, zones, power, water and services; a skyline that lights up at night, from Hamlet to Metropolis.", href: "/games/zenith" },
  { tag: "ZLink+", title: "Linkwave and more", body: "A members-only game, +25% XP, a weekly ZX Cash drop and link levels from Bronze to Neon. Neon Siege stays separate.", href: "/zlink" },
  { tag: "New", title: "ZLink+ is here", body: "One link, every plus: all of Sports+, UBusiness Ultimate and double daily ZX Cash for 40 ZX Cash a month. (Neon Siege stays separate.)", href: "/zlink" },
  { tag: "Site", title: "A whole new look", body: "Arcade noir: a drifting aurora, a synthwave hero, cards that tilt toward you, a game ticker and a glass navbar, in both themes.", href: "/" },
  { tag: "UBusiness", title: "Families, foodies and a food critic", body: "Six kinds of shopper, staff who get better (and training to five stars), a coffee bar, bulk deals, late-night opening, a price promise and the week in review.", href: "/games/ubusiness" },
  { tag: "UBusiness", title: "The big expansion + free Ultimate", body: "Bakery and frozen departments, specials, store upgrades, loans, trophies, reviews, shoplifters and a rival store. Ultimate is free to claim until 31 October.", href: "/games/ubusiness" },
  { tag: "Site", title: "A fresh new look", body: "A spotlight on the front page, Browse by vibe collections, and search everything with Ctrl+K.", href: "/" },
  { tag: "New game", title: "UBusiness", body: "Run your own store in photoreal 3D: stock the shelves, set the prices, work the till. Lite 5 ZX Cash, Ultimate 30, or free with the battle pass.", href: "/games/ubusiness" },
  { tag: "Hometown", title: "100 new things to build", body: "Furniture, Decor and Outdoor: king beds, arcade cabinets, pool tables, aquariums, fireplaces, gazebos, trampolines, fountains, trees and fences.", href: "/games/hometown" },
  { tag: "Hometown", title: "Townsfolk and servers", body: "Twelve townsfolk walk the streets, chat and keep the market trading while you're away. Pick your server from the menu: two more are on the way.", href: "/games/hometown" },
  { tag: "Mega update", title: "Daily rewards", body: "ZX Cash every day you come back, 50 on day 7.", href: "/" },
  { tag: "Hometown", title: "The Town Bank", body: "Save your cash for interest, claim the daily allowance, wave and cheer at your neighbours, find your way with the minimap.", href: "/games/hometown" },
  { tag: "Life", title: "Invest, adopt, go viral", body: "Shares and property that rise and fall, pets that love you back, fame on social media and holidays around the world.", href: "/games/life" },
  { tag: "Neon Siege", title: "New guns", body: "The Marksman Rifle and the Light Machine Gun now drop from floor loot and chests.", href: "/games/neon-siege" },
  { tag: "Trenches", title: "Belleau Wood", body: "A seventh front: summer wheat fields, a dense wood and a ruined lodge. Win there for the Belleau Oak Leaf.", href: "/games/trenches" },
  { tag: "Screamer", title: "Coach mode and Grand Final day", body: "Run a club from the box, roll premierships into a dynasty, and lift the cup to fireworks.", href: "/games/aussie-rules" },
];
