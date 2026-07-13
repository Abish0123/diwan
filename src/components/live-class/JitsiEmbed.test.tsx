import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";

describe("JitsiEmbed", () => {
  afterEach(() => {
    vi.resetModules();
    // @ts-expect-error test cleanup
    delete window.JitsiMeetExternalAPI;
  });

  it("shows a loading spinner, then hides it once the call reports joined, and forwards onLeave", async () => {
    const listeners: Record<string, (...args: unknown[]) => void> = {};
    const dispose = vi.fn();
    const apiInstance = {
      dispose,
      executeCommand: vi.fn(),
      addEventListener: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
        listeners[event] = cb;
      }),
    };
    const JitsiCtor = vi.fn(() => apiInstance);
    // @ts-expect-error test setup
    window.JitsiMeetExternalAPI = JitsiCtor;

    const { JitsiEmbed } = await import("./JitsiEmbed");
    const onLeave = vi.fn();
    const { container } = render(<JitsiEmbed roomName="room-1" displayName="Ali" onLeave={onLeave} />);

    await waitFor(() => expect(JitsiCtor).toHaveBeenCalledWith("meet.jit.si", expect.objectContaining({ roomName: "room-1" })));
    await waitFor(() => expect(apiInstance.addEventListener).toHaveBeenCalledWith("videoConferenceJoined", expect.any(Function)));
    expect(container.querySelector(".animate-spin")).toBeInTheDocument();

    act(() => { listeners["videoConferenceJoined"](); });
    // spinner should be gone once joined fires
    await waitFor(() => expect(container.querySelector(".animate-spin")).not.toBeInTheDocument());

    act(() => { listeners["readyToClose"](); });
    expect(onLeave).toHaveBeenCalled();
  });

  it("disposes the Jitsi API instance on unmount", async () => {
    const dispose = vi.fn();
    const apiInstance = { dispose, executeCommand: vi.fn(), addEventListener: vi.fn() };
    // @ts-expect-error test setup
    window.JitsiMeetExternalAPI = vi.fn(() => apiInstance);

    const { JitsiEmbed } = await import("./JitsiEmbed");
    const { unmount } = render(<JitsiEmbed roomName="room-2" displayName="Ali" />);
    await waitFor(() => expect(apiInstance.addEventListener).toHaveBeenCalled());
    unmount();
    expect(dispose).toHaveBeenCalled();
  });

  it("shows an error state with a fallback link when the Jitsi script fails to load", async () => {
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = originalCreateElement(tag);
      if (tag === "script") {
        // Simulate the script failing to load asynchronously.
        setTimeout(() => el.onerror && (el.onerror as (e: unknown) => void)(new Event("error")), 0);
      }
      return el;
    });

    const { JitsiEmbed } = await import("./JitsiEmbed");
    render(<JitsiEmbed roomName="room-3" displayName="Ali" />);

    await waitFor(() => expect(screen.getByText("Couldn't load the video call.")).toBeInTheDocument());
    expect(screen.getByText("Open in Jitsi Meet instead ↗")).toHaveAttribute(
      "href",
      "https://meet.jit.si/room-3"
    );

    (document.createElement as unknown as { mockRestore: () => void }).mockRestore();
  });
});
