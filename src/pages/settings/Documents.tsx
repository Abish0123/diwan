import { useEffect, useMemo, useRef, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { cn } from "@/lib/utils";
import { smartDb } from "@/lib/localDb";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { isCentralAdmin } from "@/lib/roles";
import {
  FileText, Upload, Search, Filter, MoreHorizontal, Download, Eye, Trash2,
  FileImage, FolderOpen, Share2, FileSpreadsheet, FileArchive, FileVideo,
  FileAudio, File as FileIcon, FileCode2, FolderPlus, Folder, ChevronRight,
  Home, UploadCloud, X, Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "sonner";

interface DocRecord {
  id: string;
  name: string;
  type: string;        // real file extension, uppercased (PDF, DOCX, JPG, ...)
  size: string;         // formatted for display (e.g. "2.4 MB")
  sizeBytes: number;
  category: string;
  updatedAt: string;
  status: "Active";
  fileUrl: string;      // real /uploads/... path — the actual stored file
  folderId: string | null;
  uid?: string;
  createdAt?: string;
}

interface FolderRecord {
  id: string;
  name: string;
  parentId: string | null;
  uid?: string;
  createdAt?: string;
}

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // matches the server's express.json({ limit: "25mb" })

const IMAGE_TYPES = new Set(["JPG", "JPEG", "PNG", "GIF", "WEBP", "SVG", "BMP", "AVIF"]);
const PREVIEWABLE_INLINE = new Set(["PDF", ...IMAGE_TYPES]);

function iconFor(type: string) {
  if (IMAGE_TYPES.has(type)) return { Icon: FileImage, cls: "bg-amber-500/10 text-amber-500" };
  if (type === "PDF") return { Icon: FileText, cls: "bg-rose-500/10 text-rose-500" };
  if (["DOC", "DOCX", "TXT", "RTF", "ODT"].includes(type)) return { Icon: FileText, cls: "bg-blue-500/10 text-blue-500" };
  if (["XLS", "XLSX", "CSV", "ODS"].includes(type)) return { Icon: FileSpreadsheet, cls: "bg-emerald-500/10 text-emerald-500" };
  if (["PPT", "PPTX", "ODP"].includes(type)) return { Icon: FileText, cls: "bg-orange-500/10 text-orange-500" };
  if (["ZIP", "RAR", "7Z", "TAR", "GZ"].includes(type)) return { Icon: FileArchive, cls: "bg-slate-500/10 text-slate-500" };
  if (["MP4", "MOV", "AVI", "MKV", "WEBM"].includes(type)) return { Icon: FileVideo, cls: "bg-purple-500/10 text-purple-500" };
  if (["MP3", "WAV", "OGG", "M4A"].includes(type)) return { Icon: FileAudio, cls: "bg-pink-500/10 text-pink-500" };
  if (["JSON", "XML", "HTML", "CSS", "JS", "TS"].includes(type)) return { Icon: FileCode2, cls: "bg-cyan-500/10 text-cyan-500" };
  return { Icon: FileIcon, cls: "bg-slate-500/10 text-slate-500" };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Polished drag-and-drop dropzone — replaces the raw browser
// `<input type="file">`, whose native "Choose File / No file chosen" chrome
// can't be restyled and gives no visual feedback for drag-over or the
// chosen file. Supports any format; nothing here restricts file type.
function FileDropzone({ file, onChange }: { file: File | null; onChange: (f: File | null) => void }) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  if (file) {
    const ext = (file.name.split(".").pop() || "FILE").toUpperCase();
    const { Icon, cls } = iconFor(ext);
    return (
      <div className="flex items-center gap-3 rounded-xl border border-sidebar-border/50 bg-muted/20 p-3">
        <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center shrink-0", cls)}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold truncate">{file.name}</p>
          <p className="text-[11px] text-muted-foreground">{formatBytes(file.size)} · {file.type || `.${ext.toLowerCase()} file`}</p>
        </div>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => onChange(null)}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onChange(f);
      }}
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-colors",
        dragOver ? "border-primary bg-primary/5" : "border-sidebar-border/60 hover:border-primary/40 hover:bg-muted/20"
      )}
    >
      <div className={cn("h-11 w-11 rounded-full flex items-center justify-center transition-colors", dragOver ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground")}>
        <UploadCloud className="h-5 w-5" />
      </div>
      <p className="text-sm font-bold text-slate-700">
        <span className="text-primary">Click to browse</span> or drag a file here
      </p>
      <p className="text-[11px] text-muted-foreground">Any file format · up to {formatBytes(MAX_UPLOAD_BYTES)}</p>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
    </div>
  );
}

export default function Documents() {
  const { user, role } = useAuth();
  const uid = user?.uid;
  const navigate = useNavigate();

  const allowed = isCentralAdmin(role);

  useEffect(() => {
    if (!allowed) {
      toast.error("Access denied — Documents management is admin-only");
      navigate("/");
    }
  }, [allowed, navigate]);

  const [documents, setDocuments] = useState<DocRecord[]>([]);
  const [folders, setFolders] = useState<FolderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<DocRecord | null>(null);
  const [filterCategory, setFilterCategory] = useState("all");
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);

  const [uploadName, setUploadName] = useState("");
  const [uploadCategory, setUploadCategory] = useState("General");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [renamingFolder, setRenamingFolder] = useState<FolderRecord | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      smartDb.getAll("Document", uid),
      smartDb.getAll("DocumentFolder", uid),
    ]).then(([docs, fldrs]: any[]) => {
      if (cancelled) return;
      setDocuments((docs || []) as DocRecord[]);
      setFolders((fldrs || []) as FolderRecord[]);
    }).catch((e) => {
      console.error("Failed to load documents:", e);
      if (!cancelled) { setDocuments([]); setFolders([]); }
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [uid]);

  // Breadcrumb path from root down to the currently open folder.
  const breadcrumb = useMemo(() => {
    const path: FolderRecord[] = [];
    let cursor = folders.find((f) => f.id === currentFolderId) || null;
    while (cursor) {
      path.unshift(cursor);
      cursor = folders.find((f) => f.id === cursor!.parentId) || null;
    }
    return path;
  }, [folders, currentFolderId]);

  const subfolders = folders.filter((f) => (f.parentId || null) === currentFolderId);

  const totalFiles = documents.length;
  const totalBytes = documents.reduce((sum, d) => sum + (d.sizeBytes || 0), 0);
  const sharedFiles = documents.filter((d) => d.status === "Active").length;
  const recentUploads = documents.filter((d) => {
    const updated = new Date(d.createdAt || d.updatedAt).getTime();
    return !isNaN(updated) && Date.now() - updated <= 7 * 24 * 60 * 60 * 1000;
  }).length;

  // While searching, look across every folder (so a file doesn't seem to
  // vanish just because you're not currently inside its folder); otherwise
  // scope strictly to the folder you're standing in, like a real file browser.
  const isSearching = searchTerm.trim().length > 0;
  const filteredDocs = documents.filter((d) => {
    const matchesSearch =
      d.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = filterCategory === "all" || d.category === filterCategory;
    const matchesFolder = isSearching || (d.folderId || null) === currentFolderId;
    return matchesSearch && matchesCategory && matchesFolder;
  });

  function folderItemCount(folderId: string): number {
    const subCount = folders.filter((f) => f.parentId === folderId).length;
    const docCount = documents.filter((d) => d.folderId === folderId).length;
    return subCount + docCount;
  }

  async function handleCreateFolder() {
    if (!folderName.trim()) {
      toast.error("Give the folder a name");
      return;
    }
    if (renamingFolder) {
      try {
        await smartDb.update("DocumentFolder", renamingFolder.id, { name: folderName.trim() });
        setFolders((prev) => prev.map((f) => f.id === renamingFolder.id ? { ...f, name: folderName.trim() } : f));
        toast.success("Folder renamed");
      } catch {
        toast.error("Failed to rename folder");
      }
      setFolderDialogOpen(false);
      setFolderName("");
      setRenamingFolder(null);
      return;
    }
    const id = `FOLDER-${Date.now().toString(36)}`;
    const now = new Date().toISOString();
    const record: FolderRecord = { id, name: folderName.trim(), parentId: currentFolderId };
    try {
      const created = (await smartDb.create("DocumentFolder", { ...record, uid, createdAt: now }, id)) as FolderRecord;
      setFolders((prev) => [...prev, created]);
      setFolderDialogOpen(false);
      setFolderName("");
      toast.success(`"${created.name}" folder created`);
    } catch (e) {
      console.error("Failed to create folder:", e);
      toast.error("Failed to create folder");
    }
  }

  async function handleDeleteFolder(folder: FolderRecord) {
    if (folderItemCount(folder.id) > 0) {
      toast.error(`"${folder.name}" isn't empty — move or delete its contents first`);
      return;
    }
    try {
      await smartDb.delete("DocumentFolder", folder.id);
      setFolders((prev) => prev.filter((f) => f.id !== folder.id));
      toast.success(`"${folder.name}" deleted`);
    } catch {
      toast.error("Failed to delete folder");
    }
  }

  async function handleUpload() {
    if (!uploadFile) {
      toast.error("Choose a file to upload");
      return;
    }
    if (uploadFile.size > MAX_UPLOAD_BYTES) {
      toast.error(`File is too large — max ${formatBytes(MAX_UPLOAD_BYTES)} per document`);
      return;
    }
    setUploading(true);
    try {
      // Real upload — writes the actual file to disk on the server and
      // returns a real, permanently-servable /uploads/... URL. Supports any
      // file type since it's just raw bytes; nothing here inspects or
      // restricts the format.
      const dataUrl = await readFileAsDataUrl(uploadFile);
      const uploadRes = await fetch("/api/uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: uploadFile.name, fileData: dataUrl }),
      });
      if (!uploadRes.ok) throw new Error("Upload failed");
      const { url } = await uploadRes.json();

      const ext = (uploadFile.name.split(".").pop() || "FILE").toUpperCase();
      const id = `DOC-${Date.now().toString(36)}`;
      const now = new Date().toISOString();
      const record: DocRecord = {
        id,
        name: uploadName.trim() || uploadFile.name,
        type: ext,
        size: formatBytes(uploadFile.size),
        sizeBytes: uploadFile.size,
        category: uploadCategory,
        updatedAt: now,
        status: "Active",
        fileUrl: url,
        folderId: currentFolderId,
      };
      const created = (await smartDb.create("Document", { ...record, uid, createdAt: now }, id)) as DocRecord;
      setDocuments((prev) => [created, ...prev]);
      setUploadOpen(false);
      setUploadName("");
      setUploadCategory("General");
      setUploadFile(null);
      toast.success("Document uploaded");
    } catch (e) {
      console.error("Failed to upload document:", e);
      toast.error("Failed to upload document — check your connection and try again");
    } finally {
      setUploading(false);
    }
  }

  function handleDownload(doc: DocRecord) {
    // The real stored file — same bytes that were uploaded, not a
    // fabricated placeholder.
    const a = document.createElement("a");
    a.href = doc.fileUrl;
    a.download = doc.name;
    a.target = "_blank";
    a.rel = "noreferrer";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function handleShare(doc: DocRecord) {
    const link = `${window.location.origin}${doc.fileUrl}`;
    navigator.clipboard.writeText(link).then(
      () => toast.success("Link copied to clipboard"),
      () => toast.error("Couldn't copy — select and copy manually")
    );
  }

  async function handleDelete(doc: DocRecord) {
    try {
      await smartDb.delete("Document", doc.id);
      setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
      toast.success(doc.name + " deleted");
    } catch (e) {
      console.error("Failed to delete document:", e);
      toast.error("Failed to delete document");
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <FolderOpen className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Document Management</h1>
              <p className="text-sm text-slate-400">Store and organize all institutional documents and files.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => { setRenamingFolder(null); setFolderName(""); setFolderDialogOpen(true); }}>
              <FolderPlus className="mr-2 h-4 w-4" /> New Folder
            </Button>
            <Button className="gradient-primary" onClick={() => setUploadOpen(true)}>
              <Upload className="mr-2 h-4 w-4" /> Upload Document
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="premium-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Total Files</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalFiles.toLocaleString()}</div>
              <p className="text-[10px] text-muted-foreground font-bold mt-1">Total documents stored</p>
            </CardContent>
          </Card>
          <Card className="premium-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Storage Used</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{formatBytes(totalBytes)}</div>
              <p className="text-[10px] text-primary font-bold mt-1">{formatBytes(MAX_UPLOAD_BYTES)} max per file</p>
            </CardContent>
          </Card>
          <Card className="premium-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Shared Files</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-500">{sharedFiles.toLocaleString()}</div>
              <p className="text-[10px] text-emerald-500 font-bold mt-1">Accessible by staff/students</p>
            </CardContent>
          </Card>
          <Card className="premium-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Recent Uploads</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{recentUploads.toLocaleString()}</div>
              <p className="text-[10px] text-muted-foreground font-bold mt-1">Files added this week</p>
            </CardContent>
          </Card>
        </div>

        <Card className="premium-card overflow-hidden">
          <CardHeader className="border-b border-sidebar-border/50 bg-muted/20 space-y-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <CardTitle className="text-lg font-bold">File Explorer</CardTitle>
              <div className="flex items-center gap-2">
                <div className="relative w-full md:w-64">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search documents..."
                    className="pl-9 h-9 bg-background"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="icon" className="h-9 w-9">
                      <Filter className="h-4 w-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56" align="end">
                    <div className="space-y-3">
                      <p className="text-sm font-bold">Filter by Category</p>
                      <Select value={filterCategory} onValueChange={setFilterCategory}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Categories</SelectItem>
                          <SelectItem value="Academic">Academic</SelectItem>
                          <SelectItem value="Finance">Finance</SelectItem>
                          <SelectItem value="HR">HR</SelectItem>
                          <SelectItem value="Compliance">Compliance</SelectItem>
                          <SelectItem value="General">General</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Breadcrumb — grouped path trail; every ancestor segment is a
                clickable link back to that level, the current folder reads
                as a plain (non-interactive) label so it's obvious where
                "you are" vs. where you can navigate to. */}
            {!isSearching && (
              <div className="inline-flex items-center gap-0.5 rounded-xl bg-muted/40 border border-sidebar-border/50 px-1.5 py-1 text-sm flex-wrap">
                <button
                  onClick={() => setCurrentFolderId(null)}
                  disabled={currentFolderId === null}
                  className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-semibold transition-colors",
                    currentFolderId === null
                      ? "text-foreground cursor-default"
                      : "text-muted-foreground hover:bg-background hover:text-foreground hover:shadow-sm")}
                >
                  <Home className="h-3.5 w-3.5" /> My Documents
                </button>
                {breadcrumb.map((f, i) => {
                  const isCurrent = i === breadcrumb.length - 1;
                  return (
                    <span key={f.id} className="flex items-center gap-0.5">
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                      <button
                        onClick={() => setCurrentFolderId(f.id)}
                        disabled={isCurrent}
                        className={cn("px-2.5 py-1 rounded-lg font-semibold transition-colors max-w-[220px] truncate",
                          isCurrent
                            ? "text-foreground cursor-default"
                            : "text-muted-foreground hover:bg-background hover:text-foreground hover:shadow-sm")}
                      >
                        {f.name}
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
          </CardHeader>
          <CardContent className="p-0">
            {/* Folder grid — only shown at the top level of whatever folder
                you're in, and hidden while searching (search spans all folders). */}
            {!isSearching && subfolders.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 p-4 border-b border-sidebar-border/50">
                {subfolders.map((folder) => (
                  <div
                    key={folder.id}
                    onDoubleClick={() => setCurrentFolderId(folder.id)}
                    className="group flex items-center gap-2.5 rounded-xl border border-sidebar-border/50 bg-background hover:bg-muted/30 hover:border-primary/30 transition-colors p-3 cursor-pointer"
                    onClick={() => setCurrentFolderId(folder.id)}
                  >
                    <Folder className="h-8 w-8 text-amber-400 fill-amber-100 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold truncate">{folder.name}</p>
                      <p className="text-[10px] text-muted-foreground">{folderItemCount(folder.id)} item{folderItemCount(folder.id) === 1 ? "" : "s"}</p>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenuItem onClick={() => { setRenamingFolder(folder); setFolderName(folder.name); setFolderDialogOpen(true); }}>
                          <Pencil className="mr-2 h-4 w-4" /> Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-rose-500" onClick={() => handleDeleteFolder(folder)}>
                          <Trash2 className="mr-2 h-4 w-4" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ))}
              </div>
            )}

            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-sidebar-border/50">
                  <TableHead className="font-bold text-xs uppercase tracking-wider">Document Name</TableHead>
                  <TableHead className="font-bold text-xs uppercase tracking-wider">Category</TableHead>
                  <TableHead className="font-bold text-xs uppercase tracking-wider">Size</TableHead>
                  <TableHead className="font-bold text-xs uppercase tracking-wider">Last Updated</TableHead>
                  <TableHead className="font-bold text-xs uppercase tracking-wider">Status</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
                )}
                {!loading && filteredDocs.map((doc) => {
                  const { Icon, cls } = iconFor(doc.type);
                  return (
                    <TableRow
                      key={doc.id}
                      className="border-sidebar-border/50 group cursor-pointer"
                      onClick={() => setPreviewDoc(doc)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center shrink-0", cls)}>
                            <Icon className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="text-sm font-bold group-hover:text-primary transition-colors">{doc.name}</p>
                            <p className="text-[10px] text-muted-foreground font-medium">{doc.id}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-[10px] font-bold bg-muted/50 text-muted-foreground border-none">
                          {doc.category}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm font-medium text-muted-foreground">{doc.size}</TableCell>
                      <TableCell className="text-sm font-medium">{new Date(doc.updatedAt).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className="text-[10px] font-black uppercase tracking-tighter px-2 h-5 border-none bg-emerald-500/10 text-emerald-500"
                        >
                          {doc.status}
                        </Badge>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setPreviewDoc(doc)}>
                              <Eye className="mr-2 h-4 w-4" /> Preview
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDownload(doc)}>
                              <Download className="mr-2 h-4 w-4" /> Download
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleShare(doc)}>
                              <Share2 className="mr-2 h-4 w-4" /> Share
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-rose-500" onClick={() => handleDelete(doc)}>
                              <Trash2 className="mr-2 h-4 w-4" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!loading && filteredDocs.length === 0 && subfolders.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-10">
                      {isSearching
                        ? "No documents match your search/filter."
                        : documents.length === 0 && folders.length === 0
                          ? "This is empty — upload a file or create a folder to get started."
                          : "This folder is empty."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* New Folder / Rename Folder Dialog */}
      <Dialog open={folderDialogOpen} onOpenChange={setFolderDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{renamingFolder ? "Rename Folder" : "New Folder"}</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-2">
            <Label htmlFor="folder-name">Folder Name</Label>
            <Input
              id="folder-name"
              placeholder="e.g. Circulars 2026"
              value={folderName}
              autoFocus
              onChange={(e) => setFolderName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleCreateFolder(); }}
            />
            {!renamingFolder && (
              <p className="text-[11px] text-muted-foreground">
                Created inside {currentFolderId ? `"${breadcrumb[breadcrumb.length - 1]?.name}"` : "My Documents"}.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFolderDialogOpen(false)}>Cancel</Button>
            <Button className="gradient-primary" onClick={handleCreateFolder}>
              <FolderPlus className="mr-2 h-4 w-4" /> {renamingFolder ? "Save" : "Create Folder"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload Dialog */}
      <Dialog open={uploadOpen} onOpenChange={(o) => { if (!uploading) setUploadOpen(o); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Upload Document</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>File — any format</Label>
              <FileDropzone
                file={uploadFile}
                onChange={(f) => {
                  setUploadFile(f);
                  if (f && !uploadName.trim()) setUploadName(f.name);
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="doc-name">Document Name</Label>
              <Input
                id="doc-name"
                placeholder="e.g. Annual_Report_2024.pdf"
                value={uploadName}
                onChange={(e) => setUploadName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={uploadCategory} onValueChange={setUploadCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Academic">Academic</SelectItem>
                  <SelectItem value="Finance">Finance</SelectItem>
                  <SelectItem value="HR">HR</SelectItem>
                  <SelectItem value="Compliance">Compliance</SelectItem>
                  <SelectItem value="General">General</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-[11px] text-muted-foreground -mt-1">
              Uploading to {currentFolderId ? `"${breadcrumb[breadcrumb.length - 1]?.name}"` : "My Documents"}.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={uploading} onClick={() => setUploadOpen(false)}>Cancel</Button>
            <Button className="gradient-primary" disabled={uploading || !uploadFile} onClick={handleUpload}>
              <Upload className="mr-2 h-4 w-4" /> {uploading ? "Uploading…" : "Upload"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog — Drive-style: a large, dedicated preview pane on the
          left, metadata + actions in a side panel on the right, instead of a
          tiny thumbnail squeezed above a details grid. */}
      <Dialog open={!!previewDoc} onOpenChange={() => setPreviewDoc(null)}>
        <DialogContent className="sm:max-w-4xl p-0 gap-0 overflow-hidden max-h-[88vh] flex flex-col">
          {previewDoc && (() => {
            const { Icon, cls } = iconFor(previewDoc.type);
            const isPreviewable = PREVIEWABLE_INLINE.has(previewDoc.type);
            const folderName = folders.find((f) => f.id === previewDoc.folderId)?.name;
            return (
              <>
                <DialogHeader className="px-5 py-4 border-b border-sidebar-border/50 shrink-0">
                  <div className="flex items-center gap-3 pr-8">
                    <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center shrink-0", cls)}>
                      <Icon className="h-4.5 w-4.5" />
                    </div>
                    <div className="min-w-0">
                      <DialogTitle className="text-base truncate">{previewDoc.name}</DialogTitle>
                      <p className="text-[11px] text-muted-foreground">{previewDoc.id} · {folderName ? `in "${folderName}"` : "My Documents"}</p>
                    </div>
                  </div>
                </DialogHeader>

                <div className="flex-1 min-h-0 grid md:grid-cols-[1fr_260px]">
                  {/* Large preview pane — the real stored file, not a placeholder */}
                  <div className={cn(
                    "flex items-center justify-center min-h-[320px] md:min-h-[60vh]",
                    previewDoc.type === "PDF" ? "bg-slate-100" : "bg-muted/30 p-5 overflow-auto"
                  )}>
                    {IMAGE_TYPES.has(previewDoc.type) && (
                      <img src={previewDoc.fileUrl} alt={previewDoc.name} className="max-w-full max-h-[65vh] object-contain rounded-lg shadow-sm" />
                    )}
                    {previewDoc.type === "PDF" && (
                      // #toolbar=0&navpanes=0 suppresses Chrome's own built-in
                      // PDF.js chrome (page-thumbnail rail + toolbar) — left
                      // as default it renders its own full viewer UI inside
                      // the iframe, which duplicated and visually clashed
                      // with this dialog's own Download/actions panel.
                      <iframe
                        src={`${previewDoc.fileUrl}#toolbar=0&navpanes=0`}
                        title={previewDoc.name}
                        className="w-full h-full min-h-[60vh]"
                      />
                    )}
                    {!isPreviewable && (
                      <div className="flex flex-col items-center gap-3 text-center px-6">
                        <div className={cn("h-20 w-20 rounded-2xl flex items-center justify-center", cls)}>
                          <Icon className="h-10 w-10" />
                        </div>
                        <div>
                          <p className="font-bold text-sm text-slate-700">No inline preview for .{previewDoc.type.toLowerCase()} files</p>
                          <p className="text-xs text-muted-foreground mt-1">Download the file to open it in the right application.</p>
                        </div>
                        <Button className="gradient-primary mt-1" onClick={() => handleDownload(previewDoc)}>
                          <Download className="mr-2 h-4 w-4" /> Download to View
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Side panel — metadata + actions */}
                  <div className="border-t md:border-t-0 md:border-l border-sidebar-border/50 p-4 space-y-4 overflow-y-auto">
                    <div className="space-y-3 text-sm">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Type</p>
                        <p className="font-medium mt-0.5">{previewDoc.type}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Size</p>
                        <p className="font-medium mt-0.5">{previewDoc.size}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Category</p>
                        <Badge variant="secondary" className="mt-1 text-[10px] font-bold bg-muted/50 text-muted-foreground border-none">{previewDoc.category}</Badge>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Location</p>
                        <p className="font-medium mt-0.5 flex items-center gap-1">
                          {folderName ? <Folder className="h-3.5 w-3.5 text-amber-400 fill-amber-100 shrink-0" /> : <Home className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                          <span className="truncate">{folderName || "My Documents"}</span>
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Last Updated</p>
                        <p className="font-medium mt-0.5">{new Date(previewDoc.updatedAt).toLocaleString()}</p>
                      </div>
                    </div>

                    <div className="space-y-1.5 pt-2 border-t border-sidebar-border/50">
                      <Button className="w-full justify-start gradient-primary" onClick={() => handleDownload(previewDoc)}>
                        <Download className="mr-2 h-4 w-4" /> Download
                      </Button>
                      {isPreviewable && (
                        <Button variant="outline" className="w-full justify-start" asChild>
                          <a href={previewDoc.fileUrl} target="_blank" rel="noreferrer">
                            <Eye className="mr-2 h-4 w-4" /> Open in New Tab
                          </a>
                        </Button>
                      )}
                      <Button variant="outline" className="w-full justify-start" onClick={() => handleShare(previewDoc)}>
                        <Share2 className="mr-2 h-4 w-4" /> Copy Share Link
                      </Button>
                      <Button variant="outline" className="w-full justify-start text-rose-500 hover:text-rose-600" onClick={() => { handleDelete(previewDoc); setPreviewDoc(null); }}>
                        <Trash2 className="mr-2 h-4 w-4" /> Delete
                      </Button>
                    </div>
                  </div>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
