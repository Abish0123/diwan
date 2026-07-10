import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAdmissions } from "@/hooks/useAdmissions";
import { useClasses } from "@/hooks/useClasses";
import { useGrades } from "@/contexts/CurriculumContext";
import { Lead } from "@/types/admissions";

interface AddEnquiryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const NATIONALITIES = [
  "Qatari", "Saudi Arabian", "Emirati", "Kuwaiti", "Bahraini", "Omani",
  "Egyptian", "Jordanian", "Lebanese", "Syrian", "Indian", "Pakistani",
  "Bangladeshi", "Filipino", "British", "American", "Other",
];

const RELATIONSHIPS = ["Father", "Mother", "Legal Guardian", "Grandfather", "Grandmother", "Other"];

const emptyForm = {
  studentName: "",
  dob: "",
  gender: "" as "" | "Male" | "Female",
  nationality: "",
  parentName: "",
  relationship: "Father" as string,
  phone: "",
  altPhone: "",
  email: "",
  interestedClass: "",
  source: "Website" as Lead["source"],
  previousSchool: "",
  notes: "",
};

export const AddEnquiryDialog = ({ open, onOpenChange }: AddEnquiryDialogProps) => {
  const { addLead } = useAdmissions();
  const { classes } = useClasses();
  const grades = useGrades();
  const [formData, setFormData] = useState(emptyForm);

  const set = (field: string, value: string) => setFormData(prev => ({ ...prev, [field]: value }));

  // Merge school classes with default grades, preserve Pre-KG→Grade 12 order
  const extraClasses = classes.map(c => c.name).filter(n => !grades.includes(n));
  const availableClassNames = [...grades, ...extraClasses];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    addLead({
      studentName: formData.studentName,
      parentName: formData.parentName,
      phone: formData.phone,
      email: formData.email,
      interestedClass: formData.interestedClass,
      source: formData.source,
      notes: [
        formData.notes,
        formData.dob ? `DOB: ${formData.dob}` : "",
        formData.gender ? `Gender: ${formData.gender}` : "",
        formData.nationality ? `Nationality: ${formData.nationality}` : "",
        formData.relationship ? `Relationship: ${formData.relationship}` : "",
        formData.altPhone ? `Alt Phone: ${formData.altPhone}` : "",
        formData.previousSchool ? `Previous School: ${formData.previousSchool}` : "",
      ].filter(Boolean).join(" | "),
      status: "Enquiry",
    });
    onOpenChange(false);
    setFormData(emptyForm);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[680px] rounded-[2.5rem] border-none shadow-2xl p-0 overflow-hidden bg-white max-h-[90vh] overflow-y-auto">
        <DialogHeader className="px-8 pt-8 pb-6 bg-slate-50/50 border-b border-slate-100 sticky top-0 z-10 bg-white">
          <DialogTitle className="text-2xl font-black text-slate-900">Add New Enquiry</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground font-medium">
            Fill in the details to create a new lead in the admissions pipeline.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="px-8 py-6 space-y-8">

          {/* Student Details */}
          <div>
            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">Student Details</h3>
            <div className="grid grid-cols-2 gap-5">
              <div className="space-y-2 col-span-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Student Full Name *</Label>
                <Input
                  placeholder="Full Name"
                  className="rounded-xl border-slate-200 h-11"
                  value={formData.studentName}
                  onChange={e => set("studentName", e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Date of Birth</Label>
                <Input
                  type="date"
                  className="rounded-xl border-slate-200 h-11"
                  value={formData.dob}
                  onChange={e => set("dob", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Gender</Label>
                <Select value={formData.gender} onValueChange={v => set("gender", v)}>
                  <SelectTrigger className="rounded-xl border-slate-200 h-11">
                    <SelectValue placeholder="Select gender" />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl">
                    <SelectItem value="Male">Male</SelectItem>
                    <SelectItem value="Female">Female</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Nationality</Label>
                <Select value={formData.nationality} onValueChange={v => set("nationality", v)}>
                  <SelectTrigger className="rounded-xl border-slate-200 h-11">
                    <SelectValue placeholder="Select nationality" />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl">
                    {NATIONALITIES.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Previous School</Label>
                <Input
                  placeholder="School name"
                  className="rounded-xl border-slate-200 h-11"
                  value={formData.previousSchool}
                  onChange={e => set("previousSchool", e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Parent / Guardian */}
          <div>
            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">Parent / Guardian</h3>
            <div className="grid grid-cols-2 gap-5">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Parent / Guardian Name *</Label>
                <Input
                  placeholder="Full Name"
                  className="rounded-xl border-slate-200 h-11"
                  value={formData.parentName}
                  onChange={e => set("parentName", e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Relationship</Label>
                <Select value={formData.relationship} onValueChange={v => set("relationship", v)}>
                  <SelectTrigger className="rounded-xl border-slate-200 h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl">
                    {RELATIONSHIPS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Primary Phone *</Label>
                <Input
                  placeholder="+974 ..."
                  className="rounded-xl border-slate-200 h-11"
                  value={formData.phone}
                  onChange={e => set("phone", e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Alternate Phone</Label>
                <Input
                  placeholder="+974 ..."
                  className="rounded-xl border-slate-200 h-11"
                  value={formData.altPhone}
                  onChange={e => set("altPhone", e.target.value)}
                />
              </div>
              <div className="space-y-2 col-span-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Email Address *</Label>
                <Input
                  type="email"
                  placeholder="email@example.com"
                  className="rounded-xl border-slate-200 h-11"
                  value={formData.email}
                  onChange={e => set("email", e.target.value)}
                  required
                />
              </div>
            </div>
          </div>

          {/* Enquiry Details */}
          <div>
            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">Enquiry Details</h3>
            <div className="grid grid-cols-2 gap-5">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Grade *</Label>
                <Select value={formData.interestedClass} onValueChange={v => set("interestedClass", v)} required>
                  <SelectTrigger className="rounded-xl border-slate-200 h-11">
                    <SelectValue placeholder="Select grade" />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl max-h-60 overflow-y-auto">
                    {availableClassNames.map(cls => <SelectItem key={cls} value={cls}>{cls}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Enquiry Source</Label>
                <Select value={formData.source} onValueChange={v => set("source", v as Lead["source"])}>
                  <SelectTrigger className="rounded-xl border-slate-200 h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl">
                    <SelectItem value="Website">Website</SelectItem>
                    <SelectItem value="Walk-in">Walk-in</SelectItem>
                    <SelectItem value="Ads">Ads</SelectItem>
                    <SelectItem value="Referral">Referral</SelectItem>
                    <SelectItem value="Social Media">Social Media</SelectItem>
                    <SelectItem value="Phone Call">Phone Call</SelectItem>
                    <SelectItem value="Open Day">Open Day</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 col-span-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Notes / Additional Info</Label>
                <Textarea
                  placeholder="Any additional information about this enquiry..."
                  className="rounded-xl border-slate-200 min-h-[90px]"
                  value={formData.notes}
                  onChange={e => set("notes", e.target.value)}
                />
              </div>
            </div>
          </div>

          <DialogFooter className="pt-4 border-t border-slate-100">
            <Button type="button" variant="ghost" className="rounded-xl font-bold text-xs h-11 px-6" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" className="rounded-xl gradient-primary text-white font-bold text-xs h-11 px-8 shadow-lg shadow-primary/20">
              Save Enquiry
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
