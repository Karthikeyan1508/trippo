import { randomBytes } from "node:crypto"

/** Short, URL-safe, unguessable code for a trip's shareable invite link. */
export function newJoinCode() {
  return randomBytes(8).toString("base64url")
}

/** Absolute invite URL for a code, given the request's origin. */
export function joinPath(code: string) {
  return `/join/${code}`
}
