/**
 * The crawlers, previews, page testers and HTTP libraries a view count
 * leaves out (FER-029), by their own name in the user agent. Next's list
 * (`userAgent().isBot`) misses the ones that run the page's script the way
 * a shopper's browser does: a headless Chrome, Lighthouse, the AI crawlers.
 * `bot` is a word of its own (`Googlebot/2.1`, `AhrefsBot`), so a phone
 * sold as a "Cubot" is not one.
 */
const KNOWN_BOT =
  /(?<!cu)bot\b|crawl|spider|scrap|slurp|headless|lighthouse|pagespeed|gtmetrix|ptst|preview|facebookexternalhit|facebookcatalog|whatsapp|ia_archiver|yandex|baidu|sogou|bytespider|curl\/|wget\/|python|go-http-client|node-fetch|axios\/|okhttp|java\//iu;

/**
 * Whether a request's user agent says a machine sent it. No user agent at
 * all is one too: every browser sends its own.
 */
export function isKnownBot(userAgent: string | null): boolean {
  return userAgent === null || userAgent.trim() === ""
    ? true
    : KNOWN_BOT.test(userAgent);
}
