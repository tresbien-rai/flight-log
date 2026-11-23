/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** OAuth client ID of the Google Cloud project for Drive sync. Public, not a secret. */
  readonly VITE_GOOGLE_CLIENT_ID?: string;
}
