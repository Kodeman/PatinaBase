/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // ── Patina capture palette (T-01) ──────────────────────────────
        ink: "#211E18",
        "ink-2": "#3C382F",
        "ink-soft": "#6B6555",
        paper: "#E7E5DB",
        "paper-2": "#DEDBCF",
        "paper-3": "#F1EFE7",
        line: "rgba(33,30,24,0.16)",
        "line-2": "rgba(33,30,24,0.30)",
        verdigris: "#3C7C6C", // verified / success / primary action
        "verdigris-2": "#5BA68F",
        "verdigris-ink": "#22463D",
        brass: "#A07C38", // trade / decision
        "brass-2": "#C7A052",
        rust: "#9A5A3E", // error / missing / friction
        "rust-2": "#B97A56",
        // ── Legacy keys — kept aliased so unmigrated components compile ──
        "off-white": "#FAF7F2",
        pearl: "#E5E2DD",
        clay: "#C4A57B",
        "aged-oak": "#8B7355",
        mocha: "#5C4A3C",
        charcoal: "#2C2926",
        sage: "#A8B5A0",
        "dusty-blue": "#8B9CAD",
        terracotta: "#D4A090",
        "golden-hour": "#E8C547",
        surface: "#FFFFFF",
      },
      fontFamily: {
        display: ["Fraunces", "Georgia", "serif"],
        body: ["Hanken Grotesk", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "monospace"],
      },
      borderRadius: {
        DEFAULT: "3px",
        sm: "2px",
        md: "6px",
      },
      boxShadow: {
        sm: "0 1px 3px rgba(44, 41, 38, 0.04), 0 6px 24px rgba(44, 41, 38, 0.04)",
        md: "0 4px 8px rgba(44, 41, 38, 0.08)",
        lg: "0 8px 16px rgba(44, 41, 38, 0.12)",
        xl: "0 12px 24px rgba(44, 41, 38, 0.16)",
      },
      animation: {
        "strata-pulse": "strata-pulse 1.5s ease-in-out infinite",
        breathe: "breathe 3s ease-in-out infinite",
      },
      keyframes: {
        "strata-pulse": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.3" },
        },
        breathe: {
          "0%, 100%": { transform: "scale(1)" },
          "50%": { transform: "scale(1.08)" },
        },
      },
    },
  },
  plugins: [],
};
