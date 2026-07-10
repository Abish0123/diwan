import type { ShopItem } from "@/types/learningUniverse";

// Cosmetic-only shop catalogue — seeded once per school (uid) the first time
// the Learning Universe wallet is opened and ShopItem comes back empty. No
// real-money link anywhere: cost is spent in Learning Coins earned from
// missions/olympics only.
export const LEARNING_UNIVERSE_SHOP_SEED: Omit<ShopItem, "id" | "uid">[] = [
  { name: "Bronze Frame", category: "avatar-frame", cost: 20, assetRef: "frame-bronze" },
  { name: "Silver Frame", category: "avatar-frame", cost: 50, assetRef: "frame-silver" },
  { name: "Gold Frame", category: "avatar-frame", cost: 100, assetRef: "frame-gold" },
  { name: "Galaxy Frame", category: "avatar-frame", cost: 180, assetRef: "frame-galaxy" },

  { name: "Rising Star", category: "avatar-badge", cost: 15, assetRef: "badge-star" },
  { name: "Quiz Champion", category: "avatar-badge", cost: 40, assetRef: "badge-trophy" },
  { name: "Streak Master", category: "avatar-badge", cost: 60, assetRef: "badge-flame" },
  { name: "Chapter Conqueror", category: "avatar-badge", cost: 90, assetRef: "badge-crown" },

  { name: "Explorer", category: "title", cost: 10, assetRef: "title-explorer" },
  { name: "Scholar", category: "title", cost: 45, assetRef: "title-scholar" },
  { name: "Mastermind", category: "title", cost: 85, assetRef: "title-mastermind" },
  { name: "Legend", category: "title", cost: 150, assetRef: "title-legend" },

  { name: "Ocean Theme", category: "theme-color", cost: 25, assetRef: "theme-ocean" },
  { name: "Sunset Theme", category: "theme-color", cost: 25, assetRef: "theme-sunset" },
  { name: "Forest Theme", category: "theme-color", cost: 25, assetRef: "theme-forest" },
];
