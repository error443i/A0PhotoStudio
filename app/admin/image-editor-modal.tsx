"use client";

import { useState, useEffect, useRef, useMemo } from "react";

export type ImageEditorModalProps = {
  files: File[];
  defaultAspectRatio?: number | null; // e.g. 16/9 for hero background
  title?: string;
  onComplete: (editedFiles: File[]) => void;
  onCancel: () => void;
};

type AspectPreset = {
  label: string;
  value: number | null | "original";
};

const ASPECT_PRESETS: AspectPreset[] = [
  { label: "Free", value: null },
  { label: "16:9 Landscape", value: 16 / 9 },
  { label: "4:3 Standard", value: 4 / 3 },
  { label: "1:1 Square", value: 1 / 1 },
  { label: "4:5 Portrait", value: 4 / 5 },
  { label: "Original", value: "original" },
];

type DragHandle =
  | "move"
  | "nw"
  | "n"
  | "ne"
  | "e"
  | "se"
  | "s"
  | "sw"
  | "w";

type CropRect = {
  x: number; // percentage 0 - 100
  y: number; // percentage 0 - 100
  width: number; // percentage 0 - 100
  height: number; // percentage 0 - 100
};

// Pure calculation helper for centered crop rect given an aspect ratio
function calculateInitialCrop(
  ratioValue: number | null | "original",
  nativeW: number,
  nativeH: number,
  rot: 0 | 90 | 180 | 270,
): CropRect {
  if (ratioValue === null) {
    return { x: 5, y: 5, width: 90, height: 90 };
  }

  const isRotated90 = rot === 90 || rot === 270;
  const effectiveW = isRotated90 ? nativeH : nativeW;
  const effectiveH = isRotated90 ? nativeW : nativeH;

  if (!effectiveW || !effectiveH) {
    return { x: 5, y: 5, width: 90, height: 90 };
  }

  const targetRatio = ratioValue === "original" ? effectiveW / effectiveH : ratioValue;
  const currentRatio = effectiveW / effectiveH;

  let newW = 90;
  let newH = 90;

  if (currentRatio > targetRatio) {
    // Image is wider than target crop
    newH = 90;
    newW = (newH * targetRatio) / currentRatio;
  } else {
    // Image is taller than target crop
    newW = 90;
    newH = (newW * currentRatio) / targetRatio;
  }

  const newX = (100 - newW) / 2;
  const newY = (100 - newH) / 2;

  return {
    x: Math.max(0, newX),
    y: Math.max(0, newY),
    width: Math.min(100, newW),
    height: Math.min(100, newH),
  };
}

interface SingleEditorProps {
  file: File;
  defaultAspectRatio: number | null;
  title: string;
  isMultiple: boolean;
  currentIndex: number;
  totalCount: number;
  onApply: (editedFile: File) => void;
  onSkip: () => void;
  onCancel: () => void;
}

function SinglePhotoEditor({
  file,
  defaultAspectRatio,
  title,
  isMultiple,
  currentIndex,
  totalCount,
  onApply,
  onSkip,
  onCancel,
}: SingleEditorProps) {
  const imageUrl = useMemo(() => {
    return URL.createObjectURL(file);
  }, [file]);

  useEffect(() => {
    return () => {
      URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  const [naturalDimensions, setNaturalDimensions] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });

  const [rotation, setRotation] = useState<0 | 90 | 180 | 270>(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [selectedRatio, setSelectedRatio] = useState<number | null | "original">(defaultAspectRatio);
  const [crop, setCrop] = useState<CropRect>({ x: 5, y: 5, width: 90, height: 90 });
  const [isExporting, setIsExporting] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const dragRef = useRef<{
    handle: DragHandle | null;
    startX: number;
    startY: number;
    startCrop: CropRect;
    containerWidth: number;
    containerHeight: number;
  }>({
    handle: null,
    startX: 0,
    startY: 0,
    startCrop: { x: 5, y: 5, width: 90, height: 90 },
    containerWidth: 1,
    containerHeight: 1,
  });

  function handleImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const img = e.currentTarget;
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    setNaturalDimensions({ width: nw, height: nh });

    if (defaultAspectRatio !== null) {
      setCrop(calculateInitialCrop(defaultAspectRatio, nw, nh, 0));
    } else {
      setCrop({ x: 5, y: 5, width: 90, height: 90 });
    }
  }

  function applyAspectRatio(ratioValue: number | null | "original") {
    setSelectedRatio(ratioValue);
    const nextCrop = calculateInitialCrop(
      ratioValue,
      naturalDimensions.width,
      naturalDimensions.height,
      rotation,
    );
    setCrop(nextCrop);
  }

  function handleRotateCW() {
    setRotation((prev) => ((prev + 90) % 360) as 0 | 90 | 180 | 270);
  }

  function handleRotateCCW() {
    setRotation((prev) => ((prev + 270) % 360) as 0 | 90 | 180 | 270);
  }

  function handleFlipH() {
    setFlipH((prev) => !prev);
  }

  function handleFlipV() {
    setFlipV((prev) => !prev);
  }

  function handleReset() {
    setRotation(0);
    setFlipH(false);
    setFlipV(false);
    setSelectedRatio(defaultAspectRatio);
    if (defaultAspectRatio !== null) {
      setCrop(calculateInitialCrop(defaultAspectRatio, naturalDimensions.width, naturalDimensions.height, 0));
    } else {
      setCrop({ x: 5, y: 5, width: 90, height: 90 });
    }
  }

  function handlePointerDown(handle: DragHandle, e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();

    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    dragRef.current = {
      handle,
      startX: e.clientX,
      startY: e.clientY,
      startCrop: { ...crop },
      containerWidth: rect.width,
      containerHeight: rect.height,
    };

    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent) {
    const { handle, startX, startY, startCrop, containerWidth, containerHeight } = dragRef.current;
    if (!handle || containerWidth <= 0 || containerHeight <= 0) return;

    e.preventDefault();

    const deltaX = ((e.clientX - startX) / containerWidth) * 100;
    const deltaY = ((e.clientY - startY) / containerHeight) * 100;

    const minSize = 10; // minimum percentage size (10%)

    if (handle === "move") {
      let nextX = startCrop.x + deltaX;
      let nextY = startCrop.y + deltaY;

      nextX = Math.max(0, Math.min(100 - startCrop.width, nextX));
      nextY = Math.max(0, Math.min(100 - startCrop.height, nextY));

      setCrop({
        ...startCrop,
        x: nextX,
        y: nextY,
      });
      return;
    }

    let newX = startCrop.x;
    let newY = startCrop.y;
    let newWidth = startCrop.width;
    let newHeight = startCrop.height;

    const isRotated90 = rotation === 90 || rotation === 270;
    const effW = isRotated90 ? naturalDimensions.height : naturalDimensions.width;
    const effH = isRotated90 ? naturalDimensions.width : naturalDimensions.height;
    const imageAspect = effW && effH ? effW / effH : 1;
    const containerAspect = containerWidth / containerHeight;

    const targetRatio =
      selectedRatio === "original"
        ? imageAspect
        : typeof selectedRatio === "number"
          ? selectedRatio
          : null;

    if (handle.includes("e")) {
      newWidth = Math.max(minSize, Math.min(100 - startCrop.x, startCrop.width + deltaX));
    }
    if (handle.includes("w")) {
      const maxLeft = startCrop.x + startCrop.width - minSize;
      const desiredX = Math.max(0, Math.min(maxLeft, startCrop.x + deltaX));
      newWidth = startCrop.width + (startCrop.x - desiredX);
      newX = desiredX;
    }
    if (handle.includes("s")) {
      newHeight = Math.max(minSize, Math.min(100 - startCrop.y, startCrop.height + deltaY));
    }
    if (handle.includes("n")) {
      const maxTop = startCrop.y + startCrop.height - minSize;
      const desiredY = Math.max(0, Math.min(maxTop, startCrop.y + deltaY));
      newHeight = startCrop.height + (startCrop.y - desiredY);
      newY = desiredY;
    }

    if (targetRatio !== null && targetRatio > 0) {
      if (handle === "e" || handle === "w") {
        newHeight = (newWidth * containerAspect) / targetRatio;
        if (newY + newHeight > 100) {
          newHeight = 100 - newY;
          newWidth = (newHeight * targetRatio) / containerAspect;
        }
      } else if (handle === "n" || handle === "s") {
        newWidth = (newHeight * targetRatio) / containerAspect;
        if (newX + newWidth > 100) {
          newWidth = 100 - newX;
          newHeight = (newWidth * containerAspect) / targetRatio;
        }
      } else {
        const currentCalculatedH = (newWidth * containerAspect) / targetRatio;
        if (newY + currentCalculatedH <= 100) {
          newHeight = currentCalculatedH;
        } else {
          newHeight = 100 - newY;
          newWidth = (newHeight * targetRatio) / containerAspect;
        }
      }
    }

    newX = Math.max(0, Math.min(100 - minSize, newX));
    newY = Math.max(0, Math.min(100 - minSize, newY));
    newWidth = Math.max(minSize, Math.min(100 - newX, newWidth));
    newHeight = Math.max(minSize, Math.min(100 - newY, newHeight));

    setCrop({
      x: newX,
      y: newY,
      width: newWidth,
      height: newHeight,
    });
  }

  function handlePointerUp(e: React.PointerEvent) {
    dragRef.current.handle = null;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // Ignore if pointer capture was already released
    }
  }

  async function renderEditedImage(): Promise<File> {
    return new Promise((resolve, reject) => {
      if (!imageRef.current || !file) {
        reject(new Error("Image not ready for processing"));
        return;
      }

      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          const natW = img.naturalWidth;
          const natH = img.naturalHeight;

          const isRotated90 = rotation === 90 || rotation === 270;
          const rotatedW = isRotated90 ? natH : natW;
          const rotatedH = isRotated90 ? natW : natH;

          const rotCanvas = document.createElement("canvas");
          rotCanvas.width = rotatedW;
          rotCanvas.height = rotatedH;
          const rotCtx = rotCanvas.getContext("2d");

          if (!rotCtx) {
            reject(new Error("Failed to get 2D canvas context"));
            return;
          }

          rotCtx.save();
          rotCtx.translate(rotatedW / 2, rotatedH / 2);
          rotCtx.rotate((rotation * Math.PI) / 180);
          rotCtx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
          rotCtx.drawImage(img, -natW / 2, -natH / 2);
          rotCtx.restore();

          const cropX = Math.round((crop.x / 100) * rotatedW);
          const cropY = Math.round((crop.y / 100) * rotatedH);
          const cropW = Math.round((crop.width / 100) * rotatedW);
          const cropH = Math.round((crop.height / 100) * rotatedH);

          const finalCanvas = document.createElement("canvas");
          finalCanvas.width = Math.max(1, cropW);
          finalCanvas.height = Math.max(1, cropH);
          const finalCtx = finalCanvas.getContext("2d");

          if (!finalCtx) {
            reject(new Error("Failed to get final canvas context"));
            return;
          }

          finalCtx.drawImage(
            rotCanvas,
            cropX,
            cropY,
            cropW,
            cropH,
            0,
            0,
            finalCanvas.width,
            finalCanvas.height,
          );

          finalCanvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error("Failed to export image blob"));
                return;
              }
              const baseName = file.name.replace(/\.[^/.]+$/, "");
              const exportedFile = new File([blob], `${baseName}-edited.jpg`, {
                type: "image/jpeg",
                lastModified: Date.now(),
              });
              resolve(exportedFile);
            },
            "image/jpeg",
            0.94,
          );
        } catch (err) {
          reject(err);
        }
      };

      img.onerror = () => reject(new Error("Failed to load source image for rendering"));
      img.src = imageUrl;
    });
  }

  async function handleApplyCurrent() {
    setIsExporting(true);
    try {
      const fileToSave = await renderEditedImage();
      onApply(fileToSave);
    } catch (err) {
      console.error("Error exporting edited image, falling back to original:", err);
      onApply(file);
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="image-editor-dialog">
      {/* Header */}
      <header className="image-editor-header">
        <div>
          <h2 id="image-editor-title">{title}</h2>
          {isMultiple && (
            <p className="image-editor-counter">
              Photo {currentIndex + 1} of {totalCount} · <span>{file.name}</span>
            </p>
          )}
        </div>
        <button
          className="image-editor-close"
          type="button"
          aria-label="Cancel editing"
          onClick={onCancel}
        >
          ×
        </button>
      </header>

      {/* Workspace */}
      <div className="image-editor-workspace">
        {/* Main Stage */}
        <div className="image-editor-stage">
          <div
            className="image-editor-container"
            ref={containerRef}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imageRef}
              src={imageUrl}
              alt="Crop preview"
              className="image-editor-preview"
              onLoad={handleImageLoad}
              style={{
                transform: `rotate(${rotation}deg) scaleX(${flipH ? -1 : 1}) scaleY(${flipV ? -1 : 1})`,
              }}
            />

            {/* Crop Box with handles and rule-of-thirds grid */}
            <div
              className="image-editor-crop-box"
              style={{
                left: `${crop.x}%`,
                top: `${crop.y}%`,
                width: `${crop.width}%`,
                height: `${crop.height}%`,
              }}
              onPointerDown={(e) => handlePointerDown("move", e)}
            >
              <div className="crop-grid-h crop-grid-h1" aria-hidden="true" />
              <div className="crop-grid-h crop-grid-h2" aria-hidden="true" />
              <div className="crop-grid-v crop-grid-v1" aria-hidden="true" />
              <div className="crop-grid-v crop-grid-v2" aria-hidden="true" />

              <div
                className="crop-handle crop-handle-nw"
                onPointerDown={(e) => handlePointerDown("nw", e)}
                aria-hidden="true"
              />
              <div
                className="crop-handle crop-handle-ne"
                onPointerDown={(e) => handlePointerDown("ne", e)}
                aria-hidden="true"
              />
              <div
                className="crop-handle crop-handle-se"
                onPointerDown={(e) => handlePointerDown("se", e)}
                aria-hidden="true"
              />
              <div
                className="crop-handle crop-handle-sw"
                onPointerDown={(e) => handlePointerDown("sw", e)}
                aria-hidden="true"
              />

              <div
                className="crop-handle crop-handle-n"
                onPointerDown={(e) => handlePointerDown("n", e)}
                aria-hidden="true"
              />
              <div
                className="crop-handle crop-handle-e"
                onPointerDown={(e) => handlePointerDown("e", e)}
                aria-hidden="true"
              />
              <div
                className="crop-handle crop-handle-s"
                onPointerDown={(e) => handlePointerDown("s", e)}
                aria-hidden="true"
              />
              <div
                className="crop-handle crop-handle-w"
                onPointerDown={(e) => handlePointerDown("w", e)}
                aria-hidden="true"
              />
            </div>
          </div>
        </div>

        {/* Sidebar Controls */}
        <aside className="image-editor-controls">
          <div className="control-group">
            <span className="control-label">Aspect Ratio</span>
            <div className="ratio-button-grid">
              {ASPECT_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  className={`ratio-button ${selectedRatio === preset.value ? "is-active" : ""}`}
                  onClick={() => applyAspectRatio(preset.value)}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="control-group">
            <span className="control-label">Rotate &amp; Flip</span>
            <div className="tool-button-row">
              <button
                type="button"
                className="tool-button"
                onClick={handleRotateCCW}
                title="Rotate Counter-Clockwise (-90°)"
              >
                <span aria-hidden="true">↺</span> -90°
              </button>
              <button
                type="button"
                className="tool-button"
                onClick={handleRotateCW}
                title="Rotate Clockwise (+90°)"
              >
                <span aria-hidden="true">↻</span> +90°
              </button>
              <button
                type="button"
                className={`tool-button ${flipH ? "is-active" : ""}`}
                onClick={handleFlipH}
                title="Flip Horizontally"
              >
                <span aria-hidden="true">⇄</span> Flip H
              </button>
              <button
                type="button"
                className={`tool-button ${flipV ? "is-active" : ""}`}
                onClick={handleFlipV}
                title="Flip Vertically"
              >
                <span aria-hidden="true">⇅</span> Flip V
              </button>
            </div>
          </div>

          <div className="control-group">
            <button
              type="button"
              className="tool-button-reset"
              onClick={handleReset}
            >
              ⟲ Reset Adjustments
            </button>
          </div>
        </aside>
      </div>

      {/* Footer */}
      <footer className="image-editor-footer">
        <div className="footer-left">
          <button
            type="button"
            className="editor-btn-secondary"
            onClick={onCancel}
            disabled={isExporting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="editor-btn-secondary"
            onClick={onSkip}
            disabled={isExporting}
            title="Upload current file without applying crop or transform"
          >
            Skip Crop &amp; Upload
          </button>
        </div>

        <div className="footer-right">
          <button
            type="button"
            className="editor-btn-primary"
            onClick={() => void handleApplyCurrent()}
            disabled={isExporting}
          >
            {isExporting ? (
              "Processing…"
            ) : isMultiple && currentIndex + 1 < totalCount ? (
              "Save & Next Photo →"
            ) : (
              "Apply & Upload Photo"
            )}
          </button>
        </div>
      </footer>
    </div>
  );
}

export default function ImageEditorModal({
  files,
  defaultAspectRatio = null,
  title = "Edit Image",
  onComplete,
  onCancel,
}: ImageEditorModalProps) {
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [processedFiles, setProcessedFiles] = useState<File[]>([]);

  const activeFile = files[currentFileIndex];
  const isMultiple = files.length > 1;

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  if (!activeFile) return null;

  function advanceQueue(fileToSave: File) {
    const updatedList = [...processedFiles, fileToSave];
    if (currentFileIndex + 1 < files.length) {
      setProcessedFiles(updatedList);
      setCurrentFileIndex((prev) => prev + 1);
    } else {
      onComplete(updatedList);
    }
  }

  return (
    <div
      className="image-editor-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="image-editor-title"
    >
      <SinglePhotoEditor
        key={`${currentFileIndex}-${activeFile.name}`}
        file={activeFile}
        defaultAspectRatio={defaultAspectRatio}
        title={title}
        isMultiple={isMultiple}
        currentIndex={currentFileIndex}
        totalCount={files.length}
        onApply={(editedFile) => advanceQueue(editedFile)}
        onSkip={() => advanceQueue(activeFile)}
        onCancel={onCancel}
      />
    </div>
  );
}
