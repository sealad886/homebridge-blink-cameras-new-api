import type { FirebaseConfig } from './fcm/types';

/**
 * Public Firebase client parameters recovered from the Play-installed Blink61.0
 * APK (base SHA256758085236e6bced77d5bc7f4c28651e66004043f4349ce4c2a0be9cf54d26615).
 * These identify the receiving application/project; they are not Firebase owner,
 * service-account, sender, or receiver-private credentials.
 * https://firebase.google.com/docs/projects/api-keys
 */
export const BLINK_FIREBASE_CLIENT: FirebaseConfig = {
  "projectId": "blink-6c1ea",
  "appId": "1:351117235468:android:14fb3ef63df2a7c2",
  "apiKey": "AIzaSyBcgwrpglzCZJPUNNeQQnpBbJAFlas_XAI",
  "messagingSenderId": "351117235468"
};

export const BLINK_NOTIFICATION_APP_VERSION = '61.0';
