import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initialsForName } from "@/lib/job-status";
import { cn } from "@/lib/utils";

export interface AssigneeDisplayProps {
  name: string;
  photo?: string;
  compact?: boolean;
  dense?: boolean;
  className?: string;
}

export function AssigneeDisplay({
  name,
  photo,
  compact = false,
  dense = false,
  className,
}: AssigneeDisplayProps) {
  const avatarSize = dense ? "h-5 w-5" : compact ? "h-7 w-7" : "h-8 w-8";

  return (
    <div className={cn("flex items-center", dense ? "gap-1.5" : "gap-2", className)}>
      <Avatar className={cn("ring-2 ring-background", avatarSize)}>
        <AvatarImage src={photo} alt={name} />
        <AvatarFallback className={cn("font-medium", dense ? "text-[9px]" : "text-xs")}>
          {initialsForName(name)}
        </AvatarFallback>
      </Avatar>
      <span
        className={cn(
          "font-medium text-foreground",
          dense ? "text-xs" : compact ? "text-xs" : "text-sm"
        )}
      >
        {name}
      </span>
    </div>
  );
}

export default AssigneeDisplay;
