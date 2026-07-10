import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import {
  Plus,
  Shield,
  Lock,
  Users,
  Edit,
  Trash2,
  CheckCircle2,
  XCircle
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { smartDb } from "@/lib/localDb";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { isCentralAdmin } from "@/lib/roles";

const seedRoles = [
  {
    id: "ROL-001",
    name: "Super Admin",
    description: "Full access to all modules and settings.",
    users: 2,
    status: "Active",
    builtIn: true,
    permissions: ["manage_students", "manage_staff", "view_reports", "manage_finance", "settings_access"]
  },
  {
    id: "ROL-002",
    name: "Principal",
    description: "Academic and administrative oversight.",
    users: 1,
    status: "Active",
    builtIn: true,
    permissions: ["manage_students", "manage_staff", "view_reports", "settings_access"]
  },
  {
    id: "ROL-003",
    name: "Teacher",
    description: "Access to classes, students, and grading.",
    users: 45,
    status: "Active",
    builtIn: true,
    permissions: ["manage_students", "view_reports"]
  },
  {
    id: "ROL-004",
    name: "Accountant",
    description: "Access to finance and payroll modules.",
    users: 3,
    status: "Active",
    builtIn: true,
    permissions: ["manage_finance", "view_reports"]
  }
];

const PERMISSION_OPTIONS = [
  { id: "manage_students", label: "Manage Students" },
  { id: "manage_staff", label: "Manage Staff" },
  { id: "view_reports", label: "View Reports" },
  { id: "manage_finance", label: "Manage Finance" },
  { id: "settings_access", label: "Settings Access" },
];

type Role = {
  id: string;
  name: string;
  description: string;
  users: number;
  status: string;
  builtIn?: boolean;
  permissions: string[];
};

const Permissions = () => {
  const { user, role } = useAuth();
  const uid = user?.uid;
  const navigate = useNavigate();

  // Centralized console — admin-tier only.
  const allowed = isCentralAdmin(role);

  useEffect(() => {
    if (!allowed) {
      toast.error("Access denied — Permissions management is admin-only");
      navigate("/");
    }
  }, [allowed, navigate]);

  const [roles, setRoles] = useState<Role[]>([]);
  const [createRoleOpen, setCreateRoleOpen] = useState(false);
  const [editRole, setEditRole] = useState<Role | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let data = (await smartDb.getAll("Role", uid)) as Role[];
        if (!data || data.length === 0) {
          data = [];
          for (const row of seedRoles) {
            const created = (await smartDb.create(
              "Role",
              { ...row, uid, createdAt: new Date().toISOString() },
              row.id
            )) as Role;
            data.push(created);
          }
        }
        if (!cancelled) setRoles(data);
      } catch (e) {
        console.error("Failed to load roles:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid]);

  // Create form state
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleDesc, setNewRoleDesc] = useState("");
  const [newRolePerms, setNewRolePerms] = useState<string[]>([]);

  // Edit form state
  const [editRoleName, setEditRoleName] = useState("");
  const [editRoleDesc, setEditRoleDesc] = useState("");
  const [editRolePerms, setEditRolePerms] = useState<string[]>([]);

  function openCreate() {
    setNewRoleName("");
    setNewRoleDesc("");
    setNewRolePerms([]);
    setCreateRoleOpen(true);
  }

  function openEdit(role: Role) {
    setEditRoleName(role.name);
    setEditRoleDesc(role.description);
    // FIX: initialize the edit dialog's permission checkboxes from the role
    // being edited instead of resetting to [] (which made edits unsavable).
    setEditRolePerms(role.permissions ?? []);
    setEditRole(role);
  }

  function togglePerm(perms: string[], id: string, setter: (p: string[]) => void) {
    if (perms.includes(id)) {
      setter(perms.filter((p) => p !== id));
    } else {
      setter([...perms, id]);
    }
  }

  async function handleCreate() {
    if (!newRoleName.trim()) {
      toast.error("Role name is required");
      return;
    }
    try {
      const id = `ROL-${String(Date.now()).slice(-6)}`;
      const record: Role = {
        id,
        name: newRoleName.trim(),
        description: newRoleDesc.trim(),
        users: 0,
        status: "Active",
        builtIn: false,
        permissions: newRolePerms,
      };
      const created = (await smartDb.create(
        "Role",
        { ...record, uid, createdAt: new Date().toISOString() },
        id
      )) as Role;
      setRoles((prev) => [...prev, created]);
      toast.success("Role created");
      setCreateRoleOpen(false);
    } catch (e) {
      console.error("Failed to create role:", e);
      toast.error("Failed to create role");
    }
  }

  async function handleEditSave() {
    if (!editRole) return;
    if (!editRoleName.trim()) {
      toast.error("Role name is required");
      return;
    }
    try {
      const patch = {
        name: editRoleName.trim(),
        description: editRoleDesc.trim(),
        permissions: editRolePerms,
      };
      await smartDb.update("Role", editRole.id, patch);
      setRoles((prev) =>
        prev.map((r) => (r.id === editRole.id ? { ...r, ...patch } : r))
      );
      toast.success("Role updated");
      setEditRole(null);
    } catch (e) {
      console.error("Failed to update role:", e);
      toast.error("Failed to update role");
    }
  }

  async function handleDelete(role: Role) {
    if (role.builtIn) {
      toast.error("Built-in roles cannot be deleted");
      return;
    }
    try {
      await smartDb.delete("Role", role.id);
      setRoles((prev) => prev.filter((r) => r.id !== role.id));
      toast.success("Role deleted");
    } catch (e) {
      console.error("Failed to delete role:", e);
      toast.error("Failed to delete role");
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <Shield className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Permissions & Roles</h1>
              <p className="text-sm text-slate-400">Manage user roles and their access permissions across the system.</p>
            </div>
          </div>
          <Button className="gradient-primary" onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" /> Create New Role
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Role List */}
          <Card className="lg:col-span-2 premium-card">
            <CardHeader>
              <CardTitle>User Roles</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Role Name</TableHead>
                    <TableHead>Users</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {roles.map((role) => (
                    <TableRow key={role.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                            <Shield className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="font-bold">{role.name}</div>
                            <div className="text-[10px] text-muted-foreground max-w-[200px] truncate">{role.description}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm">
                          <Users className="h-3 w-3 text-muted-foreground" />
                          {role.users} users
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="default" className="bg-green-500/10 text-green-500 border-none">
                          {role.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(role)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        {!role.builtIn && (
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(role)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Module Permissions */}
          <Card className="premium-card">
            <CardHeader>
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Lock className="h-4 w-4 text-primary" />
                Quick Permissions (Teacher)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">Student Management</p>
                    <p className="text-[10px] text-muted-foreground">View and edit student profiles</p>
                  </div>
                  <Switch defaultChecked />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">Attendance Tracking</p>
                    <p className="text-[10px] text-muted-foreground">Mark and view attendance</p>
                  </div>
                  <Switch defaultChecked />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">Finance Module</p>
                    <p className="text-[10px] text-muted-foreground">Access invoices and payroll</p>
                  </div>
                  <Switch />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">Library Access</p>
                    <p className="text-[10px] text-muted-foreground">Manage books and issues</p>
                  </div>
                  <Switch defaultChecked />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">System Settings</p>
                    <p className="text-[10px] text-muted-foreground">Modify school configuration</p>
                  </div>
                  <Switch />
                </div>
              </div>
              <Button className="w-full gradient-primary" size="sm" onClick={() => toast.success("Permissions updated successfully")}>
                Save Changes
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Create Role Dialog */}
      <Dialog open={createRoleOpen} onOpenChange={setCreateRoleOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Role</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="create-role-name">Role Name</Label>
              <Input
                id="create-role-name"
                placeholder="e.g. Department Head"
                value={newRoleName}
                onChange={(e) => setNewRoleName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-role-desc">Description</Label>
              <Input
                id="create-role-desc"
                placeholder="Brief description of this role"
                value={newRoleDesc}
                onChange={(e) => setNewRoleDesc(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Permissions</Label>
              <div className="space-y-2 rounded-lg border border-sidebar-border/50 p-3">
                {PERMISSION_OPTIONS.map((perm) => (
                  <div key={perm.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`create-${perm.id}`}
                      checked={newRolePerms.includes(perm.id)}
                      onCheckedChange={() => togglePerm(newRolePerms, perm.id, setNewRolePerms)}
                    />
                    <label htmlFor={`create-${perm.id}`} className="text-sm cursor-pointer">
                      {perm.label}
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateRoleOpen(false)}>Cancel</Button>
            <Button className="gradient-primary" onClick={handleCreate}>
              <Plus className="mr-2 h-4 w-4" /> Create Role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Role Dialog */}
      <Dialog open={!!editRole} onOpenChange={() => setEditRole(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Role</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="edit-role-name">Role Name</Label>
              <Input
                id="edit-role-name"
                value={editRoleName}
                onChange={(e) => setEditRoleName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-role-desc">Description</Label>
              <Input
                id="edit-role-desc"
                value={editRoleDesc}
                onChange={(e) => setEditRoleDesc(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Permissions</Label>
              <div className="space-y-2 rounded-lg border border-sidebar-border/50 p-3">
                {PERMISSION_OPTIONS.map((perm) => (
                  <div key={perm.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`edit-${perm.id}`}
                      checked={editRolePerms.includes(perm.id)}
                      onCheckedChange={() => togglePerm(editRolePerms, perm.id, setEditRolePerms)}
                    />
                    <label htmlFor={`edit-${perm.id}`} className="text-sm cursor-pointer">
                      {perm.label}
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditRole(null)}>Cancel</Button>
            <Button className="gradient-primary" onClick={handleEditSave}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default Permissions;
