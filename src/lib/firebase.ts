import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut as fbSignOut, onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import { getAnalytics, isSupported } from 'firebase/analytics';

// Tu configuración de Firebase para condo1-ca3b0
const firebaseConfig = {
  apiKey: "AIzaSyDYGiXiFrgzEPDDB48BGBLjZNbUDz6gbvQ",
  authDomain: "condo1-ca3b0.firebaseapp.com",
  databaseURL: "https://condo1-ca3b0-default-rtdb.firebaseio.com",
  projectId: "condo1-ca3b0",
  storageBucket: "condo1-ca3b0.firebasestorage.app",
  messagingSenderId: "688452449935",
  appId: "1:688452449935:web:417405b66923abd8a3e2fa",
  measurementId: "G-FYZDBEYT21"
};

const app = initializeApp(firebaseConfig);

// Inicializar Firestore (usa base de datos por defecto)
export const db = getFirestore(app);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Initialize Analytics optionally (only in supported web browsers)
export let analytics: any = null;
isSupported().then((supported) => {
  if (supported) {
    analytics = getAnalytics(app);
    console.log('[Firebase] Analytics inicializado correctamente.');
  }
}).catch((err) => {
  console.warn('[Firebase] Analytics no es compatible o falló al iniciar en este entorno:', err);
});

// Standard constraints for popup authentication to work reliable in sandbox
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('[Firebase Sync Error]', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Test Connection on load as per skill requirements
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('[Firebase] Por favor, revisa tu conexión a internet o la configuración del proyecto de Firebase.');
    }
  }
}
testConnection();
