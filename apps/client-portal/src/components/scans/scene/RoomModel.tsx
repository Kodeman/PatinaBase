'use client';

import { useGLTF } from '@react-three/drei';

interface RoomModelProps {
  url: string;
}

export function RoomModel({ url }: RoomModelProps) {
  const { scene } = useGLTF(url);
  if (!scene) return null;
  return <primitive object={scene} />;
}

RoomModel.preload = (url: string) => {
  useGLTF.preload(url);
};
