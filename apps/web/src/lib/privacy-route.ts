export const PRIVACY_PATH = '/privacy'

/** A real static-host SPA route; policy section hashes are not workspace selections. */
export function isPrivacyPath(pathname: string): boolean {
  return pathname === PRIVACY_PATH || pathname === `${PRIVACY_PATH}/`
}
