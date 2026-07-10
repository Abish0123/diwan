import { useContext } from "react";
import { AdmissionsContext } from "../contexts/AdmissionsContext";

export const useAdmissions = () => {
  const context = useContext(AdmissionsContext);
  if (context === undefined) {
    throw new Error('useAdmissions must be used within an AdmissionsProvider');
  }
  return context;
};
