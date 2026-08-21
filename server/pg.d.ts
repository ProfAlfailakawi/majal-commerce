declare module 'pg' {
  export class Pool {
    constructor(options?: Record<string, unknown>);
    connect(): Promise<any>;
    query(text: string, values?: unknown[]): Promise<{ rows: any[]; rowCount: number | null }>;
    end(): Promise<void>;
  }
}
