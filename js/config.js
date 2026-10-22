// Public settings. Safe to publish: the Firebase config identifies the project,
// and the Maps key is locked to this website's address in Google Cloud.
// Trip data (addresses, plans, places) lives in Firestore behind the passcode.
export const firebaseConfig = {
  apiKey: "AIzaSyApU4cFilaubJqlGrN9_s4sApk4SMX90aI",
  authDomain: "roque-roadtrip.firebaseapp.com",
  projectId: "roque-roadtrip",
  storageBucket: "roque-roadtrip.firebasestorage.app",
  messagingSenderId: "209852763973",
  appId: "1:209852763973:web:8205ccbd2a705719c7f82c"
};

// Google Maps Platform key (Map Tiles API + Places API (New)).
// Leave empty for preview mode: flat OpenStreetMap imagery, no Google search or photos.
export const MAPS_KEY = "";
