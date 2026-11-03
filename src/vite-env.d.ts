/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 'web' for the claude.ai beta build, unset for the Mac app. */
  readonly VITE_TARGET?: 'web';
}
