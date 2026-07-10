import { useState, useEffect, useMemo } from "react";
import * as XLSX from "xlsx";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Edit, Trash2, DoorOpen, Search, Users2, Download } from "lucide-react";
import { toast } from "sonner";
import { smartDb } from "@/lib/localDb";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

export const ROOM_TYPES = [
  "Classroom", "Laboratory", "Computer Lab", "Library", "Staff Room",
  "Principal Office", "Admin Office", "Meeting Room", "Clinic / Sick Room",
  "Auditorium", "Sports Room", "Store Room", "Exam Hall",
] as const;

export type RoomType = typeof ROOM_TYPES[number];

export interface Room {
  id: string;
  roomNo: string;
  roomName: string;
  type: RoomType;
  capacity: number;
  floor: string;
  notes: string;
  status: "Active" | "Inactive";
  uid?: string;
  createdAt?: string;
}

const TYPE_BADGE: Record<string, string> = {
  "Classroom": "bg-violet-100 text-violet-700 border-violet-200",
  "Laboratory": "bg-amber-100 text-amber-700 border-amber-200",
  "Computer Lab": "bg-sky-100 text-sky-700 border-sky-200",
  "Library": "bg-emerald-100 text-emerald-700 border-emerald-200",
  "Staff Room": "bg-orange-100 text-orange-700 border-orange-200",
  "Principal Office": "bg-rose-100 text-rose-700 border-rose-200",
  "Admin Office": "bg-indigo-100 text-indigo-700 border-indigo-200",
  "Meeting Room": "bg-teal-100 text-teal-700 border-teal-200",
  "Clinic / Sick Room": "bg-red-100 text-red-700 border-red-200",
  "Auditorium": "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200",
  "Sports Room": "bg-lime-100 text-lime-700 border-lime-200",
  "Store Room": "bg-slate-100 text-slate-700 border-slate-200",
  "Exam Hall": "bg-blue-100 text-blue-700 border-blue-200",
};

const emptyForm = {
  roomNo: "",
  roomName: "",
  type: "Classroom" as RoomType,
  capacity: 25,
  floor: "",
  notes: "",
  status: "Active" as "Active" | "Inactive",
};

export default function RoomManagement() {
  const { user } = useAuth();
  const uid = user?.uid;

  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState("All Types");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      let data = await smartDb.getAll("Room", uid) as Room[];
      if (!data || data.length === 0) {
        data = await seedStandardRooms();
      }
      setRooms(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Failed to load rooms:", e);
    } finally {
      setLoading(false);
    }
  };

  // First-run only: populate a standard room list (32 classrooms mapped to real
  // Grade+Section classes, plus admin/special-purpose rooms) so the page isn't empty.
  const seedStandardRooms = async (): Promise<Room[]> => {
    let sectionNames: string[] = [];
    try {
      const classes = await fetch("/api/data/classes").then(r => r.json());
      const normGrade = (g: string) => {
        const s = String(g || "").trim();
        const m = s.match(/(\d+)/);
        if (m && /^(grade\s*)?\d+$/i.test(s)) return `Grade ${m[1]}`;
        if (/pre-?kg/i.test(s)) return "Pre-KG";
        if (/^lkg$/i.test(s)) return "LKG";
        if (/^ukg$/i.test(s)) return "UKG";
        return s.startsWith("Grade") ? s : null;
      };
      const sectionFromName = (name: string) => (String(name || "").match(/Section\s+([A-Z])/i)?.[1] || "").toUpperCase();
      const targets = (Array.isArray(classes) ? classes : [])
        .map((c: any) => ({ grade: normGrade(c.grade), section: sectionFromName(c.name) }))
        .filter((t: any) => t.grade && ["A", "B", "C"].includes(t.section));
      const gradeRank = (g: string) => ({ "Pre-KG": 0, LKG: 1, UKG: 2 } as Record<string, number>)[g] ?? 2 + Number((g.match(/\d+/) || ["99"])[0]);
      targets.sort((a: any, b: any) => gradeRank(a.grade) - gradeRank(b.grade) || a.section.localeCompare(b.section));
      sectionNames = targets.slice(0, 32).map((t: any) => `${t.grade} - ${t.section}`);
    } catch { /* fall back to generic names below */ }

    const classroomRows = Array.from({ length: 32 }, (_, i) => ({
      roomNo: String(101 + i),
      roomName: sectionNames[i] || `Classroom ${i + 1}`,
      type: "Classroom" as RoomType,
      capacity: 25,
      floor: i < 16 ? "Ground Floor" : "First Floor",
      notes: "",
      status: "Active" as const,
    }));
    const adminRows = [
      { roomNo: "001", roomName: "Reception", type: "Admin Office" as RoomType, capacity: 10, floor: "Ground Floor", notes: "", status: "Active" as const },
      { roomNo: "002", roomName: "Principal Office", type: "Principal Office" as RoomType, capacity: 5, floor: "Ground Floor", notes: "", status: "Active" as const },
      { roomNo: "003", roomName: "Admin Office", type: "Admin Office" as RoomType, capacity: 10, floor: "Ground Floor", notes: "", status: "Active" as const },
      { roomNo: "004", roomName: "Staff Room", type: "Staff Room" as RoomType, capacity: 30, floor: "Ground Floor", notes: "", status: "Active" as const },
    ];
    const specialRows = [
      { roomNo: "201", roomName: "Library", type: "Library" as RoomType, capacity: 50, floor: "Second Floor", notes: "", status: "Active" as const },
      { roomNo: "202", roomName: "Computer Lab", type: "Computer Lab" as RoomType, capacity: 30, floor: "Second Floor", notes: "", status: "Active" as const },
      { roomNo: "203", roomName: "Science Lab", type: "Laboratory" as RoomType, capacity: 30, floor: "Second Floor", notes: "", status: "Active" as const },
      { roomNo: "204", roomName: "Sick Room / Clinic", type: "Clinic / Sick Room" as RoomType, capacity: 5, floor: "Ground Floor", notes: "", status: "Active" as const },
      { roomNo: "205", roomName: "Store Room", type: "Store Room" as RoomType, capacity: 0, floor: "Ground Floor", notes: "", status: "Active" as const },
    ];

    const all = [...classroomRows, ...adminRows, ...specialRows];
    const created: Room[] = [];
    for (const row of all) {
      const id = `ROOM-${row.roomNo}`;
      const room = await smartDb.create("Room", { id, ...row, uid, createdAt: new Date().toISOString() }, id) as Room;
      created.push(room);
    }
    return created;
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [uid]);

  const filtered = useMemo(() => rooms
    .filter(r => typeFilter === "All Types" || r.type === typeFilter)
    .filter(r => !q ||
      r.roomNo?.toLowerCase().includes(q.toLowerCase()) ||
      r.roomName?.toLowerCase().includes(q.toLowerCase())
    )
    .sort((a, b) => (a.roomNo || "").localeCompare(b.roomNo || "", undefined, { numeric: true })),
    [rooms, q, typeFilter]);

  const totalCapacity = useMemo(() => rooms.reduce((sum, r) => sum + (Number(r.capacity) || 0), 0), [rooms]);

  const openNew = () => { setEditingRoom(null); setForm(emptyForm); setIsModalOpen(true); };
  const openEdit = (r: Room) => {
    setEditingRoom(r);
    setForm({
      roomNo: r.roomNo || "", roomName: r.roomName || "", type: r.type || "Classroom",
      capacity: r.capacity ?? 25, floor: r.floor || "", notes: r.notes || "",
      status: r.status || "Active",
    });
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.roomNo.trim() || !form.roomName.trim()) {
      toast.error("Room No and Room Name are required.");
      return;
    }
    const duplicate = rooms.find(r => r.roomNo.trim().toLowerCase() === form.roomNo.trim().toLowerCase() && r.id !== editingRoom?.id);
    if (duplicate) {
      toast.error(`Room No "${form.roomNo}" is already in use by "${duplicate.roomName}".`);
      return;
    }
    setSaving(true);
    try {
      if (editingRoom) {
        await smartDb.update("Room", editingRoom.id, { ...form });
        setRooms(prev => prev.map(r => r.id === editingRoom.id ? { ...r, ...form } : r));
        toast.success("Room updated.");
      } else {
        const newId = `ROOM-${String(Date.now()).slice(-8)}`;
        const created = await smartDb.create("Room", { id: newId, ...form, uid, createdAt: new Date().toISOString() }, newId) as Room;
        setRooms(prev => [...prev, created]);
        toast.success(`Room "${form.roomName}" added.`);
      }
      setIsModalOpen(false);
    } catch (e) {
      console.error("Failed to save room:", e);
      toast.error("Failed to save room.");
    } finally {
      setSaving(false);
    }
  };

  const handleExport = () => {
    if (filtered.length === 0) {
      toast.error("No rooms to export.");
      return;
    }
    const rows = [
      ["Room No", "Room Name", "Type", "Capacity", "Floor", "Status", "Notes"],
      ...filtered.map(r => [r.roomNo, r.roomName, r.type, r.capacity, r.floor || "", r.status, r.notes || ""]),
    ];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 10 }, { wch: 24 }, { wch: 18 }, { wch: 10 }, { wch: 14 }, { wch: 10 }, { wch: 32 }];
    XLSX.utils.book_append_sheet(wb, ws, "Rooms");
    XLSX.writeFile(wb, `room_management_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success(`Exported ${filtered.length} rooms to Excel.`);
  };

  const handleDelete = async (r: Room) => {
    if (!confirm(`Delete room "${r.roomName}" (${r.roomNo})? This cannot be undone.`)) return;
    try {
      await smartDb.delete("Room", r.id);
      setRooms(prev => prev.filter(x => x.id !== r.id));
      toast.success("Room deleted.");
    } catch (e) {
      toast.error("Failed to delete room.");
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-violet-100 flex items-center justify-center flex-shrink-0">
              <DoorOpen className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Room Management</h1>
              <p className="text-sm text-slate-400">Configure classrooms, labs, offices and facilities used across timetable, exam seating and allocation.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleExport}>
              <Download className="h-4 w-4 mr-1.5" /> Export Excel
            </Button>
            <Button onClick={openNew} className="bg-purple-600 hover:bg-purple-700">
              <Plus className="h-4 w-4 mr-1.5" /> Add Room
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card><CardContent className="pt-6">
            <p className="text-xs font-semibold text-slate-500 uppercase">Total Rooms</p>
            <p className="text-2xl font-black text-slate-900 mt-1">{rooms.length}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-6">
            <p className="text-xs font-semibold text-slate-500 uppercase">Classrooms</p>
            <p className="text-2xl font-black text-slate-900 mt-1">{rooms.filter(r => r.type === "Classroom").length}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-6">
            <p className="text-xs font-semibold text-slate-500 uppercase">Total Capacity</p>
            <p className="text-2xl font-black text-slate-900 mt-1">{totalCapacity}</p>
          </CardContent></Card>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-base">All Rooms</CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search room no / name..." className="pl-8 h-9 w-56" />
              </div>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-[240px] overflow-y-auto">
                  <SelectItem value="All Types">All Types</SelectItem>
                  {ROOM_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-slate-400 py-8 text-center">Loading rooms…</p>
            ) : filtered.length === 0 ? (
              <div className="py-12 text-center">
                <DoorOpen className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                <p className="text-sm text-slate-500">{rooms.length === 0 ? "No rooms configured yet. Add your first room to get started." : "No rooms match your search."}</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Room No</TableHead>
                    <TableHead>Room Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Capacity</TableHead>
                    <TableHead>Floor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="font-semibold">{r.roomNo}</TableCell>
                      <TableCell>{r.roomName}</TableCell>
                      <TableCell>
                        <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-md border", TYPE_BADGE[r.type] || "bg-slate-100 text-slate-600 border-slate-200")}>
                          {r.type}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1 text-sm text-slate-600">
                          <Users2 className="h-3.5 w-3.5 text-slate-400" /> {r.capacity}
                        </span>
                      </TableCell>
                      <TableCell className="text-slate-500">{r.floor || "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={r.status === "Active" ? "border-emerald-200 text-emerald-700 bg-emerald-50" : "border-slate-200 text-slate-500 bg-slate-50"}>
                          {r.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(r)}>
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-600" onClick={() => handleDelete(r)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingRoom ? "Edit Room" : "Add Room"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Room No *</Label>
                <Input value={form.roomNo} onChange={e => setForm(f => ({ ...f, roomNo: e.target.value }))} placeholder="e.g. 101" />
              </div>
              <div className="space-y-1.5">
                <Label>Floor</Label>
                <Input value={form.floor} onChange={e => setForm(f => ({ ...f, floor: e.target.value }))} placeholder="e.g. Ground Floor" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Room Name *</Label>
              <Input value={form.roomName} onChange={e => setForm(f => ({ ...f, roomName: e.target.value }))} placeholder="e.g. Grade 1-A" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v as RoomType }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-[240px] overflow-y-auto">
                    {ROOM_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Capacity</Label>
                <Input type="number" min={1} value={form.capacity} onChange={e => setForm(f => ({ ...f, capacity: Number(e.target.value) || 0 }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v as "Active" | "Inactive" }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional — equipment, AC, projector, etc." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-purple-600 hover:bg-purple-700">
              {saving ? "Saving…" : editingRoom ? "Save Changes" : "Add Room"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
