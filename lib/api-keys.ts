import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const DATA_DIR = path.join(process.cwd(), 'data');
const KEYS_FILE = path.join(DATA_DIR, 'api-keys.json');

export interface ApiKey {
    id: string;
    name: string;
    key: string;
    createdAt: string;
    isMaster?: boolean;
}

function ensureDataDir() {
    try {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        if (!fs.existsSync(KEYS_FILE)) {
            fs.writeFileSync(KEYS_FILE, JSON.stringify([]));
        }
    } catch (error) {
        // Ignore errors in production/read-only environments
        console.warn('Could not create data directory, likely read-only environment.');
    }
}

export function getApiKeys(): ApiKey[] {
    const keys: ApiKey[] = [];

    // 1. Add Master Key if exists
    if (process.env.MASTER_API_KEY) {
        keys.push({
            id: 'master-key',
            name: 'Master Key (Env)',
            key: process.env.MASTER_API_KEY,
            createdAt: new Date().toISOString(),
            isMaster: true
        });
    }

    // 2. Try to read from file
    try {
        ensureDataDir();
        if (fs.existsSync(KEYS_FILE)) {
            const data = fs.readFileSync(KEYS_FILE, 'utf-8');
            const fileKeys = JSON.parse(data);
            keys.push(...fileKeys);
        }
    } catch (error) {
        console.warn('Error reading API keys file:', error);
    }

    return keys;
}

export function generateApiKey(name: string): ApiKey {
    // If MASTER_API_KEY is set, we might want to disable generation or just warn
    // But for now, we'll try to generate. If it fails (read-only), we throw.

    try {
        ensureDataDir();
        const keys = getApiKeys().filter(k => !k.isMaster); // Only get file keys

        const newKey: ApiKey = {
            id: crypto.randomUUID(),
            name,
            key: 'sk_' + crypto.randomBytes(16).toString('hex'),
            createdAt: new Date().toISOString(),
        };

        keys.push(newKey);
        fs.writeFileSync(KEYS_FILE, JSON.stringify(keys, null, 2));

        return newKey;
    } catch (error) {
        console.error('Failed to generate API key:', error);
        throw new Error('Cannot generate keys in this environment (likely read-only). Use MASTER_API_KEY instead.');
    }
}

export function revokeApiKey(id: string): boolean {
    if (id === 'master-key') return false; // Cannot revoke master key

    try {
        ensureDataDir();
        let keys = getApiKeys().filter(k => !k.isMaster);
        const initialLength = keys.length;

        keys = keys.filter(k => k.id !== id);

        if (keys.length !== initialLength) {
            fs.writeFileSync(KEYS_FILE, JSON.stringify(keys, null, 2));
            return true;
        }
    } catch (error) {
        console.error('Failed to revoke API key:', error);
    }

    return false;
}

export function validateApiKey(key: string): boolean {
    if (process.env.MASTER_API_KEY && key === process.env.MASTER_API_KEY) {
        return true;
    }
    const keys = getApiKeys();
    return keys.some(k => k.key === key);
}
