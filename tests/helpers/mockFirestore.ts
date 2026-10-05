export const TEST_CONTACT_HASH_SECRET = 'test_contact_hash_secret_at_least_32_characters_long_for_hmac';
if (process.env.NODE_ENV === 'test' && (!process.env.CONTACT_HASH_SECRET || process.env.CONTACT_HASH_SECRET.length < 32)) {
  process.env.CONTACT_HASH_SECRET = TEST_CONTACT_HASH_SECRET;
}

export interface DecodedTestUser {
  uid: string;
  email?: string;
  email_verified?: boolean;
  phone_number?: string;
  [key: string]: any;
}

export class MockDocumentSnapshot {
  constructor(
    public readonly id: string,
    private readonly _data: any,
    public readonly ref: MockDocumentReference
  ) {}

  get exists(): boolean {
    return this._data !== undefined && this._data !== null;
  }

  data(): any {
    return this._data ? JSON.parse(JSON.stringify(this._data)) : undefined;
  }
}

export class MockQuerySnapshot {
  constructor(public readonly docs: MockDocumentSnapshot[]) {}

  get empty(): boolean {
    return this.docs.length === 0;
  }

  get size(): number {
    return this.docs.length;
  }

  forEach(callback: (doc: MockDocumentSnapshot) => void): void {
    this.docs.forEach(callback);
  }
}

export type MockHooks = {
  onBeforeDelete?: (collectionName: string, id: string) => Promise<void> | void;
  onBeforeSet?: (collectionName: string, id: string, data: any) => Promise<void> | void;
  onBeforeUpdate?: (collectionName: string, id: string, data: any) => Promise<void> | void;
};

export class MockDocumentReference {
  constructor(
    public readonly collectionName: string,
    public readonly id: string,
    private readonly store: Map<string, Map<string, any>>,
    private readonly hooks?: MockHooks
  ) {}

  get path(): string {
    return `${this.collectionName}/${this.id}`;
  }

  async get(): Promise<MockDocumentSnapshot> {
    const col = this.store.get(this.collectionName);
    const data = col ? col.get(this.id) : undefined;
    return new MockDocumentSnapshot(this.id, data, this);
  }

  async set(data: any, options?: { merge?: boolean }): Promise<void> {
    if (this.hooks?.onBeforeSet) {
      await this.hooks.onBeforeSet(this.collectionName, this.id, data);
    }
    let col = this.store.get(this.collectionName);
    if (!col) {
      col = new Map<string, any>();
      this.store.set(this.collectionName, col);
    }

    const target = (options?.merge && col.has(this.id)) ? { ...(col.get(this.id) || {}) } : {};
    for (const [k, v] of Object.entries(data)) {
      if (v && typeof v === 'object' && (v.constructor?.name === 'DeleteTransform' || (v as any)._methodName === 'FieldValue.delete')) {
        delete target[k];
      } else if (v !== undefined) {
        target[k] = JSON.parse(JSON.stringify(v));
      }
    }
    col.set(this.id, target);
  }

  async update(data: any): Promise<void> {
    if (this.hooks?.onBeforeUpdate) {
      await this.hooks.onBeforeUpdate(this.collectionName, this.id, data);
    }
    const col = this.store.get(this.collectionName);
    if (!col || !col.has(this.id)) {
      throw new Error(`Document ${this.path} does not exist for update`);
    }
    const target = { ...(col.get(this.id) || {}) };
    for (const [k, v] of Object.entries(data)) {
      if (v && typeof v === 'object' && (v.constructor?.name === 'DeleteTransform' || (v as any)._methodName === 'FieldValue.delete')) {
        delete target[k];
      } else if (v !== undefined) {
        target[k] = JSON.parse(JSON.stringify(v));
      }
    }
    col.set(this.id, target);
  }

  async delete(): Promise<void> {
    if (this.hooks?.onBeforeDelete) {
      await this.hooks.onBeforeDelete(this.collectionName, this.id);
    }
    const col = this.store.get(this.collectionName);
    if (col) {
      col.delete(this.id);
    }
  }
}

type QueryFilter = {
  field: string;
  op: '==' | 'in';
  value: any;
};

type OrderByClause = {
  field: string;
  direction: 'asc' | 'desc';
};

export class MockQuery {
  protected filters: QueryFilter[] = [];
  protected orderBys: OrderByClause[] = [];
  protected limitCount?: number;

  constructor(
    public readonly collectionName: string,
    protected readonly store: Map<string, Map<string, any>>,
    protected readonly hooks?: MockHooks
  ) {}

  where(field: string, op: '==' | 'in', value: any): MockQuery {
    const query = this.clone();
    query.filters.push({ field, op, value });
    return query;
  }

  orderBy(field: string, direction: 'asc' | 'desc' = 'asc'): MockQuery {
    const query = this.clone();
    query.orderBys.push({ field, direction });
    return query;
  }

  limit(n: number): MockQuery {
    const query = this.clone();
    query.limitCount = n;
    return query;
  }

  protected clone(): MockQuery {
    const q = new MockQuery(this.collectionName, this.store, this.hooks);
    q.filters = [...this.filters];
    q.orderBys = [...this.orderBys];
    q.limitCount = this.limitCount;
    return q;
  }

  async get(): Promise<MockQuerySnapshot> {
    const col = this.store.get(this.collectionName);
    if (!col) return new MockQuerySnapshot([]);

    let items: Array<{ id: string; data: any }> = [];
    for (const [id, data] of col.entries()) {
      let match = true;
      for (const filter of this.filters) {
        const val = data?.[filter.field];
        if (filter.op === '==') {
          if (val !== filter.value) match = false;
        } else if (filter.op === 'in') {
          if (!Array.isArray(filter.value) || !filter.value.includes(val)) match = false;
        }
        if (!match) break;
      }
      if (match) {
        items.push({ id, data });
      }
    }

    for (const order of this.orderBys) {
      items.sort((a, b) => {
        const va = a.data?.[order.field];
        const vb = b.data?.[order.field];
        if (va === vb) return 0;
        if (order.direction === 'desc') {
          return va < vb ? 1 : -1;
        }
        return va > vb ? 1 : -1;
      });
    }

    if (this.limitCount !== undefined) {
      items = items.slice(0, this.limitCount);
    }

    const docs = items.map(
      (item) => new MockDocumentSnapshot(item.id, item.data, new MockDocumentReference(this.collectionName, item.id, this.store, this.hooks))
    );
    return new MockQuerySnapshot(docs);
  }
}

export class MockCollectionReference extends MockQuery {
  doc(id?: string): MockDocumentReference {
    const docId = id || `doc_${Math.random().toString(36).slice(2, 11)}`;
    return new MockDocumentReference(this.collectionName, docId, this.store, this.hooks);
  }
}

export class MockWriteBatch {
  private operations: Array<() => Promise<void>> = [];

  set(ref: MockDocumentReference, data: any, options?: { merge?: boolean }): MockWriteBatch {
    this.operations.push(async () => {
      await ref.set(data, options);
    });
    return this;
  }

  update(ref: MockDocumentReference, data: any): MockWriteBatch {
    this.operations.push(async () => {
      await ref.update(data);
    });
    return this;
  }

  delete(ref: MockDocumentReference): MockWriteBatch {
    this.operations.push(async () => {
      await ref.delete();
    });
    return this;
  }

  async commit(): Promise<void> {
    for (const op of this.operations) {
      await op();
    }
  }
}

export class MockTransaction {
  private stagedWrites: Array<() => Promise<void>> = [];

  constructor(private readonly store: Map<string, Map<string, any>>) {}

  async get(ref: MockDocumentReference): Promise<MockDocumentSnapshot> {
    return ref.get();
  }

  set(ref: MockDocumentReference, data: any, options?: { merge?: boolean }): MockTransaction {
    this.stagedWrites.push(async () => {
      await ref.set(data, options);
    });
    return this;
  }

  update(ref: MockDocumentReference, data: any): MockTransaction {
    this.stagedWrites.push(async () => {
      await ref.update(data);
    });
    return this;
  }

  delete(ref: MockDocumentReference): MockTransaction {
    this.stagedWrites.push(async () => {
      await ref.delete();
    });
    return this;
  }

  async commit(): Promise<void> {
    for (const write of this.stagedWrites) {
      await write();
    }
  }
}

export class MockFirestore {
  public store = new Map<string, Map<string, any>>();
  public hooks: MockHooks = {};

  collection(name: string): MockCollectionReference {
    return new MockCollectionReference(name, this.store, this.hooks);
  }

  batch(): MockWriteBatch {
    return new MockWriteBatch();
  }

  async runTransaction<T>(updateFunction: (transaction: MockTransaction) => Promise<T>): Promise<T> {
    const tx = new MockTransaction(this.store);
    const result = await updateFunction(tx);
    await tx.commit();
    return result;
  }

  reset(): void {
    this.store.clear();
    this.hooks = {};
  }

  seed(collectionName: string, id: string, data: any): void {
    let col = this.store.get(collectionName);
    if (!col) {
      col = new Map<string, any>();
      this.store.set(collectionName, col);
    }
    col.set(id, JSON.parse(JSON.stringify(data)));
  }

  getDoc(collectionName: string, id: string): any {
    return this.store.get(collectionName)?.get(id);
  }
}

export class MockAuth {
  private users = new Map<string, DecodedTestUser>();
  public onDeleteUser?: (uid: string) => Promise<void> | void;
  public onGetUser?: (uid: string) => Promise<{ uid: string }> | { uid: string };

  addUser(token: string, user: DecodedTestUser): void {
    this.users.set(token, { ...user });
  }

  async verifyIdToken(token: string): Promise<DecodedTestUser> {
    const user = this.users.get(token);
    if (!user) {
      const err = new Error(`Firebase ID token has invalid signature or user not found: ${token}`);
      (err as any).code = 'auth/invalid-id-token';
      throw err;
    }
    return { ...user };
  }

  async deleteUser(uid: string): Promise<void> {
    if (this.onDeleteUser) {
      await this.onDeleteUser(uid);
      return;
    }
    for (const [token, user] of this.users.entries()) {
      if (user.uid === uid) {
        this.users.delete(token);
      }
    }
  }

  async getUser(uid: string): Promise<{ uid: string }> {
    if (this.onGetUser) {
      return await this.onGetUser(uid);
    }
    return { uid };
  }

  reset(): void {
    this.users.clear();
    this.onDeleteUser = undefined;
    this.onGetUser = undefined;
  }
}

export function createMockFirestore(): MockFirestore {
  return new MockFirestore();
}

export function createMockAuth(): MockAuth {
  return new MockAuth();
}
