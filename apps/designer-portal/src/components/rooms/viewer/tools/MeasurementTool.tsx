'use client';

import { useCallback } from 'react';
import { Line, Html } from '@react-three/drei';
import { useViewerStore } from '@/stores/viewer-store';
import type { ThreeEvent } from '@react-three/fiber';

/**
 * Measurement tool that allows clicking two points in 3D space
 * to measure the distance between them
 */
export function MeasurementTool() {
  const { measurementPoints, currentMeasurement, addMeasurementPoint, unitSystem } = useViewerStore();

  // Handle click to add measurement point
  const handleClick = useCallback((event: ThreeEvent<MouseEvent>) => {
    // Stop propagation to prevent orbit controls from interfering
    event.stopPropagation();

    // Get the intersection point directly from the event
    if (event.intersections.length > 0) {
      const point = event.intersections[0].point;
      addMeasurementPoint({ x: point.x, y: point.y, z: point.z });
    }
  }, [addMeasurementPoint]);

  // Format current measurement
  const formatDistance = (meters: number): string => {
    if (unitSystem === 'imperial') {
      const feet = meters * 3.28084;
      const wholeFeet = Math.floor(feet);
      const inches = Math.round((feet - wholeFeet) * 12);
      return inches === 12 ? `${wholeFeet + 1}' 0"` : `${wholeFeet}' ${inches}"`;
    }
    return `${meters.toFixed(2)} m`;
  };

  return (
    <group onClick={handleClick}>
      {/* First point marker */}
      {measurementPoints[0] && (
        <mesh position={[measurementPoints[0].x, measurementPoints[0].y, measurementPoints[0].z]}>
          <sphereGeometry args={[0.05, 16, 16]} />
          <meshStandardMaterial color="#3b82f6" emissive="#3b82f6" emissiveIntensity={0.5} />
        </mesh>
      )}

      {/* Second point marker */}
      {measurementPoints[1] && (
        <mesh position={[measurementPoints[1].x, measurementPoints[1].y, measurementPoints[1].z]}>
          <sphereGeometry args={[0.05, 16, 16]} />
          <meshStandardMaterial color="#3b82f6" emissive="#3b82f6" emissiveIntensity={0.5} />
        </mesh>
      )}

      {/* Line between points */}
      {measurementPoints.length === 2 && (
        <>
          <Line
            points={[
              [measurementPoints[0].x, measurementPoints[0].y, measurementPoints[0].z],
              [measurementPoints[1].x, measurementPoints[1].y, measurementPoints[1].z],
            ]}
            color="#3b82f6"
            lineWidth={2}
          />

          {/* Distance label */}
          {currentMeasurement !== null && (
            <Html
              position={[
                (measurementPoints[0].x + measurementPoints[1].x) / 2,
                (measurementPoints[0].y + measurementPoints[1].y) / 2 + 0.2,
                (measurementPoints[0].z + measurementPoints[1].z) / 2,
              ]}
              center
            >
              <div className="bg-blue-500 text-white text-sm font-medium px-2 py-1 rounded shadow-lg whitespace-nowrap">
                {formatDistance(currentMeasurement)}
              </div>
            </Html>
          )}
        </>
      )}

      {/* Saved measurements */}
      {useViewerStore.getState().savedMeasurements.map((m) => (
        <group key={m.id}>
          <mesh position={[m.startPoint.x, m.startPoint.y, m.startPoint.z]}>
            <sphereGeometry args={[0.03, 16, 16]} />
            <meshStandardMaterial color="#22c55e" />
          </mesh>
          <mesh position={[m.endPoint.x, m.endPoint.y, m.endPoint.z]}>
            <sphereGeometry args={[0.03, 16, 16]} />
            <meshStandardMaterial color="#22c55e" />
          </mesh>
          <Line
            points={[
              [m.startPoint.x, m.startPoint.y, m.startPoint.z],
              [m.endPoint.x, m.endPoint.y, m.endPoint.z],
            ]}
            color="#22c55e"
            lineWidth={1.5}
            dashed
            dashSize={0.1}
            gapSize={0.05}
          />
          <Html
            position={[
              (m.startPoint.x + m.endPoint.x) / 2,
              (m.startPoint.y + m.endPoint.y) / 2 + 0.15,
              (m.startPoint.z + m.endPoint.z) / 2,
            ]}
            center
          >
            <div className="bg-green-600/90 text-white text-xs font-medium px-1.5 py-0.5 rounded whitespace-nowrap">
              {m.label || m.distanceFormatted.imperial}
            </div>
          </Html>
        </group>
      ))}
    </group>
  );
}
