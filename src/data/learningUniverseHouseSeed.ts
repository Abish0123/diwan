import type { House } from "@/types/learningUniverse";

// Four within-school houses, seeded once per school (uid) the first time
// House comes back empty. Students are auto-assigned to whichever has the
// fewest members (see assignHouseIfMissing in LearningUniverseContext).
export const LEARNING_UNIVERSE_HOUSE_SEED: Omit<House, "id" | "uid">[] = [
  { name: "Phoenix", colorHex: "#f97316", icon: "Flame" },
  { name: "Falcon", colorHex: "#3b82f6", icon: "Feather" },
  { name: "Griffin", colorHex: "#10b981", icon: "Shield" },
  { name: "Dragon", colorHex: "#a855f7", icon: "Sparkles" },
];
