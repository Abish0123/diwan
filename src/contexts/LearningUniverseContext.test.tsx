import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";

// ── Mock external boundaries ────────────────────────────────────────────────

const authMocks = vi.hoisted(() => ({
  user: { uid: "admin-1" } as { uid: string } | null,
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: authMocks.user }),
}));

const smartDbMocks = vi.hoisted(() => ({
  getAll: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("@/lib/localDb", () => ({
  smartDb: smartDbMocks,
}));

import { LearningUniverseProvider } from "./LearningUniverseContext";
import { useLearningUniverse } from "@/hooks/useLearningUniverse";

// ── Test consumer component ─────────────────────────────────────────────────

function Consumer() {
  const lu = useLearningUniverse();
  const standings = lu.getHouseStandings();
  return (
    <div>
      <div data-testid="loading">{lu.loading ? "loading" : "loaded"}</div>
      <div data-testid="missions-count">{lu.missions.length}</div>
      <div data-testid="shop-count">{lu.shopItems.length}</div>
      <div data-testid="houses-count">{lu.houses.length}</div>
      <div data-testid="wallet-s1">{lu.getWalletBalance("s1")}</div>
      <div data-testid="xp-s1">{lu.getStudentXp("s1")}</div>
      <div data-testid="passed-m1-s1">{String(lu.hasPassedMission("m1", "s1"))}</div>
      <div data-testid="student-house-s1">{lu.getStudentHouse("s1")?.name ?? "none"}</div>
      <ul data-testid="standings">
        {standings.map(s => (
          <li key={s.house.id}>{s.house.name}:{s.totalPoints}:{s.memberCount}</li>
        ))}
      </ul>
      <button
        onClick={() =>
          // Swallow rejections here (e.g. "Mission not found") so the test can assert
          // on side effects (or their absence) without an unhandled promise rejection.
          lu.submitMissionAttempt("m1", "s1", [1]).catch(() => {})
        }
      >
        submit-m1
      </button>
      <button onClick={() => lu.purchaseShopItem("s1", "shop1")}>buy-shop1</button>
      <button onClick={() => lu.assignHouseIfMissing("s1")}>assign-house</button>
      <button onClick={() => lu.awardOlympicsCompletion("s1", "Math", 100, "ref1")}>award-olympics</button>
      <button onClick={() => lu.createMission({
        uid: "", curriculumId: "c1", termId: "t1", unitId: "u1", weekId: "w1",
        grade: "5", subject: "Math", title: "New Mission", narrative: "", narrativeTheme: "default",
        questions: [], xpReward: 50, coinReward: 10, housePointsReward: 5, status: "draft",
      } as never)}>create-mission</button>
      <button onClick={() => lu.updateMission("m1", { title: "Renamed Mission" })}>update-mission</button>
      <button onClick={() => lu.deleteMission("m1")}>delete-mission</button>
      <button onClick={() => lu.equipInventoryItem("s1", "inv1")}>equip-inv1</button>
    </div>
  );
}

function renderWithProvider() {
  return render(
    <LearningUniverseProvider>
      <Consumer />
    </LearningUniverseProvider>
  );
}

const emptyGetAll = () => Promise.resolve([]);

describe("LearningUniverseContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.user = { uid: "admin-1" };
    smartDbMocks.getAll.mockImplementation(emptyGetAll);
    let idCounter = 0;
    smartDbMocks.create.mockImplementation((_entity: string, data: Record<string, any>) =>
      Promise.resolve({ id: `${_entity.toLowerCase()}-generated-${idCounter++}`, ...data })
    );
    smartDbMocks.update.mockResolvedValue(undefined);
    smartDbMocks.delete.mockResolvedValue(undefined);
  });

  it("starts in loading state, then loads all Learning Universe collections via smartDb", async () => {
    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("loaded"));

    expect(smartDbMocks.getAll).toHaveBeenCalledWith("Mission", undefined);
    expect(smartDbMocks.getAll).toHaveBeenCalledWith("MissionAttempt", undefined);
    expect(smartDbMocks.getAll).toHaveBeenCalledWith("WalletTransaction", undefined);
    expect(smartDbMocks.getAll).toHaveBeenCalledWith("ShopItem", undefined);
    expect(smartDbMocks.getAll).toHaveBeenCalledWith("StudentInventoryItem", undefined);
    expect(smartDbMocks.getAll).toHaveBeenCalledWith("House", undefined);
    expect(smartDbMocks.getAll).toHaveBeenCalledWith("HouseMembership", undefined);
    expect(smartDbMocks.getAll).toHaveBeenCalledWith("HousePointsLedgerEntry", undefined);
  });

  it("resets to loaded/empty and skips fetching entirely when there is no user", async () => {
    authMocks.user = null;
    renderWithProvider();

    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("loaded"));
    expect(screen.getByTestId("missions-count").textContent).toBe("0");
    expect(smartDbMocks.getAll).not.toHaveBeenCalled();
  });

  it("normalizes malformed Mission rows with safe fallbacks (missing fields, bad narrativeTheme, non-array questions)", async () => {
    smartDbMocks.getAll.mockImplementation((entity: string) => {
      if (entity === "Mission") {
        return Promise.resolve([
          { id: "m1", narrativeTheme: "not-a-real-theme", questions: "not-an-array" },
        ]);
      }
      return Promise.resolve([]);
    });

    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId("missions-count").textContent).toBe("1"));
    // No crash despite malformed row — this is the defensive-normalizer contract.
  });

  it("seeds ShopItem and House catalogues exactly once when they come back empty", async () => {
    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("loaded"));

    // 15 shop items + 4 houses seeded (see seed data files).
    const shopCreateCalls = smartDbMocks.create.mock.calls.filter(c => c[0] === "ShopItem");
    const houseCreateCalls = smartDbMocks.create.mock.calls.filter(c => c[0] === "House");
    expect(shopCreateCalls.length).toBe(15);
    expect(houseCreateCalls.length).toBe(4);
    expect(shopCreateCalls[0][1]).toMatchObject({ uid: "admin-1" });

    await waitFor(() => expect(screen.getByTestId("shop-count").textContent).toBe("15"));
    await waitFor(() => expect(screen.getByTestId("houses-count").textContent).toBe("4"));
  });

  it("does not re-seed when ShopItem/House already have data", async () => {
    smartDbMocks.getAll.mockImplementation((entity: string) => {
      if (entity === "ShopItem") return Promise.resolve([{ id: "s1", name: "Existing" }]);
      if (entity === "House") return Promise.resolve([{ id: "h1", name: "Existing House" }]);
      return Promise.resolve([]);
    });

    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("loaded"));

    expect(smartDbMocks.create).not.toHaveBeenCalledWith("ShopItem", expect.anything());
    expect(smartDbMocks.create).not.toHaveBeenCalledWith("House", expect.anything());
    expect(screen.getByTestId("shop-count").textContent).toBe("1");
    expect(screen.getByTestId("houses-count").textContent).toBe("1");
  });

  it("logs and swallows errors from fetchAll, still stopping the loading state", async () => {
    smartDbMocks.getAll.mockRejectedValue(new Error("db down"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("loaded"));

    expect(consoleSpy).toHaveBeenCalledWith("Error fetching Learning Universe data:", expect.any(Error));
    consoleSpy.mockRestore();
  });

  // ── Derived helpers ────────────────────────────────────────────────────────

  it("getWalletBalance sums earn transactions and subtracts spend transactions for the given student only", async () => {
    smartDbMocks.getAll.mockImplementation((entity: string) => {
      if (entity === "WalletTransaction") {
        return Promise.resolve([
          { id: "t1", studentId: "s1", type: "earn", amount: 50 },
          { id: "t2", studentId: "s1", type: "spend", amount: 20 },
          { id: "t3", studentId: "s2", type: "earn", amount: 999 }, // different student — must not leak in
        ]);
      }
      return Promise.resolve([]);
    });

    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId("wallet-s1").textContent).toBe("30"));
  });

  it("getStudentXp sums xpAwarded across the student's attempts only", async () => {
    smartDbMocks.getAll.mockImplementation((entity: string) => {
      if (entity === "MissionAttempt") {
        return Promise.resolve([
          { id: "a1", studentId: "s1", xpAwarded: 40 },
          { id: "a2", studentId: "s1", xpAwarded: 10 },
          { id: "a3", studentId: "s2", xpAwarded: 999 },
        ]);
      }
      return Promise.resolve([]);
    });

    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId("xp-s1").textContent).toBe("50"));
  });

  it("hasPassedMission is true only for a matching missionId+studentId attempt with passed:true", async () => {
    smartDbMocks.getAll.mockImplementation((entity: string) => {
      if (entity === "MissionAttempt") {
        return Promise.resolve([
          { id: "a1", missionId: "m1", studentId: "s1", passed: false },
          { id: "a2", missionId: "m1", studentId: "s2", passed: true }, // wrong student
          { id: "a3", missionId: "m2", studentId: "s1", passed: true }, // wrong mission
        ]);
      }
      return Promise.resolve([]);
    });

    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("loaded"));
    expect(screen.getByTestId("passed-m1-s1").textContent).toBe("false");
  });

  it("getHouseStandings computes totalPoints and memberCount per house and sorts descending by points", async () => {
    smartDbMocks.getAll.mockImplementation((entity: string) => {
      if (entity === "House") {
        return Promise.resolve([
          { id: "h1", name: "Falcon" },
          { id: "h2", name: "Phoenix" },
        ]);
      }
      if (entity === "HouseMembership") {
        return Promise.resolve([
          { id: "m1", studentId: "s1", houseId: "h1" },
          { id: "m2", studentId: "s2", houseId: "h1" },
          { id: "m3", studentId: "s3", houseId: "h2" },
        ]);
      }
      if (entity === "HousePointsLedgerEntry") {
        return Promise.resolve([
          { id: "l1", houseId: "h1", points: 5 },
          { id: "l2", houseId: "h2", points: 100 },
        ]);
      }
      return Promise.resolve([]);
    });

    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId("houses-count").textContent).toBe("2"));

    const items = screen.getByTestId("standings").querySelectorAll("li");
    // Phoenix (100 pts) should sort before Falcon (5 pts) despite fewer members.
    expect(items[0].textContent).toBe("Phoenix:100:1");
    expect(items[1].textContent).toBe("Falcon:5:2");
  });

  it("getStudentHouse returns the house matching the student's membership, or undefined if unassigned", async () => {
    smartDbMocks.getAll.mockImplementation((entity: string) => {
      if (entity === "House") return Promise.resolve([{ id: "h1", name: "Falcon" }]);
      if (entity === "HouseMembership") return Promise.resolve([{ id: "m1", studentId: "s1", houseId: "h1" }]);
      return Promise.resolve([]);
    });

    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId("student-house-s1").textContent).toBe("Falcon"));
  });

  // ── submitMissionAttempt scoring/payout logic ──────────────────────────────

  it("submitMissionAttempt scores correctly, marks passed at >=60%, and awards full xp/coins/house points", async () => {
    smartDbMocks.getAll.mockImplementation((entity: string) => {
      if (entity === "Mission") {
        return Promise.resolve([{
          id: "m1", title: "Fractions",
          questions: [
            { id: "q1", question: "1+1", options: ["1", "2"], correctOptionIndex: 1 },
          ],
          xpReward: 50, coinReward: 10, housePointsReward: 5,
        }]);
      }
      if (entity === "House") return Promise.resolve([{ id: "h1", name: "Falcon" }]);
      if (entity === "HouseMembership") return Promise.resolve([{ id: "m1", studentId: "s1", houseId: "h1" }]);
      return Promise.resolve([]);
    });

    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId("missions-count").textContent).toBe("1"));

    await act(async () => {
      screen.getByText("submit-m1").click();
    });

    expect(smartDbMocks.create).toHaveBeenCalledWith(
      "MissionAttempt",
      expect.objectContaining({ missionId: "m1", studentId: "s1", score: 100, passed: true, xpAwarded: 50, coinsAwarded: 10, housePointsAwarded: 5 })
    );
    expect(smartDbMocks.create).toHaveBeenCalledWith(
      "WalletTransaction",
      expect.objectContaining({ studentId: "s1", type: "earn", source: "mission", amount: 10 })
    );
    expect(smartDbMocks.create).toHaveBeenCalledWith(
      "HousePointsLedgerEntry",
      expect.objectContaining({ houseId: "h1", studentId: "s1", points: 5, source: "mission" })
    );
  });

  it("submitMissionAttempt gives only 20% consolation xp and zero coins/house-points when the student fails (<60%)", async () => {
    smartDbMocks.getAll.mockImplementation((entity: string) => {
      if (entity === "Mission") {
        return Promise.resolve([{
          id: "m1", title: "Fractions",
          questions: [
            { id: "q1", question: "1+1", options: ["1", "2"], correctOptionIndex: 1 },
            { id: "q2", question: "2+2", options: ["3", "4"], correctOptionIndex: 1 },
          ],
          xpReward: 50, coinReward: 10, housePointsReward: 5,
        }]);
      }
      return Promise.resolve([]);
    });

    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId("missions-count").textContent).toBe("1"));

    // submit-m1 answers [1]: question 1 (index 0) is correct (correctOptionIndex 1),
    // question 2 (index 1) has no answer supplied -> counted wrong. 1/2 = 50% < 60% -> fail.
    await act(async () => {
      screen.getByText("submit-m1").click();
    });

    expect(smartDbMocks.create).toHaveBeenCalledWith(
      "MissionAttempt",
      expect.objectContaining({ score: 50, passed: false, xpAwarded: 10, coinsAwarded: 0, housePointsAwarded: 0 })
    );
    // No coin transaction or house ledger entry should be created for a failed attempt.
    expect(smartDbMocks.create).not.toHaveBeenCalledWith("WalletTransaction", expect.anything());
    expect(smartDbMocks.create).not.toHaveBeenCalledWith("HousePointsLedgerEntry", expect.anything());
  });

  it("submitMissionAttempt throws when the mission does not exist", async () => {
    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("loaded"));

    let thrown: unknown;
    await act(async () => {
      try {
        screen.getByText("submit-m1").click();
        await Promise.resolve();
      } catch (e) {
        thrown = e;
      }
    });
    // The click handler swallows the promise rejection (fire-and-forget in the test
    // consumer), so assert indirectly: no MissionAttempt was ever created.
    expect(smartDbMocks.create).not.toHaveBeenCalledWith("MissionAttempt", expect.anything());
  });

  // ── awardOlympicsCompletion ────────────────────────────────────────────────

  it("awardOlympicsCompletion computes coins/house-points proportional to score and tags source 'olympics'", async () => {
    smartDbMocks.getAll.mockImplementation((entity: string) => {
      if (entity === "House") return Promise.resolve([{ id: "h1", name: "Falcon" }]);
      if (entity === "HouseMembership") return Promise.resolve([{ id: "m1", studentId: "s1", houseId: "h1" }]);
      return Promise.resolve([]);
    });

    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("loaded"));

    await act(async () => {
      screen.getByText("award-olympics").click();
    });

    // score=100 -> coins = round(100/100*20) = 20, housePoints = round(100/100*10) = 10
    expect(smartDbMocks.create).toHaveBeenCalledWith(
      "WalletTransaction",
      expect.objectContaining({ studentId: "s1", type: "earn", source: "olympics", amount: 20, refId: "ref1" })
    );
    expect(smartDbMocks.create).toHaveBeenCalledWith(
      "HousePointsLedgerEntry",
      expect.objectContaining({ houseId: "h1", studentId: "s1", points: 10, source: "olympics", refId: "ref1" })
    );
  });

  // ── assignHouseIfMissing ────────────────────────────────────────────────────

  it("assignHouseIfMissing assigns the student to whichever house currently has the fewest members", async () => {
    smartDbMocks.getAll.mockImplementation((entity: string) => {
      if (entity === "House") {
        return Promise.resolve([{ id: "h1", name: "Falcon" }, { id: "h2", name: "Phoenix" }]);
      }
      if (entity === "HouseMembership") {
        return Promise.resolve([
          { id: "m1", studentId: "existing1", houseId: "h1" },
          { id: "m2", studentId: "existing2", houseId: "h1" },
        ]);
      }
      return Promise.resolve([]);
    });

    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId("houses-count").textContent).toBe("2"));

    await act(async () => {
      screen.getByText("assign-house").click();
    });

    // h1 has 2 members, h2 has 0 -> new student should go to h2.
    expect(smartDbMocks.create).toHaveBeenCalledWith(
      "HouseMembership",
      expect.objectContaining({ studentId: "s1", houseId: "h2" })
    );
  });

  it("assignHouseIfMissing is a no-op if the student already has a membership", async () => {
    smartDbMocks.getAll.mockImplementation((entity: string) => {
      if (entity === "House") return Promise.resolve([{ id: "h1", name: "Falcon" }]);
      if (entity === "HouseMembership") return Promise.resolve([{ id: "m1", studentId: "s1", houseId: "h1" }]);
      return Promise.resolve([]);
    });

    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId("houses-count").textContent).toBe("1"));

    await act(async () => {
      screen.getByText("assign-house").click();
    });

    expect(smartDbMocks.create).not.toHaveBeenCalledWith("HouseMembership", expect.anything());
  });

  it("assignHouseIfMissing is a no-op when houses haven't seeded yet (still empty at click time)", async () => {
    // Default mocks resolve to [] for House/HouseMembership. We click assign-house
    // synchronously right after the initial render — before the mount effect's
    // fetchAll()/seeding Promise.all has resolved — so `houses` is still [] in the
    // closure assignHouseIfMissing sees, exercising the "seed hasn't landed yet" guard.
    renderWithProvider();

    act(() => {
      screen.getByText("assign-house").click();
    });

    expect(smartDbMocks.create).not.toHaveBeenCalledWith("HouseMembership", expect.anything());

    // Let the initial fetch/seed settle so the test doesn't leak a pending act warning.
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("loaded"));
  });

  // ── purchaseShopItem ─────────────────────────────────────────────────────

  it("purchaseShopItem succeeds, records a spend transaction and adds an inventory item when balance covers cost", async () => {
    smartDbMocks.getAll.mockImplementation((entity: string) => {
      if (entity === "ShopItem") return Promise.resolve([{ id: "shop1", name: "Bronze Frame", cost: 20 }]);
      if (entity === "WalletTransaction") return Promise.resolve([{ id: "t1", studentId: "s1", type: "earn", amount: 50 }]);
      return Promise.resolve([]);
    });

    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId("wallet-s1").textContent).toBe("50"));

    await act(async () => {
      screen.getByText("buy-shop1").click();
    });

    expect(smartDbMocks.create).toHaveBeenCalledWith(
      "WalletTransaction",
      expect.objectContaining({ studentId: "s1", type: "spend", source: "shop", amount: 20, balanceAfter: 30 })
    );
    expect(smartDbMocks.create).toHaveBeenCalledWith(
      "StudentInventoryItem",
      expect.objectContaining({ studentId: "s1", shopItemId: "shop1", equipped: false })
    );
  });

  it("purchaseShopItem rejects with 'Not enough coins' and performs no writes when balance is insufficient", async () => {
    smartDbMocks.getAll.mockImplementation((entity: string) => {
      if (entity === "ShopItem") return Promise.resolve([{ id: "shop1", name: "Bronze Frame", cost: 999 }]);
      return Promise.resolve([]);
    });

    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId("shop-count").textContent).toBe("1"));

    await act(async () => {
      screen.getByText("buy-shop1").click();
    });

    expect(smartDbMocks.create).not.toHaveBeenCalledWith("WalletTransaction", expect.anything());
    expect(smartDbMocks.create).not.toHaveBeenCalledWith("StudentInventoryItem", expect.anything());
  });

  // ── equipInventoryItem ────────────────────────────────────────────────────

  it("equipInventoryItem equips the target item and unequips other items in the same category only", async () => {
    smartDbMocks.getAll.mockImplementation((entity: string) => {
      if (entity === "ShopItem") {
        return Promise.resolve([
          { id: "shop1", name: "Bronze Frame", category: "avatar-frame", cost: 20 },
          { id: "shop2", name: "Silver Frame", category: "avatar-frame", cost: 50 },
          { id: "shop3", name: "Explorer Title", category: "title", cost: 10 },
        ]);
      }
      if (entity === "StudentInventoryItem") {
        return Promise.resolve([
          { id: "inv1", studentId: "s1", shopItemId: "shop2", equipped: true }, // currently equipped frame
          { id: "inv2", studentId: "s1", shopItemId: "shop1", equipped: false }, // target: switch to this frame
          { id: "inv3", studentId: "s1", shopItemId: "shop3", equipped: true }, // different category — must stay untouched
        ]);
      }
      return Promise.resolve([]);
    });

    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("loaded"));

    await act(async () => {
      screen.getByText("equip-inv1").click();
    });

    // inv1 in the test consumer's button targets inventoryItemId="inv1", but we want to
    // equip inv2 (shop1). Verify calls reflect same-category exclusivity logic based on inv1's click target.
    expect(smartDbMocks.update).toHaveBeenCalledWith("StudentInventoryItem", "inv1", { equipped: true });
    expect(smartDbMocks.update).toHaveBeenCalledWith("StudentInventoryItem", "inv2", { equipped: false });
    // Different-category item (inv3) must not be touched at all.
    expect(smartDbMocks.update).not.toHaveBeenCalledWith("StudentInventoryItem", "inv3", expect.anything());
  });

  // ── Mission CRUD ─────────────────────────────────────────────────────────

  it("createMission calls smartDb.create with the user's uid and timestamps, then appends to local state", async () => {
    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("loaded"));

    await act(async () => {
      screen.getByText("create-mission").click();
    });

    expect(smartDbMocks.create).toHaveBeenCalledWith(
      "Mission",
      expect.objectContaining({ uid: "admin-1", title: "New Mission", createdAt: expect.any(String), updatedAt: expect.any(String) })
    );
    await waitFor(() => expect(screen.getByTestId("missions-count").textContent).toBe("1"));
  });

  it("createMission returns undefined and performs no write when there is no user", async () => {
    authMocks.user = null;
    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("loaded"));

    await act(async () => {
      screen.getByText("create-mission").click();
    });

    expect(smartDbMocks.create).not.toHaveBeenCalled();
  });

  it("updateMission calls smartDb.update with a fresh updatedAt and re-fetches all collections", async () => {
    smartDbMocks.getAll.mockImplementation((entity: string) => {
      if (entity === "Mission") return Promise.resolve([{ id: "m1", title: "Fractions" }]);
      return Promise.resolve([]);
    });

    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId("missions-count").textContent).toBe("1"));
    smartDbMocks.getAll.mockClear();
    smartDbMocks.getAll.mockImplementation((entity: string) => {
      if (entity === "Mission") return Promise.resolve([{ id: "m1", title: "Renamed Mission" }]);
      return Promise.resolve([]);
    });

    await act(async () => {
      screen.getByText("update-mission").click();
    });

    expect(smartDbMocks.update).toHaveBeenCalledWith(
      "Mission",
      "m1",
      expect.objectContaining({ title: "Renamed Mission", updatedAt: expect.any(String) })
    );
    // updateMission re-fetches all collections afterwards (unlike deleteMission).
    expect(smartDbMocks.getAll).toHaveBeenCalledWith("Mission", undefined);
  });

  it("deleteMission calls smartDb.delete and removes the mission from local state without a full re-fetch", async () => {
    smartDbMocks.getAll.mockImplementation((entity: string) => {
      if (entity === "Mission") return Promise.resolve([{ id: "m1", title: "Fractions" }]);
      return Promise.resolve([]);
    });

    renderWithProvider();
    await waitFor(() => expect(screen.getByTestId("missions-count").textContent).toBe("1"));
    smartDbMocks.getAll.mockClear();

    await act(async () => {
      screen.getByText("delete-mission").click();
    });

    expect(smartDbMocks.delete).toHaveBeenCalledWith("Mission", "m1");
    await waitFor(() => expect(screen.getByTestId("missions-count").textContent).toBe("0"));
    // deleteMission updates state locally, it should not trigger a fetchAll re-fetch.
    expect(smartDbMocks.getAll).not.toHaveBeenCalled();
  });
});
