// Thin Asset-specific wrapper around the generic MaintenanceLogDialog (see
// src/components/shared/MaintenanceLogDialog.tsx) — kept as its own file so
// Assets.tsx's existing <AssetMaintenanceDialog asset={...} /> usage never
// had to change when Transport Vehicles started reusing the same
// underlying MaintenanceLog history UI.
import { MaintenanceLogDialog } from "@/components/shared/MaintenanceLogDialog";
import { Asset } from "@/types/finance";

interface Props {
  asset: Asset | null;
  onClose: () => void;
  onChanged: () => void;
}

export function AssetMaintenanceDialog({ asset, onClose, onChanged }: Props) {
  return (
    <MaintenanceLogDialog
      subject={asset ? { id: asset.id, name: asset.name } : null}
      entity="AssetRecord"
      resolvedStatus="Active"
      onClose={onClose}
      onChanged={onChanged}
    />
  );
}
