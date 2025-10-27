import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/app/**/*.{ts,tsx}"],
  theme: { 
    extend: {
      colors: {
        // Chef Stacks Color Palette (Yelp-Red Core)
        primary: {
          DEFAULT: '#D32323', // Primary Red
          hover: '#B91C1C',   // Primary Hover
        },
        secondary: {
          DEFAULT: '#FFF8F6', // Cream background
          accent: '#F7B267',  // Apricot accent
        },
        text: {
          primary: '#2B2B2B',   // Primary text
          secondary: '#555555', // Secondary text
        },
        border: {
          DEFAULT: '#E5E5E5',   // Borders/Lines
        },
        card: {
          DEFAULT: '#FFFFFF',   // Card background
        },
        muted: {
          DEFAULT: '#FDF3F2',   // Muted background (soft blush)
        },
        // Functional colors
        success: '#3BA55D',
        warning: '#F59E0B',
        error: '#DC2626',
        info: '#2563EB',
        // Optional accent variations
        sage: '#73A580',
        'warm-gray': '#F0ECE9',
      }
    } 
  },
  plugins: [],
};

export default config;
