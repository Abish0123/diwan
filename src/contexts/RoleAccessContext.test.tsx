import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, cleanup } from "@testing-library/react";

// RoleAccessSync bridges smartDb.watch() polling into roles.ts's
// module-level cache via setRoleGroupOverrides/setCustomRoles. We mock both
// boundaries: smartDb (the external data source) and the roles module
// (the module-level state it writes into), so we can assert exactly what
// this component computes from raw watch() rows without depending on
// roles.ts's own internal state.
const watchCallbacks: Record<string, (rows: unknown[]) => void> = {};
const unsubscribeFns: Record<string, ReturnType<typeof vi.fn>> = {};

vi.mock("@/lib/localDb", () => ({
  smartDb: {
    watch: vi.fn((entity: string, _uid: string | undefined, cb: (rows: unknown[]) => void) => {
      watchCallbacks[entity] = cb;
      const unsub = vi.fn();
      unsubscribeFns[entity] = unsub;
      return unsub;
    }),
  },
}));

vi.mock("@/lib/roles", () => ({
  setRoleGroupOverrides: vi.fn(),
  setCustomRoles: vi.fn(),
}));

import { smartDb } from "@/lib/localDb";
import { setRoleGroupOverrides, setCustomRoles } from "@/lib/roles";
import { RoleAccessSync } from "@/contexts/RoleAccessContext";

describe("RoleAccessSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(watchCallbacks).forEach(k => delete watchCallbacks[k]);
    Object.keys(unsubscribeFns).forEach(k => delete unsubscribeFns[k]);
  });

  it("renders nothing (null) and provides no context value", () => {
    const { container } = render(<RoleAccessSync />);
    expect(container).toBeEmptyDOMElement();
  });

  it("subscribes to both RoleAccessOverride and CustomRole entities on mount", () => {
    render(<RoleAccessSync />);
    expect(smartDb.watch).toHaveBeenCalledWith("RoleAccessOverride", undefined, expect.any(Function));
    expect(smartDb.watch).toHaveBeenCalledWith("CustomRole", undefined, expect.any(Function));
    expect(smartDb.watch).toHaveBeenCalledTimes(2);
  });

  it("builds a role-id -> groups[] map from RoleAccessOverride rows and forwards it", () => {
    render(<RoleAccessSync />);
    watchCallbacks["RoleAccessOverride"]([
      { id: "accountant", groups: ["Finance", "Reports"] },
      { id: "librarian", groups: ["Library"] },
    ]);
    expect(setRoleGroupOverrides).toHaveBeenCalledWith({
      accountant: ["Finance", "Reports"],
      librarian: ["Library"],
    });
  });

  it("skips rows without an id when building the overrides map", () => {
    render(<RoleAccessSync />);
    watchCallbacks["RoleAccessOverride"]([
      { id: "accountant", groups: ["Finance"] },
      { groups: ["Ghost"] }, // no id — must not appear in map
      { id: "", groups: ["AlsoGhost"] }, // falsy id
    ]);
    expect(setRoleGroupOverrides).toHaveBeenCalledWith({ accountant: ["Finance"] });
  });

  it("defaults groups to [] when a row's groups field is not an array", () => {
    render(<RoleAccessSync />);
    watchCallbacks["RoleAccessOverride"]([
      { id: "nurse", groups: "not-an-array" },
      { id: "hr_manager" }, // groups missing entirely
    ]);
    expect(setRoleGroupOverrides).toHaveBeenCalledWith({ nurse: [], hr_manager: [] });
  });

  it("passes {} to setRoleGroupOverrides when rows is an empty array", () => {
    render(<RoleAccessSync />);
    watchCallbacks["RoleAccessOverride"]([]);
    expect(setRoleGroupOverrides).toHaveBeenCalledWith({});
  });

  it("handles a null/falsy rows payload from watch() without throwing", () => {
    render(<RoleAccessSync />);
    expect(() => watchCallbacks["RoleAccessOverride"](null as unknown as unknown[])).not.toThrow();
    expect(setRoleGroupOverrides).toHaveBeenCalledWith({});
  });

  it("maps CustomRole rows into RoleDef objects with fixed admin-layout/non-admin defaults", () => {
    render(<RoleAccessSync />);
    watchCallbacks["CustomRole"]([
      { id: "custom_role_1", label: "Custom One", description: "Does custom things", groups: ["Communication"], prefix: "CU1", badge: "bg-blue-100 text-blue-700" },
    ]);
    expect(setCustomRoles).toHaveBeenCalledWith([
      {
        id: "custom_role_1",
        label: "Custom One",
        description: "Does custom things",
        layout: "admin",
        isAdmin: false,
        full: false,
        groups: ["Communication"],
        prefix: "CU1",
        badge: "bg-blue-100 text-blue-700",
      },
    ]);
  });

  it("fills in sensible fallback defaults for a sparse CustomRole row", () => {
    render(<RoleAccessSync />);
    watchCallbacks["CustomRole"]([{ id: "custom_role_2" }]);
    expect(setCustomRoles).toHaveBeenCalledWith([
      {
        id: "custom_role_2",
        label: "custom_role_2", // falls back to id when label missing
        description: "Custom role",
        layout: "admin",
        isAdmin: false,
        full: false,
        groups: [],
        prefix: "CST",
        badge: "bg-slate-100 text-slate-700",
      },
    ]);
  });

  it("defaults groups to [] for a CustomRole row whose groups field isn't an array", () => {
    render(<RoleAccessSync />);
    watchCallbacks["CustomRole"]([{ id: "custom_role_3", groups: "oops" }]);
    expect(setCustomRoles).toHaveBeenCalledWith([
      expect.objectContaining({ id: "custom_role_3", groups: [] }),
    ]);
  });

  it("handles a null/falsy CustomRole rows payload without throwing", () => {
    render(<RoleAccessSync />);
    expect(() => watchCallbacks["CustomRole"](null as unknown as unknown[])).not.toThrow();
    expect(setCustomRoles).toHaveBeenCalledWith([]);
  });

  it("unsubscribes both watchers on unmount", () => {
    const { unmount } = render(<RoleAccessSync />);
    const overrideUnsub = unsubscribeFns["RoleAccessOverride"];
    const customRoleUnsub = unsubscribeFns["CustomRole"];
    unmount();
    expect(overrideUnsub).toHaveBeenCalledTimes(1);
    expect(customRoleUnsub).toHaveBeenCalledTimes(1);
  });

  it("re-subscribes fresh watchers if remounted", () => {
    const { unmount } = render(<RoleAccessSync />);
    unmount();
    cleanup();
    render(<RoleAccessSync />);
    expect(smartDb.watch).toHaveBeenCalledTimes(4); // 2 per mount x 2 mounts
  });
});
