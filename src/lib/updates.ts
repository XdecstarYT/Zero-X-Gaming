/** "What's new" on the home page: the latest updates, newest first. Add a line when something ships. */
export interface Update {
  tag: string;
  title: string;
  body: string;
  href: string;
}

export const UPDATES: Update[] = [
  { tag: "Hometown", title: "100 new things to build", body: "Furniture, Decor and Outdoor: king beds, arcade cabinets, pool tables, aquariums, fireplaces, gazebos, trampolines, fountains, trees and fences.", href: "/games/hometown" },
  { tag: "Hometown", title: "Townsfolk and servers", body: "Twelve townsfolk walk the streets, chat and keep the market trading while you're away. Pick your server from the menu: two more are on the way.", href: "/games/hometown" },
  { tag: "Mega update", title: "Daily rewards", body: "Coins every day you come back, 50 on day 7.", href: "/" },
  { tag: "Hometown", title: "The Town Bank", body: "Save your cash for interest, claim the daily allowance, wave and cheer at your neighbours, find your way with the minimap.", href: "/games/hometown" },
  { tag: "Life", title: "Invest, adopt, go viral", body: "Shares and property that rise and fall, pets that love you back, fame on social media and holidays around the world.", href: "/games/life" },
  { tag: "Neon Siege", title: "New guns", body: "The Marksman Rifle and the Light Machine Gun now drop from floor loot and chests.", href: "/games/neon-siege" },
  { tag: "Trenches", title: "Belleau Wood", body: "A seventh front: summer wheat fields, a dense wood and a ruined lodge. Win there for the Belleau Oak Leaf.", href: "/games/trenches" },
  { tag: "Screamer", title: "Coach mode and Grand Final day", body: "Run a club from the box, roll premierships into a dynasty, and lift the cup to fireworks.", href: "/games/aussie-rules" },
];
