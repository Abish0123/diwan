import { IntegrationAdapter, IntegrationError } from "./IntegrationAdapter.js";

export interface ZoomMeetingInput {
  accountId: string;
  clientId: string;
  clientSecret: string;
  topic?: string;
  startTime?: string;
  duration?: number;
}

export interface ZoomMeetingResult {
  joinUrl: string;
  startUrl: string;
  meetingId: string;
  password?: string;
}

// Real Server-to-Server OAuth flow (Zoom retired JWT apps in 2023) — same
// two-call sequence (token, then meeting-create) as the original inline
// handler, unchanged.
export class ZoomAdapter implements IntegrationAdapter<ZoomMeetingInput, ZoomMeetingResult> {
  async send(input: ZoomMeetingInput): Promise<ZoomMeetingResult> {
    const { accountId, clientId, clientSecret, topic, startTime, duration } = input;

    const tokenRes = await fetch(
      `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(accountId)}`,
      { method: "POST", headers: { Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}` } },
    );
    const tokenData: any = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      throw new IntegrationError(
        tokenData.reason || tokenData.message || "Zoom authentication failed — check credentials",
        tokenRes.status || 401,
      );
    }

    const meetingRes = await fetch("https://api.zoom.us/v2/users/me/meetings", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenData.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        topic: topic || "Live Class",
        type: 2, // scheduled
        start_time: startTime || new Date().toISOString(),
        duration: duration || 45,
        settings: { join_before_host: true, waiting_room: false },
      }),
    });
    const meetingData: any = await meetingRes.json();
    if (!meetingRes.ok) {
      throw new IntegrationError(meetingData.message || "Zoom meeting creation failed", meetingRes.status);
    }

    return {
      joinUrl: meetingData.join_url,
      startUrl: meetingData.start_url,
      meetingId: meetingData.id,
      password: meetingData.password,
    };
  }
}
