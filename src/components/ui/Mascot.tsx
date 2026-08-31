import { MASCOT_PIXELS, MASCOT_SIZE } from "@/lib/mascotPixels";

interface MascotProps {
  size?: number;
  className?: string;
}

/** La ranocchietta pixel-art disegnata a mano, riusata come icona del sito. */
export function Mascot({ size = 32, className }: MascotProps) {
  return (
    <svg
      viewBox={`0 0 ${MASCOT_SIZE} ${MASCOT_SIZE}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      aria-hidden="true"
      className={className}
    >
      {MASCOT_PIXELS.map(([x, y, w, fill], i) => (
        <rect key={i} x={x} y={y} width={w} height={1} fill={fill} />
      ))}
    </svg>
  );
}
