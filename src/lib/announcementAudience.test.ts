import { describe, it, expect } from "vitest";
import { canViewAnnouncement, classMatchesViewer, filterAnnouncementsForViewer, audienceGroupForRole } from "./announcementAudience";

describe("audienceGroupForRole", () => {
  it("maps admin-tier roles to 'admin'", () => {
    expect(audienceGroupForRole("admin")).toBe("admin");
  });

  it("maps the student layout role to 'student'", () => {
    expect(audienceGroupForRole("student")).toBe("student");
  });

  it("maps the parent layout role to 'parent'", () => {
    expect(audienceGroupForRole("parent")).toBe("parent");
  });

  it("maps every other role (teachers, librarians, etc.) to 'staff'", () => {
    expect(audienceGroupForRole("teacher")).toBe("staff");
    expect(audienceGroupForRole("librarian")).toBe("staff");
  });
});

describe("classMatchesViewer", () => {
  it("a school-wide (empty) targetClass matches every viewer", () => {
    expect(classMatchesViewer(undefined, { grade: "Grade 5", section: "A" })).toBe(true);
    expect(classMatchesViewer("", { grade: "Grade 5", section: "A" })).toBe(true);
  });

  it("a grade-wide target matches any section of that grade", () => {
    expect(classMatchesViewer("Grade 5", { grade: "Grade 5", section: "A" })).toBe(true);
    expect(classMatchesViewer("Grade 5", { grade: "Grade 5", section: "Z" })).toBe(true);
  });

  it("a section-specific target only matches that exact section", () => {
    expect(classMatchesViewer("Grade 5-B", { grade: "Grade 5", section: "B" })).toBe(true);
    expect(classMatchesViewer("Grade 5-B", { grade: "Grade 5", section: "A" })).toBe(false);
  });

  it("a class-targeted announcement is hidden from a viewer with no known class", () => {
    expect(classMatchesViewer("Grade 5", { grade: undefined })).toBe(false);
  });

  it("normalizes 'Section B' the same as 'B'", () => {
    expect(classMatchesViewer("Grade 5-B", { grade: "Grade 5", section: "Section B" })).toBe(true);
  });
});

describe("canViewAnnouncement", () => {
  it("admin sees everything, including drafts", () => {
    expect(canViewAnnouncement({ status: "Draft", targetAudience: "Staff" }, "admin")).toBe(true);
  });

  it("non-admin never sees an unpublished announcement", () => {
    expect(canViewAnnouncement({ status: "Draft", targetAudience: "All" }, "student", [{ grade: "Grade 5" }])).toBe(false);
  });

  it("a Students-only announcement is hidden from staff", () => {
    const a = { status: "Published", targetAudience: "Students" };
    expect(canViewAnnouncement(a, "teacher")).toBe(false);
    expect(canViewAnnouncement(a, "student", [{ grade: "Grade 5" }])).toBe(true);
  });

  it("a Parents-only announcement is hidden from students", () => {
    const a = { status: "Published", targetAudience: "Parents" };
    expect(canViewAnnouncement(a, "student", [{ grade: "Grade 5" }])).toBe(false);
    expect(canViewAnnouncement(a, "parent", [{ grade: "Grade 5" }])).toBe(true);
  });

  it("staff see grade-wide notices regardless of which class they teach", () => {
    const a = { status: "Published", targetAudience: "Staff", targetClass: "Grade 9-C" };
    expect(canViewAnnouncement(a, "teacher")).toBe(true);
  });

  it("a class-targeted parent notice only reaches a parent with a matching child", () => {
    const a = { status: "Published", targetAudience: "Parents", targetClass: "Grade 5-B" };
    expect(canViewAnnouncement(a, "parent", [{ grade: "Grade 5", section: "B" }])).toBe(true);
    expect(canViewAnnouncement(a, "parent", [{ grade: "Grade 5", section: "A" }])).toBe(false);
    expect(canViewAnnouncement(a, "parent", [{ grade: "Grade 3", section: "B" }, { grade: "Grade 5", section: "B" }])).toBe(true);
  });

  it("'All' audience is visible to every role", () => {
    const a = { status: "Published", targetAudience: "All" };
    expect(canViewAnnouncement(a, "student", [{ grade: "Grade 5" }])).toBe(true);
    expect(canViewAnnouncement(a, "teacher")).toBe(true);
    expect(canViewAnnouncement(a, "parent", [{ grade: "Grade 5" }])).toBe(true);
  });
});

describe("filterAnnouncementsForViewer", () => {
  it("keeps only announcements the viewer is actually allowed to see", () => {
    const rows = [
      { id: "1", status: "Published", targetAudience: "All" },
      { id: "2", status: "Draft", targetAudience: "All" },
      { id: "3", status: "Published", targetAudience: "Staff" },
      { id: "4", status: "Published", targetAudience: "Students", targetClass: "Grade 5" },
    ];
    const visible = filterAnnouncementsForViewer(rows, "student", [{ grade: "Grade 5", section: "A" }]);
    expect(visible.map(r => r.id)).toEqual(["1", "4"]);
  });
});
