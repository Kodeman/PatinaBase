/**
 * RC-7 lane e2: the service acceptance, completion and care journeys under
 * playwright.round8.config.ts, so they run on its chromium and webkit-iphone
 * projects. run-consumer-journey.mjs sets RC7_E2_ROUND8=1 against the owned
 * stack it started and proved (with the client portal it keeps up); in any
 * other round8 run this file declares no tests. The journey itself refuses
 * anything but the owned stack before a write.
 */
if (process.env.RC7_E2_ROUND8 === '1') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('./rc7-e2-consumer-journey.journey');
}
