/**
 * FROZEN CROSS-LANGUAGE POSE-VECTOR PIN (Field Capture P2, Layer 3 §3.5).
 *
 * ⚠ DO NOT HAND-EDIT. Every number below was emitted by, and is asserted by,
 * the generating test:
 *
 *     services/scan-pipeline/tests/test_refine_adapter.py
 *         :: test_cross_language_pose_vector_pin_matches_the_frozen_portal_fixture
 *
 * That test recomputes each `(cameraCenterMeters, qvecHamilton, rotation)`
 * triple from `refine_adapter.arkit_c2w_to_colmap_w2c(cameraTransform)` and
 * compares it against the identical table held as a Python literal. This file
 * holds the portal's copy. `refined-poses.test.ts` reads it and asserts that
 * `colmapPlanPose(cameraCenterMeters, …)` agrees with
 * `photoPlanPose(cameraTransform, …)`.
 *
 * WHY IT EXISTS: no refine artifact has ever been written to production
 * Storage, so there is no live document to validate the conversion against.
 * These eight vectors are the only real guarantee that the two languages
 * still agree about the ARKit↔COLMAP basis. If either side's convention
 * drifts — a transposed rotation, a column-for-row read, a dropped
 * `ARKIT_TO_RIGHT_ROTATED_COLMAP`, a sign error — exactly one of the two
 * suites goes red, and the disagreement is legible rather than silent.
 *
 * TO REGENERATE (only when the pipeline's convention deliberately changes,
 * which is a ruling, not a refactor): re-emit from the Python side and update
 * BOTH literals in the same commit.
 *
 * Conventions: `cameraTransform` is ARKit camera-to-world, row-major, 16
 * doubles (as `room_scan_images.camera_transform` stores it).
 * `qvecHamilton` is `[qw, qx, qy, qz]`. `rotation` is COLMAP `cam_from_world`,
 * row-major — its THIRD ROW is the ARKit-world forward direction.
 */

export interface CrossLanguagePoseVector {
  label: string;
  /** ARKit camera-to-world, row-major, 16 doubles. */
  cameraTransform: number[];
  /** COLMAP-derived camera centre, ARKit world metres. */
  cameraCenterMeters: [number, number, number];
  /** COLMAP `cam_from_world` orientation, Hamilton `[qw, qx, qy, qz]`. */
  qvecHamilton: [number, number, number, number];
  /** COLMAP `cam_from_world` rotation, row-major. */
  rotation: [
    [number, number, number],
    [number, number, number],
    [number, number, number],
  ];
}

export const CROSS_LANGUAGE_POSE_VECTORS: CrossLanguagePoseVector[] = [
  {
    label: 'identity at origin',
    cameraTransform: [1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0],
    cameraCenterMeters: [0.0, 0.0, 0.0],
    qvecHamilton: [0.0, 0.7071067811865476, 0.7071067811865475, 0.0],
    rotation: [
      [0.0, 1.0, 0.0],
      [1.0, 0.0, 0.0],
      [0.0, 0.0, -1.0],
    ],
  },
  {
    label: 'yaw +30 about world +Y',
    cameraTransform: [0.8660254037844387, 0.0, 0.49999999999999994, 1.25, 0.0, 1.0, 0.0, 1.6, -0.49999999999999994, 0.0, 0.8660254037844387, -0.4, 0.0, 0.0, 0.0, 1.0],
    cameraCenterMeters: [1.25, 1.6, -0.4],
    qvecHamilton: [0.18301270189221927, 0.6830127018922194, 0.6830127018922193, -0.18301270189221927],
    rotation: [
      [0.0, 1.0, 0.0],
      [0.8660254037844387, 0.0, -0.49999999999999994],
      [-0.49999999999999994, 0.0, -0.8660254037844387],
    ],
  },
  {
    label: 'yaw -115 about world +Y',
    cameraTransform: [-0.42261826174069933, 0.0, -0.90630778703665, -2.0, 0.0, 1.0, 0.0, 1.55, 0.90630778703665, 0.0, -0.42261826174069933, 3.5, 0.0, 0.0, 0.0, 1.0],
    cameraCenterMeters: [-2.0, 1.55, 3.5],
    qvecHamilton: [0.5963678105290181, -0.3799281965909153, -0.3799281965909153, -0.5963678105290181],
    rotation: [
      [0.0, 1.0, 0.0],
      [-0.42261826174069933, 0.0, 0.90630778703665],
      [0.90630778703665, 0.0, 0.42261826174069933],
    ],
  },
  {
    label: 'pitch +20 about world +X',
    cameraTransform: [1.0, 0.0, 0.0, 0.5, 0.0, 0.9396926207859084, -0.3420201433256687, 1.7, 0.0, 0.3420201433256687, 0.9396926207859084, 0.5, 0.0, 0.0, 0.0, 1.0],
    cameraCenterMeters: [0.5, 1.7, 0.5],
    qvecHamilton: [0.12278780396897283, 0.696364240320019, 0.6963642403200189, 0.12278780396897283],
    rotation: [
      [0.0, 0.9396926207859084, 0.3420201433256687],
      [1.0, 0.0, 0.0],
      [0.0, 0.3420201433256687, -0.9396926207859084],
    ],
  },
  {
    label: 'roll +45 about world +Z',
    cameraTransform: [0.7071067811865476, -0.7071067811865475, 0.0, -1.1, 0.7071067811865475, 0.7071067811865476, 0.0, 1.45, 0.0, 0.0, 1.0, -2.2, 0.0, 0.0, 0.0, 1.0],
    cameraCenterMeters: [-1.1, 1.45, -2.2],
    qvecHamilton: [0.0, 0.3826834323650898, 0.9238795325112867, 0.0],
    rotation: [
      [-0.7071067811865475, 0.7071067811865476, 0.0],
      [0.7071067811865476, 0.7071067811865475, 0.0],
      [0.0, 0.0, -1.0],
    ],
  },
  {
    label: '77 about (1,2,3)',
    cameraTransform: [0.28031169331930317, -0.6705127828394977, 0.6869046241198975, 3.33, 0.8919553387412507, 0.44639361024561786, 0.07175248025583797, 1.62, -0.3547407902672681, 0.5925751874494207, 0.723196805122809, -0.77, 0.0, 0.0, 0.0, 1.0],
    cameraCenterMeters: [3.33, 1.62, -0.77],
    qvecHamilton: [0.3529326248659027, 0.20045490985634443, 0.9063201595881498, -0.11764420828863424],
    rotation: [
      [-0.6705127828394977, 0.44639361024561786, 0.5925751874494207],
      [0.28031169331930317, 0.8919553387412507, -0.3547407902672681],
      [-0.6869046241198975, -0.07175248025583797, -0.723196805122809],
    ],
  },
  {
    label: '143 about (-2,1,0.5)',
    cameraTransform: [0.5717534499887399, -0.8165212846825813, -0.07994363067987847, 0.0, -0.5538676753534515, -0.45603827003828473, 0.6966058386627636, 1.5, -0.6052508493381379, -0.35400859865375534, -0.7129862000450409, 4.2, 0.0, 0.0, 0.0, 1.0],
    cameraCenterMeters: [0.0, 1.5, 4.2],
    qvecHamilton: [0.2926590336932247, -0.0780387573994957, -0.37069779109272044, 0.8779771010796742],
    rotation: [
      [-0.8165212846825813, -0.45603827003828473, -0.35400859865375534],
      [0.5717534499887399, -0.5538676753534515, -0.6052508493381379],
      [0.07994363067987847, -0.6966058386627636, 0.7129862000450409],
    ],
  },
  {
    label: '179 about (0.3,-0.9,0.2)',
    cameraTransform: [-0.808372915832907, -0.5780244945300044, 0.11144914836434075, -4.4, -0.5708241814109012, 0.7234253187549671, -0.38834979348629584, 1.38, 0.14385055740030492, -0.37754932380764117, -0.9147477932348427, 0.9, 0.0, 0.0, 0.0, 1.0],
    cameraCenterMeters: [-4.4, 1.38, 0.9],
    qvecHamilton: [0.43757831221792093, 0.1396888449788083, -0.15203002983313893, -0.8751566244358419],
    rotation: [
      [-0.5780244945300044, 0.7234253187549671, -0.37754932380764117],
      [-0.808372915832907, -0.5708241814109012, 0.14385055740030492],
      [-0.11144914836434075, 0.38834979348629584, 0.9147477932348427],
    ],
  },
];
