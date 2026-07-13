import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import React from "react";

// react-leaflet/leaflet render actual browser map canvases (DOM measurement,
// tile loading) that jsdom can't support — this is a genuine third-party
// mapping-library boundary, so it's mocked the same way fetch/smartDb are
// elsewhere. onPick is exposed globally so tests can simulate a map click.
vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: any) => <div data-testid="map-container">{children}</div>,
  TileLayer: () => null,
  Marker: ({ position }: any) => <div data-testid="marker">{position[0]},{position[1]}</div>,
  useMapEvents: (handlers: any) => {
    (globalThis as any).__mapClick = (lat: number, lng: number) => handlers.click({ latlng: { lat, lng } });
    return null;
  },
}));

import { LocationPicker, type PickedLocation } from "./LocationPicker";

function Harness({ initial }: { initial?: PickedLocation | null }) {
  const [value, setValue] = React.useState<PickedLocation | null>(initial ?? null);
  return <LocationPicker value={value} onChange={setValue} />;
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  (globalThis as any).fetch = vi.fn();
});

describe("LocationPicker", () => {
  it("renders the picked-location summary when a value is already set", () => {
    render(<Harness initial={{ address: "123 Main St", lat: 25.28541, lng: 51.53101 }} />);
    expect(screen.getByText("123 Main St")).toBeInTheDocument();
    expect(screen.getByText("25.28541, 51.53101")).toBeInTheDocument();
  });

  it("clears the value when the X button is clicked", () => {
    render(<Harness initial={{ address: "123 Main St", lat: 25.28541, lng: 51.53101 }} />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.queryByText("123 Main St")).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search address or place name…")).toBeInTheDocument();
  });

  it("shows the search input and Pin button when there is no value", () => {
    render(<Harness />);
    expect(screen.getByPlaceholderText("Search address or place name…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Pin/i })).toBeInTheDocument();
  });

  it("debounces search input and fetches suggestions from the places API", async () => {
    vi.useFakeTimers();
    const suggestions = [{ name: "School", address: "School Rd", lat: 1, lng: 2 }];
    (globalThis.fetch as any).mockResolvedValue({ ok: true, json: async () => suggestions });

    render(<Harness />);
    const input = screen.getByPlaceholderText("Search address or place name…");
    fireEvent.change(input, { target: { value: "Scho" } });

    // Not fetched yet before debounce elapses
    expect(globalThis.fetch).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(400);
    });
    // Switch back to real timers before using waitFor/findBy* — their
    // internal polling relies on real setTimeout ticking.
    vi.useRealTimers();

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    expect((globalThis.fetch as any).mock.calls[0][0]).toContain("/api/places/search?q=");
    expect(await screen.findByText("School")).toBeInTheDocument();
  });

  it("selecting a suggestion calls onChange with its address/lat/lng and clears the query", async () => {
    vi.useFakeTimers();
    const suggestions = [{ name: "School", address: "School Rd", lat: 1, lng: 2 }];
    (globalThis.fetch as any).mockResolvedValue({ ok: true, json: async () => suggestions });

    render(<Harness />);
    const input = screen.getByPlaceholderText("Search address or place name…");
    fireEvent.change(input, { target: { value: "Scho" } });
    act(() => {
      vi.advanceTimersByTime(400);
    });
    vi.useRealTimers();
    const option = await screen.findByText("School");
    fireEvent.click(option);

    expect(await screen.findByText("School Rd")).toBeInTheDocument();
  });

  it("pressing Enter selects the first suggestion", async () => {
    vi.useFakeTimers();
    const suggestions = [
      { name: "First", address: "First Address", lat: 1, lng: 2 },
      { name: "Second", address: "Second Address", lat: 3, lng: 4 },
    ];
    (globalThis.fetch as any).mockResolvedValue({ ok: true, json: async () => suggestions });

    render(<Harness />);
    const input = screen.getByPlaceholderText("Search address or place name…");
    fireEvent.change(input, { target: { value: "Fir" } });
    act(() => {
      vi.advanceTimersByTime(400);
    });
    vi.useRealTimers();
    await screen.findByText("First");
    fireEvent.keyDown(input, { key: "Enter" });

    expect(await screen.findByText("First Address")).toBeInTheDocument();
  });

  it("clears suggestions and does not fetch when the query is emptied/blank", async () => {
    vi.useFakeTimers();
    render(<Harness />);
    const input = screen.getByPlaceholderText("Search address or place name…");
    fireEvent.change(input, { target: { value: "   " } });
    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("opens the pin-drop map when the Pin button is clicked and cancels back to search", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /Pin/i }));

    expect(screen.getByText("Click on the map to drop a pin")).toBeInTheDocument();
    expect(screen.getByTestId("map-container")).toBeInTheDocument();
    expect(screen.getByText("No pin dropped yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use this location" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("Click on the map to drop a pin")).not.toBeInTheDocument();
  });

  it("dropping a pin on the map enables 'Use this location' and commits the picked lat/lng", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /Pin/i }));

    act(() => {
      (globalThis as any).__mapClick(25.1234, 51.5678);
    });

    expect(await screen.findByText("25.12340, 51.56780")).toBeInTheDocument();
    const useBtn = screen.getByRole("button", { name: "Use this location" });
    expect(useBtn).not.toBeDisabled();

    fireEvent.click(useBtn);
    // Falls back to a generated "Pinned location" address since the query was empty
    expect(await screen.findByText(/Pinned location \(25\.1234, 51\.5678\)/)).toBeInTheDocument();
  });

  it("uses the typed query text as the address when a pin is dropped with text already entered", async () => {
    render(<Harness />);
    const input = screen.getByPlaceholderText("Search address or place name…");
    fireEvent.change(input, { target: { value: "My custom spot" } });
    fireEvent.click(screen.getByRole("button", { name: /Pin/i }));

    act(() => {
      (globalThis as any).__mapClick(10, 20);
    });
    fireEvent.click(screen.getByRole("button", { name: "Use this location" }));

    expect(await screen.findByText("My custom spot")).toBeInTheDocument();
  });

  it("ignores fetch/network failures gracefully (no suggestions shown, no crash)", async () => {
    vi.useFakeTimers();
    (globalThis.fetch as any).mockRejectedValue(new Error("network down"));
    render(<Harness />);
    const input = screen.getByPlaceholderText("Search address or place name…");
    fireEvent.change(input, { target: { value: "Fail" } });
    act(() => {
      vi.advanceTimersByTime(400);
    });
    vi.useRealTimers();
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    expect(screen.queryByText(/School/)).not.toBeInTheDocument();
  });
});
