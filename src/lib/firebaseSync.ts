import { db, handleFirestoreError, OperationType, auth } from './firebase';
import { signInAnonymously } from 'firebase/auth';
import { collection, doc, writeBatch, getDocs, setDoc, getDoc } from 'firebase/firestore';
import { storage } from './storage';

// Maps our LocalStorage key identifiers to their corresponding subcollection paths under /users/{userId}/...
const SYNC_MAP: Record<string, { colName: string; isSingleDoc?: boolean }> = {
  'condobill_condos': { colName: 'condos' },
  'condobill_units': { colName: 'units' },
  'condobill_transactions': { colName: 'transactions' },
  'condobill_categories': { colName: 'categories' },
  'condobill_concepts': { colName: 'concepts' },
  'condobill_tasks': { colName: 'tasks' },
  'condobill_maintenance': { colName: 'maintenance' },
  'condobill_repairs': { colName: 'repairs' },
  'condobill_staff': { colName: 'staff' },
  'condobill_suppliers': { colName: 'suppliers' },
  'condobill_products': { colName: 'products' },
  'condobill_sales': { colName: 'sales' },
  'condobill_clients': { colName: 'clients' },
  'condobill_quotes': { colName: 'quotes' },
  'condobill_users': { colName: 'appUsers' },
  'condobill_employees': { colName: 'employees' },
  'condobill_work_areas': { colName: 'workAreas' },
  'condobill_receipts': { colName: 'receipts' },
  'condobill_cortes': { colName: 'cortes' },
  'condobill_ticket_settings': { colName: 'ticketSettings', isSingleDoc: true }
};

export interface SyncStats {
  condos: number;
  units: number;
  transactions: number;
  products: number;
  sales: number;
  clients: number;
  quotes: number;
  receipts: number;
  cortes: number;
}

export function getLocalStats(): SyncStats {
  const localData = storage.exportAllData();
  return {
    condos: (localData['condobill_condos'] || []).length,
    units: (localData['condobill_units'] || []).length,
    transactions: (localData['condobill_transactions'] || []).length,
    products: (localData['condobill_products'] || []).length,
    sales: (localData['condobill_sales'] || []).length,
    clients: (localData['condobill_clients'] || []).length,
    quotes: (localData['condobill_quotes'] || []).length,
    receipts: (localData['condobill_receipts'] || []).length,
    cortes: (localData['condobill_cortes'] || []).length
  };
}

export function getDeviceId(): string {
  if (typeof window === "undefined") return "server";
  let id = localStorage.getItem("condobill_device_id");
  if (!id) {
    id = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" 
      ? crypto.randomUUID() 
      : Math.random().toString(36).substring(2) + Date.now().toString(36);
    localStorage.setItem("condobill_device_id", id);
  }
  return id;
}

export interface FirestoreRoot {
  baseCol: string;
  baseId: string;
}

/**
 * Ensures a valid Firebase Authentication session exists, signing in
 * anonymously in the background if no user is currently logged in.
 */
export async function ensureFirebaseAuth(): Promise<any> {
  if (auth.currentUser) {
    return auth.currentUser;
  }
  try {
    const userCred = await signInAnonymously(auth);
    console.log("[Firebase] Autenticación anónima exitosa con UID:", userCred.user.uid);
    return userCred.user;
  } catch (error: any) {
    if (error && error.code === "auth/operation-not-allowed") {
      throw new Error(
        "El proveedor de Autenticación Anónima no está habilitado en Firebase. " +
        "Por favor, configure Firebase Console: sección de Autenticación > Métodos de inicio de sesión > Habilitar proveedor 'Anónimo'."
      );
    }
    throw error;
  }
}

/**
 * Returns the firebase path source of truth (private UID vs Shared Group Code)
 */
export function getSyncRoot(userId: string): FirestoreRoot {
  const groupCode = (localStorage.getItem("condobill_group_code") || "").trim();
  if (groupCode !== "") {
    return { baseCol: "shared_namespaces", baseId: groupCode };
  }
  return { baseCol: "users", baseId: userId };
}

/**
 * Upload active local storage data arrays to Firestore under the authenticated user's private space or group space.
 */
export async function uploadToCloud(userId: string): Promise<void> {
  await ensureFirebaseAuth();
  const activeUserId = auth.currentUser?.uid || userId;
  const localData = storage.exportAllData();
  const root = getSyncRoot(activeUserId);

  for (const [localStorageKey, syncMeta] of Object.entries(SYNC_MAP)) {
    const rawData = localData[localStorageKey];
    const path = `${root.baseCol}/${root.baseId}/${syncMeta.colName}`;

    try {
      // 1. Fetch existing documents from Firestore to delete them and write the new ones (mirror upload)
      const colRef = collection(db, root.baseCol, root.baseId, syncMeta.colName);
      const snapshot = await getDocs(colRef);
      
      // Delete existing
      let batch = writeBatch(db);
      let batchCount = 0;
      
      for (const snapDoc of snapshot.docs) {
        batch.delete(snapDoc.ref);
        batchCount++;
        if (batchCount >= 400) {
          await batch.commit();
          batch = writeBatch(db);
          batchCount = 0;
        }
      }
      if (batchCount > 0) {
        await batch.commit();
      }

      // 2. Upload present local data
      if (syncMeta.isSingleDoc) {
        if (rawData) {
          const docRef = doc(db, root.baseCol, root.baseId, syncMeta.colName, 'settings');
          await setDoc(docRef, rawData);
        }
      } else if (Array.isArray(rawData) && rawData.length > 0) {
        batch = writeBatch(db);
        batchCount = 0;

        for (const item of rawData) {
          if (!item || !item.id) continue;
          
          const docRef = doc(db, root.baseCol, root.baseId, syncMeta.colName, item.id);
          batch.set(docRef, item);
          batchCount++;

          if (batchCount >= 400) {
            await batch.commit();
            batch = writeBatch(db);
            batchCount = 0;
          }
        }

        if (batchCount > 0) {
          await batch.commit();
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  }

  // 3. Update the sync metadata document to notify other devices
  try {
    const syncDocRef = doc(db, root.baseCol, root.baseId, "metadata", "sync");
    await setDoc(syncDocRef, {
      lastUpdated: Date.now(),
      updatedBy: getDeviceId()
    });
  } catch (error) {
    console.warn("[Firebase] No se pudo guardar el metadato de sincronización en la nube:", error);
  }
}

/**
 * Download documents from Firestore and replace the current LocalStorage database.
 */
export async function downloadFromCloud(userId: string): Promise<SyncStats> {
  await ensureFirebaseAuth();
  const activeUserId = auth.currentUser?.uid || userId;
  const downloadedMap: Record<string, any> = {};
  const root = getSyncRoot(activeUserId);

  for (const [localStorageKey, syncMeta] of Object.entries(SYNC_MAP)) {
    const path = `${root.baseCol}/${root.baseId}/${syncMeta.colName}`;
    try {
      if (syncMeta.isSingleDoc) {
        const colRef = collection(db, root.baseCol, root.baseId, syncMeta.colName);
        const snapshot = await getDocs(colRef);
        if (!snapshot.empty) {
          downloadedMap[localStorageKey] = snapshot.docs[0].data();
        }
      } else {
        const colRef = collection(db, root.baseCol, root.baseId, syncMeta.colName);
        const snapshot = await getDocs(colRef);
        const list: any[] = [];
        snapshot.forEach((docSnap) => {
          list.push(docSnap.data());
        });
        downloadedMap[localStorageKey] = list;
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, path);
    }
  }

  // Import downloaded maps directly into storage
  storage.importAllData(downloadedMap);

  return {
    condos: (downloadedMap['condobill_condos'] || []).length,
    units: (downloadedMap['condobill_units'] || []).length,
    transactions: (downloadedMap['condobill_transactions'] || []).length,
    products: (downloadedMap['condobill_products'] || []).length,
    sales: (downloadedMap['condobill_sales'] || []).length,
    clients: (downloadedMap['condobill_clients'] || []).length,
    quotes: (downloadedMap['condobill_quotes'] || []).length,
    receipts: (downloadedMap['condobill_receipts'] || []).length,
    cortes: (downloadedMap['condobill_cortes'] || []).length
  };
}

/**
 * Checks if a group code exists in Firestore.
 */
export async function checkGroupCodeExists(groupCodeToTest: string): Promise<boolean> {
  const code = groupCodeToTest.trim().toLowerCase().replace(/[^a-z0-9_\-]/g, "");
  if (!code) return false;
  
  // Ensure authenticated
  await ensureFirebaseAuth();
  
  try {
    const docRef = doc(db, "shared_namespaces", code, "info", "meta");
    const docSnap = await getDoc(docRef);
    return docSnap.exists();
  } catch (error) {
    console.error("[FirebaseSync] Error checking group code existence:", error);
    return false;
  }
}

/**
 * Creates a new group code registry in Firestore under shared_namespaces/{code}/info/meta.
 */
export async function createGroupCodeInCloud(groupCodeToCreate: string): Promise<void> {
  const code = groupCodeToCreate.trim().toLowerCase().replace(/[^a-z0-9_\-]/g, "");
  if (!code) {
    throw new Error("El código del grupo no puede estar vacío.");
  }
  
  // Ensure authenticated
  await ensureFirebaseAuth();
  
  try {
    const docRef = doc(db, "shared_namespaces", code, "info", "meta");
    await setDoc(docRef, {
      id: "meta",
      exists: true,
      code: code,
      createdAt: new Date().toISOString(),
      creatorUid: auth.currentUser?.uid || "anonymous",
      creatorEmail: auth.currentUser?.email || null
    });
    console.log(`[FirebaseSync] Código de grupo "${code}" registrado con éxito.`);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `shared_namespaces/${code}/info/meta`);
  }
}

