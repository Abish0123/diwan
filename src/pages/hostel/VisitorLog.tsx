import { useState, useEffect, useMemo } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, LogOut, Search, UserCheck2, Clock } from "lucide-react";
import { toast } from "sonner";
import { smartDb } from "@/lib/localDb";
import { useAuth } from "@/hooks/useAuth";

interface HostelVisitor {
  id: string;
  visitorName: string;
  relationship: string;
  studentName: string;
  studentId: string;
  purpose: string;
  phone?: string;
  checkInAt: string;
  checkOutAt?: string;
  createdAt?: string;
}

// Real visitor log for the hostel — did not exist at all before (only the
// general campus Visitors page under Security existed). Tracks who visits
// which boarder, when they arrived and left — real smartDb CRUD, same
// check-in/check-out timestamp pattern as security/Visitors.tsx.
export default function HostelVisitorLog() {
  const { user } = useAuth();
  const [visitors, setVisitors] = useState<HostelVisitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [logOpen, setLogOpen] = useState(false);
  const [form, setForm] = useState({ visitorName: "", relationship: "", studentName: "", studentId: "", purpose: "", phone: "" });

  const load = async () => {
    setLoading(true);
    try {
      const data = await smartDb.getAll("HostelVisitor", undefined);
      setVisitors((data as HostelVisitor[]).sort((a, b) => (b.checkInAt || "").localeCompare(a.checkInAt || "")));
    } catch (error) {
      console.error("Failed to load hostel visitor log:", error);
      toast.error("Failed to load visitor log");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleLogVisitor = async () => {
    if (!form.visitorName.trim() || !form.studentName.trim()) {
      toast.error("Visitor name and student being visited are required");
      return;
    }
    const now = new Date().toISOString();
    const id = `HVIS-${Date.now()}`;
    try {
      await smartDb.create("HostelVisitor", {
        id, visitorName: form.visitorName.trim(), relationship: form.relationship.trim() || "—",
        studentName: form.studentName.trim(), studentId: form.studentId.trim(),
        purpose: form.purpose.trim() || "Visit", phone: form.phone.trim(),
        checkInAt: now, uid: user?.uid, createdAt: now,
      }, id);
      toast.success(`${form.visitorName} checked in to visit ${form.studentName}`);
      setForm({ visitorName: "", relationship: "", studentName: "", studentId: "", purpose: "", phone: "" });
      setLogOpen(false);
      load();
    } catch (error) {
      console.error("Failed to log visitor:", error);
      toast.error("Failed to log visitor");
    }
  };

  const handleCheckOut = async (visitor: HostelVisitor) => {
    try {
      await smartDb.update("HostelVisitor", visitor.id, { checkOutAt: new Date().toISOString() });
      toast.success(`${visitor.visitorName} checked out`);
      load();
    } catch (error) {
      console.error("Failed to check out visitor:", error);
      toast.error("Failed to check out visitor");
    }
  };

  const filtered = useMemo(
    () => visitors.filter((v) =>
      !search ||
      v.visitorName.toLowerCase().includes(search.toLowerCase()) ||
      v.studentName.toLowerCase().includes(search.toLowerCase())
    ),
    [visitors, search]
  );

  const currentlyIn = visitors.filter((v) => !v.checkOutAt).length;

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <UserCheck2 className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Hostel Visitor Log</h1>
              <p className="text-sm text-slate-400">
                {currentlyIn} visitor{currentlyIn === 1 ? "" : "s"} currently on premises
              </p>
            </div>
          </div>
          <Button onClick={() => setLogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Log Visitor
          </Button>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-base">Visitor Records</CardTitle>
              <div className="relative w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search visitor or student…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-9" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <p className="text-sm text-muted-foreground text-center py-10">Loading…</p>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-10">No visitors logged yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Visitor</TableHead>
                    <TableHead>Relationship</TableHead>
                    <TableHead>Visiting</TableHead>
                    <TableHead>Purpose</TableHead>
                    <TableHead>Check-In</TableHead>
                    <TableHead>Check-Out</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((v) => (
                    <TableRow key={v.id}>
                      <TableCell className="font-medium">{v.visitorName}{v.phone ? <span className="block text-xs text-muted-foreground">{v.phone}</span> : null}</TableCell>
                      <TableCell>{v.relationship}</TableCell>
                      <TableCell>{v.studentName}</TableCell>
                      <TableCell>{v.purpose}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(v.checkInAt).toLocaleString()}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{v.checkOutAt ? new Date(v.checkOutAt).toLocaleString() : "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={v.checkOutAt ? "border-slate-300 text-slate-500" : "border-emerald-500 text-emerald-600"}>
                          {v.checkOutAt ? "Checked Out" : "On Premises"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {!v.checkOutAt && (
                          <Button size="sm" variant="outline" onClick={() => handleCheckOut(v)}>
                            <LogOut className="h-3.5 w-3.5 mr-1.5" /> Check Out
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={logOpen} onOpenChange={setLogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Clock className="h-5 w-5 text-purple-600" /> Log Visitor Check-In</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Visitor Name *</Label>
                <Input value={form.visitorName} onChange={(e) => setForm({ ...form, visitorName: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Relationship</Label>
                <Input value={form.relationship} onChange={(e) => setForm({ ...form, relationship: e.target.value })} placeholder="Parent, Guardian…" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Visiting Student *</Label>
                <Input value={form.studentName} onChange={(e) => setForm({ ...form, studentName: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Student ID</Label>
                <Input value={form.studentId} onChange={(e) => setForm({ ...form, studentId: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Purpose</Label>
              <Input value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} placeholder="Visit, drop-off, pickup…" />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLogOpen(false)}>Cancel</Button>
            <Button onClick={handleLogVisitor}>Check In</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
