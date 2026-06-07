import { useRef } from "react";
import { QRCodeCanvas } from "qrcode.react";

import { Button } from "@/components/ui/button";
import { getTaskScanPayload } from "@/lib/job-status";
import { cn } from "@/lib/utils";

export interface QrPrintMenuProps {
  taskId: string;
  jobId: string;
  className?: string;
}

export function QrPrintMenu({ taskId, jobId, className }: QrPrintMenuProps) {
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const payload = getTaskScanPayload(taskId, jobId);

  function handlePrint() {
    const canvas = canvasWrapRef.current?.querySelector("canvas");
    if (!canvas) return;

    const printWindow = window.open("", "_blank", "width=420,height=520");
    if (!printWindow) return;

    const image = canvas.toDataURL("image/png");
    const safeTitle = jobId
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    printWindow.document.write(`<!DOCTYPE html>
<html><head><title>${safeTitle} — QR</title>
<style>
  body { font-family: system-ui, sans-serif; text-align: center; padding: 24px; }
  h1 { font-size: 1.25rem; margin-bottom: 8px; }
  p { color: #666; font-size: 0.875rem; margin-bottom: 16px; }
  img { width: 220px; height: 220px; }
</style></head><body>
<h1>${safeTitle}</h1>
<p>Scan at a floor station to update status</p>
<img src="${image}" alt="Task QR code" />
<script>window.onload = function () { window.print(); };<\/script>
</body></html>`);
    printWindow.document.close();
  }

  return (
    <div className={cn("relative", className)}>
      <div
        ref={canvasWrapRef}
        className="pointer-events-none absolute -left-[9999px] opacity-0"
        aria-hidden="true"
      >
        <QRCodeCanvas value={payload} size={220} level="M" marginSize={2} />
      </div>

      <Button
        type="button"
        variant="outline"
        onClick={handlePrint}
        className="mt-3 w-full bg-background"
      >
        Print QR
      </Button>
    </div>
  );
}

export default QrPrintMenu;
