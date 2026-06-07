import { cn } from "@/lib/utils";

export interface WerqrLogoProps {
  className?: string;
}

export function WerqrLogo({ className }: WerqrLogoProps) {
  return (
    <img
      src="/werqr-logo.png"
      alt=""
      className={cn("h-9 w-9 shrink-0 object-contain", className)}
      aria-hidden="true"
    />
  );
}

export default WerqrLogo;
