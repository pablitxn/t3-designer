import { getSiteConfig } from './site-config'

/** Statements belong to this installation's operator, never to the source author. */
export const privacyDetails = getSiteConfig().operator
