import { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { processImage, renderBinaryPreview } from './lib/imageProcessor';
import {
  generateModel,
  getLedPosition,
  autoSizeConfig,
  DEFAULT_CONFIG,
  type ModelConfig,
} from './lib/meshGenerator';
import { exportSTL } from './lib/stlExporter';
import Preview3D from './components/Preview3D';

function Slider({
  label,
  unit,
  value,
  min,
  max,
  step,
  decimals = 0,
  onChange,
}: {
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  step: number;
  decimals?: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="text-xs block">
      <div className="flex justify-between mb-0.5">
        <span className="text-gray-500">{label}</span>
        <span className="text-gray-400 tabular-nums">
          {value.toFixed(decimals)} {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
      />
    </label>
  );
}

function App() {
  const [sourceImage, setSourceImage] = useState<HTMLImageElement | null>(null);
  const [threshold, setThreshold] = useState(128);
  const [invertImage, setInvertImage] = useState(false);
  const [config, setConfig] = useState<ModelConfig>({ ...DEFAULT_CONFIG });
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [autoSize, setAutoSize] = useState(true);
  const [projCenter, setProjCenter] = useState<{ x: number; y: number } | null>(null);

  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Track processed image dimensions for projection center mapping
  const processedDimsRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });

  // Draw projection center dot on preview canvas
  const drawProjDot = useCallback((canvas: HTMLCanvasElement, cx: number, cy: number) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // cx, cy are in processed image coordinates; canvas matches those dims
    ctx.fillStyle = '#ff3333';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
  }, []);

  // Auto-size dimensions when a new image is loaded
  useEffect(() => {
    if (!sourceImage) return;
    const { width, height } = processImage(sourceImage, threshold);
    const auto = autoSizeConfig(width, height);
    setConfig(prev => ({ ...prev, ...auto }));
    setAutoSize(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceImage]);

  // Generate model whenever any relevant state changes
  useEffect(() => {
    if (!sourceImage) return;

    const { binary: rawBinary, width, height } = processImage(sourceImage, threshold);
    processedDimsRef.current = { width, height };

    const binary = invertImage
      ? rawBinary.map(row => row.map(v => !v))
      : rawBinary;

    if (previewCanvasRef.current) {
      renderBinaryPreview(binary, previewCanvasRef.current);
      if (projCenter) {
        drawProjDot(previewCanvasRef.current, projCenter.x, projCenter.y);
      }
    }

    try {
      const geo = generateModel(
        binary, width, height, config,
        projCenter?.x, projCenter?.y,
      );
      setGeometry(geo);
      setError(null);
    } catch (e) {
      console.error('Geometry generation failed:', e);
      setError(e instanceof Error ? e.message : String(e));
      setGeometry(null);
    }
  }, [sourceImage, threshold, invertImage, projCenter, config, drawProjDot]);

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return;
    const img = new Image();
    img.onload = () => {
      setAutoSize(true);
      setProjCenter(null);
      setSourceImage(img);
    };
    img.src = URL.createObjectURL(file);
  }, []);

  // Global paste listener for Cmd+V / Ctrl+V image paste
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = e.clipboardData?.files[0];
      if (file && file.type.startsWith('image/')) {
        e.preventDefault();
        handleFile(file);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [handleFile]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => setDragOver(false), []);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const cx = (e.clientX - rect.left) * scaleX;
    const cy = (e.clientY - rect.top) * scaleY;
    setProjCenter({ x: cx, y: cy });
  }, []);

  const handleExport = useCallback(() => {
    if (geometry) exportSTL(geometry);
  }, [geometry]);

  const updateConfig = (key: keyof ModelConfig, value: number) => {
    setAutoSize(false);
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const ledPos = getLedPosition(config);

  return (
    <div className="h-screen flex flex-col lg:flex-row overflow-hidden">
      {/* Left panel */}
      <div className="w-full lg:w-80 lg:h-full p-4 flex flex-col gap-3 border-r border-gray-800 bg-gray-950 overflow-y-auto shrink-0">
        <h1 className="text-xl font-bold">Shadow Projector</h1>
        <p className="text-xs text-gray-500">
          Anamorphic table projector — image flat on floor, cone in centre,
          LED above, shadow cast downward
        </p>

        {/* Upload */}
        <div
          className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
            dragOver
              ? 'border-blue-400 bg-blue-950/30'
              : 'border-gray-600 hover:border-gray-400'
          }`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileInput}
          />
          {sourceImage ? (
            <p className="text-sm text-gray-400">
              {sourceImage.naturalWidth} x {sourceImage.naturalHeight}px
              <br />
              <span className="text-xs">Drop or click to replace</span>
            </p>
          ) : (
            <p className="text-gray-400 text-sm">
              Drop a B&W image here
              <br />
              or click to browse / paste
            </p>
          )}
        </div>

        {/* Binary preview */}
        {sourceImage && (
          <div className="bg-gray-900 rounded p-2">
            <p className="text-xs text-gray-500 mb-1">
              Threshold preview (click to set projection center)
            </p>
            <canvas
              ref={previewCanvasRef}
              className="w-full rounded cursor-crosshair"
              style={{ imageRendering: 'pixelated' }}
              onClick={handleCanvasClick}
            />
            {projCenter && (
              <div className="flex items-center justify-between mt-1">
                <p className="text-xs text-gray-600">
                  Center: ({Math.round(projCenter.x)}, {Math.round(projCenter.y)})
                </p>
                <button
                  className="text-xs text-blue-400 hover:text-blue-300"
                  onClick={(e) => {
                    e.stopPropagation();
                    setProjCenter(null);
                  }}
                >
                  Reset
                </button>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="bg-red-900/40 border border-red-600 rounded p-2 text-xs text-red-300">
            {error}
          </div>
        )}

        {/* Threshold + Invert */}
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <Slider
              label="Threshold"
              unit=""
              value={threshold}
              min={1}
              max={254}
              step={1}
              onChange={setThreshold}
            />
          </div>
          <label className="flex items-center gap-1.5 text-xs text-gray-400 pb-0.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={invertImage}
              onChange={(e) => setInvertImage(e.target.checked)}
              className="accent-blue-500"
            />
            Invert
          </label>
        </div>

        {/* Dimension sliders */}
        <div className="border-t border-gray-800 pt-3 flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-300">Dimensions</p>
            {!autoSize && (
              <button
                className="text-xs text-blue-400 hover:text-blue-300"
                onClick={() => {
                  setAutoSize(true);
                  if (sourceImage) {
                    const { width, height } = processImage(sourceImage, threshold);
                    const auto = autoSizeConfig(width, height);
                    setConfig((prev) => ({ ...prev, ...auto }));
                  }
                }}
              >
                Auto
              </button>
            )}
          </div>

          <Slider
            label="Bottom radius"
            unit="mm"
            value={config.bottomRadius}
            min={5}
            max={100}
            step={1}
            onChange={(v) => updateConfig('bottomRadius', v)}
          />
          <Slider
            label="Top radius"
            unit="mm"
            value={config.topRadius}
            min={3}
            max={80}
            step={1}
            onChange={(v) => updateConfig('topRadius', v)}
          />
          <Slider
            label="Cylinder height"
            unit="mm"
            value={config.cylinderHeight}
            min={10}
            max={300}
            step={5}
            onChange={(v) => updateConfig('cylinderHeight', v)}
          />
          <Slider
            label="LED height"
            unit="mm"
            value={config.ledHeight}
            min={30}
            max={500}
            step={5}
            onChange={(v) => updateConfig('ledHeight', v)}
          />
          <Slider
            label="Wall thickness"
            unit="mm"
            value={config.wallThickness}
            min={0.4}
            max={5}
            step={0.1}
            decimals={1}
            onChange={(v) => updateConfig('wallThickness', v)}
          />
          <Slider
            label="Wrap angle"
            unit={"\u00B0"}
            value={config.wrapAngle}
            min={90}
            max={360}
            step={10}
            onChange={(v) => updateConfig('wrapAngle', v)}
          />
          <Slider
            label="Projection distance"
            unit="mm"
            value={config.projectionDistance}
            min={10}
            max={500}
            step={5}
            onChange={(v) => updateConfig('projectionDistance', v)}
          />
        </div>

        {/* Support cage sliders */}
        <div className="border-t border-gray-800 pt-3 flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-300">Support Cage</p>
            <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={config.enableCage}
                onChange={(e) => {
                  setAutoSize(false);
                  setConfig(prev => ({ ...prev, enableCage: e.target.checked }));
                }}
                className="accent-blue-500"
              />
              Enable
            </label>
          </div>
          {config.enableCage && (
            <>
              <Slider
                label="Strut width"
                unit="mm"
                value={config.strutWidth}
                min={0.8}
                max={6}
                step={0.1}
                decimals={1}
                onChange={(v) => updateConfig('strutWidth', v)}
              />
              <Slider
                label="Strut depth"
                unit="mm"
                value={config.strutDepth}
                min={0.8}
                max={6}
                step={0.1}
                decimals={1}
                onChange={(v) => updateConfig('strutDepth', v)}
              />
              <Slider
                label="Radial segments"
                unit=""
                value={config.cageRadialSegments}
                min={0}
                max={32}
                step={1}
                onChange={(v) => updateConfig('cageRadialSegments', v)}
              />
              <Slider
                label="Height segments"
                unit=""
                value={config.cageHeightSegments}
                min={0}
                max={24}
                step={1}
                onChange={(v) => updateConfig('cageHeightSegments', v)}
              />
              <Slider
                label="Cage rotation"
                unit={"\u00B0"}
                value={config.cageRotation}
                min={0}
                max={360}
                step={1}
                onChange={(v) => updateConfig('cageRotation', v)}
              />
            </>
          )}
        </div>

        <button
          disabled={!geometry}
          onClick={handleExport}
          className="w-full py-2 rounded font-semibold transition-colors bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed"
        >
          Download STL
        </button>
      </div>

      {/* Right panel – 3D preview */}
      <div className="flex-1 min-h-[400px] relative">
        <div className="absolute inset-0">
          <Preview3D geometry={geometry} ledPosition={ledPos} config={config} />
        </div>
      </div>
    </div>
  );
}

export default App;
