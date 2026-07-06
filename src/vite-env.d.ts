/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />
/// <reference types="vite-plugin-pwa/react" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Wird von vite.config.ts `define` zur Build-Zeit als Literal eingebettet.
// Entspricht dem `v`-Wert aus public/version.json des gleichen Builds.
declare const __BUILD_VERSION__: string;
