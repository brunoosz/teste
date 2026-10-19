/** @type {import('tailwindcss').Config} */
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  future: { hoverOnlyWhenSupported: true },
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: token("bg"),
        surface: token("surface"),
        elevated: token("elevated"),
        line: token("line"),
        fg: token("fg"),
        muted: token("muted"),
        primary: token("primary"),
        secondary: token("secondary"),
        success: token("success"),
        danger: token("danger"),
        warning: token("warning"),
        separator: token("separator"),
        ink: token("ink"),
        "ink-contrast": token("ink-contrast"),
      },
      fontSize: {
        "large-title": ["30px", { lineHeight: "1.0", letterSpacing: "-0.035em", fontWeight: "800" }],
        title: ["20px", { lineHeight: "1.15", letterSpacing: "-0.022em", fontWeight: "750" }],
        headline: ["15.5px", { lineHeight: "1.35", letterSpacing: "-0.006em", fontWeight: "600" }],
        body: ["15px", { lineHeight: "1.45", letterSpacing: "-0.003em" }],
        callout: ["14px", { lineHeight: "1.4", letterSpacing: "-0.002em" }],
        footnote: ["13px", { lineHeight: "1.4", letterSpacing: "0.002em" }],
        caption: ["11.5px", { lineHeight: "1.3", letterSpacing: "0.04em", fontWeight: "600" }],
      },
      transitionTimingFunction: {
        "out-strong": "var(--ease-out)",
        "in-out-strong": "var(--ease-in-out)",
      },
      fontFamily: {
        sans: ['"Inter Variable"', "Inter", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
      },
      borderRadius: {
        "4xl": "2rem",
        chip: "var(--radius-sm)",
        control: "var(--radius-md)",
        card: "var(--radius-lg)",
        sheet: "var(--radius-xl)",
      },
      boxShadow: {
        soft: "0 0 0 1px rgb(var(--line) / 0.12)",
        glow: "none",
        sm: "none",
        md: "0 0 0 1px rgb(var(--line) / 0.12)",
        lg: "0 0 0 1px rgb(var(--line) / 0.14)",
        xl: "0 0 0 1px rgb(var(--line) / 0.14)",
        "2xl": "0 0 0 1px rgb(var(--line) / 0.16)",
        ring: "0 0 0 4px rgb(var(--primary) / 0.18)",
      },
      backgroundImage: {
        brand: "linear-gradient(rgb(var(--ink)), rgb(var(--ink)))",
      },
      keyframes: {
        shimmer: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
        pulseDot: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.35" },
        },
      },
      animation: {
        shimmer: "shimmer 1.6s infinite",
        "pulse-dot": "pulseDot 1.6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
