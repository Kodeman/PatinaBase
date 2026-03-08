# PostHog iOS SDK Setup

## Add via Xcode SPM

1. Open `Patina.xcodeproj` in Xcode
2. File > Add Package Dependencies
3. Enter URL: `https://github.com/PostHog/posthog-ios.git`
4. Set version rule: Up to Next Major (from 3.0.0)
5. Add `PostHog` library to the Patina target
6. Build to verify integration

## Info.plist

Add `NSUserTrackingUsageDescription` to `Patina/Info.plist` for ATT compliance:

```xml
<key>NSUserTrackingUsageDescription</key>
<string>Patina uses this to understand how you use the app and improve your experience</string>
```

This is required because PostHogService checks ATT authorization status to respect user privacy preferences.
