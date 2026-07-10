import { useContext } from "react";
import { SubmissionContext } from "../contexts/SubmissionContext";

export const useSubmissions = () => {
  const context = useContext(SubmissionContext);
  if (context === undefined) {
    throw new Error("useSubmissions must be used within a SubmissionProvider");
  }
  return context;
};
