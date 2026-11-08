import { cn } from "@/lib/utils";

/** A number plate, the one bold element of the design (docs/DESIGN.md). */
export function Plate({ plate, className }: { plate: string; className?: string }) {
  return (
    <span
      className={cn(
        "num inline-block rounded border-2 border-foreground bg-plate px-2 py-0.5 font-bold leading-tight tracking-wide text-foreground",
        className,
      )}
    >
      {plate}
    </span>
  );
}
