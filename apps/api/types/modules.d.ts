declare module "node-sessionstorage" {
    interface SessionStorage {
        setItem(key: string, value: string): void;
        getItem(key: string): string;
        removeItem(key: string): void;
        clear(): void;
    }
    const storage: SessionStorage;
    export default storage;
}
