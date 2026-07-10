import { useContext } from "react";
import { LearningUniverseContext } from "@/contexts/LearningUniverseContextDefinition";

export const useLearningUniverse = () => {
  const context = useContext(LearningUniverseContext);
  if (context === undefined) {
    throw new Error("useLearningUniverse must be used within a LearningUniverseProvider");
  }
  return context;
};
