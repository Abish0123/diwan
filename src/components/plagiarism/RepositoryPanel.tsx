import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Trash2, FileText, Lock } from "lucide-react";
import { toast } from "sonner";
import { smartDb } from "@/lib/localDb";
import { ensurePlagiarismSeed, getRepository, REPOSITORY_DOCS } from "@/lib/plagiarismData";
import { logAudit } from "@/lib/codingAudit";
import { RepositoryDocument } from "@/types/plagiarism";
import { useAuth } from "@/hooks/useAuth";
import { isAdmin } from "@/lib/codingRbac";

const wordCount = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;

export function RepositoryPanel() {
  const { user, role } = useAuth();
  const canManage = isAdmin(role) || role === "staff";
  const [docs, setDocs] = useState<RepositoryDocument[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", studentName: "", department: "Computer Science", year: "2026", text: "" });

  const load = async () => { await ensurePlagiarismSeed(); setDocs((await getRepository()) || []); };
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!form.title.trim()) return toast.error("Enter a title");
    if (wordCount(form.text) < 20) return toast.error("Add at least ~20 words of text");
    const doc: RepositoryDocument = { id: `REPO-${Date.now()}`, ...form };
    await smartDb.create(REPOSITORY_DOCS, doc as never, doc.id);
    await logAudit("Repository document added", "repository_documents", { user: user?.email, role }, form.title);
    toast.success("Added to repository");
    setOpen(false);
    setForm({ title: "", studentName: "", department: "Computer Science", year: "2026", text: "" });
    load();
  };

  const remove = async (d: RepositoryDocument) => {
    await smartDb.delete(REPOSITORY_DOCS, d.id);
    await logAudit("Repository document removed", "repository_documents", { user: user?.email, role }, d.title);
    load(); toast.success("Removed");
  };

  return (
    <Card className="border-slate-200">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base">Document Repository ({docs.length})</CardTitle>
          <p className="text-xs text-slate-500 mt-1">Past reports compared against new submissions for student-to-student matching.</p>
        </div>
        {canManage ? (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button size="sm" className="bg-[#9810fa] hover:bg-[#5d1899]"><Plus className="h-4 w-4 mr-1.5" /> Add Document</Button></DialogTrigger>
            <DialogContent className="max-w-xl max-h-[88vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Add Repository Document</DialogTitle></DialogHeader>
              <div className="space-y-3 py-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2"><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
                  <div><Label>Student</Label><Input value={form.studentName} onChange={(e) => setForm({ ...form, studentName: e.target.value })} /></div>
                  <div><Label>Department</Label><Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} /></div>
                  <div><Label>Year</Label><Input value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} /></div>
                </div>
                <div><Label>Document text</Label><Textarea rows={6} value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} placeholder="Paste the report text…" /></div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button className="bg-[#9810fa] hover:bg-[#5d1899]" onClick={add}>Add</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : (
          <Badge variant="outline" className="bg-slate-50 text-slate-500 border-slate-200 gap-1.5"><Lock className="h-3.5 w-3.5" /> Read-only</Badge>
        )}
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow><TableHead>Title</TableHead><TableHead>Student</TableHead><TableHead>Department</TableHead><TableHead>Year</TableHead><TableHead>Words</TableHead>{canManage && <TableHead></TableHead>}</TableRow>
          </TableHeader>
          <TableBody>
            {docs.map((d) => (
              <TableRow key={d.id}>
                <TableCell className="font-medium text-slate-800"><span className="flex items-center gap-2"><FileText className="h-3.5 w-3.5 text-slate-400" />{d.title}</span></TableCell>
                <TableCell className="text-sm text-slate-600">{d.studentName}</TableCell>
                <TableCell className="text-sm text-slate-500">{d.department}</TableCell>
                <TableCell className="text-sm text-slate-500">{d.year}</TableCell>
                <TableCell className="text-sm text-slate-500">{wordCount(d.text)}</TableCell>
                {canManage && <TableCell className="text-right"><Button size="sm" variant="ghost" className="text-rose-400 hover:text-rose-600" onClick={() => remove(d)}><Trash2 className="h-4 w-4" /></Button></TableCell>}
              </TableRow>
            ))}
            {docs.length === 0 && <TableRow><TableCell colSpan={canManage ? 6 : 5} className="text-center text-slate-400 py-8">Repository is empty.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
