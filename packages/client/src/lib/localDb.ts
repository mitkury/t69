import Dexie from 'dexie';
import type { SpacePointer } from './spaces/SpacePointer';
import type { VertexOperation } from '@core';

/**
 * Space setup on a client side
 * The setup points to a space either local or remote by url field
 */
export type SpaceSetup = {
  // Global unique identifier of the space
  id: string;
  // The url to the space: both local and remote; e.g file://path/to/space-dir or http://example.com/space-api
  uri: string;
  name: string | null;
  createdAt: Date;

  // Additional fields
  ttabsLayout?: string | null;
  theme?: string | null;
  colorScheme?: 'light' | 'dark' | null;
  drafts?: { [draftId: string]: string } | null;
  secrets?: { [key: string]: string } | null;
};

export interface ConfigEntry {
  key: string;
  value: unknown;
}

// Table for operations with split operation IDs
export interface TreeOperation {
  // Composite primary key components
  clock: number;        // The counter/clock value
  peerId: string;       // The peer ID
  treeId: string;       // Tree identifier
  spaceId: string;      // Space reference

  // Operation data
  targetId: string;     // Target vertex ID

  // Move operation: has parentId
  parentId?: string;    // For move operations

  // Property operation: has key/value/transient  
  key?: string;         // Property key
  value?: any;          // Property value
}

class LocalDb extends Dexie {
  spaces!: Dexie.Table<SpaceSetup, string>;
  config!: Dexie.Table<ConfigEntry, string>;
  treeOps!: Dexie.Table<TreeOperation, string>; // Primary key is composite

  constructor() {
    super('localDb');

    this.version(1).stores({
      spaces: '&id, uri, name, createdAt',
      config: '&key',
      treeOps: '&[clock+peerId+treeId+spaceId], spaceId, treeId, [spaceId+treeId], [spaceId+treeId+clock]'
    });
  }
}

export const db = new LocalDb();

// Convert to VertexOperation for RepTree
function toVertexOperation(op: TreeOperation): VertexOperation {
  if (op.parentId !== undefined) {
    // Move operation detected by presence of parentId
    return {
      id: { counter: op.clock, peerId: op.peerId },
      targetId: op.targetId,
      parentId: op.parentId
    } as VertexOperation;
  } else {
    // Property operation detected by presence of key
    return {
      id: { counter: op.clock, peerId: op.peerId },
      targetId: op.targetId,
      key: op.key!,
      value: op.value,
    } as VertexOperation;
  }
}

// Convert from VertexOperation for storage
function fromVertexOperation(op: VertexOperation, spaceId: string, treeId: string): TreeOperation {
  const base: Partial<TreeOperation> = {
    clock: op.id.counter,
    peerId: op.id.peerId,
    treeId,
    spaceId,
    targetId: op.targetId
  };

  if ('parentId' in op) {
    return { ...base, parentId: op.parentId } as TreeOperation;
  } else {
    return {
      ...base,
      key: op.key,
      value: op.value,
    } as TreeOperation;
  }
}

export async function getAllPointers(): Promise<SpacePointer[]> {
  try {
    // Get all spaces but only return the pointer fields
    const spaces = await db.spaces.toArray();
    return spaces.map(space => ({
      id: space.id,
      uri: space.uri,
      name: space.name,
      createdAt: space.createdAt
    }));
  } catch (error) {
    console.error('Failed to get pointers from database:', error);
    return [];
  }
}

export async function getCurrentSpaceId(): Promise<string | null> {
  try {
    const entry = await db.config.get('currentSpaceId');
    return entry ? entry.value as string : null;
  } catch (error) {
    console.error('Failed to get currentSpaceId from database:', error);
    return null;
  }
}

export async function getAllConfig(): Promise<Record<string, unknown>> {
  try {
    const entries = await db.config.toArray();
    return Object.fromEntries(entries.map(e => [e.key, e.value]));
  } catch (error) {
    console.error('Failed to get config from database:', error);
    return {};
  }
}

export async function savePointers(pointers: SpacePointer[]): Promise<void> {
  try {
    // Ensure all pointers have serializable createdAt dates
    const serializablePointers = pointers.map(pointer => {
      // Make a copy of the pointer to avoid modifying the original
      const serializedPointer = { ...pointer };

      // Ensure createdAt is a proper Date object
      // If it's already a Date, use it; otherwise try to create a new Date from it
      if (!(serializedPointer.createdAt instanceof Date)) {
        try {
          serializedPointer.createdAt = new Date(serializedPointer.createdAt);
        } catch (dateError) {
          console.error('Failed to convert createdAt to Date:', dateError);
          // Fallback to current date if conversion fails
          serializedPointer.createdAt = new Date();
        }
      }

      return serializedPointer;
    });

    // Convert pointers to SpaceSetup objects and save them
    // This preserves any existing additional data like ttabsLayout
    for (const pointer of serializablePointers) {
      try {
        // Check if this space already exists
        const existingSpace = await db.spaces.get(pointer.id);

        if (existingSpace) {
          // Update only the pointer fields, preserving other data
          await db.spaces.update(pointer.id, {
            uri: pointer.uri,
            name: pointer.name,
            createdAt: pointer.createdAt
          });
        } else {
          // Create a new space setup
          await db.spaces.put({
            ...pointer,
            ttabsLayout: null,
            theme: null,
            drafts: null,
            secrets: null
          });
        }
      } catch (spaceError) {
        console.error(`Failed to save space ${pointer.id}:`, spaceError);
      }
    }
  } catch (error) {
    console.error('Failed to save pointers to database:', error);
  }
}

export async function saveConfig(config: Record<string, unknown>): Promise<void> {
  try {
    await db.config.bulkPut(
      Object.entries(config).map(([key, value]) => ({ key, value }))
    );
  } catch (error) {
    console.error('Failed to save config to database:', error);
  }
}

export async function saveCurrentSpaceId(id: string | null): Promise<void> {
  if (id === null) return;

  try {
    await db.config.put({ key: 'currentSpaceId', value: id });
  } catch (error) {
    console.error('Failed to save currentSpaceId to database:', error);
  }
}

export async function initializeDatabase(): Promise<{
  pointers: SpacePointer[];
  currentSpaceId: string | null;
  config: Record<string, unknown>;
}> {
  try {
    const pointers = await getAllPointers();
    const currentSpaceId = await getCurrentSpaceId();
    const config = await getAllConfig();

    return { pointers, currentSpaceId, config };
  } catch (error) {
    console.error('Failed to initialize database:', error);

    // Attempt recovery
    try {
      await db.delete();
      await db.open();
      console.log('Database reset after error');
    } catch (recoveryError) {
      console.error('Failed to recover database:', recoveryError);
    }

    return { pointers: [], currentSpaceId: null, config: {} };
  }
}

// Get the complete SpaceSetup for a space
export async function getSpaceSetup(spaceId: string): Promise<SpaceSetup | undefined> {
  try {
    const space = await db.spaces
      .where('id')
      .equals(spaceId)
      .first();

    return space;
  } catch (error) {
    console.error(`Failed to get setup for space ${spaceId}:`, error);
    return undefined;
  }
}

// Get just the ttabsLayout for a space
export async function getTtabsLayout(spaceId: string): Promise<string | null | undefined> {
  try {
    const space = await db.spaces
      .where('id')
      .equals(spaceId)
      .first();
    return space?.ttabsLayout;
  } catch (error) {
    console.error(`Failed to get ttabsLayout for space ${spaceId}:`, error);
    return undefined;
  }
}

// Save ttabsLayout for a space
export async function saveTtabsLayout(spaceId: string, layout: string): Promise<void> {
  try {
    // Use modify to update only the specific field without loading the entire object
    await db.spaces
      .where('id')
      .equals(spaceId)
      .modify({ ttabsLayout: layout });
  } catch (error) {
    console.error(`Failed to save ttabsLayout for space ${spaceId}:`, error);
  }
}

// Get operations for a specific tree
export async function getTreeOps(spaceId: string, treeId: string): Promise<VertexOperation[]> {
  try {
    const treeOps = await db.treeOps
      .where('[spaceId+treeId]')
      .equals([spaceId, treeId])
      .toArray();

    return treeOps.map(toVertexOperation);
  } catch (error) {
    console.error(`Failed to get ops for tree ${treeId} in space ${spaceId}:`, error);
    return [];
  }
}

export async function appendTreeOps(spaceId: string, treeId: string, ops: ReadonlyArray<VertexOperation>): Promise<void> {
  if (ops.length === 0) return;

  const treeOpsEntries = ops.map(op => fromVertexOperation(op, spaceId, treeId));

  // Use bulkPut to store operations
  await db.treeOps.bulkPut(treeOpsEntries);
}

export async function getAllSpaceTreeOps(spaceId: string): Promise<Map<string, VertexOperation[]>> {
  try {
    const treeOps = await db.treeOps
      .where('spaceId')
      .equals(spaceId)
      .toArray();

    const treeOpsMap = new Map<string, VertexOperation[]>();

    for (const entry of treeOps) {
      if (!treeOpsMap.has(entry.treeId)) {
        treeOpsMap.set(entry.treeId, []);
      }
      treeOpsMap.get(entry.treeId)!.push(toVertexOperation(entry));
    }

    return treeOpsMap;
  } catch (error) {
    console.error(`Failed to get all tree ops for space ${spaceId}:`, error);
    return new Map();
  }
}

export async function deleteTreeOps(spaceId: string, treeId: string): Promise<void> {
  try {
    await db.treeOps
      .where('[spaceId+treeId]')
      .equals([spaceId, treeId])
      .delete();
  } catch (error) {
    console.error(`Failed to delete ops for tree ${treeId} in space ${spaceId}:`, error);
  }
}

export async function getTreeOpCount(spaceId: string, treeId: string): Promise<number> {
  try {
    return await db.treeOps
      .where('[spaceId+treeId]')
      .equals([spaceId, treeId])
      .count();
  } catch (error) {
    console.error(`Failed to get op count for tree ${treeId} in space ${spaceId}:`, error);
    return 0;
  }
}

// Save theme for a space
export async function saveSpaceTheme(spaceId: string, theme: string): Promise<void> {
  try {
    await db.spaces
      .where('id')
      .equals(spaceId)
      .modify({ theme: theme });
  } catch (error) {
    console.error(`Failed to save theme for space ${spaceId}:`, error);
  }
}

// Save color scheme for a space
export async function saveSpaceColorScheme(spaceId: string, colorScheme: 'light' | 'dark'): Promise<void> {
  try {
    await db.spaces
      .where('id')
      .equals(spaceId)
      .modify({ colorScheme: colorScheme });
  } catch (error) {
    console.error(`Failed to save color scheme for space ${spaceId}:`, error);
  }
}

// Delete a space from the database
export async function deleteSpace(spaceId: string): Promise<void> {
  try {
    await db.transaction('rw', [db.spaces, db.treeOps, db.config], async () => {
      // Delete all operations for this space
      await db.treeOps
        .where('spaceId')
        .equals(spaceId)
        .delete();

      // Delete the space from the spaces table
      await db.spaces.delete(spaceId);

      // Check if this was the current space and clear it if so
      const currentId = await getCurrentSpaceId();
      if (currentId === spaceId) {
        await db.config.delete('currentSpaceId');
      }
    });

    console.log(`Space ${spaceId} deleted from database`);
  } catch (error) {
    console.error(`Failed to delete space ${spaceId} from database:`, error);
  }
}

// Get a draft for a space and draftId
export async function getDraft(spaceId: string, draftId: string): Promise<string | undefined> {
  try {
    const space = await db.spaces.get(spaceId);
    return space?.drafts?.[draftId];
  } catch (error) {
    console.error(`Failed to get draft for space ${spaceId} and draftId ${draftId}:`, error);
    return undefined;
  }
}

// Save a draft for a space
export async function saveDraft(spaceId: string, draftId: string, content: string): Promise<void> {
  try {
    await db.spaces
      .where('id')
      .equals(spaceId)
      .modify((space) => {
        if (!space.drafts) {
          space.drafts = {};
        }
        space.drafts[draftId] = content;
      });
  } catch (error) {
    console.error(`Failed to save draft for space ${spaceId} and draftId ${draftId}:`, error);
  }
}

// Delete a draft for a space
export async function deleteDraft(spaceId: string, draftId: string): Promise<void> {
  try {
    await db.spaces
      .where('id')
      .equals(spaceId)
      .modify((space) => {
        if (space.drafts && space.drafts[draftId]) {
          delete space.drafts[draftId];
        }
      });
  } catch (error) {
    console.error(`Failed to delete draft for space ${spaceId} and draftId ${draftId}:`, error);
  }
}

// Get all secrets for a space
export async function getAllSecrets(spaceId: string): Promise<Record<string, string> | undefined> {
  try {
    const space = await db.spaces.get(spaceId);
    return space?.secrets || undefined;
  } catch (error) {
    console.error(`Failed to get all secrets for space ${spaceId}:`, error);
    return undefined;
  }
}

// Save all secrets for a space
export async function saveAllSecrets(spaceId: string, secrets: Record<string, string>): Promise<void> {
  try {
    await db.spaces
      .where('id')
      .equals(spaceId)
      .modify((space) => {
        if (!space.secrets) {
          space.secrets = {};
        }
        Object.assign(space.secrets, secrets);
      });
  } catch (error) {
    console.error(`Failed to save all secrets for space ${spaceId}:`, error);
  }
}

// Get a specific secret for a space
export async function getSecret(spaceId: string, key: string): Promise<string | undefined> {
  try {
    const space = await db.spaces.get(spaceId);
    return space?.secrets?.[key];
  } catch (error) {
    console.error(`Failed to get secret ${key} for space ${spaceId}:`, error);
    return undefined;
  }
}

// Set a specific secret for a space
export async function setSecret(spaceId: string, key: string, value: string): Promise<void> {
  try {
    await db.spaces
      .where('id')
      .equals(spaceId)
      .modify((space) => {
        if (!space.secrets) {
          space.secrets = {};
        }
        space.secrets[key] = value;
      });
  } catch (error) {
    console.error(`Failed to set secret ${key} for space ${spaceId}:`, error);
  }
}


