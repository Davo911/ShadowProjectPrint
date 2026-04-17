import * as THREE from 'three';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';

export function exportSTL(geometry: THREE.BufferGeometry, filename: string = 'shadow-projector.stl') {
  const exporter = new STLExporter();

  // Wrap geometry in a mesh for the exporter
  const mesh = new THREE.Mesh(geometry);
  const result = exporter.parse(mesh, { binary: true });

  const blob = new Blob([result], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();

  URL.revokeObjectURL(url);
}
