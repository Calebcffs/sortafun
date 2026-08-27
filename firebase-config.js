// Firebase project config for sortafun leaderboards.
//
// This is PUBLIC on purpose. It is not a secret key. Anyone can read it in the
// page source. What people can actually do is controlled by firestore.rules.
//
// To turn leaderboards ON:
//   1. Make a Firebase project at https://console.firebase.google.com (free Spark plan is fine)
//   2. Add a Web App, copy its config values in below
//   3. Enable Firestore (production mode) and paste firestore.rules
//   4. See SETUP.md for the full walk-through
//
// Until the values below are filled in, the games still work — the leaderboard
// panel just shows "leaderboard offline".

window.SORTAFUN_FIREBASE = {
  apiKey: "AIzaSyD48N34sV14IqGHbnwBLaBR8GwxZ9d2nys",
  authDomain: "sortafun-ba7cb.firebaseapp.com",
  projectId: "sortafun-ba7cb",
  storageBucket: "sortafun-ba7cb.firebasestorage.app",
  messagingSenderId: "674389696205",
  appId: "1:674389696205:web:8467bad3f828aac7605384",
};
