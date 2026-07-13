import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Must mock global fetch BEFORE importing apiClient so the module under test
// picks up the stub when it accesses globalThis.fetch at call time.
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

import { apiClient } from "./apiClient";

// ── Helpers ───────────────────────────────────────────────────────────────────

function okResponse(body: unknown): Response {
  return {
    ok: true,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function errorResponse(status: number, body: unknown): Response {
  return {
    ok: false,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

// ── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── GET helpers ───────────────────────────────────────────────────────────────

describe("GET requests", () => {
  it("getStudents() calls GET /students and returns the parsed array", async () => {
    const students = [{ id: "1", name: "Ali" }];
    fetchMock.mockResolvedValue(okResponse(students));

    const result = await apiClient.getStudents();

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/students$/);
    expect(init.method).toBe("GET");
    expect(result).toEqual(students);
  });

  it("getStudent(id) calls GET /students/:id", async () => {
    const student = { id: "42", name: "Sara" };
    fetchMock.mockResolvedValue(okResponse(student));

    const result = await apiClient.getStudent("42");

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/students\/42$/);
    expect(result).toEqual(student);
  });

  it("getLeads() calls GET /admissions", async () => {
    fetchMock.mockResolvedValue(okResponse([]));
    await apiClient.getLeads();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/admissions$/);
    expect(init.method).toBe("GET");
  });

  it("getAttendance() calls GET /attendance", async () => {
    fetchMock.mockResolvedValue(okResponse([]));
    await apiClient.getAttendance();

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/attendance$/);
  });

  it("getHealthRecords() calls GET /health", async () => {
    fetchMock.mockResolvedValue(okResponse([]));
    await apiClient.getHealthRecords();

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/health$/);
  });

  it("getIncidents() calls GET /incidents", async () => {
    fetchMock.mockResolvedValue(okResponse([]));
    await apiClient.getIncidents();

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/incidents$/);
  });

  it("getExitRecords() calls GET /exit-records", async () => {
    fetchMock.mockResolvedValue(okResponse([]));
    await apiClient.getExitRecords();

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/exit-records$/);
  });
});

// ── POST / PUT / DELETE helpers ───────────────────────────────────────────────

describe("mutation requests", () => {
  it("createStudent() calls POST /students with JSON body and Content-Type header", async () => {
    const payload = { name: "New Student" };
    fetchMock.mockResolvedValue(okResponse({ id: "99", ...payload }));

    await apiClient.createStudent(payload);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/students$/);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual(payload);
  });

  it("updateStudent() calls PUT /students/:id with JSON body", async () => {
    const payload = { name: "Updated" };
    fetchMock.mockResolvedValue(okResponse({ id: "5", ...payload }));

    await apiClient.updateStudent("5", payload);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/students\/5$/);
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual(payload);
  });

  it("deleteStudent() calls DELETE /students/:id without a body", async () => {
    fetchMock.mockResolvedValue(okResponse({ message: "deleted" }));

    await apiClient.deleteStudent("7");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/students\/7$/);
    expect(init.method).toBe("DELETE");
    expect(init.body).toBeUndefined();
  });

  it("createLead() calls POST /admissions", async () => {
    fetchMock.mockResolvedValue(okResponse({ id: "L1" }));

    const payload = { studentName: "Zara", status: "Enquiry" };
    await apiClient.createLead(payload);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/admissions$/);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual(payload);
  });

  it("updateLead() calls PUT /admissions/:id", async () => {
    fetchMock.mockResolvedValue(okResponse({ id: "L1" }));

    await apiClient.updateLead("L1", { status: "Enrolled" });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/admissions\/L1$/);
    expect(init.method).toBe("PUT");
  });

  it("enrollLead() calls POST /admissions/:id/enroll without a data body", async () => {
    fetchMock.mockResolvedValue(okResponse({ success: true }));

    await apiClient.enrollLead("L2");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/admissions\/L2\/enroll$/);
    expect(init.method).toBe("POST");
    expect(init.body).toBeUndefined();
  });

  it("createAttendance() calls POST /attendance", async () => {
    fetchMock.mockResolvedValue(okResponse({ id: "A1" }));
    await apiClient.createAttendance({ studentId: "1", date: "2026-01-01" });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/attendance$/);
    expect(init.method).toBe("POST");
  });
});

// ── Error handling ────────────────────────────────────────────────────────────

describe("error handling", () => {
  it("throws the server error message when response.ok is false", async () => {
    fetchMock.mockResolvedValue(errorResponse(404, { error: "Student not found" }));

    await expect(apiClient.getStudent("999")).rejects.toThrow("Student not found");
  });

  it("throws a generic API Error message when error body has no 'error' field", async () => {
    fetchMock.mockResolvedValue(errorResponse(500, {}));

    await expect(apiClient.getStudents()).rejects.toThrow("API Error: 500");
  });

  it("propagates a network-level fetch rejection (e.g. ECONNREFUSED)", async () => {
    fetchMock.mockRejectedValue(new Error("Failed to fetch"));

    await expect(apiClient.getStudents()).rejects.toThrow("Failed to fetch");
  });
});

// ── Base URL ──────────────────────────────────────────────────────────────────

describe("base URL composition", () => {
  it("all requests are sent to the same origin (localhost:5000/api by default)", async () => {
    fetchMock.mockResolvedValue(okResponse([]));

    await apiClient.getStudents();
    await apiClient.getLeads();
    await apiClient.getAttendance();

    for (const call of fetchMock.mock.calls) {
      const url = call[0] as string;
      expect(url.startsWith("http://localhost:5000/api")).toBe(true);
    }
  });
});
