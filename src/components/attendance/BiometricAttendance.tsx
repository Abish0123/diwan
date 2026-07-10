import { useState, useEffect, useRef } from "react";
import { Fingerprint, X, WifiOff, Clock, User, CreditCard, Settings } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { smartDb } from "@/lib/localDb";
import { useAuth } from "@/hooks/useAuth";
import { notifyParentsOfStudents } from "@/lib/classPublishNotify";
import { toast } from "sonner";
import type { Student } from "@/types";

type ScanEntry = {
  id: string;
  time: string;
  name: string;
  studentId: string;
  class: string;
  status: "Present" | "Late";
};

// A real fingerprint/RFID reader (ZKTeco, etc.) is a HID keyboard-wedge
// device: scanning a card/finger "types" the card's encoded ID followed by
// Enter into whatever text field has focus, then the device itself knows
// nothing about attendance policy. This used to fabricate the entire flow —
// a hardcoded student roster cycling on a setInterval, status decided by
// Math.random(), a permanently-"Online" fake device panel — and never wrote
// a single real attendance record. This version is what that real device
// integration actually looks like: an always-focused input matches the
// scanned ID against real Student records (by id, since no dedicated RFID
// card-id field exists yet) and writes a real `attendance` row, using the
// exact same record shape/id scheme as the manual roster in Attendance.tsx
// so both paths for marking today's attendance stay consistent.
export const BiometricAttendance = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const { user } = useAuth();
  const [mode, setMode] = useState<"fingerprint" | "rfid">("rfid");
  const [code, setCode] = useState("");
  const [scanning, setScanning] = useState(false);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<ScanEntry[]>([]);
  const [markLate, setMarkLate] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    smartDb.getAll("Student", undefined).then((data) => {
      setStudents(data as Student[]);
    }).catch((err) => {
      console.error("Failed to load students for scanner:", err);
      toast.error("Failed to load students");
    }).finally(() => setLoading(false));
    inputRef.current?.focus();
  }, [open]);

  const today = new Date().toISOString().split("T")[0];

  const findStudent = (raw: string) => {
    const q = raw.trim().toLowerCase();
    if (!q) return undefined;
    return students.find((s) => s.id.toLowerCase() === q || (s.name || "").toLowerCase() === q);
  };

  const handleScan = async (raw: string) => {
    const student = findStudent(raw);
    if (!student) {
      toast.error(`No student found matching "${raw}"`);
      return;
    }
    setScanning(true);
    try {
      const status: "Present" | "Late" = markLate ? "Late" : "Present";
      const nowTime = new Date().toTimeString().slice(0, 8);
      const rec = {
        id: `ATT-STU-${student.id}-${today}`,
        entityId: student.id,
        entityType: "student",
        name: student.name,
        class: student.grade ? `${student.grade}${student.section ? `-${student.section}` : ""}` : student.classId,
        status,
        date: today,
        time: nowTime,
        uid: user?.uid,
        createdAt: new Date().toISOString(),
        source: mode === "rfid" ? "RFID Scan" : "Fingerprint Scan",
      };
      // Same deterministic id scheme as the manual roster save in
      // Attendance.tsx — smartDb.create upserts on that id, so re-scanning
      // the same student today just updates their existing record instead
      // of creating a duplicate.
      await smartDb.create("attendance", rec, rec.id);
      window.dispatchEvent(new Event("attendance-updated"));

      if (status === "Late") {
        notifyParentsOfStudents(
          [{ id: student.id, name: student.name, message: `${student.name} was marked Late on ${new Date().toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" })} (scanner check-in at ${nowTime}).` }],
          { entity: "Attendance", type: "attendance_marked", title: "Attendance Update", sourceId: rec.id, grade: student.grade || "", section: student.section || "", redirectUrl: "/parent/attendance" }
        ).catch(() => {});
      }

      const entry: ScanEntry = { id: rec.id, time: nowTime, name: student.name, studentId: student.id, class: rec.class || "", status };
      setEntries((prev) => [entry, ...prev.filter((e) => e.studentId !== student.id)].slice(0, 10));
      toast.success(`${student.name} marked ${status}`);
    } catch (error) {
      console.error("Scan failed:", error);
      toast.error("Failed to record attendance");
    } finally {
      setScanning(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || scanning) return;
    handleScan(code.trim());
    setCode("");
  };

  const presentCount = entries.filter((e) => e.status === "Present").length;
  const lateCount = entries.filter((e) => e.status === "Late").length;

  return (
    <div
      className={cn(
        "fixed top-0 right-0 h-full w-96 bg-card shadow-2xl z-50 flex flex-col transition-transform duration-300 ease-in-out",
        open ? "translate-x-0" : "translate-x-full"
      )}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-base">Attendance Scanner</span>
          <div className="flex items-center gap-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-full px-2 py-0.5 text-xs font-medium">
            <CreditCard className="w-3 h-3" />
            Keyboard-wedge
          </div>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-muted transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-center gap-2 px-4 py-2 border-b">
        <button
          onClick={() => setMode("fingerprint")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
            mode === "fingerprint" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
          )}
        >
          <Fingerprint className="w-4 h-4" />
          Fingerprint
        </button>
        <button
          onClick={() => setMode("rfid")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
            mode === "rfid" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
          )}
        >
          <CreditCard className="w-4 h-4" />
          RFID Card
        </button>
      </div>

      <div className="px-4 py-4 space-y-3">
        <form onSubmit={handleSubmit} className="space-y-2">
          <Input
            ref={inputRef}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={mode === "rfid" ? "Scan card or type Student ID…" : "Type Student ID (device output)…"}
            className="h-11 font-mono text-sm"
            disabled={scanning || loading}
            autoFocus
          />
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <input type="checkbox" checked={markLate} onChange={(e) => setMarkLate(e.target.checked)} className="accent-amber-500" />
              Mark as Late instead of Present
            </label>
            <Button type="submit" size="sm" disabled={scanning || loading || !code.trim()}>
              {scanning ? "Recording…" : "Record"}
            </Button>
          </div>
        </form>
        <p className="text-[11px] text-muted-foreground">
          Matches a real Student ID (a HID card reader that types + Enter works here too). Writes today's attendance immediately — no simulated data.
        </p>
      </div>

      <div className="px-4 flex-1 overflow-hidden flex flex-col min-h-0">
        <div className="flex items-center gap-2 mb-2">
          <Clock className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Recorded This Session</span>
        </div>
        <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
          {entries.length === 0 && (
            <div className="text-center text-muted-foreground text-sm py-6">Waiting for a scan...</div>
          )}
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-muted/40"
            >
              <span
                className={cn(
                  "w-2 h-2 rounded-full shrink-0",
                  entry.status === "Present" ? "bg-green-500" : "bg-amber-400"
                )}
              />
              <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{entry.name}</p>
                <p className="text-[11px] text-muted-foreground">{entry.class}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[11px] text-muted-foreground">{entry.time}</p>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px] px-1 py-0 h-4",
                    entry.status === "Present"
                      ? "border-green-500 text-green-600 dark:text-green-400"
                      : "border-amber-400 text-amber-600 dark:text-amber-400"
                  )}
                >
                  {entry.status}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="px-4 py-3 border-t grid grid-cols-3 gap-1 text-center">
        {[
          { label: "Present", value: presentCount, color: "text-green-600 dark:text-green-400" },
          { label: "Late", value: lateCount, color: "text-amber-600 dark:text-amber-400" },
          { label: "Total Scanned", value: entries.length, color: "text-blue-500" },
        ].map((stat) => (
          <div key={stat.label} className="bg-muted/50 rounded-lg py-2 px-1">
            <p className={cn("text-sm font-bold", stat.color)}>{stat.value}</p>
            <p className="text-[10px] text-muted-foreground leading-tight">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="px-4 pb-4 border-t pt-3">
        <button
          onClick={() => setSettingsOpen((v) => !v)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
        >
          <Settings className="w-3.5 h-3.5" />
          Device Info
          <span className="ml-auto">{settingsOpen ? "▲" : "▼"}</span>
        </button>
        {settingsOpen && (
          <div className="mt-2 bg-muted/40 rounded-lg px-3 py-2 space-y-1.5 text-xs">
            <div className="flex items-start gap-1.5 text-muted-foreground">
              <WifiOff className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-500" />
              <span>
                No physical scanner is connected — this panel accepts input from any USB HID device configured to
                type a Student ID (most RFID/fingerprint readers support this "keyboard wedge" mode), or manual entry.
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
