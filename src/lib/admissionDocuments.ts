// The admission document checklist (National ID, Birth Certificate, TC, ...)
// used to be a hardcoded const inside AdmissionOfficerDashboard.tsx — no
// school could add/remove/reorder a required document without a code change.
// This makes it real, persisted configuration: read from the DB, editable by
// an admin, with the historical list kept only as an in-memory fallback for
// schools that haven't customized it yet — never silently written to the DB
// as fake "seed" rows.
import { smartDb } from "@/lib/localDb";

export interface AdmissionDocumentType {
  id: string;
  key: string;
  label: string;
  required: boolean;
  order: number;
  uid?: string;
  createdAt?: string;
  updatedAt?: string;
}

export const DEFAULT_ADMISSION_DOCUMENTS: AdmissionDocumentType[] = [
  { id: "qidCopy",    key: "qidCopy",    label: "Student National ID / Passport Copy", required: true,  order: 0 },
  { id: "birthCert",  key: "birthCert",  label: "Birth Certificate",                   required: true,  order: 1 },
  { id: "idProof",    key: "idProof",    label: "Parent / Guardian ID Proof",          required: true,  order: 2 },
  { id: "tc",         key: "tc",         label: "Transfer Certificate (TC)",           required: true,  order: 3 },
  { id: "reportCard", key: "reportCard", label: "Previous School Report Card",         required: true,  order: 4 },
  { id: "passport",   key: "passport",   label: "Passport Copy (if applicable)",       required: false, order: 5 },
  { id: "medical",    key: "medical",    label: "Medical / Health Certificate",        required: false, order: 6 },
];

export async function getAdmissionDocumentTypes(): Promise<AdmissionDocumentType[]> {
  const rows = (await smartDb.getAll("AdmissionDocumentType", undefined).catch(() => [])) as AdmissionDocumentType[];
  if (!rows || rows.length === 0) return DEFAULT_ADMISSION_DOCUMENTS;
  return [...rows].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export async function saveAdmissionDocumentType(doc: AdmissionDocumentType, uid?: string): Promise<AdmissionDocumentType> {
  const now = new Date().toISOString();
  return (await smartDb.create("AdmissionDocumentType", { ...doc, uid, updatedAt: now }, doc.id)) as AdmissionDocumentType;
}

export async function deleteAdmissionDocumentType(id: string): Promise<void> {
  await smartDb.delete("AdmissionDocumentType", id);
}
