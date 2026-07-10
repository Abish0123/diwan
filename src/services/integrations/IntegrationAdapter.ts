// Adapter pattern for third-party integrations. Before this, Zoom, Stripe,
// S3, WhatsApp, PayTabs, and SMTP were six differently-shaped Express route
// handlers in server.ts — different request bodies, different auth
// mechanisms (Basic/Bearer/SDK-credentials/env-vars), different upstream
// protocols (REST JSON, form-urlencoded, AWS SDK), different response
// envelopes. No common interface, so adding a new provider meant writing a
// full route from first principles.
//
// The interface stays deliberately minimal (send only) rather than forcing
// a rigid shared request/response shape — the six upstream protocols
// genuinely differ, and that's exactly what an adapter is for. Each
// adapter's send() takes and returns whatever shape that provider actually
// needs; only the calling convention (one method, throws IntegrationError
// on failure) is unified.

export class IntegrationError extends Error {
  constructor(message: string, public readonly status: number = 500) {
    super(message);
    this.name = "IntegrationError";
  }
}

export interface IntegrationAdapter<TInput, TResult> {
  send(input: TInput): Promise<TResult>;
}
