import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initialsForName } from "@/lib/job-status";
import { cn } from "@/lib/utils";

export interface AssigneeDisplayProps {
  name: string;
  photo?: string;
  compact?: boolean;
  className?: string;
}

export function AssigneeDisplay({
  name,
  photo,
  compact = false,
  className,
}: AssigneeDisplayProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Avatar className={cn("ring-2 ring-background", compact ? "h-7 w-7" : "h-8 w-8")}>
        <AvatarImage src={photo} alt={name} />
        <AvatarFallback className="text-xs font-medium">
          {initialsForName(name)}
        </AvatarFallback>
      </Avatar>
      <span
        className={cn(
          "font-medium text-foreground",
          compact ? "text-xs" : "text-sm"
        )}
      >
        {name}
      </span>
    </div>
  );
}

export default AssigneeDisplay;
