# Patina iOS App

Native Swift/SwiftUI app for room capture and furniture discovery.

## Structure

- Xcode project at `Patina/Patina.xcodeproj`
- Swift source in `Patina/Patina/`

## Architecture (MV-VM + Coordinators)

- **Core/**: Models, Network, Persistence, Extensions
- **Design/**: Components, Tokens, Animations, Gestures
- **Features/**: Walk (room capture)
- **App/**: Coordinators, Configuration
- **Services/Sync/**: Supabase integration

## Key Patterns

- RoomModel for spatial data
- Sync service for Supabase integration
- Custom gesture handlers
- SwiftUI with UIKit bridges where needed

## Related Specs

- Room capture flow spec (pending — not yet in `docs/specs/`)
