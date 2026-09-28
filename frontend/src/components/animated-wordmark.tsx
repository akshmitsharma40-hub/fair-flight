import { useMemo } from "react";
import { motion, type Variants } from "framer-motion";

interface AnimatedWordmarkProps {
  text: string;
  className?: string;
}

/**
 * Color ramp swept left→right across the word, echoing the AeroTrend tile
 * (sky → cyan → blue → indigo).
 */
const RAMP = ["#7dd3fc", "#67e8f9", "#38bdf8", "#60a5fa", "#a5b4fc"];

/** Split by grapheme so Devanagari matras stay attached to their consonant. */
function segment(text: string): string[] {
  const Seg = (
    Intl as typeof Intl & { Segmenter?: new (l: string, o: { granularity: "grapheme" }) => { segment: (s: string) => Iterable<{ segment: string }> } }
  ).Segmenter;
  if (Seg) {
    try {
      return [...new Seg("en", { granularity: "grapheme" }).segment(text)].map((s) => s.segment);
    } catch {
      /* fall through */
    }
  }
  return [...text];
}

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.045, delayChildren: 0.3 } },
};

const letterVariants: Variants = {
  hidden: { y: 20, opacity: 0, filter: "blur(8px)" },
  show: {
    y: 0,
    opacity: 1,
    filter: "blur(0px)",
    transition: { type: "spring", stiffness: 340, damping: 26 },
  },
  hover: (i: number) => ({
    y: -5,
    transition: { type: "spring", stiffness: 520, damping: 16, delay: i * 0.028 },
  }),
};

/**
 * AnimatedWordmark — the FAIR FLIGHT headline.
 * On load: letters rise out of a blur in a staggered wave. On hover of the
 * title: the wave replays upward, letter by letter. Colours sweep across the
 * brand ramp; screen readers get the plain word via aria-label.
 */
export function AnimatedWordmark({ text, className }: AnimatedWordmarkProps) {
  const glyphs = useMemo(() => segment(text), [text]);

  return (
    <motion.h1
      className={className}
      variants={containerVariants}
      initial="hidden"
      animate="show"
      whileHover="hover"
      aria-label={text}
      data-wordmark={text}
    >
      {glyphs.map((glyph, i) => {
        const color =
          glyph.trim() === ""
            ? undefined
            : RAMP[Math.min(RAMP.length - 1, Math.round((i / Math.max(1, glyphs.length - 1)) * (RAMP.length - 1)))];
        return (
          <motion.span
            key={`${glyph}-${i}`}
            custom={i}
            variants={letterVariants}
            aria-hidden="true"
            className="inline-block whitespace-pre will-change-transform"
            style={color ? { color } : undefined}
          >
            {glyph}
          </motion.span>
        );
      })}
    </motion.h1>
  );
}

export default AnimatedWordmark;
