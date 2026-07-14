// @vitest-environment node
/**
 * API tests — /api/vehicles, /api/routes, /api/tracking/*
 *
 * Covers: CRUD on vehicles and routes, GPS location push, fleet status,
 * live vehicle lookup, and unknown-vehicle 404.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestServer, type TestServer } from "./helpers/createTestServer";

let s: TestServer;

beforeAll(async () => {
  s = await createTestServer();
}, 40_000);

afterAll(() => s.teardown());

// ─── GET /api/vehicles ────────────────────────────────────────────────────

describe("GET /api/vehicles", () => {
  it("returns 200 and an array", async () => {
    const res = await s.request.get("/api/vehicles");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("returns vehicles with expected shape", async () => {
    const res = await s.request.get("/api/vehicles");
    if (res.body.length > 0) {
      const v = res.body[0];
      expect(v).toHaveProperty("id");
      expect(v).toHaveProperty("regNumber");
    }
  });
});

// ─── POST /api/vehicles ───────────────────────────────────────────────────

describe("POST /api/vehicles", () => {
  it("creates a vehicle and returns 201 with auto-generated id", async () => {
    const res = await s.request
      .post("/api/vehicles")
      .send({ regNumber: "TEST-9999", type: "Van", capacity: 12, driver: "Ali" });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("id");
    expect(res.body.regNumber).toBe("TEST-9999");
  });

  it("new vehicle appears in GET /api/vehicles", async () => {
    const createRes = await s.request
      .post("/api/vehicles")
      .send({ regNumber: "TST-0001", type: "Bus", capacity: 40 });
    const id = createRes.body.id as string;

    const listRes = await s.request.get("/api/vehicles");
    const ids = listRes.body.map((v: { id: string }) => v.id);
    expect(ids).toContain(id);
  });
});

// ─── GET /api/vehicles/:id ────────────────────────────────────────────────

describe("GET /api/vehicles/:id", () => {
  it("returns 200 and the vehicle for a known id", async () => {
    const listRes = await s.request.get("/api/vehicles");
    const id = listRes.body[0]?.id;
    if (!id) return; // skip if no vehicles seeded

    const res = await s.request.get(`/api/vehicles/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(id);
  });

  it("returns 404 for an unknown vehicle id", async () => {
    const res = await s.request.get("/api/vehicles/NO-SUCH-V999");
    expect(res.status).toBe(404);
  });
});

// ─── PUT /api/vehicles/:id ────────────────────────────────────────────────

describe("PUT /api/vehicles/:id", () => {
  it("updates a vehicle and reflects changes on GET", async () => {
    const createRes = await s.request
      .post("/api/vehicles")
      .send({ regNumber: "UP-0001", type: "Bus", capacity: 30 });
    const id = createRes.body.id as string;

    await s.request.put(`/api/vehicles/${id}`).send({ capacity: 50 });

    const getRes = await s.request.get(`/api/vehicles/${id}`);
    expect(getRes.body.capacity).toBe(50);
  });

  it("returns 404 for unknown vehicle id", async () => {
    const res = await s.request
      .put("/api/vehicles/GHOST-V999")
      .send({ capacity: 10 });
    expect(res.status).toBe(404);
  });
});

// ─── DELETE /api/vehicles/:id ─────────────────────────────────────────────

describe("DELETE /api/vehicles/:id", () => {
  it("deletes a vehicle and GET returns 404 afterwards", async () => {
    const createRes = await s.request
      .post("/api/vehicles")
      .send({ regNumber: "DEL-0001", type: "Van", capacity: 8 });
    const id = createRes.body.id as string;

    const delRes = await s.request.delete(`/api/vehicles/${id}`);
    expect(delRes.status).toBe(200);
    expect(delRes.body).toMatchObject({ status: "deleted" });

    const getRes = await s.request.get(`/api/vehicles/${id}`);
    expect(getRes.status).toBe(404);
  });
});

// ─── Routes CRUD ─────────────────────────────────────────────────────────

describe("/api/routes CRUD", () => {
  it("GET returns 200 and array", async () => {
    const res = await s.request.get("/api/routes");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("POST creates a route with id", async () => {
    const res = await s.request
      .post("/api/routes")
      .send({ name: "Route A", stops: ["School", "Market", "Home"] });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("id");
    expect(res.body.name).toBe("Route A");
  });

  it("DELETE removes a route", async () => {
    const createRes = await s.request
      .post("/api/routes")
      .send({ name: "Temp Route" });
    const id = createRes.body.id as string;

    const delRes = await s.request.delete(`/api/routes/${id}`);
    expect(delRes.status).toBe(200);

    const listRes = await s.request.get("/api/routes");
    const ids = listRes.body.map((r: { id: string }) => r.id);
    expect(ids).not.toContain(id);
  });
});

// ─── GPS Tracking ─────────────────────────────────────────────────────────

describe("/api/tracking/location", () => {
  it("returns 400 when vehicle_id is missing", async () => {
    const res = await s.request
      .post("/api/tracking/location")
      .send({ lat: 26.2, lng: 50.5 });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("accepts a valid location update and returns success", async () => {
    const res = await s.request
      .post("/api/tracking/location")
      .send({ vehicle_id: "V001", lat: 26.22, lng: 50.58, speed: 60, heading: 90 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "success" });
  });
});

describe("GET /api/tracking/live/:vehicleId", () => {
  it("returns 404 for a vehicle with no GPS data", async () => {
    const res = await s.request.get("/api/tracking/live/UNKNOWN-VEHICLE");
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("error");
  });

  it("returns live position after a location push", async () => {
    await s.request
      .post("/api/tracking/location")
      .send({ vehicle_id: "TRACK-TEST", lat: 26.1, lng: 50.3, speed: 0 });

    const res = await s.request.get("/api/tracking/live/TRACK-TEST");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ lat: 26.1, lng: 50.3 });
  });
});

describe("GET /api/tracking/live", () => {
  it("returns 200 and an object map of all tracked vehicles", async () => {
    const res = await s.request.get("/api/tracking/live");
    expect(res.status).toBe(200);
    expect(typeof res.body).toBe("object");
    expect(Array.isArray(res.body)).toBe(false); // it's a Record, not an array
  });
});

describe("GET /api/tracking/fleet-status", () => {
  it("returns 200 and fleet status object", async () => {
    const res = await s.request.get("/api/tracking/fleet-status");
    expect(res.status).toBe(200);
    expect(typeof res.body).toBe("object");
  });
});
