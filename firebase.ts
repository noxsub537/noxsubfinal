// Importa as funções necessárias do SDK
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";

// Configuração do seu app Firebase
const firebaseConfig = {
  apiKey: "AIzaSyDwW75sWA_E0X0wqRlqxcHPc_l6pXID3eQ",
  authDomain: "noxsub-45150.firebaseapp.com",
  projectId: "noxsub-45150",
  storageBucket: "noxsub-45150.firebasestorage.app",
  messagingSenderId: "580154881681",
  appId: "1:580154881681:web:f52a497a23647b7a15f130",
  measurementId: "G-H5J1LF4H8J"
};

// Inicializa o Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

export { app, analytics };
