"use client";

import { forwardRef, ReactNode, useEffect, useRef, useState } from "react";
import {
  motion,
  useAnimation,
  useInView,
  useMotionTemplate,
  useMotionValue,
} from "motion/react";
import { cn } from "@/lib/utils";

// ==================== BoxReveal ====================
// Revela o conteúdo com um "wipe" de cor da marca — usado no headline do login.

type BoxRevealProps = {
  children: ReactNode;
  width?: string;
  boxColor?: string;
  duration?: number;
  delay?: number;
  className?: string;
};

export function BoxReveal({
  children,
  width = "fit-content",
  boxColor = "#6460e4",
  duration = 0.5,
  delay = 0.15,
  className,
}: BoxRevealProps) {
  const mainControls = useAnimation();
  const slideControls = useAnimation();
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true });

  useEffect(() => {
    if (isInView) {
      slideControls.start("visible");
      mainControls.start("visible");
    }
  }, [isInView, mainControls, slideControls]);

  return (
    <div ref={ref} style={{ position: "relative", width, overflow: "hidden" }} className={className}>
      <motion.div
        variants={{ hidden: { opacity: 0, y: 24 }, visible: { opacity: 1, y: 0 } }}
        initial="hidden"
        animate={mainControls}
        transition={{ duration, delay, ease: "easeOut" }}
      >
        {children}
      </motion.div>
      <motion.div
        variants={{ hidden: { left: 0 }, visible: { left: "100%" } }}
        initial="hidden"
        animate={slideControls}
        transition={{ duration, delay, ease: "easeIn" }}
        style={{
          position: "absolute",
          top: 2,
          bottom: 2,
          left: 0,
          right: 0,
          zIndex: 20,
          background: boxColor,
          borderRadius: 4,
        }}
      />
    </div>
  );
}

// ==================== SpotlightInput ====================
// Input com brilho da marca seguindo o mouse — mesma classe/estilo do input
// original do login, só adiciona o efeito por cima.

type SpotlightInputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  containerClassName?: string;
};

export const SpotlightInput = forwardRef<HTMLInputElement, SpotlightInputProps>(
  function SpotlightInput({ className, containerClassName, ...props }, ref) {
    const radius = 120;
    const [visible, setVisible] = useState(false);
    const mouseX = useMotionValue(0);
    const mouseY = useMotionValue(0);

    function handleMouseMove({ currentTarget, clientX, clientY }: React.MouseEvent<HTMLDivElement>) {
      const { left, top } = currentTarget.getBoundingClientRect();
      mouseX.set(clientX - left);
      mouseY.set(clientY - top);
    }

    return (
      <motion.div
        style={{
          background: useMotionTemplate`
            radial-gradient(${visible ? radius + "px" : "0px"} circle at ${mouseX}px ${mouseY}px, rgba(100,96,228,0.55), transparent 80%)
          `,
        }}
        onMouseMove={handleMouseMove}
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        className={cn("rounded-xl p-[1.5px] transition duration-300", containerClassName)}
      >
        <input ref={ref} className={className} {...props} />
      </motion.div>
    );
  }
);
