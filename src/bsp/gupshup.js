/**
 * Gupshup BSP adapter — STUB ONLY.
 *
 * Docs: https://docs.gupshup.io/
 *
 * TODO when implementing:
 * - POST https://api.gupshup.io/wa/api/v1/msg — send free-form + template messages
 * - Validate inbound webhooks via X-Gupshup-Signature header
 * - Parse incoming payload (nested under payload.payload) into IncomingMessage
 * - buildWebhookResponse — Gupshup typically expects HTTP 200 with empty/JSON ack
 * - Map templateRef → GUPSHUP_TEMPLATE_ID_* env vars
 *
 * Set BSP_PROVIDER=twilio until this adapter is complete.
 */

function notImplemented(method) {
  throw new Error(
    `Gupshup adapter not implemented yet (${method}) — set BSP_PROVIDER=twilio`
  );
}

const adapter = {
  name: "gupshup",

  async sendMessage() {
    notImplemented("sendMessage");
  },

  async sendTemplate() {
    notImplemented("sendTemplate");
  },

  validateWebhook() {
    notImplemented("validateWebhook");
  },

  parseIncomingMessage() {
    notImplemented("parseIncomingMessage");
  },

  buildWebhookResponse() {
    notImplemented("buildWebhookResponse");
  },
};

module.exports = adapter;
