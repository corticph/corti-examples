/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#0B0B0F",
          soft: "#1A1A22",
        },
        paper: {
          DEFAULT: "#FFFFFF",
          muted: "#F6F6F4",
        },
        surface: "#FAFAF8",
        accent: {
          DEFAULT: "#0EA5A5",
          soft: "#CFEFEC",
        },
        muted: {
          300: "#D6D6D2",
          500: "#8A8A86",
          700: "#3B3B3B",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
      },
      borderRadius: {
        lg: "10px",
        xl: "14px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(11,11,15,0.06), 0 8px 24px rgba(11,11,15,0.04)",
      },
    },
  },
  plugins: [],
};
