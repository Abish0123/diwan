import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Building2, Users, TrendingUp, DollarSign, CheckCircle2, Plus, Eye, Edit2, Send } from "lucide-react";
import { smartDb } from "@/lib/localDb";
import { useAuth } from "@/hooks/useAuth";
import { useBranch } from "@/contexts/BranchContext";

const roleAccess = [
  { role: "Principal", access: "Full Access", modules: ["Academic", "Finance", "HR", "Analytics", "Settings"] },
  { role: "Finance Manager", access: "Finance Only", modules: ["Finance", "Billing", "Payroll"] },
  { role: "Teacher", access: "Academic Only", modules: ["Classes", "Assignments", "Grades", "Attendance"] },
  { role: "Parent", access: "Portal Only", modules: ["Student Portal", "Fees", "Timetable"] },
];

const enrolmentMonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];

export default function BranchManagement() {
  const { user } = useAuth();
  const uid = user?.uid;
  const { activeBranchId, setActiveBranchId } = useBranch();

  const [branches, setBranches] = useState<any[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<any>(null);
  const [addBranchOpen, setAddBranchOpen] = useState(false);
  const [newBranch, setNewBranch] = useState({ name: '', location: '', principal: '', phone: '' });
  const [editBranch, setEditBranch] = useState<any>(null);
  const [editForm, setEditForm] = useState({ name: '', city: '', principal: '', contact: '' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // No fake seed: an empty result honestly means no branches exist yet
        // — this used to silently write 6 fabricated campuses (with invented
        // student counts, revenue, and attendance) into the real Branch table
        // the first time it was empty.
        const data = await smartDb.getAll("Branch", uid);
        if (!cancelled) {
          setBranches(data);
          setSelectedBranch(data[0] ?? null);
        }
      } catch (e) {
        console.error("Failed to load branches:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid]);

  // KPIs derived from the live branch list.
  const totalStudents = branches.reduce((s, b) => s + (b.students || 0), 0);
  const totalStaff = branches.reduce((s, b) => s + (b.staff || 0), 0);
  const totalRevenue = branches.reduce((s, b) => s + (Number(String(b.revenue).replace(/,/g, "")) || 0), 0);
  const attendanceVals = branches.filter(b => (b.attendance || 0) > 0).map(b => b.attendance);
  const avgAttendance = attendanceVals.length
    ? attendanceVals.reduce((s, v) => s + v, 0) / attendanceVals.length
    : 0;

  const kpis = [
    { label: "Total Students", value: totalStudents.toLocaleString(), trend: `${branches.length} branches`, up: true, icon: Users, color: "text-purple-600", bg: "bg-blue-50" },
    { label: "Total Staff", value: totalStaff.toLocaleString(), trend: `${branches.length} branches`, up: true, icon: Building2, color: "text-purple-600", bg: "bg-indigo-50" },
    { label: "Monthly Revenue", value: `AED ${totalRevenue.toLocaleString()}`, trend: "across group", up: true, icon: DollarSign, color: "text-emerald-600", bg: "bg-emerald-50" },
    { label: "Avg Attendance", value: `${avgAttendance.toFixed(1)}%`, trend: "active campuses", up: true, icon: TrendingUp, color: "text-amber-600", bg: "bg-amber-50" },
  ];

  const maxEnrolment = Math.max(...(selectedBranch?.enrolment?.filter((v: number) => v > 0) ?? []), 1);

  async function handleAddBranch() {
    if (!newBranch.name || !newBranch.location || !newBranch.principal || !newBranch.phone) {
      toast.error("Please fill in all fields");
      return;
    }
    try {
      const id = `BR-${String(Date.now()).slice(-6)}`;
      const record = {
        id,
        name: newBranch.name,
        city: newBranch.location,
        students: 0,
        staff: 0,
        revenue: "0",
        attendance: 0,
        status: "Active",
        principal: newBranch.principal,
        contact: newBranch.phone,
        enrolment: [0, 0, 0, 0, 0, 0],
      };
      const created = await smartDb.create(
        "Branch",
        { ...record, uid, createdAt: new Date().toISOString() },
        id
      );
      setBranches(prev => [...prev, created]);
      toast.success(`Branch "${newBranch.name}" added successfully`);
      setNewBranch({ name: '', location: '', principal: '', phone: '' });
      setAddBranchOpen(false);
    } catch (e) {
      console.error("Failed to add branch:", e);
      toast.error("Failed to add branch");
    }
  }

  function openEditBranch(branch: any) {
    setEditForm({
      name: branch.name ?? "",
      city: branch.city ?? "",
      principal: branch.principal ?? "",
      contact: branch.contact ?? "",
    });
    setEditBranch(branch);
  }

  async function handleEditBranch() {
    if (!editBranch) return;
    if (!editForm.name || !editForm.city) {
      toast.error("Branch name and city are required");
      return;
    }
    try {
      await smartDb.update("Branch", editBranch.id, { ...editForm });
      setBranches(prev => prev.map(b => b.id === editBranch.id ? { ...b, ...editForm } : b));
      setSelectedBranch((prev: any) => prev && prev.id === editBranch.id ? { ...prev, ...editForm } : prev);
      toast.success("Branch updated successfully");
      setEditBranch(null);
    } catch (e) {
      console.error("Failed to update branch:", e);
      toast.error("Failed to update branch");
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <Building2 className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Branch Management</h1>
              <p className="text-sm text-slate-400">Manage all campuses across your school group</p>
            </div>
          </div>
          <Button
            onClick={() => setAddBranchOpen(true)}
            className="flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Branch
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          {branches.map((branch) => (
            <button
              key={branch.id}
              onClick={() => setSelectedBranch(branch)}
              className={`px-4 py-2 rounded-full text-sm font-medium border transition-all ${
                selectedBranch?.id === branch.id
                  ? "bg-purple-600 text-white border-purple-600 shadow-sm"
                  : "bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-purple-600"
              }`}
            >
              {branch.name}
              {branch.students > 0 && (
                <span className={`ml-2 text-xs ${selectedBranch?.id === branch.id ? "text-blue-100" : "text-gray-400"}`}>
                  {branch.students.toLocaleString()}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {kpis.map((kpi) => (
            <Card key={kpi.label}>
              <CardContent className="pt-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">{kpi.label}</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">{kpi.value}</p>
                    <p className={`text-xs mt-1 font-medium ${kpi.up ? "text-emerald-600" : "text-rose-600"}`}>
                      {kpi.up ? "▲" : "▼"} {kpi.trend}
                    </p>
                  </div>
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${kpi.bg}`}>
                    <kpi.icon className={`w-5 h-5 ${kpi.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Branch Comparison</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Branch Name</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead>Students</TableHead>
                  <TableHead>Staff</TableHead>
                  <TableHead>Revenue (AED)</TableHead>
                  <TableHead>Attendance %</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {branches.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">
                      No branches yet — click "Add Branch" to create your first campus.
                    </TableCell>
                  </TableRow>
                )}
                {branches.map((branch) => (
                  <TableRow key={branch.id} className="cursor-pointer hover:bg-gray-50" onClick={() => setSelectedBranch(branch)}>
                    <TableCell className="font-medium">{branch.name}</TableCell>
                    <TableCell>{branch.city}</TableCell>
                    <TableCell>{branch.students > 0 ? branch.students.toLocaleString() : "—"}</TableCell>
                    <TableCell>{branch.staff}</TableCell>
                    <TableCell>{branch.revenue !== "0" ? branch.revenue : "—"}</TableCell>
                    <TableCell>{branch.attendance > 0 ? `${branch.attendance}%` : "—"}</TableCell>
                    <TableCell>
                      <Badge variant={branch.status === "Active" ? "default" : "secondary"} className={branch.status === "Active" ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100" : ""}>
                        {branch.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={(e) => { e.stopPropagation(); toast.info(`Viewing ${branch.name}`); }}>
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={(e) => { e.stopPropagation(); openEditBranch(branch); }}>
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {selectedBranch && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                    <Building2 className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <CardTitle className="text-base font-semibold">{selectedBranch.name}</CardTitle>
                    <p className="text-sm text-gray-500">{selectedBranch.city}</p>
                  </div>
                </div>
                {/* Scopes Students (and future branch-aware modules) to just this
                    campus everywhere in the app — see BranchContext. Only shown
                    when there's more than one branch to actually isolate between. */}
                {branches.length > 1 && (
                  activeBranchId === selectedBranch.id ? (
                    <Button size="sm" variant="secondary" onClick={() => setActiveBranchId(null)}>
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1.5 text-emerald-600" /> Active Branch
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => setActiveBranchId(selectedBranch.id)}>
                      Set as Active Branch
                    </Button>
                  )
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Students", value: selectedBranch.students > 0 ? selectedBranch.students.toLocaleString() : "N/A", icon: Users, color: "text-purple-600", bg: "bg-blue-50" },
                  { label: "Staff", value: selectedBranch.staff, icon: Users, color: "text-purple-600", bg: "bg-indigo-50" },
                  { label: "Revenue (AED)", value: selectedBranch.revenue !== "0" ? selectedBranch.revenue : "N/A", icon: DollarSign, color: "text-emerald-600", bg: "bg-emerald-50" },
                  { label: "Attendance", value: selectedBranch.attendance > 0 ? `${selectedBranch.attendance}%` : "N/A", icon: CheckCircle2, color: "text-amber-600", bg: "bg-amber-50" },
                ].map((stat) => (
                  <div key={stat.label} className={`rounded-xl p-3 ${stat.bg}`}>
                    <stat.icon className={`w-4 h-4 ${stat.color} mb-1`} />
                    <p className="text-xs text-gray-500">{stat.label}</p>
                    <p className="text-lg font-bold text-gray-900">{stat.value}</p>
                  </div>
                ))}
              </div>

              {selectedBranch.students > 0 && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-3">6-Month Enrolment Trend</p>
                  <div className="flex items-end gap-2 h-28">
                    {selectedBranch.enrolment.map((val, idx) => (
                      <div key={idx} className="flex-1 flex flex-col items-center gap-1">
                        <div
                          className="w-full rounded-t-md bg-blue-500 transition-all"
                          style={{ height: `${(val / maxEnrolment) * 88}px` }}
                        />
                        <span className="text-xs text-gray-400">{enrolmentMonths[idx]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="border-t pt-4">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Principal</p>
                <p className="text-sm font-semibold text-gray-900">{selectedBranch.principal}</p>
                <p className="text-xs text-purple-600">{selectedBranch.contact}</p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" className="flex items-center gap-1.5" onClick={() => toast.success(`Announcement sent to ${selectedBranch.name}`)}>
                  <Send className="w-3.5 h-3.5" />
                  Send Announcement
                </Button>
                <Button size="sm" variant="outline" className="flex items-center gap-1.5" onClick={() => toast.info(`Navigating to students of ${selectedBranch.name}`)}>
                  <Users className="w-3.5 h-3.5" />
                  View Students
                </Button>
                <Button size="sm" variant="outline" className="flex items-center gap-1.5" onClick={() => toast.info(`Navigating to finance of ${selectedBranch.name}`)}>
                  <DollarSign className="w-3.5 h-3.5" />
                  View Finance
                </Button>
              </div>
            </CardContent>
          </Card>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Role-Based Access per Branch</CardTitle>
              <p className="text-sm text-gray-500">Module permissions by role across all campuses</p>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Role</TableHead>
                    <TableHead>Access Level</TableHead>
                    <TableHead>Modules</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {roleAccess.map((row) => (
                    <TableRow key={row.role}>
                      <TableCell className="font-medium text-sm">{row.role}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            row.access === "Full Access"
                              ? "border-emerald-300 text-emerald-700 bg-emerald-50"
                              : row.access === "Finance Only"
                              ? "border-amber-300 text-amber-700 bg-amber-50"
                              : row.access === "Academic Only"
                              ? "border-blue-300 text-blue-700 bg-blue-50"
                              : "border-gray-300 text-gray-700 bg-gray-50"
                          }
                        >
                          {row.access}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {row.modules.map((mod) => (
                            <span key={mod} className="text-xs bg-gray-100 text-gray-600 rounded px-1.5 py-0.5">
                              {mod}
                            </span>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>
      <Dialog open={addBranchOpen} onOpenChange={setAddBranchOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Add New Branch</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="branch-name">Branch Name</Label>
              <Input
                id="branch-name"
                placeholder="e.g. Mirdif Campus"
                value={newBranch.name}
                onChange={(e) => setNewBranch(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="branch-location">Location / City</Label>
              <Input
                id="branch-location"
                placeholder="e.g. Dubai"
                value={newBranch.location}
                onChange={(e) => setNewBranch(prev => ({ ...prev, location: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="branch-principal">Principal Name</Label>
              <Input
                id="branch-principal"
                placeholder="e.g. Dr. Ahmed Al-Mansoori"
                value={newBranch.principal}
                onChange={(e) => setNewBranch(prev => ({ ...prev, principal: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="branch-phone">Phone Number</Label>
              <Input
                id="branch-phone"
                placeholder="e.g. +971 4 123 4567"
                value={newBranch.phone}
                onChange={(e) => setNewBranch(prev => ({ ...prev, phone: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddBranchOpen(false)}>Cancel</Button>
            <Button onClick={handleAddBranch}>
              Add Branch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editBranch} onOpenChange={() => setEditBranch(null)}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Edit Branch</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="edit-branch-name">Branch Name</Label>
              <Input
                id="edit-branch-name"
                value={editForm.name}
                onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-branch-city">Location / City</Label>
              <Input
                id="edit-branch-city"
                value={editForm.city}
                onChange={(e) => setEditForm(prev => ({ ...prev, city: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-branch-principal">Principal Name</Label>
              <Input
                id="edit-branch-principal"
                value={editForm.principal}
                onChange={(e) => setEditForm(prev => ({ ...prev, principal: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-branch-contact">Contact</Label>
              <Input
                id="edit-branch-contact"
                value={editForm.contact}
                onChange={(e) => setEditForm(prev => ({ ...prev, contact: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditBranch(null)}>Cancel</Button>
            <Button onClick={handleEditBranch}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
