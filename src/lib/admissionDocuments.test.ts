import { describe, it, expect, vi, beforeEach } from "vitest";

const getAllMock = vi.fn();
const createMock = vi.fn();
const deleteMock = vi.fn();

vi.mock("@/lib/localDb", () => ({
  smartDb: {
    getAll: (...args: unknown[]) => getAllMock(...args),
    create: (...args: unknown[]) => createMock(...args),
    delete: (...args: unknown[]) => deleteMock(...args),
  },
}));

import {
  DEFAULT_ADMISSION_DOCUMENTS,
  getAdmissionDocumentTypes,
  saveAdmissionDocumentType,
  deleteAdmissionDocumentType,
  type AdmissionDocumentType,
} from "./admissionDocuments";

describe("DEFAULT_ADMISSION_DOCUMENTS", () => {
  it("contains the historical hardcoded checklist ordered 0..6", () => {
    expect(DEFAULT_ADMISSION_DOCUMENTS).toHaveLength(7);
    expect(DEFAULT_ADMISSION_DOCUMENTS.map((d) => d.order)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("marks the core documents required and the optional ones not required", () => {
    const byKey = Object.fromEntries(DEFAULT_ADMISSION_DOCUMENTS.map((d) => [d.key, d]));
    expect(byKey.qidCopy.required).toBe(true);
    expect(byKey.birthCert.required).toBe(true);
    expect(byKey.idProof.required).toBe(true);
    expect(byKey.tc.required).toBe(true);
    expect(byKey.reportCard.required).toBe(true);
    expect(byKey.passport.required).toBe(false);
    expect(byKey.medical.required).toBe(false);
  });
});

describe("getAdmissionDocumentTypes", () => {
  beforeEach(() => {
    getAllMock.mockReset();
  });

  it("falls back to DEFAULT_ADMISSION_DOCUMENTS when the DB returns an empty array", async () => {
    getAllMock.mockResolvedValue([]);

    const result = await getAdmissionDocumentTypes();

    expect(getAllMock).toHaveBeenCalledWith("AdmissionDocumentType", undefined);
    expect(result).toEqual(DEFAULT_ADMISSION_DOCUMENTS);
  });

  it("falls back to DEFAULT_ADMISSION_DOCUMENTS when the DB returns null/undefined", async () => {
    getAllMock.mockResolvedValue(undefined);
    expect(await getAdmissionDocumentTypes()).toEqual(DEFAULT_ADMISSION_DOCUMENTS);

    getAllMock.mockResolvedValue(null);
    expect(await getAdmissionDocumentTypes()).toEqual(DEFAULT_ADMISSION_DOCUMENTS);
  });

  it("falls back to DEFAULT_ADMISSION_DOCUMENTS when the DB call rejects", async () => {
    getAllMock.mockRejectedValue(new Error("db down"));

    const result = await getAdmissionDocumentTypes();

    expect(result).toEqual(DEFAULT_ADMISSION_DOCUMENTS);
  });

  it("returns custom rows from the DB sorted by order ascending", async () => {
    const rows: AdmissionDocumentType[] = [
      { id: "b", key: "b", label: "B", required: false, order: 2 },
      { id: "a", key: "a", label: "A", required: true, order: 0 },
      { id: "c", key: "c", label: "C", required: true, order: 1 },
    ];
    getAllMock.mockResolvedValue(rows);

    const result = await getAdmissionDocumentTypes();

    expect(result.map((r) => r.id)).toEqual(["a", "c", "b"]);
  });

  it("treats a missing/undefined order as 0 when sorting", async () => {
    const rows: AdmissionDocumentType[] = [
      { id: "withOrder", key: "withOrder", label: "With", required: true, order: -1 },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { id: "noOrder", key: "noOrder", label: "No order", required: true } as any,
    ];
    getAllMock.mockResolvedValue(rows);

    const result = await getAdmissionDocumentTypes();

    // withOrder (-1) sorts before noOrder (treated as 0)
    expect(result.map((r) => r.id)).toEqual(["withOrder", "noOrder"]);
  });

  it("does not mutate the array returned by the DB (sorts a copy)", async () => {
    const rows: AdmissionDocumentType[] = [
      { id: "b", key: "b", label: "B", required: false, order: 1 },
      { id: "a", key: "a", label: "A", required: true, order: 0 },
    ];
    const original = [...rows];
    getAllMock.mockResolvedValue(rows);

    await getAdmissionDocumentTypes();

    expect(rows).toEqual(original);
  });
});

describe("saveAdmissionDocumentType", () => {
  beforeEach(() => {
    createMock.mockReset();
  });

  it("persists the doc via smartDb.create using the doc id as the record key", async () => {
    const doc: AdmissionDocumentType = {
      id: "customDoc",
      key: "customDoc",
      label: "Custom Document",
      required: true,
      order: 8,
    };
    createMock.mockResolvedValue({ ...doc, updatedAt: "2026-07-13T00:00:00.000Z" });

    const result = await saveAdmissionDocumentType(doc, "admin-1");

    expect(createMock).toHaveBeenCalledTimes(1);
    const [table, record, id] = createMock.mock.calls[0];
    expect(table).toBe("AdmissionDocumentType");
    expect(id).toBe("customDoc");
    expect(record).toMatchObject({ ...doc, uid: "admin-1" });
    expect(typeof record.updatedAt).toBe("string");
    expect(result).toMatchObject(doc);
  });

  it("works without a uid (uid becomes undefined on the record)", async () => {
    const doc: AdmissionDocumentType = {
      id: "noUid",
      key: "noUid",
      label: "No Uid Doc",
      required: false,
      order: 9,
    };
    createMock.mockResolvedValue(doc);

    await saveAdmissionDocumentType(doc);

    const [, record] = createMock.mock.calls[0];
    expect(record.uid).toBeUndefined();
  });

  it("stamps updatedAt with the current time as an ISO string", async () => {
    const fixedNow = new Date("2026-01-01T12:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);
    createMock.mockResolvedValue({});

    const doc: AdmissionDocumentType = {
      id: "timed",
      key: "timed",
      label: "Timed Doc",
      required: true,
      order: 1,
    };
    await saveAdmissionDocumentType(doc);

    const [, record] = createMock.mock.calls[0];
    expect(record.updatedAt).toBe(fixedNow.toISOString());

    vi.useRealTimers();
  });
});

describe("deleteAdmissionDocumentType", () => {
  beforeEach(() => {
    deleteMock.mockReset();
  });

  it("deletes by id from the AdmissionDocumentType table", async () => {
    deleteMock.mockResolvedValue(undefined);

    await deleteAdmissionDocumentType("qidCopy");

    expect(deleteMock).toHaveBeenCalledWith("AdmissionDocumentType", "qidCopy");
  });

  it("propagates errors from smartDb.delete", async () => {
    deleteMock.mockRejectedValue(new Error("not found"));

    await expect(deleteAdmissionDocumentType("missing")).rejects.toThrow("not found");
  });
});
