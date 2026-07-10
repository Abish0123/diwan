import React, { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useStudents } from "@/contexts/StudentContext";
import { useClasses } from "@/hooks/useClasses";
import { useGrades } from "@/contexts/CurriculumContext";
import { toast } from "sonner";
import { UserPlus, GraduationCap, Mail, ShieldCheck, Edit3, Phone, MapPin } from "lucide-react";
import { generateUsername, generatePassword } from "@/lib/roles";
import { Student } from "@/types";
import { userRepository } from "@/repositories/UserRepository";

interface AddStudentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student?: Student | null;
}

export function AddStudentDialog({ open, onOpenChange, student }: AddStudentDialogProps) {
  const { addStudents, updateStudent } = useStudents();
  const { classes } = useClasses();
  const grades = useGrades();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedGrade, setSelectedGrade] = useState("");
  const [selectedSection, setSelectedSection] = useState("");
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    classId: "",
    status: "Active",
    studentId: "", // Optional custom ID
  });

  // Deduplicate and get available grades from database classes
  const availableGrades = useMemo(() => {
    const dbClasses = classes || [];
    const classesWithSection = dbClasses.filter(c => c.section);
    if (classesWithSection.length === 0) {
      return [];
    }
    const unique = Array.from(new Set(classesWithSection.map(c => c.grade || c.name).filter(Boolean)));
    return unique.sort((a, b) => {
      const ia = grades.indexOf(a);
      const ib = grades.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  }, [classes, grades]);

  // Sections for the selected class grade
  const availableSections = useMemo(() => {
    const dbClasses = classes || [];
    if (dbClasses.length === 0 || !selectedGrade) {
      return [];
    }
    const classesForGrade = dbClasses.filter(c => c.grade === selectedGrade || c.name === selectedGrade);
    const sectionsSet = new Set<string>();
    classesForGrade.forEach(c => {
      if (c.section) {
        sectionsSet.add(c.section);
      }
    });
    return Array.from(sectionsSet).sort();
  }, [classes, selectedGrade]);

  useEffect(() => {
    if (student) {
      setFormData({
        name: student.name || "",
        email: student.email || "",
        phone: student.phone || "",
        address: student.address || "",
        classId: student.classId || "",
        status: student.status || "Active",
        studentId: student.id || "",
      });

      // Attempt to resolve grade and section from student's classId
      const dbClasses = classes || [];
      const matchedClass = dbClasses.find(c => c.name === student.classId);
      if (matchedClass) {
        setSelectedGrade(matchedClass.grade || matchedClass.name || "");
        setSelectedSection(matchedClass.section || "");
      } else {
        // Fallback parsing
        const parts = student.classId ? student.classId.split(/\s*-\s*/) : [];
        if (parts.length >= 2) {
          setSelectedGrade(parts[0]);
          setSelectedSection(parts[1]);
        } else {
          setSelectedGrade((student as any).grade || student.classId || "");
          setSelectedSection((student as any).section || "");
        }
      }
    } else {
      setFormData({
        name: "",
        email: "",
        phone: "",
        address: "",
        classId: "",
        status: "Active",
        studentId: "",
      });
      setSelectedGrade("");
      setSelectedSection("");
    }
  }, [student, open, classes]);

  // Sync classId value when Grade/Section selections change
  useEffect(() => {
    if (selectedGrade && selectedSection) {
      const dbClasses = classes || [];
      const matched = dbClasses.find(c => 
        (c.grade === selectedGrade || c.name === selectedGrade) && 
        c.section === selectedSection
      );
      setFormData(prev => ({
        ...prev,
        classId: matched ? matched.name : `${selectedGrade} - ${selectedSection}`
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        classId: ""
      }));
    }
  }, [selectedGrade, selectedSection, classes]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email || !selectedGrade || !selectedSection) {
      toast.error("Please fill in all required fields");
      return;
    }

    setIsSubmitting(true);
    try {
      if (student) {
        // Editing existing student — no credential generation
        await updateStudent(student.id, {
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
          address: formData.address,
          classId: formData.classId,
          status: formData.status,
          grade: selectedGrade,
          section: selectedSection,
        } as Partial<Student> & { grade: string; section: string });
        toast.success("Student updated successfully");
      } else {
        // New admission — auto-generate credentials for student and parent
        const gradeNum = selectedGrade.match(/(\d+)/)?.[1] || selectedGrade;
        const stuUsername = generateUsername(formData.name, `grade${gradeNum}${selectedSection.toLowerCase()}`);
        const stuPassword = generatePassword();
        const parentUsername = generateUsername(`parent.${formData.name}`, "parent");
        const parentPassword = generatePassword();

        await addStudents([{
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
          address: formData.address,
          classId: formData.classId,
          status: formData.status,
          id: formData.studentId || undefined,
          grade: selectedGrade,
          section: selectedSection,
          username: stuUsername,
          password: stuPassword,
        } as any]);

        // Persist student user record
        await userRepository.create({
          id: stuUsername,
          uid: stuUsername,
          name: formData.name,
          email: formData.email,
          role: "student",
          username: stuUsername,
          password: stuPassword,
          status: "Active",
        }).catch(() => {});

        // Persist parent user record
        const parentEmail = `parent.${formData.email}`;
        await userRepository.create({
          id: parentUsername,
          uid: parentUsername,
          name: `Parent of ${formData.name}`,
          email: parentEmail,
          role: "parent",
          username: parentUsername,
          password: parentPassword,
          status: "Active",
        }).catch(() => {});

        toast.success(`Student admitted — credentials generated`, {
          description: `Student: ${stuUsername} / ${stuPassword}   |   Parent: ${parentUsername} / ${parentPassword}`,
          duration: 12000,
        });
      }
      onOpenChange(false);
    } catch (error) {
      console.error("Error saving student:", error);
      toast.error(student ? "Failed to update student" : "Failed to add student");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] rounded-2xl p-0 overflow-hidden border-none shadow-2xl">
        <DialogHeader className="p-6 bg-gradient-to-r from-primary/10 to-transparent">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              {student ? <Edit3 className="h-5 w-5" /> : <UserPlus className="h-5 w-5" />}
            </div>
            <div>
              <DialogTitle className="text-xl font-bold tracking-tight">
                {student ? "Edit Student Profile" : "Add New Student"}
              </DialogTitle>
              <DialogDescription className="text-xs font-medium text-muted-foreground">
                {student ? "Update the student's information below." : "Enter the student's basic information to create a new record."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <GraduationCap className="h-3 w-3" />
                Full Name <span className="text-destructive">*</span>
              </Label>
              <Input 
                id="name" 
                placeholder="e.g. John Doe" 
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="h-11 rounded-xl border-border bg-secondary/20 focus-visible:ring-primary/20"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Mail className="h-3 w-3" />
                Email Address <span className="text-destructive">*</span>
              </Label>
              <Input 
                id="email" 
                type="email"
                placeholder="e.g. john.doe@school.com" 
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="h-11 rounded-xl border-border bg-secondary/20 focus-visible:ring-primary/20"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <Phone className="h-3 w-3" />
                  Phone Number
                </Label>
                <Input 
                  id="phone" 
                  placeholder="e.g. +1 555 000 0000" 
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="h-11 rounded-xl border-border bg-secondary/20 focus-visible:ring-primary/20"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="address" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <MapPin className="h-3 w-3" />
                  Address
                </Label>
                <Input 
                  id="address" 
                  placeholder="e.g. 123 Main St" 
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="h-11 rounded-xl border-border bg-secondary/20 focus-visible:ring-primary/20"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="grade" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Grade / Class <span className="text-destructive">*</span>
                </Label>
                <Select 
                  value={selectedGrade} 
                  onValueChange={(value) => {
                    setSelectedGrade(value);
                    setSelectedSection("");
                  }}
                >
                  <SelectTrigger className="h-11 rounded-xl border-border bg-secondary/20 focus:ring-primary/20">
                    <SelectValue placeholder="Select Grade" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[200px] overflow-y-auto rounded-xl">
                    {availableGrades.map((grade) => (
                      <SelectItem key={grade} value={grade}>
                        {grade.startsWith("Grade ") || grade.includes("KG") ? grade : `Grade ${grade}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="section" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Section <span className="text-destructive">*</span>
                </Label>
                <Select 
                  value={selectedSection} 
                  onValueChange={(value) => setSelectedSection(value)}
                  disabled={!selectedGrade}
                >
                  <SelectTrigger className="h-11 rounded-xl border-border bg-secondary/20 focus:ring-primary/20">
                    <SelectValue placeholder="Select Section" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[200px] overflow-y-auto rounded-xl">
                    {availableSections.map((sec) => (
                      <SelectItem key={sec} value={sec}>
                        Section {sec}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="status" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Status
                </Label>
                <Select 
                  value={formData.status} 
                  onValueChange={(value) => setFormData({ ...formData, status: value })}
                >
                  <SelectTrigger className="h-11 rounded-xl border-border bg-secondary/20 focus:ring-primary/20">
                    <SelectValue placeholder="Select Status" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Inactive">Inactive</SelectItem>
                    <SelectItem value="Suspended">Suspended</SelectItem>
                    <SelectItem value="Alumni">Alumni</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {!student ? (
                <div className="space-y-2">
                  <Label htmlFor="studentId" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <ShieldCheck className="h-3 w-3" />
                    Custom Student ID (Optional)
                  </Label>
                  <Input 
                    id="studentId" 
                    placeholder="e.g. STU12345" 
                    value={formData.studentId}
                    onChange={(e) => setFormData({ ...formData, studentId: e.target.value })}
                    className="h-11 rounded-xl border-border bg-secondary/20 focus-visible:ring-primary/20"
                  />
                </div>
              ) : (
                <div />
              )}
            </div>

            {!student && (
              <div className="space-y-1 -mt-2">
                <p className="text-[10px] text-muted-foreground italic">Leave blank to auto-generate a unique ID.</p>
              </div>
            )}
          </div>

          <DialogFooter className="pt-4 flex items-center justify-end gap-3">
            <Button 
              type="button"
              variant="ghost" 
              onClick={() => onOpenChange(false)}
              className="h-10 px-6 font-bold text-xs uppercase tracking-wider rounded-xl hover:bg-secondary/50"
            >
              Cancel
            </Button>
            <Button 
              type="submit"
              className="gradient-primary h-10 px-8 font-bold text-xs uppercase tracking-wider shadow-lg shadow-primary/20 rounded-xl"
              disabled={isSubmitting}
            >
              {isSubmitting ? (student ? "Updating..." : "Adding...") : (student ? "Save Changes" : "Add Student")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
