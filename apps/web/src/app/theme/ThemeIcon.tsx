import { useId, useRef } from "react";
import { useAnimatedValues, useMotionRender, useReducedMotion } from "../motion/hooks";
import { REDUCED_MOTION, SPRING } from "../motion/transitions";

const CENTER = 10;
const RAYS = Array.from({ length: 8 }, (_, index) => (index * Math.PI) / 4);
const SUN = { core: 4, biteX: 21, biteY: -1, rays: 1 };
const MOON = { core: 7, biteX: 14.5, biteY: 5.5, rays: 0 };

/**
 * A sun that becomes a moon: its core swells while a shadow slides across to
 * bite a crescent out of it, and the rays turn and draw back into the core.
 */
export function ThemeIcon({ dark }: { dark: boolean }) {
  const reducedMotion = useReducedMotion();
  const values = useAnimatedValues(dark ? MOON : SUN, reducedMotion ? REDUCED_MOTION : SPRING.pill);
  const { core, biteX, biteY, rays } = values;
  const coreRef = useRef<SVGCircleElement>(null);
  const biteRef = useRef<SVGCircleElement>(null);
  const raysRef = useRef<SVGGElement>(null);
  const id = useId();
  const initial = dark ? MOON : SUN;

  useMotionRender([core, biteX, biteY, rays], () => {
    const shown = rays.get();
    coreRef.current?.setAttribute("r", `${core.get()}`);
    biteRef.current?.setAttribute("cx", `${biteX.get()}`);
    biteRef.current?.setAttribute("cy", `${biteY.get()}`);
    raysRef.current?.setAttribute("opacity", `${Math.max(0, Math.min(1, shown))}`);
    raysRef.current?.setAttribute("transform", raysTransform(shown));
  });

  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" overflow="visible">
      <defs>
        <mask id={`${id}bite`} maskUnits="userSpaceOnUse" x="-4" y="-4" width="28" height="28">
          <rect x="-4" y="-4" width="28" height="28" fill="white" />
          <circle ref={biteRef} cx={initial.biteX} cy={initial.biteY} r="5.5" fill="black" />
        </mask>
      </defs>
      <circle ref={coreRef} cx={CENTER} cy={CENTER} r={initial.core} fill="currentColor" mask={`url(#${id}bite)`} />
      <g
        ref={raysRef}
        opacity={initial.rays}
        transform={raysTransform(initial.rays)}
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      >
        {RAYS.map(angle => (
          <line
            key={angle}
            x1={CENTER + Math.cos(angle) * 6.5}
            y1={CENTER + Math.sin(angle) * 6.5}
            x2={CENTER + Math.cos(angle) * 8.5}
            y2={CENTER + Math.sin(angle) * 8.5}
          />
        ))}
      </g>
    </svg>
  );
}

function raysTransform(shown: number): string {
  const scale = 0.5 + 0.5 * shown;
  return `rotate(${(1 - shown) * 45} ${CENTER} ${CENTER}) translate(${CENTER} ${CENTER}) scale(${scale}) translate(${-CENTER} ${-CENTER})`;
}
