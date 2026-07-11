// Thin Vehicle-specific wrapper around the generic MaintenanceLogDialog
// (src/components/shared/MaintenanceLogDialog.tsx) — the same real
// MaintenanceLog tracking built for Finance Assets. Previously a vehicle's
// "Maintenance" status was just a label anyone could pick with nothing
// behind it; this gives it a real issue log and a way back to "Available".
import { MaintenanceLogDialog } from "@/components/shared/MaintenanceLogDialog";

interface Vehicle {
  id: string;
  regNumber: string;
}

interface Props {
  vehicle: Vehicle | null;
  onClose: () => void;
  onChanged: () => void;
}

export function VehicleMaintenanceDialog({ vehicle, onClose, onChanged }: Props) {
  return (
    <MaintenanceLogDialog
      subject={vehicle ? { id: vehicle.id, name: vehicle.regNumber } : null}
      entity="TransportVehicle"
      resolvedStatus="Available"
      onClose={onClose}
      onChanged={onChanged}
    />
  );
}
