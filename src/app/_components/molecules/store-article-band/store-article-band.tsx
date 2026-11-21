"use client";

import {
  Bell,
  Candy,
  CandyCane,
  Cookie,
  Gift,
  Lollipop,
  type LucideIcon,
  PartyPopper,
  Pause,
  Play,
  Ribbon,
  Snowflake,
  Sparkles,
  Star,
  TreePine,
  Trees,
} from "lucide-react";
import type { CSSProperties } from "react";

import { StoreButton } from "@/app/_components/atoms/store-button";
import { useOnScreen, useSessionFlag } from "@/lib/hooks/ui";
import { cn } from "@/lib/utils";

/** Where the visitor's pause is remembered for the visit. */
export const BAND_PAUSED_KEY = "feria:article-band-paused";

/**
 * The three waves of streamers: each falls through the band as one line, at
 * its own speed (seconds per fall), starting at its own point of the loop,
 * so the lines cross at different moments.
 */
export const BAND_WAVES = {
  fast: { duration: 6.5, start: 0.15 },
  medium: { duration: 10, start: 0.6 },
  slow: { duration: 15, start: 0.35 },
} as const;

/**
 * The streamers, written out so the server and the browser agree: the wave
 * each falls in, its column (`left`, % of the band), where it rests when
 * nothing moves (`top`, %, around the edges, clear of the greeting), how it
 * is turned, and its tint. Four per wave, spread across the width; three
 * per wave on a phone (`phone: false` shows from `md` up).
 */
export const BAND_STREAMERS = [
  { left: 5, phone: true, tint: "lime", top: 14, turn: 24, wave: "slow" },
  { left: 30, phone: false, tint: "cream", top: 84, turn: -34, wave: "slow" },
  { left: 56, phone: true, tint: "lime", top: 10, turn: 38, wave: "slow" },
  { left: 81, phone: true, tint: "cream", top: 74, turn: -16, wave: "slow" },
  { left: 13, phone: true, tint: "cream", top: 80, turn: 62, wave: "medium" },
  { left: 39, phone: true, tint: "lime", top: 12, turn: 12, wave: "medium" },
  { left: 64, phone: false, tint: "cream", top: 86, turn: -48, wave: "medium" },
  { left: 90, phone: true, tint: "lime", top: 20, turn: 54, wave: "medium" },
  { left: 21, phone: false, tint: "lime", top: 20, turn: -62, wave: "fast" },
  { left: 47, phone: true, tint: "cream", top: 88, turn: 22, wave: "fast" },
  { left: 73, phone: true, tint: "lime", top: 14, turn: -20, wave: "fast" },
  { left: 97, phone: true, tint: "cream", top: 60, turn: 44, wave: "fast" },
] as const;

/**
 * The holiday icons around the greeting, every fitting one lucide-react has:
 * fourteen from `md` up, the eight with `phone: true` on a phone, so it
 * stays airy. Each twinkles in turn.
 */
export const BAND_ICONS = [
  { icon: TreePine, left: 8, phone: true, size: "lg", top: 26, turn: -8 },
  { icon: Snowflake, left: 17, phone: false, size: "sm", top: 16, turn: 0 },
  { icon: Gift, left: 20, phone: true, size: "md", top: 74, turn: 8 },
  { icon: CandyCane, left: 29, phone: true, size: "md", top: 20, turn: -14 },
  { icon: Bell, left: 37, phone: false, size: "sm", top: 82, turn: 10 },
  { icon: Star, left: 50, phone: true, size: "sm", top: 14, turn: 0 },
  { icon: Snowflake, left: 50, phone: true, size: "sm", top: 86, turn: 20 },
  { icon: Sparkles, left: 63, phone: true, size: "md", top: 82, turn: 0 },
  { icon: PartyPopper, left: 71, phone: true, size: "md", top: 20, turn: 12 },
  { icon: Cookie, left: 80, phone: false, size: "sm", top: 76, turn: -10 },
  { icon: Ribbon, left: 84, phone: false, size: "sm", top: 22, turn: 6 },
  { icon: Lollipop, left: 92, phone: true, size: "md", top: 64, turn: -12 },
  { icon: Candy, left: 5, phone: false, size: "sm", top: 64, turn: 18 },
  { icon: Trees, left: 94, phone: false, size: "sm", top: 34, turn: 0 },
] as const satisfies readonly {
  icon: LucideIcon;
  left: number;
  phone: boolean;
  size: "lg" | "md" | "sm";
  top: number;
  turn: number;
}[];

const ICON_SIZE = {
  lg: "size-6 md:size-7",
  md: "size-5 md:size-6",
  sm: "size-4 md:size-5",
} as const;

/** One twinkle; the icons take their turns at this pace. */
const TWINKLE_S = 3.6;

/**
 * A piece's own timing goes in `animation-delay` and `-duration` here, not in
 * custom properties the `--animate-*` theme value reads: those resolve where
 * the theme declares them, on the root, and every piece would share them.
 */
type PieceStyle = CSSProperties & { "--store-turn"?: string };

/**
 * A column the band's height. Still, its streamer rests at `top`; moving,
 * it falls with its wave: the same time and point of the loop for the
 * whole wave, so the wave reads as one line.
 */
function columnStyle(streamer: (typeof BAND_STREAMERS)[number]): PieceStyle {
  const wave = BAND_WAVES[streamer.wave];

  return {
    animationDelay: `${(-wave.start * wave.duration).toFixed(2)}s`,
    animationDuration: `${wave.duration}s`,
    left: `${streamer.left}%`,
    transform: `translateY(${streamer.top}%)`,
  };
}

function swayStyle(
  streamer: (typeof BAND_STREAMERS)[number],
  index: number
): PieceStyle {
  return {
    "--store-turn": `${streamer.turn}deg`,
    animationDelay: `${-index * 0.7}s`,
    animationDuration: `${2 + (index % 3) * 0.4}s`,
    transform: `rotate(${streamer.turn}deg)`,
  };
}

function iconStyle(index: number): PieceStyle {
  return {
    animationDelay: `${(-((index * 0.9) % TWINKLE_S)).toFixed(2)}s`,
    animationDuration: `${TWINKLE_S}s`,
  };
}

/** A thin curl of paper streamer, its stroke the same 1.25 px at any size. */
function Streamer({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth={1.25}
      viewBox="0 0 16 40"
    >
      <path
        d="M8 2c6 3 6 7 0 9s-6 7 0 9 6 7 0 9-6 7 0 9"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

// Every piece holds still while the band is not running; `!` because the
// `animation` shorthand of its class resets the play state, later in the
// stylesheet.
const HELD = "group-data-[running=false]/band:[animation-play-state:paused]!";

export interface StoreArticleBandProps {
  className?: string;
  /** "¡Felices Fiestas!", in the page's language. */
  greeting: string;
  /** The pause button's name, in the page's language. */
  pauseLabel: string;
}

/**
 * The moss band between an article and its suggestions (FER-039), for the
 * holidays: the greeting in lime in the middle, thin streamers falling
 * through it in a loop, swaying like paper, and holiday icons around the
 * greeting, twinkling in turn. The picture is decoration, hidden from
 * screen readers; the one control is the pause button.
 *
 * It moves for longer than five seconds, so it has a pause (WCAG 2.2.2),
 * remembered for the visit. It also holds still off screen, to spare a
 * phone's battery, and before the script runs. Pausing stops every piece
 * where it is (`animation-play-state`), so nothing jumps. Under reduced
 * motion nothing is animated: the streamers rest around the greeting, and
 * the button, with nothing to pause, is not shown. Only `transform` and
 * `opacity` animate; the band's height is fixed.
 */
function StoreArticleBand({
  className,
  greeting,
  pauseLabel,
}: StoreArticleBandProps) {
  const [ref, onScreen] = useOnScreen();
  const [paused, setPaused] = useSessionFlag(BAND_PAUSED_KEY);
  const running = onScreen && !paused;

  return (
    <div
      className={cn(
        "group/band relative flex h-55 items-center justify-center overflow-hidden bg-store-contrast px-4 md:h-80",
        className
      )}
      data-running={running}
      data-slot="store-article-band"
      data-testid="store-article-band"
      ref={ref}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        data-slot="store-article-band-picture"
        data-testid="store-article-band-picture"
      >
        {BAND_STREAMERS.map((streamer, index) => (
          <span
            className={cn(
              "absolute inset-y-0 w-2.5 motion-safe:animate-store-stream md:w-3",
              HELD,
              !streamer.phone && "max-md:hidden"
            )}
            data-slot="store-article-band-streamer"
            data-testid="store-article-band-streamer"
            data-wave={streamer.wave}
            key={streamer.left}
            style={columnStyle(streamer)}
          >
            <span
              className={cn("block motion-safe:animate-store-sway", HELD)}
              data-slot="store-article-band-sway"
              data-testid="store-article-band-sway"
              style={swayStyle(streamer, index)}
            >
              <Streamer
                className={cn(
                  "h-6 w-2.5 md:h-7 md:w-3",
                  streamer.tint === "lime"
                    ? "text-store-accent"
                    : "text-store-background/70"
                )}
              />
            </span>
          </span>
        ))}
        {BAND_ICONS.map(({ icon: Icon, ...icon }, index) => (
          <span
            className={cn(
              "absolute -translate-1/2",
              !icon.phone && "max-md:hidden"
            )}
            key={`${icon.left}:${icon.top}`}
            style={{ left: `${icon.left}%`, top: `${icon.top}%` }}
          >
            <span
              className={cn("block motion-safe:animate-store-twinkle", HELD)}
              data-slot="store-article-band-icon"
              data-testid="store-article-band-icon"
              style={iconStyle(index)}
            >
              <Icon
                className={cn(ICON_SIZE[icon.size], "text-store-accent")}
                strokeWidth={1.5}
                style={{ transform: `rotate(${icon.turn}deg)` }}
              />
            </span>
          </span>
        ))}
        <p className="relative flex h-full items-center justify-center px-4 text-center font-display store-display-banner leading-display font-extrabold text-store-accent uppercase">
          {greeting}
        </p>
      </div>
      <StoreButton
        aria-label={pauseLabel}
        aria-pressed={paused}
        className="absolute right-2 bottom-2 z-10 motion-reduce:hidden md:right-4 md:bottom-3"
        data-testid="store-article-band-pause"
        onClick={() => {
          setPaused(!paused);
        }}
        size="icon"
        variant="contrast"
      >
        {paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
      </StoreButton>
    </div>
  );
}

export { StoreArticleBand };
