/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        noc: {
          blue: "#2563eb",
          navy: "#0f172a",
          panel: "#111827",
        },
      },
    },
  },
  plugins: [],
};
