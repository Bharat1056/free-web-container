/**
 * Deploy feature mode. Distinct from `NODE_ENV` — local/dev can run with
 * `NODE_ENV=production` builds without enabling BYOK gates.
 */
export function isProdMode(): boolean {
  return process.env.APP_MODE === "prod";
}
