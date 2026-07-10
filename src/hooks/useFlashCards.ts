import { useContext } from "react";
import { FlashCardContext } from "../contexts/FlashCardContextDefinition";

export const useFlashCards = () => {
  const context = useContext(FlashCardContext);
  if (context === undefined) {
    throw new Error('useFlashCards must be used within a FlashCardProvider');
  }
  return context;
};
