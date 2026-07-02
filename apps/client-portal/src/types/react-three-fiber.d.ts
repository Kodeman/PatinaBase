/**
 * @react-three/fiber v8 augments the *global* JSX namespace with its element
 * types (ambientLight, primitive, etc.), but @types/react 19 resolves JSX
 * element types from the module-scoped React.JSX namespace instead. Bridge
 * the two until fiber is upgraded to v9 (which targets React 19 natively).
 * Type-only — no runtime impact.
 */
import type { ThreeElements } from '@react-three/fiber';

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements extends ThreeElements {}
  }
}
