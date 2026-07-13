import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetSignedUrl = vi.fn();

vi.mock("@aws-sdk/client-s3", () => {
  return {
    S3Client: vi.fn().mockImplementation((config: unknown) => ({ __config: config })),
    PutObjectCommand: vi.fn().mockImplementation((input: unknown) => ({ __input: input })),
  };
});

vi.mock("@aws-sdk/s3-request-presigner", () => {
  return {
    getSignedUrl: (...args: unknown[]) => mockGetSignedUrl(...args),
  };
});

import { S3Adapter, S3PresignedUrlInput } from "./S3Adapter";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

function baseInput(overrides: Partial<S3PresignedUrlInput> = {}): S3PresignedUrlInput {
  return {
    accessKeyId: "AKIA_TEST",
    secretAccessKey: "secret123",
    region: "us-east-1",
    bucket: "my-bucket",
    key: "uploads/file.png",
    ...overrides,
  };
}

describe("S3Adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSignedUrl.mockResolvedValue("https://signed.example.com/upload?sig=abc");
  });

  it("returns uploadUrl, publicUrl and expiresIn on success", async () => {
    const adapter = new S3Adapter();
    const result = await adapter.send(baseInput());

    expect(result.uploadUrl).toBe("https://signed.example.com/upload?sig=abc");
    expect(result.publicUrl).toBe("https://my-bucket.s3.us-east-1.amazonaws.com/uploads/file.png");
    expect(result.expiresIn).toBe(300);
  });

  it("constructs the S3Client with the region and credentials from input", async () => {
    const adapter = new S3Adapter();
    await adapter.send(baseInput({ region: "eu-west-2", accessKeyId: "AKIA_X", secretAccessKey: "shh" }));

    expect(S3Client).toHaveBeenCalledWith({
      region: "eu-west-2",
      credentials: { accessKeyId: "AKIA_X", secretAccessKey: "shh" },
    });
  });

  it("builds a PutObjectCommand with Bucket and Key from input", async () => {
    const adapter = new S3Adapter();
    await adapter.send(baseInput({ bucket: "bkt", key: "path/to/obj.jpg", contentType: "image/jpeg" }));

    expect(PutObjectCommand).toHaveBeenCalledWith({
      Bucket: "bkt",
      Key: "path/to/obj.jpg",
      ContentType: "image/jpeg",
    });
  });

  it("defaults ContentType to application/octet-stream when contentType is omitted", async () => {
    const adapter = new S3Adapter();
    await adapter.send(baseInput({ contentType: undefined }));

    expect(PutObjectCommand).toHaveBeenCalledWith(
      expect.objectContaining({ ContentType: "application/octet-stream" })
    );
  });

  it("defaults ContentType to application/octet-stream when contentType is an empty string", async () => {
    const adapter = new S3Adapter();
    await adapter.send(baseInput({ contentType: "" }));

    expect(PutObjectCommand).toHaveBeenCalledWith(
      expect.objectContaining({ ContentType: "application/octet-stream" })
    );
  });

  it("passes the constructed client and command to getSignedUrl with a 300s expiry", async () => {
    const adapter = new S3Adapter();
    await adapter.send(baseInput());

    expect(mockGetSignedUrl).toHaveBeenCalledTimes(1);
    const [clientArg, commandArg, optionsArg] = mockGetSignedUrl.mock.calls[0];
    expect(clientArg).toEqual({ __config: { region: "us-east-1", credentials: { accessKeyId: "AKIA_TEST", secretAccessKey: "secret123" } } });
    expect(commandArg).toEqual({ __input: { Bucket: "my-bucket", Key: "uploads/file.png", ContentType: "application/octet-stream" } });
    expect(optionsArg).toEqual({ expiresIn: 300 });
  });

  it("builds the publicUrl using the exact bucket, region, and key even with special characters", async () => {
    const adapter = new S3Adapter();
    const result = await adapter.send(baseInput({ bucket: "b1", region: "ap-south-1", key: "folder/sub folder/file name.pdf" }));

    expect(result.publicUrl).toBe("https://b1.s3.ap-south-1.amazonaws.com/folder/sub folder/file name.pdf");
  });

  it("propagates rejection when getSignedUrl fails", async () => {
    mockGetSignedUrl.mockRejectedValueOnce(new Error("AWS credentials invalid"));
    const adapter = new S3Adapter();

    await expect(adapter.send(baseInput())).rejects.toThrow("AWS credentials invalid");
  });

  it("handles an empty key by still producing a well-formed publicUrl", async () => {
    const adapter = new S3Adapter();
    const result = await adapter.send(baseInput({ key: "" }));

    expect(result.publicUrl).toBe("https://my-bucket.s3.us-east-1.amazonaws.com/");
    expect(PutObjectCommand).toHaveBeenCalledWith(
      expect.objectContaining({ Key: "" })
    );
  });
});
