import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";

import { cn } from "@/lib/utils";

/** Slider shadcn/ui, avec une couleur de piste au choix (voix, musique ou primaire). */
function Slider({
  className,
  tone = "primary",
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root> & {
  tone?: "primary" | "voice" | "music";
}) {
  const range = { primary: "bg-primary", voice: "bg-voice", music: "bg-music" }[tone];
  const thumb = {
    primary: "border-primary",
    voice: "border-voice",
    music: "border-music",
  }[tone];
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      className={cn(
        "relative flex w-full touch-none select-none items-center data-[disabled]:opacity-50",
        className,
      )}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-muted">
        <SliderPrimitive.Range className={cn("absolute h-full", range)} />
      </SliderPrimitive.Track>
      {(props.value ?? props.defaultValue ?? [0]).map((_, i) => (
        <SliderPrimitive.Thumb
          key={i}
          className={cn(
            "block size-4 rounded-full border-2 bg-background shadow-sm transition-[box-shadow] outline-none hover:ring-4 hover:ring-ring/30 focus-visible:ring-4 focus-visible:ring-ring/50",
            thumb,
          )}
        />
      ))}
    </SliderPrimitive.Root>
  );
}

export { Slider };
