/**
 * BSP loader — the only import path the rest of the app should use:
 *   const bsp = require('./bsp');
 */

const providers = {
  twilio: () => require("./twilio"),
  gupshup: () => require("./gupshup"),
  // Future: aisensy: () => require('./aisensy'),
  // Future: dialog360: () => require('./dialog360'),
};

const providerName = process.env.BSP_PROVIDER || "twilio";
const loader = providers[providerName];

if (!loader) {
  throw new Error(
    `Unknown BSP_PROVIDER: ${providerName}. Known: ${Object.keys(providers).join(", ")}`
  );
}

module.exports = loader();
