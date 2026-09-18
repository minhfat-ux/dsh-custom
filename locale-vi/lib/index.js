/**
 * Host half of the Vietnamese language pack.
 *
 * Every contribution is browser-side: the `./client` bundle registers the `vi`
 * language definition and its dictionaries through `ctx.locale`. The Host half
 * exists so the package is a mountable Cordis entry.
 */

/** Stable Cordis plugin name. */
export const name = 'dsh-locale-vi'

/** No Host-side services are required. */
export function apply() {}
