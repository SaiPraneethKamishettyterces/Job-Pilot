// Back-compat shim. The single source of truth is ./config.ts; this re-exports
// the flat `env` view that existing modules import. New code should prefer
// importing `config` from ./config.js for the grouped, typed configuration.
export { env, config } from "./config.js";
