import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Expose both VITE_* and SUPABASE_* env vars to the browser bundle
  envPrefix: ["VITE_", "SUPABASE_"],
});
