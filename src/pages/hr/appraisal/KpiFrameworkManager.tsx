import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  ClipboardList, ChevronDown, ChevronUp, Pencil, Trash2, Plus, RotateCcw, X,
} from "lucide-react";
import { toast } from "sonner";
import { smartDb } from "@/lib/localDb";
import { KpiCategory, DEFAULT_KPI_CATEGORIES } from "./kpiFrameworkTypes";

export function KpiFrameworkManager() {
  const [categories, setCategories] = useState<KpiCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<KpiCategory | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newWeight, setNewWeight] = useState("10");

  const load = async () => {
    setLoading(true);
    try {
      const rows = (await smartDb.getAll("KpiFrameworkCategory", undefined)) as KpiCategory[];
      if (rows.length === 0) {
        const now = new Date().toISOString();
        const seeded = DEFAULT_KPI_CATEGORIES.map((c, i) => ({ ...c, id: `kpicat-default-${i}`, createdAt: now, updatedAt: now }));
        await Promise.all(seeded.map((c) => smartDb.create("KpiFrameworkCategory", c, c.id)));
        setCategories(seeded as KpiCategory[]);
      } else {
        setCategories(rows);
      }
    } catch {
      toast.error("Failed to load KPI framework");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const totalWeight = useMemo(() => categories.reduce((s, c) => s + (Number(c.weight) || 0), 0), [categories]);

  async function handleDelete(c: KpiCategory) {
    if (!confirm(`Delete "${c.title}"? This can't be undone.`)) return;
    await smartDb.delete("KpiFrameworkCategory", c.id);
    setCategories((prev) => prev.filter((x) => x.id !== c.id));
    toast.success(`Deleted "${c.title}"`);
  }

  async function handleRestoreDefault(c: KpiCategory) {
    const idx = categories.filter((x) => x.isDefault).findIndex((x) => x.id === c.id);
    const original = DEFAULT_KPI_CATEGORIES.find((d) => d.title === c.title) || DEFAULT_KPI_CATEGORIES[idx];
    if (!original) return;
    const restored: KpiCategory = { ...original, id: c.id, createdAt: c.createdAt, updatedAt: new Date().toISOString() };
    await smartDb.update("KpiFrameworkCategory", c.id, restored);
    setCategories((prev) => prev.map((x) => (x.id === c.id ? restored : x)));
    toast.success(`Restored "${c.title}" to the standard version`);
  }

  async function handleCreate() {
    if (!newTitle.trim()) { toast.error("Name is required."); return; }
    const id = `kpicat-custom-${Date.now()}`;
    const now = new Date().toISOString();
    const c: KpiCategory = {
      id, title: newTitle.trim(), weight: Math.max(0, Number(newWeight) || 0),
      criteria: ["New criterion"], isDefault: false, createdAt: now, updatedAt: now,
    };
    await smartDb.create("KpiFrameworkCategory", c, id);
    setCategories((prev) => [...prev, c]);
    setCreateOpen(false);
    setNewTitle(""); setNewWeight("10");
    setEditing(c);
    toast.success(`Created "${c.title}" — add your criteria.`);
  }

  async function saveEdit(c: KpiCategory) {
    const patch = { ...c, updatedAt: new Date().toISOString() };
    await smartDb.update("KpiFrameworkCategory", c.id, patch);
    setCategories((prev) => prev.map((x) => (x.id === c.id ? patch : x)));
    setEditing(null);
    toast.success(`Saved "${c.title}"`);
  }

  if (loading) return <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">Loading KPI framework…</div>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-slate-900">KPI Framework</h3>
          <p className="text-xs text-slate-400">The standard category/criteria breakdown appraisals are measured against.</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={totalWeight === 100 ? "border-emerald-200 text-emerald-700" : "border-amber-200 text-amber-700"}>
            {totalWeight}% total weight
          </Badge>
          <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> New Category
          </Button>
        </div>
      </div>

      {categories.map((cat) => (
        <Card key={cat.id}>
          <CardHeader className="pb-0 pt-4">
            <div className="flex items-center justify-between w-full">
              <button className="flex items-center gap-3 flex-1 text-left" onClick={() => setExpanded(expanded === cat.id ? null : cat.id)}>
                <ClipboardList className="h-5 w-5 text-indigo-500" />
                <CardTitle className="text-base">{cat.title}</CardTitle>
                <Badge variant="outline" className="text-xs">{cat.weight}% weight</Badge>
                {cat.isDefault && <Badge variant="outline" className="text-[9px]">Standard</Badge>}
              </button>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="outline" className="gap-1" onClick={() => setEditing({ ...cat, criteria: [...cat.criteria] })}>
                  <Pencil className="h-3 w-3" /> Edit
                </Button>
                {cat.isDefault && (
                  <Button size="sm" variant="outline" title="Restore standard version" onClick={() => handleRestoreDefault(cat)}>
                    <RotateCcw className="h-3 w-3" />
                  </Button>
                )}
                <Button size="sm" variant="outline" className="text-rose-500 hover:text-rose-600" onClick={() => handleDelete(cat)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
                <button className="p-1.5" onClick={() => setExpanded(expanded === cat.id ? null : cat.id)}>
                  {expanded === cat.id ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                </button>
              </div>
            </div>
          </CardHeader>
          {expanded === cat.id && (
            <CardContent className="pt-3 pb-4">
              <ul className="space-y-2">
                {cat.criteria.map((criterion) => (
                  <li key={criterion} className="flex items-start gap-2 text-sm text-gray-700">
                    <span className="mt-0.5 h-4 w-4 rounded border border-indigo-300 bg-indigo-50 flex items-center justify-center flex-shrink-0">
                      <span className="block h-2 w-2 rounded-sm bg-indigo-400" />
                    </span>
                    {criterion}
                  </li>
                ))}
              </ul>
            </CardContent>
          )}
        </Card>
      ))}

      {/* New category dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader><DialogTitle>New KPI Category</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Category Name</Label>
              <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="e.g. Innovation & Technology" className="mt-1" />
            </div>
            <div>
              <Label>Weight (%)</Label>
              <Input type="number" min={0} max={100} value={newWeight} onChange={(e) => setNewWeight(e.target.value)} className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} className="bg-purple-600 hover:bg-purple-700">Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-[520px] max-h-[85vh] overflow-y-auto">
          {editing && (
            <>
              <DialogHeader><DialogTitle>Edit KPI Category</DialogTitle></DialogHeader>
              <div className="space-y-3 py-2">
                <div>
                  <Label>Category Name</Label>
                  <Input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} className="mt-1" />
                </div>
                <div>
                  <Label>Weight (%)</Label>
                  <Input type="number" min={0} max={100} value={editing.weight} onChange={(e) => setEditing({ ...editing, weight: Number(e.target.value) })} className="mt-1" />
                </div>
                <div className="space-y-2">
                  <Label>Criteria</Label>
                  {editing.criteria.map((c, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        value={c}
                        onChange={(e) => setEditing({ ...editing, criteria: editing.criteria.map((x, j) => (j === i ? e.target.value : x)) })}
                        className="flex-1 text-sm"
                      />
                      <button type="button" onClick={() => setEditing({ ...editing, criteria: editing.criteria.filter((_, j) => j !== i) })} className="p-1 text-rose-300 hover:text-rose-600">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setEditing({ ...editing, criteria: [...editing.criteria, "New criterion"] })}
                    className="text-xs font-semibold text-purple-600 hover:underline flex items-center gap-1"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add Criterion
                  </button>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
                <Button onClick={() => saveEdit(editing)} className="bg-purple-600 hover:bg-purple-700">Save</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
