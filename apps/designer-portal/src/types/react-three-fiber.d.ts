import type { ThreeElements } from '@react-three/fiber';
import 'react';

// @react-three/fiber v8 augments the legacy *global* `JSX.IntrinsicElements`,
// but React 19 resolves intrinsic elements through the `React.JSX` namespace,
// so the three.js elements (mesh, group, ambientLight, ...) the room-scan
// viewer renders go unrecognized. Re-augment `React.JSX` with r3f's
// ThreeElements. Remove this shim when upgrading to @react-three/fiber v9,
// which augments React.JSX natively.
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements extends ThreeElements {}
  }
}
