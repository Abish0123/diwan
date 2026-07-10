import { useContext } from "react";
import { ClassContext } from "../contexts/ClassContext";

export const useClasses = () => {
  const context = useContext(ClassContext);
  if (context === undefined) {
    throw new Error("useClasses must be used within a ClassProvider");
  }
  return context;
};
