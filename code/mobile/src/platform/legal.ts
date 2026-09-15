/**
 * The product's legal documents — ONE place (design review 2026-09-01).
 *
 * ⛔ RESOLVED (founder 2026-09-01): the documents live IN the app now — `components/LegalSheet`
 * renders the terms + privacy text from the copy pack (`legal.*` keys), opened from the sign-in
 * consent line and from the You tab. These URLs remain as the OPTIONAL hosted mirrors: when the
 * founder hosts web copies (App Store Connect metadata wants URLs), set them here and any surface
 * that prefers a browser can use them. Null simply means "the in-app sheet is the document".
 */

/*
 * ⛔ HOSTED 2026-09-01 (audit finding 4): the identity worker now serves both documents —
 * App Store Connect requires the privacy URL, and "null means the in-app sheet is the document"
 * was never going to pass review. The in-app LegalSheet remains the athlete-facing summary.
 */
export const TERMS_URL: string | null = 'https://hush-identity.hush-app.workers.dev/terms';

export const PRIVACY_URL: string | null = 'https://hush-identity.hush-app.workers.dev/privacy';
