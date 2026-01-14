
import { openDB, DBSchema } from 'idb';
import { SavedDataset, SavedPMPlan } from '../types';

interface ReliabilityDB extends DBSchema {
  datasets: {
    key: string;
    value: SavedDataset;
  };
  pm_plans: {
    key: string;
    value: SavedPMPlan;
  };
  session: {
    key: string;
    value: any;
  };
}

const DB_NAME = 'reliability-ai-db';
const DB_VERSION = 4; // Incremented version for session store

export const initDB = async () => {
  return openDB<ReliabilityDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, newVersion, transaction) {
      if (!db.objectStoreNames.contains('datasets')) {
        db.createObjectStore('datasets', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('pm_plans')) {
        db.createObjectStore('pm_plans', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('session')) {
        db.createObjectStore('session');
      }
    },
  });
};

export const dbApi = {
    async getAll(storeName: 'datasets' | 'pm_plans') {
        const db = await initDB();
        return db.getAll(storeName);
    },

    async save(storeName: 'datasets' | 'pm_plans', item: any) {
        const db = await initDB();
        return db.put(storeName, item);
    },

    async delete(storeName: 'datasets' | 'pm_plans', id: string) {
        const db = await initDB();
        return db.delete(storeName, id);
    },

    // Session Persistence Methods
    async saveSession(state: any) {
        const db = await initDB();
        return db.put('session', state, 'current_active_session');
    },

    async getSession() {
        const db = await initDB();
        return db.get('session', 'current_active_session');
    },

    async migrateFromLocalStorage() {
        if (localStorage.getItem('migration_complete')) return;
        
        const lsDatasets = localStorage.getItem('reliability_datasets');
        const lsPlans = localStorage.getItem('pm_plans_db');
        
        if (!lsDatasets && !lsPlans) {
            localStorage.setItem('migration_complete', 'true');
            return;
        }

        const db = await initDB();
        
        if (lsDatasets) {
            try {
                const parsed: SavedDataset[] = JSON.parse(lsDatasets);
                const tx = db.transaction('datasets', 'readwrite');
                for (const ds of parsed) {
                    await tx.store.put(ds);
                }
                await tx.done;
                localStorage.removeItem('reliability_datasets');
            } catch (e) { console.error("Migration failed for datasets", e); }
        }

        if (lsPlans) {
            try {
                const parsed: SavedPMPlan[] = JSON.parse(lsPlans);
                const tx = db.transaction('pm_plans', 'readwrite');
                for (const plan of parsed) {
                    await tx.store.put(plan);
                }
                await tx.done;
                localStorage.removeItem('pm_plans_db');
            } catch (e) { console.error("Migration failed for PM plans", e); }
        }
        
        localStorage.setItem('migration_complete', 'true');
    }
};
