import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sora)", "sans-serif"],
      },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        surface: {
          0: "var(--surface-0)",
          1: "var(--surface-1)",
          2: "var(--surface-2)",
          3: "var(--surface-3)",
        },
        gr: {
          50:  "#f0effd",
          100: "#e0dffb",
          200: "#c2bff7",
          300: "#a39ff3",
          400: "#857fef",
          500: "#6460e4",
          600: "#504db6",
          700: "#3c3a88",
          800: "#2D2D6B",
          900: "#1e1e47",
          950: "#0f0f24",
        },
        brand: {
          navy:   "#282552",
          purple: "#4c3d8d",
          violet: "#6e5d9f",
          orange: "#db824e",
          pink:   "#d1517a",
          yellow: "#f1c85e",
          mauve:  "#9f5697",
          blue:   "#516cb1",
          teal:   "#6ab0a0",
        },
      },
      boxShadow: {
        "glow-gr":         "0 0 20px rgba(100,96,228,0.22), 0 0 60px rgba(100,96,228,0.07)",
        "glow-gr-sm":      "0 0 10px rgba(100,96,228,0.18)",
        "glow-brand":      "0 0 20px rgba(76,61,141,0.3), 0 0 60px rgba(76,61,141,0.08)",
        "glow-orange":     "0 0 20px rgba(219,130,78,0.25), 0 0 60px rgba(219,130,78,0.07)",
        "card":            "0 4px 24px rgba(0,0,0,0.4)",
        "card-lg":         "0 8px 48px rgba(0,0,0,0.55)",
        "inset-top":       "inset 0 1px 0 rgba(255,255,255,0.06)",
      },
      backgroundImage: {
        "gradient-gr":       "linear-gradient(135deg, #857fef, #6460e4)",
        "gradient-gr-soft":  "linear-gradient(135deg, rgba(100,96,228,0.15), rgba(100,96,228,0.05))",
        "gradient-surface":  "linear-gradient(180deg, #0f1525 0%, #0b0f1c 100%)",
      },
      animation: {
        "fade-in-up":    "fade-in-up 0.35s ease-out forwards",
        "fade-in":       "fade-in 0.25s ease-out forwards",
        "glow-pulse":    "glow-pulse 3s ease-in-out infinite",
        "slide-in-left": "slide-in-left 0.3s ease-out forwards",
        "orbit":         "orbit calc(var(--duration)*1s) linear infinite",
      },
      keyframes: {
        orbit: {
          "0%":   { transform: "rotate(calc(var(--angle) * 1deg)) translateY(calc(var(--radius) * 1px)) rotate(calc(var(--angle) * -1deg))" },
          "100%": { transform: "rotate(calc(var(--angle) * 1deg + 360deg)) translateY(calc(var(--radius) * 1px)) rotate(calc((var(--angle) * -1deg) - 360deg))" },
        },
        "fade-in-up": {
          from: { opacity: "0", transform: "translateY(10px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to:   { opacity: "1" },
        },
        "slide-in-left": {
          from: { opacity: "0", transform: "translateX(-8px)" },
          to:   { opacity: "1", transform: "translateX(0)" },
        },
        "glow-pulse": {
          "0%,100%": { boxShadow: "0 0 12px rgba(100,96,228,0.13)" },
          "50%":     { boxShadow: "0 0 24px rgba(100,96,228,0.22)" },
        },
      },
    },
  },
  plugins: [],
};
export default config;
