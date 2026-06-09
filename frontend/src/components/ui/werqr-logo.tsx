import { cn } from "@/lib/utils";

export type WerqrLogoVariant = "icon" | "wordmark";

export interface WerqrLogoProps {
  className?: string;
  variant?: WerqrLogoVariant;
}

const LOGO_SOURCES: Record<WerqrLogoVariant, string> = {
  wordmark: "/werqr-logo-cropped.png",
  icon: "/werqr-logo.png",
};

export function WerqrLogo({ className, variant = "wordmark" }: WerqrLogoProps) {
  return (
    <img
      src={LOGO_SOURCES[variant]}
      alt="Werqr"
      className={cn(
        "shrink-0 object-contain",
        variant === "wordmark" ? "h-11 w-auto sm:h-12 md:h-14" : "h-9 w-9",
        className
      )}
    />
  );
}

export default WerqrLogo;
