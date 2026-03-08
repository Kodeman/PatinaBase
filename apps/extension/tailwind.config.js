/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        patina: {
          "off-white": "#EDE9E4",
          "clay-beige": "#A3927C",
          "mocha-brown": "#655B52",
          charcoal: "#3F3B37",
          "soft-cream": "#F5F2ED",
          "warm-white": "#FAF7F2",
          success: "#7A9C85",
          warning: "#D4A574",
          error: "#B87969",
          info: "#6B8FAD",
        },
      },
      fontFamily: {
        display: ["Playfair Display", "Georgia", "serif"],
        body: ["Inter", "system-ui", "sans-serif"],
      },
      boxShadow: {
        "patina-sm": "0 2px 4px rgba(101, 91, 82, 0.06)",
        "patina-md": "0 4px 8px rgba(101, 91, 82, 0.08)",
        "patina-lg": "0 8px 16px rgba(101, 91, 82, 0.12)",
        "patina-xl": "0 12px 24px rgba(101, 91, 82, 0.16)",
      },
      animation: {
        breathe: "breathe 3s ease-in-out infinite",
      },
      keyframes: {
        breathe: {
          "0%, 100%": { transform: "scale(1)" },
          "50%": { transform: "scale(1.08)" },
        },
      },
    },
  },
  plugins: [],
};
