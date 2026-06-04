import { QRCodeSVG } from "qrcode.react";

import { getTaskScanPayload } from "@/lib/job-status";
import { cn } from "@/lib/utils";

export interface TaskQrCodeProps {
  taskId: string;
  jobId?: string;
  size?: number;
  className?: string;
  label?: string;
  /** Stop drag/click on parent cards from firing when interacting with QR */
  isolatePointer?: boolean;
}

export function TaskQrCode({
  taskId,
  jobId,
  size = 56,
  className,
  label,
  isolatePointer = false,
}: TaskQrCodeProps) {
  const value = getTaskScanPayload(taskId, jobId);

  return (
    <div
      className={cn("inline-flex flex-col items-center gap-1", className)}
      title="Scan at a floor station to update status"
      onPointerDown={isolatePointer ? (e) => e.stopPropagation() : undefined}
      onClick={isolatePointer ? (e) => e.stopPropagation() : undefined}
    >
      <div
        className="rounded-md border border-border bg-white p-1 shadow-sm"
        style={{ lineHeight: 0 }}
      >
        <QRCodeSVG
          value={value}
          size={size}
          level="M"
          marginSize={1}
          bgColor="#ffffff"
          fgColor="#09090b"
        />
      </div>
      {label ? (
        <span className="max-w-[80px] truncate text-center text-[10px] text-muted-foreground">
          {label}
        </span>
      ) : null}
    </div>
  );
}

export default TaskQrCode;
