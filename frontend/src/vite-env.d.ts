/// <reference types="vite/client" />

interface Window {
  nameamNoc?: {
    getAuthToken?: () => Promise<string>;
    getAppVersion?: () => Promise<string>;
  };
}
