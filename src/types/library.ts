export interface Book {
  id: string;
  title: string;
  author: string;
  category: string;
  status: "Available" | "Borrowed";
  isbn: string;
  addedDate: string;
  description?: string;
  quantity?: number;
  available?: number;
  issuedTo?: string | null;
  dueDate?: string | null;
}

export interface DigitalResource {
  id: string;
  title: string;
  type: string;
  size: string;
  icon: React.ElementType;
  color: string;
  bg: string;
}

export interface IssueData {
  studentId: string;
  issueDate: string;
  dueDate: string;
}

export interface LibraryMember {
  id: string;
  name: string;
  role: string;
  grade: string;
  borrowed: number;
  joinDate: string;
  status: "Active" | "Inactive" | "Suspended";
}

export interface LibraryFilters {
  category: string;
  status: string;
}
