import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { FIREBASE_SYNC_ENABLED } from './runtime';

export class CloudSyncService {
  private static instance: CloudSyncService;
  private constructor() {}

  public static getInstance(): CloudSyncService {
    if (!CloudSyncService.instance) {
      CloudSyncService.instance = new CloudSyncService();
    }
    return CloudSyncService.instance;
  }

  private canWrite(): boolean {
    return Boolean(FIREBASE_SYNC_ENABLED && db && auth?.currentUser);
  }

  public isConnected(): boolean {
    return this.canWrite();
  }

  private async write(collectionName: string, value: { id: string }) {
    if (!this.canWrite() || !db) return false;
    try {
      await setDoc(doc(db, collectionName, value.id), value, { merge: true });
      return true;
    } catch (e) {
      console.warn(`[MAJAL Cloud Sync] ${collectionName} write rejected.`, e);
      return false;
    }
  }

  public async syncProductToCloud(product: { id: string }) {
    return this.write('products', product);
  }

  public async syncOrderToCloud(order: { id: string }) {
    return this.write('orders', order);
  }

  public async syncContractToCloud(contract: { id: string }) {
    return this.write('contracts', contract);
  }
}

export const cloudSync = CloudSyncService.getInstance();
