import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// useAuth — the only fields useParentChildren reads are user.uid / user.email / role.
const authMock = vi.hoisted(() => ({
  user: null as { uid?: string; email?: string } | null,
  role: null as string | null,
}));
vi.mock("./useAuth", () => ({
  useAuth: () => ({ user: authMock.user, role: authMock.role }),
}));

// smartDb — the real external boundary (Student table).
vi.mock("@/lib/localDb", () => ({
  smartDb: {
    getAll: vi.fn(),
  },
}));

import { smartDb } from "@/lib/localDb";
import { useParentChildren } from "./useParentChildren";

const mockedGetAll = vi.mocked(smartDb.getAll);

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

// In-memory localStorage stub so selectChild()'s persistence can be verified
// without depending on jsdom's real localStorage implementation details.
function makeLocalStorageStub() {
  const store = new Map<string, string>();
  return {
    getItem: vi.fn((k: string) => (store.has(k) ? store.get(k)! : null)),
    setItem: vi.fn((k: string, v: string) => { store.set(k, v); }),
    removeItem: vi.fn((k: string) => { store.delete(k); }),
    clear: vi.fn(() => store.clear()),
  };
}

const STUDENTS = [
  {
    id: "s1",
    name: "Amina Khan",
    grade: "5",
    section: "A",
    rollNo: "5",
    admissionNo: "A100",
    gender: "Female",
    dateOfBirth: "2015-04-01",
    house: "Red",
    bloodGroup: "O+",
    nationality: "UAE",
    fatherEmail: "Dad@Example.com",
  },
  {
    id: "s2",
    name: "Zayd Khan",
    grade: "3",
    section: "B",
    motherEmail: "  parent@example.com ",
  },
  {
    id: "s3",
    name: "Other Kid",
    grade: "2",
    section: "C",
    guardianEmail: "someoneelse@example.com",
  },
];

describe("useParentChildren", () => {
  let localStorageStub: ReturnType<typeof makeLocalStorageStub>;

  beforeEach(() => {
    vi.clearAllMocks();
    authMock.user = null;
    authMock.role = null;
    localStorageStub = makeLocalStorageStub();
    vi.stubGlobal("localStorage", localStorageStub);
  });

  it("does not query smartDb and starts non-loading when role is not 'parent'", async () => {
    authMock.user = { uid: "u1", email: "dad@example.com" };
    authMock.role = "admin";

    const { result } = renderHook(() => useParentChildren(), { wrapper: makeWrapper() });

    // Query is disabled entirely (enabled: false), so it never enters a loading state.
    expect(result.current.loading).toBe(false);
    expect(result.current.children).toEqual([]);
    expect(mockedGetAll).not.toHaveBeenCalled();
  });

  it("does not query smartDb when there is no authenticated email, even if role is parent", async () => {
    authMock.user = { uid: "u1", email: "" };
    authMock.role = "parent";

    const { result } = renderHook(() => useParentChildren(), { wrapper: makeWrapper() });

    expect(result.current.loading).toBe(false);
    expect(mockedGetAll).not.toHaveBeenCalled();
  });

  it("filters students to those where father/mother/guardian email matches (case-insensitive, trimmed) and maps fields", async () => {
    authMock.user = { uid: "parent-1", email: "Dad@Example.com" };
    authMock.role = "parent";
    mockedGetAll.mockResolvedValue(STUDENTS as any);

    const { result } = renderHook(() => useParentChildren(), { wrapper: makeWrapper() });

    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockedGetAll).toHaveBeenCalledWith("Student");
    expect(result.current.children).toHaveLength(1);
    expect(result.current.children[0]).toEqual({
      id: "s1",
      name: "Amina Khan",
      grade: "5",
      section: "A",
      rollNo: "5",
      admissionNo: "A100",
      gender: "Female",
      dob: "2015-04-01",
      house: "Red",
      bloodGroup: "O+",
      nationality: "UAE",
      _realStudent: true,
    });
  });

  it("matches via motherEmail with surrounding whitespace, case-insensitively", async () => {
    authMock.user = { uid: "parent-2", email: "parent@example.com" };
    authMock.role = "parent";
    mockedGetAll.mockResolvedValue(STUDENTS as any);

    const { result } = renderHook(() => useParentChildren(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.children).toHaveLength(1);
    expect(result.current.children[0].id).toBe("s2");
  });

  it("fills in '—' placeholders for missing optional fields", async () => {
    authMock.user = { uid: "parent-2", email: "parent@example.com" };
    authMock.role = "parent";
    mockedGetAll.mockResolvedValue(STUDENTS as any);

    const { result } = renderHook(() => useParentChildren(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));

    const zayd = result.current.children[0];
    expect(zayd.rollNo).toBe("—");
    expect(zayd.admissionNo).toBe("—");
    expect(zayd.gender).toBe("—");
    expect(zayd.dob).toBe("—");
    expect(zayd.house).toBe("—");
    expect(zayd.bloodGroup).toBe("—");
    expect(zayd.nationality).toBe("—");
  });

  it("returns an empty children array (not an error) when no student matches the parent's email", async () => {
    authMock.user = { uid: "parent-3", email: "nobody@example.com" };
    authMock.role = "parent";
    mockedGetAll.mockResolvedValue(STUDENTS as any);

    const { result } = renderHook(() => useParentChildren(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.children).toEqual([]);
    expect(result.current.selected).toBeUndefined();
  });

  it("initializes selectedId from localStorage keyed by uid, and 'selected' resolves that child", async () => {
    authMock.user = { uid: "parent-1", email: "dad@example.com" };
    authMock.role = "parent";
    localStorageStub.getItem.mockReturnValue("s1");
    mockedGetAll.mockResolvedValue(STUDENTS as any);

    const { result } = renderHook(() => useParentChildren(), { wrapper: makeWrapper() });

    expect(localStorageStub.getItem).toHaveBeenCalledWith("parent_selected_child_parent-1");

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.selected?.id).toBe("s1");
  });

  it("falls back to the first child when the stored selectedId doesn't match any loaded child", async () => {
    authMock.user = { uid: "parent-multi", email: "multi@example.com" };
    authMock.role = "parent";
    localStorageStub.getItem.mockReturnValue("does-not-exist");

    const multiKidStudents = [
      { id: "k1", name: "Kid One", fatherEmail: "multi@example.com" },
      { id: "k2", name: "Kid Two", motherEmail: "multi@example.com" },
    ];
    mockedGetAll.mockResolvedValue(multiKidStudents as any);

    const { result } = renderHook(() => useParentChildren(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.selected?.id).toBe("k1");
  });

  it("selectChild updates 'selected' and persists the id to localStorage under the uid-scoped key", async () => {
    authMock.user = { uid: "parent-multi", email: "multi@example.com" };
    authMock.role = "parent";

    const multiKidStudents = [
      { id: "k1", name: "Kid One", fatherEmail: "multi@example.com" },
      { id: "k2", name: "Kid Two", motherEmail: "multi@example.com" },
    ];
    mockedGetAll.mockResolvedValue(multiKidStudents as any);

    const { result } = renderHook(() => useParentChildren(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.selected?.id).toBe("k1");

    act(() => {
      result.current.selectChild("k2");
    });

    expect(result.current.selected?.id).toBe("k2");
    expect(localStorageStub.setItem).toHaveBeenCalledWith(
      "parent_selected_child_parent-multi",
      "k2"
    );
  });

  it("uses the 'default' storage key when there is no user uid", () => {
    authMock.user = null;
    authMock.role = "parent";

    renderHook(() => useParentChildren(), { wrapper: makeWrapper() });

    expect(localStorageStub.getItem).toHaveBeenCalledWith("parent_selected_child_default");
  });

  it("does not throw if localStorage access fails (e.g. disabled storage)", () => {
    authMock.user = { uid: "parent-1", email: "dad@example.com" };
    authMock.role = "parent";
    localStorageStub.getItem.mockImplementation(() => { throw new Error("blocked"); });
    localStorageStub.setItem.mockImplementation(() => { throw new Error("blocked"); });

    const { result } = renderHook(() => useParentChildren(), { wrapper: makeWrapper() });

    expect(result.current).toBeDefined();

    expect(() => {
      act(() => {
        result.current.selectChild("anything");
      });
    }).not.toThrow();
  });
});
