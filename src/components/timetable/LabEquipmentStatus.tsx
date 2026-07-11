// Real Lab Equipment availability check — shown when a Timetable slot's
// room is a lab, pulling live InventoryItem stock (category "Lab
// Equipment") instead of the timetable having no equipment awareness at
// all. Timetable now sources its room list from the real Room entity
// (settings/RoomManagement.tsx), so `roomType` (Room.type, e.g.
// "Laboratory"/"Computer Lab") is the authoritative check when available;
// the room-name regex is only a fallback for rooms with no resolved type
// (e.g. old timetable data referencing a room that's since been renamed
// or removed from Room Management).
import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { smartDb } from "@/lib/localDb";

interface LabItem {
  name: string;
  stock: number;
  status: string;
}

const LAB_ROOM_TYPES = new Set(["Laboratory", "Computer Lab"]);

export function LabEquipmentStatus({ room, roomType }: { room: string; roomType?: string }) {
  const isLab = roomType ? LAB_ROOM_TYPES.has(roomType) : /\blab\b/i.test(room);
  const [items, setItems] = useState<LabItem[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isLab) return;
    let active = true;
    setLoading(true);
    smartDb.getAll("InventoryItem", undefined)
      .then((rows) => {
        if (!active) return;
        setItems((rows as { name: string; category: string; stock: number; status: string }[])
          .filter((r) => r.category === "Lab Equipment")
          .map((r) => ({ name: r.name, stock: r.stock, status: r.status })));
      })
      .catch(() => { if (active) setItems([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [isLab]);

  if (!isLab) return null;

  if (loading) {
    return (
      <p className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-1">
        <Loader2 className="h-3 w-3 animate-spin" /> Checking lab equipment stock…
      </p>
    );
  }

  if (!items || items.length === 0) {
    return (
      <p className="text-[11px] text-amber-600 flex items-center gap-1.5 mt-1">
        <AlertTriangle className="h-3 w-3 flex-shrink-0" /> No Lab Equipment items tracked in Inventory yet.
      </p>
    );
  }

  const outOfStock = items.filter((i) => i.status === "Out of Stock");
  const lowStock = items.filter((i) => i.status === "Low Stock");

  if (outOfStock.length > 0) {
    return (
      <p className="text-[11px] text-rose-600 flex items-start gap-1.5 mt-1">
        <AlertTriangle className="h-3 w-3 flex-shrink-0 mt-0.5" />
        <span>{outOfStock.length} lab item{outOfStock.length === 1 ? "" : "s"} out of stock: {outOfStock.map((i) => i.name).join(", ")}</span>
      </p>
    );
  }
  if (lowStock.length > 0) {
    return (
      <p className="text-[11px] text-amber-600 flex items-start gap-1.5 mt-1">
        <AlertTriangle className="h-3 w-3 flex-shrink-0 mt-0.5" />
        <span>{lowStock.length} lab item{lowStock.length === 1 ? "" : "s"} running low: {lowStock.map((i) => i.name).join(", ")}</span>
      </p>
    );
  }
  return (
    <p className="text-[11px] text-emerald-600 flex items-center gap-1.5 mt-1">
      <CheckCircle2 className="h-3 w-3 flex-shrink-0" /> All {items.length} Lab Equipment item{items.length === 1 ? "" : "s"} in stock.
    </p>
  );
}
