/**
 * mailmoat's shared Google OAuth client (PRD F1.4, DISTRIBUTION.md §1): a "Desktop app" client
 * in Kaushal's Google Cloud project, published as "In production" and left unverified.
 *
 * Google treats a desktop client's secret as non-confidential — PKCE and the loopback redirect
 * are what protect the sign-in — so it is committed here and users never create their own.
 * `.env` (`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`) overrides it for development.
 */
export const BUILT_IN_GOOGLE_CLIENT = Object.freeze({
  clientId: '',
  clientSecret: '',
});
