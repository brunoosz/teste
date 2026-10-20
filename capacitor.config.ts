import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.fileflow.app",
  appName: "FileFlow",
  webDir: "dist",
  server: {
    androidScheme: "https",
  },
  plugins: {
    StatusBar: {
      style: "Dark",
      backgroundColor: "#111113",
    },
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 500,
      backgroundColor: "#111113",
      showSpinner: false,
    },
    Filesystem: {
      readExternalStorage: true,
      writeExternalStorage: true,
    },
  },
  android: {
    allowMixedContent: false,
    useLegacyBridge: false,
  },
};

export default config;
