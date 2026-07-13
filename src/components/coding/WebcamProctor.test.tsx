import { createRef } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { WebcamProctor, WebcamHandle } from "./WebcamProctor";
import { loadFaceModel, detectFaces, FaceObservation } from "@/lib/faceDetection";

vi.mock("@/lib/faceDetection", () => ({
  loadFaceModel: vi.fn(),
  detectFaces: vi.fn(),
}));

const mockedLoad = vi.mocked(loadFaceModel);
const mockedDetect = vi.mocked(detectFaces);

function fakeStream() {
  const stop = vi.fn();
  return { getTracks: () => [{ stop }] } as unknown as MediaStream;
}

function mockGetUserMedia(impl: () => Promise<MediaStream>) {
  Object.defineProperty(navigator, "mediaDevices", {
    value: { getUserMedia: vi.fn(impl) },
    configurable: true,
  });
}

const baseObs: FaceObservation = {
  ready: true, count: 1, present: true, multiple: false, lookingAway: false,
};

// jsdom videos always report videoWidth/videoHeight === 0. The component's
// detection loop and capture() both gate on a non-zero width, so we patch the
// prototype to simulate a live video frame; individual tests can override.
let videoWidthValue = 320;
let videoHeightValue = 240;

describe("WebcamProctor", () => {
  beforeEach(() => {
    mockedLoad.mockReset();
    mockedDetect.mockReset();
    mockGetUserMedia(() => Promise.resolve(fakeStream()));
    videoWidthValue = 320;
    videoHeightValue = 240;
    Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", {
      configurable: true, get: () => videoWidthValue,
    });
    Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", {
      configurable: true, get: () => videoHeightValue,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the starting-camera state before permission resolves", () => {
    let resolveStream!: (s: MediaStream) => void;
    mockGetUserMedia(() => new Promise((res) => { resolveStream = res; }));
    render(<WebcamProctor />);
    expect(screen.getByText("Starting camera…")).toBeInTheDocument();
    resolveStream(fakeStream());
  });

  it("shows the camera-on state and calls onStream(true) when permission is granted", async () => {
    const onStream = vi.fn();
    render(<WebcamProctor onStream={onStream} />);
    await waitFor(() => expect(onStream).toHaveBeenCalledWith(true));
    expect(screen.queryByText("Starting camera…")).not.toBeInTheDocument();
    expect(screen.queryByText(/Camera blocked/)).not.toBeInTheDocument();
  });

  it("shows the denied state and calls onStream(false) when permission is refused", async () => {
    mockGetUserMedia(() => Promise.reject(new Error("denied")));
    const onStream = vi.fn();
    render(<WebcamProctor onStream={onStream} />);
    await waitFor(() => expect(onStream).toHaveBeenCalledWith(false));
    expect(screen.getByText(/Camera blocked/)).toBeInTheDocument();
  });

  it("shows the REC pill when active (default) once the camera is on", async () => {
    render(<WebcamProctor />);
    await waitFor(() => expect(screen.getByText("REC")).toBeInTheDocument());
  });

  it("hides the REC pill when active=false", async () => {
    render(<WebcamProctor active={false} onStream={() => {}} />);
    await waitFor(() => expect(screen.queryByText("Starting camera…")).not.toBeInTheDocument());
    expect(screen.queryByText("REC")).not.toBeInTheDocument();
  });

  it("shows the plain camera icon (no status pill) when detect is off", async () => {
    const { container } = render(<WebcamProctor detect={false} />);
    await waitFor(() => expect(screen.queryByText("Starting camera…")).not.toBeInTheDocument());
    expect(container.querySelector("svg.lucide-camera")).toBeInTheDocument();
    expect(screen.queryByText("Face OK")).not.toBeInTheDocument();
  });

  it("shows the 'Loading AI…' pill while the face model is resolving", async () => {
    mockedLoad.mockReturnValue(new Promise(() => {})); // never resolves
    render(<WebcamProctor detect showOverlay />);
    await waitFor(() => expect(screen.getByText("Loading AI…")).toBeInTheDocument());
  });

  it("shows 'No face' when no face is present", async () => {
    mockedLoad.mockResolvedValue({} as any);
    mockedDetect.mockResolvedValue({ ...baseObs, present: false, count: 0 });
    render(<WebcamProctor detect showOverlay />);
    await waitFor(() => expect(screen.getByText("No face")).toBeInTheDocument());
  });

  it("shows '<n> faces!' when multiple faces are detected", async () => {
    mockedLoad.mockResolvedValue({} as any);
    mockedDetect.mockResolvedValue({ ...baseObs, count: 2, multiple: true });
    render(<WebcamProctor detect showOverlay />);
    await waitFor(() => expect(screen.getByText("2 faces!")).toBeInTheDocument());
  });

  it("shows 'Looking away' when the face is off-centre", async () => {
    mockedLoad.mockResolvedValue({} as any);
    mockedDetect.mockResolvedValue({ ...baseObs, lookingAway: true });
    render(<WebcamProctor detect showOverlay />);
    await waitFor(() => expect(screen.getByText("Looking away")).toBeInTheDocument());
  });

  it("shows 'Face OK' for a single, centred, present face", async () => {
    mockedLoad.mockResolvedValue({} as any);
    mockedDetect.mockResolvedValue({ ...baseObs });
    render(<WebcamProctor detect showOverlay />);
    await waitFor(() => expect(screen.getByText("Face OK")).toBeInTheDocument());
  });

  it("invokes onObservation with each detection pass", async () => {
    mockedLoad.mockResolvedValue({} as any);
    mockedDetect.mockResolvedValue({ ...baseObs });
    const onObservation = vi.fn();
    render(<WebcamProctor detect showOverlay onObservation={onObservation} />);
    await waitFor(() => expect(onObservation).toHaveBeenCalledWith({ ...baseObs }));
  });

  it("hides all status/AI pills when showOverlay is false, even with detect on", async () => {
    mockedLoad.mockResolvedValue({} as any);
    mockedDetect.mockResolvedValue({ ...baseObs });
    render(<WebcamProctor detect showOverlay={false} />);
    await waitFor(() => expect(screen.queryByText("Starting camera…")).not.toBeInTheDocument());
    expect(screen.queryByText("Face OK")).not.toBeInTheDocument();
    expect(screen.queryByText("Loading AI…")).not.toBeInTheDocument();
  });

  it("stops the media stream tracks on unmount", async () => {
    const stop = vi.fn();
    mockGetUserMedia(() => Promise.resolve({ getTracks: () => [{ stop }] } as unknown as MediaStream));
    const { unmount } = render(<WebcamProctor onStream={() => {}} />);
    await waitFor(() => expect(screen.queryByText("Starting camera…")).not.toBeInTheDocument());
    unmount();
    expect(stop).toHaveBeenCalled();
  });

  describe("imperative handle", () => {
    it("capture() returns null when the video has no dimensions yet", async () => {
      const ref = createRef<WebcamHandle>();
      render(<WebcamProctor ref={ref} onStream={() => {}} />);
      await waitFor(() => expect(ref.current).not.toBeNull());
      expect(ref.current!.capture()).toBeNull();
    });

    it("capture() draws the frame and returns a JPEG data URL when the video has dimensions", async () => {
      const ref = createRef<WebcamHandle>();
      const { container } = render(<WebcamProctor ref={ref} onStream={() => {}} />);
      await waitFor(() => expect(screen.queryByText("Starting camera…")).not.toBeInTheDocument());

      const video = container.querySelector("video")!;
      Object.defineProperty(video, "videoWidth", { value: 320, configurable: true });
      Object.defineProperty(video, "videoHeight", { value: 240, configurable: true });

      const drawImage = vi.fn();
      vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage } as any);
      vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/jpeg;base64,xyz");

      const result = ref.current!.capture();
      expect(drawImage).toHaveBeenCalledWith(video, 0, 0);
      expect(result).toBe("data:image/jpeg;base64,xyz");
    });

    it("detectOnce() returns null when the face model fails to load", async () => {
      mockedLoad.mockResolvedValue(null);
      const ref = createRef<WebcamHandle>();
      render(<WebcamProctor ref={ref} onStream={() => {}} />);
      await waitFor(() => expect(ref.current).not.toBeNull());
      const result = await ref.current!.detectOnce();
      expect(result).toBeNull();
    });

    it("detectOnce() resolves with the detectFaces result when the model loads", async () => {
      const fakeModel = { name: "fake" } as any;
      mockedLoad.mockResolvedValue(fakeModel);
      mockedDetect.mockResolvedValue({ ...baseObs, count: 3 });
      const ref = createRef<WebcamHandle>();
      const { container } = render(<WebcamProctor ref={ref} onStream={() => {}} />);
      await waitFor(() => expect(ref.current).not.toBeNull());
      const result = await ref.current!.detectOnce();
      expect(result).toEqual({ ...baseObs, count: 3 });
      expect(mockedDetect).toHaveBeenCalledWith(fakeModel, container.querySelector("video"));
    });
  });
});
