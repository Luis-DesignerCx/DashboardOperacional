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
      },
    },
  },
  plugins: [],
};
export default config;
