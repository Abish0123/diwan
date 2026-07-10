import { useContext } from "react";
import { AssignmentContext } from "@/contexts/AssignmentContext";

export const useAssignments = () => {
  const context = useContext(AssignmentContext);
  if (context === undefined) {
    throw new Error("useAssignments must be used within an AssignmentProvider");
  }
  return context;
};
