import { useState } from "react";
import { Camera, Minus, Plus } from "lucide-react";

import { initialsForName } from "@/lib/job-status";
import { cn } from "@/lib/utils";

const ZOOM_LEVELS = [0.75, 1, 1.25, 1.5, 2] as const;

export interface TeamMemberPhotoProps {
  name: string;
  photo?: string;
  size?: number;
  editable?: boolean;
  onPhotoClick?: () => void;
  disabled?: boolean;
}

export function TeamMemberPhoto({
  name,
  photo,
  size = 112,
  editable = false,
  onPhotoClick,
  disabled = false,
}: TeamMemberPhotoProps) {
  const [zoomIndex, setZoomIndex] = useState(1);
  const zoom = ZOOM_LEVELS[zoomIndex];

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        onClick={editable ? onPhotoClick : undefined}
        disabled={!editable || disabled}
        className={cn(
          "group relative rounded-full",
          editable && !disabled && "cursor-pointer"
        )}
      >
        <div
          className="overflow-hidden rounded-full ring-4 ring-background"
          style={{ width: size, height: size }}
        >
          {photo ? (
            <img
              src={photo}
              alt={name}
              className="h-full w-full object-cover transition-transform duration-200 ease-out"
              style={{ transform: `scale(${zoom})` }}
            />
          ) : (
            <div
              className="flex h-full w-full items-center justify-center bg-muted text-2xl font-semibold text-foreground transition-transform duration-200 ease-out"
              style={{ transform: `scale(${zoom})` }}
            >
              {initialsForName(name)}
            </div>
          )}
        </div>
        {editable ? (
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-background/70 opacity-0 transition-opacity group-hover:opacity-100">
            <Camera className="h-6 w-6 text-foreground" />
          </span>
        ) : null}
      </button>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setZoomIndex((current) => Math.max(0, current - 1))}
          disabled={zoomIndex === 0}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
          aria-label="Zoom out"
        >
          <Minus className="h-4 w-4" />
        </button>
        <span className="min-w-[3rem] text-center text-xs font-medium text-muted-foreground">
          {Math.round(zoom * 100)}%
        </span>
        <button
          type="button"
          onClick={() =>
            setZoomIndex((current) => Math.min(ZOOM_LEVELS.length - 1, current + 1))
          }
          disabled={zoomIndex === ZOOM_LEVELS.length - 1}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
          aria-label="Zoom in"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export default TeamMemberPhoto;
