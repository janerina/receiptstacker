declare module 'react-native-sqlite-storage' {
  // Minimal typings sufficient for this project.

  export interface ResultSet {
    rows: {
      length: number;
      item: (index: number) => any;
    };
  }

  export interface SQLiteDatabase {
    executeSql: (sql: string, params?: any[]) => Promise<[ResultSet]>;
    transaction: (
      cb: (txn: { executeSql: (sql: string, params?: any[]) => Promise<[ResultSet]> }) => void,
      error?: (err: any) => void,
      success?: () => void,
    ) => void;
  }

  export interface OpenDatabaseParams {
    name: string;
    location?: string;
  }

  export interface SQLiteStatic {
    enablePromise: (enable: boolean) => void;
    openDatabase: (params: OpenDatabaseParams) => Promise<SQLiteDatabase>;
  }

  const SQLite: SQLiteStatic;
  export default SQLite;
}
