/**
 * =========================================
 * WebDB API  —  Path-Based CRUD Layer
 * =========================================
 *
 * Sits on top of WebDB's IndexedDB store and
 * exposes every operation via human-readable
 * path strings, exactly like a file system.
 *
 * PATH FORMAT
 * ───────────
 *   dbname/file.json                     ← file at root of db
 *   dbname/folder/file.json              ← file inside one folder
 *   dbname/folder/subfolder/file.json    ← file inside nested folders
 *   dbname/folder                        ← a folder path
 *   dbname                               ← a database path
 *
 * QUICK START
 * ───────────
 *   const api = new WebDBAPI();
 *
 *   // ── Database ──────────────────────────
 *   await api.createDB('mydb');
 *   await api.listDBs();
 *   await api.deleteDB('mydb');
 *
 *   // ── Folder ────────────────────────────
 *   await api.createFolder('mydb/users/reports');
 *   await api.list('mydb/users');
 *   await api.deleteFolder('mydb/users/reports');
 *
 *   // ── File ──────────────────────────────
 *   await api.write('mydb/users/data.json',  { name: 'John' });
 *   await api.read ('mydb/users/data.json');
 *   await api.update('mydb/users/data.json', { name: 'Jane' });
 *   await api.upsert('mydb/users/data.json', { name: 'Sam' });
 *   await api.delete('mydb/users/data.json');
 *
 *   // ── Extra ─────────────────────────────
 *   await api.rename('mydb/users/data.json', 'profile.json');
 *   await api.move  ('mydb/a/data.json', 'mydb/b/data.json');
 *   await api.copy  ('mydb/a/data.json', 'mydb/b/data.json');
 *   await api.search('mydb', 'report');
 *   await api.exists('mydb/users/data.json');
 *   await api.info  ('mydb/users/data.json');
 */

class WebDBAPI {

    constructor() {
        /** @type {Object.<string, IDBDatabase>} */
        this._cache = {};
    }

    /* =========================================
     * INTERNAL — IndexedDB primitives
     * ========================================= */

    /**
     * Open (or return cached) database.
     * Creates the 'files' object store on first open.
     * @param {string} dbName
     * @returns {Promise<IDBDatabase>}
     */
    async _openDB(dbName) {
        if (this._cache[dbName]) return this._cache[dbName];

        return new Promise((resolve, reject) => {
            const req = indexedDB.open(dbName, 1);

            req.onerror = () => reject(new Error(`Cannot open DB "${dbName}": ${req.error?.message}`));

            req.onsuccess = () => {
                this._cache[dbName] = req.result;

                // Clean up cache entry when the connection closes externally
                req.result.onclose = () => delete this._cache[dbName];

                resolve(req.result);
            };

            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('files')) {
                    db.createObjectStore('files', { keyPath: 'id' });
                }
            };
        });
    }

    /** @returns {string} UUID v4 */
    _uuid() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    }

    /** Byte-size estimate for any content value */
    _sizeOf(content) {
        if (content instanceof Blob) return content.size;
        if (typeof content === 'string') return content.length;
        try { return JSON.stringify(content).length; } catch { return 0; }
    }

    /* ── Low-level IDB wrappers ───────────────────────────────────── */

    async _getAll(db) {
        return new Promise((resolve, reject) => {
            const tx    = db.transaction('files', 'readonly');
            const store = tx.objectStore('files');
            const req   = store.getAll();
            req.onerror   = () => reject(req.error);
            req.onsuccess = () => resolve(req.result || []);
        });
    }

    async _getById(db, id) {
        return new Promise((resolve, reject) => {
            const tx    = db.transaction('files', 'readonly');
            const store = tx.objectStore('files');
            const req   = store.get(id);
            req.onerror   = () => reject(req.error);
            req.onsuccess = () => resolve(req.result || null);
        });
    }

    async _addRecord(db, item) {
        return new Promise((resolve, reject) => {
            const tx    = db.transaction('files', 'readwrite');
            const store = tx.objectStore('files');
            const req   = store.add(item);
            req.onerror   = () => reject(req.error);
            req.onsuccess = () => resolve(req.result);
            tx.onerror    = () => reject(tx.error);
        });
    }

    async _putRecord(db, item) {
        return new Promise((resolve, reject) => {
            const tx    = db.transaction('files', 'readwrite');
            const store = tx.objectStore('files');
            const req   = store.put(item);
            req.onerror   = () => reject(req.error);
            req.onsuccess = () => resolve(req.result);
            tx.onerror    = () => reject(tx.error);
        });
    }

    async _deleteRecord(db, id) {
        return new Promise((resolve, reject) => {
            const tx    = db.transaction('files', 'readwrite');
            const store = tx.objectStore('files');
            const req   = store.delete(id);
            req.onerror   = () => reject(req.error);
            req.onsuccess = () => resolve(true);
            tx.onerror    = () => reject(tx.error);
        });
    }

    /* =========================================
     * INTERNAL — Path helpers
     * ========================================= */

    /**
     * Split a path string into { dbName, segments }.
     *
     * "mydb/folder/sub/file.json"
     *   → { dbName: 'mydb', segments: ['folder', 'sub', 'file.json'] }
     *
     * "mydb"
     *   → { dbName: 'mydb', segments: [] }
     */
    _parsePath(path) {
        if (typeof path !== 'string' || !path.trim()) {
            throw new Error('Path must be a non-empty string');
        }
        const parts = path.replace(/^\/+|\/+$/g, '').split('/').map(s => s.trim()).filter(Boolean);
        if (parts.length === 0) throw new Error(`Invalid path: "${path}"`);

        return { dbName: parts[0], segments: parts.slice(1) };
    }

    /**
     * Walk the folder hierarchy defined by folderSegments, starting at root (parent = null).
     * Returns the ID of the deepest folder, or null if folderSegments is empty (= root).
     *
     * When createMissing = true, missing intermediate folders are created automatically.
     * When createMissing = false, a missing folder throws an error.
     *
     * @param {IDBDatabase} db
     * @param {string[]}    folderSegments
     * @param {boolean}     createMissing
     * @param {any[]}       [allItems]   — optional pre-fetched records (avoids extra getAll call)
     * @returns {Promise<string|null>}
     */
    async _resolveFolderPath(db, folderSegments, createMissing = false, allItems = null) {
        if (folderSegments.length === 0) return null;

        // Fetch all records once; we'll push new folders into this array to avoid
        // repeated round-trips during deep creates.
        const all = allItems || await this._getAll(db);

        let parentId = null;

        for (const seg of folderSegments) {
            const existing = all.find(item =>
                item.type   === 'folder' &&
                (item.name === seg || item.filename === seg) &&
                item.parent === parentId
            );

            if (existing) {
                parentId = existing.id;
            } else if (createMissing) {
                const folder = {
                    id:       this._uuid(),
                    name:     seg,
                    filename: seg,
                    type:     'folder',
                    parent:   parentId,
                    size:     0,
                    created:  Date.now(),
                    modified: Date.now()
                };
                await this._addRecord(db, folder);
                all.push(folder);           // keep local list in sync
                parentId = folder.id;
            } else {
                throw new Error(`Folder not found: "${seg}"`);
            }
        }

        return parentId;
    }

    /**
     * Find a file record by name under a given parent ID.
     * @param {any[]}       all      — pre-fetched records
     * @param {string}      filename
     * @param {string|null} parentId
     * @returns {object|null}
     */
    _findFile(all, filename, parentId) {
        return all.find(item =>
            item.type === 'file' &&
            item.filename === filename &&
            item.parent   === parentId
        ) || null;
    }

    /**
     * Find a folder record by name under a given parent ID.
     */
    _findFolder(all, name, parentId) {
        return all.find(item =>
            item.type === 'folder' &&
            (item.name === name || item.filename === name) &&
            item.parent === parentId
        ) || null;
    }

    /**
     * Recursively delete a folder and all its children.
     * @param {IDBDatabase}  db
     * @param {string}       folderId
     * @param {any[]}        all
     */
    async _deleteFolderRecursive(db, folderId, all) {
        const children = all.filter(item => item.parent === folderId);

        for (const child of children) {
            if (child.type === 'folder') {
                await this._deleteFolderRecursive(db, child.id, all);
            }
            await this._deleteRecord(db, child.id);
        }

        // Delete the folder record itself
        if (folderId !== null) {
            await this._deleteRecord(db, folderId);
        }
    }

    /* =========================================
     * DATABASE OPERATIONS
     * ========================================= */

    /**
     * Create a new (empty) database.
     *
     * @example
     *   await api.createDB('mydb');
     *
     * @param {string} dbName
     * @returns {Promise<{success:true, db:string}>}
     */
    async createDB(dbName) {
        if (!dbName || typeof dbName !== 'string') throw new Error('Database name required');
        await this._openDB(dbName);
        return { success: true, db: dbName };
    }

    /**
     * Delete a database entirely.
     *
     * @example
     *   await api.deleteDB('mydb');
     *
     * @param {string} dbName
     * @returns {Promise<{success:true, deleted:string}>}
     */
    async deleteDB(dbName) {
        if (!dbName) throw new Error('Database name required');

        // Close and remove from cache first
        if (this._cache[dbName]) {
            this._cache[dbName].close();
            delete this._cache[dbName];
        }

        return new Promise((resolve, reject) => {
            const req = indexedDB.deleteDatabase(dbName);
            req.onerror   = () => reject(new Error(`Cannot delete DB "${dbName}": ${req.error?.message}`));
            req.onsuccess = () => resolve({ success: true, deleted: dbName });
            req.onblocked = () => {
                // Another tab may have the DB open; resolve anyway
                console.warn(`deleteDB("${dbName}") is blocked — close other tabs using this database`);
                resolve({ success: true, deleted: dbName, blocked: true });
            };
        });
    }

    /**
     * List all IndexedDB databases in the browser.
     *
     * @example
     *   const dbs = await api.listDBs();
     *   // [{ name: 'mydb', version: 1 }, ...]
     *
     * @returns {Promise<Array<{name:string, version:number}>>}
     */
    async listDBs() {
        if (typeof indexedDB.databases !== 'function') {
            throw new Error('indexedDB.databases() is not supported in this browser (try Chrome/Edge)');
        }
        const dbs = await indexedDB.databases();
        return dbs.map(d => ({ name: d.name, version: d.version }));
    }

    /* =========================================
     * FOLDER OPERATIONS
     * ========================================= */

    /**
     * Create a folder (and all missing parent folders along the path).
     *
     * @example
     *   await api.createFolder('mydb/users');
     *   await api.createFolder('mydb/users/reports/2024');  // creates all intermediate folders
     *
     * @param {string} path  — "dbname/folder" or "dbname/folder/subfolder"
     * @returns {Promise<{success:true, path:string}>}
     */
    async createFolder(path) {
        const { dbName, segments } = this._parsePath(path);
        if (segments.length === 0) throw new Error('Folder path required after the database name');

        const db = await this._openDB(dbName);
        await this._resolveFolderPath(db, segments, true);   // create missing = true
        return { success: true, path };
    }

    /**
     * Delete a folder and ALL its contents (files + sub-folders) recursively.
     *
     * @example
     *   await api.deleteFolder('mydb/users/reports');
     *
     * @param {string} path
     * @returns {Promise<{success:true, path:string, deletedItems:number}>}
     */
    async deleteFolder(path) {
        const { dbName, segments } = this._parsePath(path);
        if (segments.length === 0) throw new Error('Folder path required (use deleteDB to delete the whole database)');

        const db  = await this._openDB(dbName);
        const all = await this._getAll(db);

        // Resolve the target folder
        const folderSegs  = segments;
        const folderName  = folderSegs[folderSegs.length - 1];
        const parentSegs  = folderSegs.slice(0, -1);
        const parentId    = await this._resolveFolderPath(db, parentSegs, false, all);
        const folder      = this._findFolder(all, folderName, parentId);

        if (!folder) throw new Error(`Folder not found: "${path}"`);

        const before = all.length;
        await this._deleteFolderRecursive(db, folder.id, all);
        const after  = (await this._getAll(db)).length;

        return { success: true, path, deletedItems: before - after };
    }

    /**
     * Rename a folder.
     *
     * @example
     *   await api.renameFolder('mydb/oldname', 'newname');
     *
     * @param {string} path     — full path to the folder
     * @param {string} newName  — new name only (not a full path)
     * @returns {Promise<{success:true, path:string, newName:string}>}
     */
    async renameFolder(path, newName) {
        if (!newName) throw new Error('newName required');
        const { dbName, segments } = this._parsePath(path);
        if (segments.length === 0) throw new Error('Folder path required');

        const db       = await this._openDB(dbName);
        const all      = await this._getAll(db);
        const name     = segments[segments.length - 1];
        const pSegs    = segments.slice(0, -1);
        const parentId = await this._resolveFolderPath(db, pSegs, false, all);
        const folder   = this._findFolder(all, name, parentId);

        if (!folder) throw new Error(`Folder not found: "${path}"`);

        await this._putRecord(db, { ...folder, name: newName, filename: newName, modified: Date.now() });
        return { success: true, path, newName };
    }

    /* =========================================
     * LIST  (works for both db root and folders)
     * ========================================= */

    /**
     * List direct children of a path (database root or folder).
     *
     * @example
     *   await api.list('mydb');               // root-level items
     *   await api.list('mydb/users');         // items inside 'users'
     *   await api.list('mydb/users/reports'); // items inside nested folder
     *
     * @param {string} path
     * @returns {Promise<Array<{name, type, size, created, modified, id}>>}
     */
    async list(path) {
        const { dbName, segments } = this._parsePath(path);
        const db       = await this._openDB(dbName);
        const all      = await this._getAll(db);
        const parentId = segments.length > 0
            ? await this._resolveFolderPath(db, segments, false, all)
            : null;

        return all
            .filter(item => item.parent === parentId)
            .map(item => ({
                name:     item.filename || item.name,
                type:     item.type,
                size:     item.size  || 0,
                created:  item.created,
                modified: item.modified,
                id:       item.id
            }));
    }

    /* =========================================
     * FILE CRUD
     * ========================================= */

    /**
     * READ — get a file's content and metadata.
     *
     * @example
     *   const result = await api.read('mydb/users/data.json');
     *   console.log(result.content);   // { name: 'John' }
     *
     * @param {string} path
     * @returns {Promise<{path, filename, content, size, created, modified, id}>}
     */
    async read(path) {
        const { dbName, segments } = this._parsePath(path);
        if (segments.length === 0) throw new Error(`Path must point to a file, not a database: "${path}"`);

        const filename    = segments[segments.length - 1];
        const folderSegs  = segments.slice(0, -1);

        const db       = await this._openDB(dbName);
        const all      = await this._getAll(db);
        const parentId = await this._resolveFolderPath(db, folderSegs, false, all);
        const file     = this._findFile(all, filename, parentId);

        if (!file) throw new Error(`File not found: "${path}"`);

        return {
            path,
            filename: file.filename,
            content:  file.content,
            size:     file.size,
            created:  file.created,
            modified: file.modified,
            id:       file.id
        };
    }

    /**
     * WRITE — create a NEW file.
     * Auto-creates any missing intermediate folders.
     * Throws if the file already exists (use update() or upsert()).
     *
     * @example
     *   await api.write('mydb/users/data.json',        { name: 'John' });
     *   await api.write('mydb/users/notes.txt',        'Hello world');
     *   await api.write('mydb/users/reports/q1.json',  [1, 2, 3]);
     *
     * @param {string} path
     * @param {*}      content  — any JSON-serialisable value, plain string, or Blob
     * @returns {Promise<{success:true, path, id}>}
     */
    async write(path, content) {
        const { dbName, segments } = this._parsePath(path);
        if (segments.length === 0) throw new Error(`Path must point to a file, not a database: "${path}"`);

        const filename   = segments[segments.length - 1];
        const folderSegs = segments.slice(0, -1);

        const db       = await this._openDB(dbName);
        const all      = await this._getAll(db);
        const parentId = await this._resolveFolderPath(db, folderSegs, true, all);  // auto-create

        if (this._findFile(all, filename, parentId)) {
            throw new Error(`File already exists: "${path}". Use update() to overwrite or upsert() to create-or-update.`);
        }

        const file = {
            id:       this._uuid(),
            filename,
            content,
            parent:   parentId,
            type:     'file',
            size:     this._sizeOf(content),
            created:  Date.now(),
            modified: Date.now(),
            _isBinary: content instanceof Blob
        };

        await this._addRecord(db, file);
        return { success: true, path, id: file.id };
    }

    /**
     * UPDATE — overwrite an EXISTING file's content.
     * Throws if the file does not exist (use write() or upsert()).
     *
     * @example
     *   await api.update('mydb/users/data.json', { name: 'Jane' });
     *
     * @param {string} path
     * @param {*}      content
     * @returns {Promise<{success:true, path, id}>}
     */
    async update(path, content) {
        const { dbName, segments } = this._parsePath(path);
        if (segments.length === 0) throw new Error(`Path must point to a file, not a database: "${path}"`);

        const filename   = segments[segments.length - 1];
        const folderSegs = segments.slice(0, -1);

        const db       = await this._openDB(dbName);
        const all      = await this._getAll(db);
        const parentId = await this._resolveFolderPath(db, folderSegs, false, all);
        const existing = this._findFile(all, filename, parentId);

        if (!existing) {
            throw new Error(`File not found: "${path}". Use write() to create it or upsert() to create-or-update.`);
        }

        const updated = {
            ...existing,
            content,
            size:      this._sizeOf(content),
            modified:  Date.now(),
            _isBinary: content instanceof Blob
        };

        await this._putRecord(db, updated);
        return { success: true, path, id: updated.id };
    }

    /**
     * UPSERT — create if not exists, overwrite if it does.
     * Never throws for existence reasons — always succeeds.
     * Auto-creates missing folders.
     *
     * @example
     *   await api.upsert('mydb/config/settings.json', { theme: 'dark' });
     *
     * @param {string} path
     * @param {*}      content
     * @returns {Promise<{success:true, path, id, created:boolean}>}
     */
    async upsert(path, content) {
        const { dbName, segments } = this._parsePath(path);
        if (segments.length === 0) throw new Error(`Path must point to a file, not a database: "${path}"`);

        const filename   = segments[segments.length - 1];
        const folderSegs = segments.slice(0, -1);

        const db       = await this._openDB(dbName);
        const all      = await this._getAll(db);
        const parentId = await this._resolveFolderPath(db, folderSegs, true, all);  // auto-create
        const existing = this._findFile(all, filename, parentId);

        const record = {
            id:        existing ? existing.id : this._uuid(),
            filename,
            content,
            parent:    parentId,
            type:      'file',
            size:      this._sizeOf(content),
            created:   existing ? existing.created : Date.now(),
            modified:  Date.now(),
            _isBinary: content instanceof Blob
        };

        await this._putRecord(db, record);
        return { success: true, path, id: record.id, created: !existing };
    }

    /**
     * DELETE — remove a file.
     *
     * @example
     *   await api.delete('mydb/users/data.json');
     *
     * @param {string} path
     * @returns {Promise<{success:true, path, deleted:string}>}
     */
    async delete(path) {
        const { dbName, segments } = this._parsePath(path);
        if (segments.length === 0) throw new Error(`Path must point to a file, not a database: "${path}"`);

        const filename   = segments[segments.length - 1];
        const folderSegs = segments.slice(0, -1);

        const db       = await this._openDB(dbName);
        const all      = await this._getAll(db);
        const parentId = await this._resolveFolderPath(db, folderSegs, false, all);
        const file     = this._findFile(all, filename, parentId);

        if (!file) throw new Error(`File not found: "${path}"`);

        await this._deleteRecord(db, file.id);
        return { success: true, path, deleted: filename };
    }

    /* =========================================
     * EXTRA FILE OPERATIONS
     * ========================================= */

    /**
     * RENAME — rename a file in-place (same folder).
     *
     * @example
     *   await api.rename('mydb/users/old.json', 'new.json');
     *
     * @param {string} path     — full path to the file
     * @param {string} newName  — new filename only (not a full path)
     * @returns {Promise<{success:true, path, newName}>}
     */
    async rename(path, newName) {
        if (!newName) throw new Error('newName required');
        const { dbName, segments } = this._parsePath(path);
        if (segments.length === 0) throw new Error(`Path must point to a file: "${path}"`);

        const filename   = segments[segments.length - 1];
        const folderSegs = segments.slice(0, -1);

        const db       = await this._openDB(dbName);
        const all      = await this._getAll(db);
        const parentId = await this._resolveFolderPath(db, folderSegs, false, all);
        const file     = this._findFile(all, filename, parentId);

        if (!file) throw new Error(`File not found: "${path}"`);

        await this._putRecord(db, { ...file, filename: newName, modified: Date.now() });
        return { success: true, path, newName };
    }

    /**
     * MOVE — move a file to a different path within the same database.
     * Auto-creates missing destination folders.
     *
     * @example
     *   await api.move('mydb/inbox/report.json', 'mydb/archive/2024/report.json');
     *
     * @param {string} sourcePath
     * @param {string} destPath
     * @returns {Promise<{success:true, from, to}>}
     */
    async move(sourcePath, destPath) {
        const src = this._parsePath(sourcePath);
        const dst = this._parsePath(destPath);

        if (src.dbName !== dst.dbName) {
            throw new Error('Cross-database moves are not supported. Use copy() + delete() instead.');
        }
        if (src.segments.length === 0) throw new Error(`sourcePath must point to a file: "${sourcePath}"`);
        if (dst.segments.length === 0) throw new Error(`destPath must point to a file: "${destPath}"`);

        const db    = await this._openDB(src.dbName);
        const all   = await this._getAll(db);

        // Resolve source
        const srcFile    = src.segments[src.segments.length - 1];
        const srcFolders = src.segments.slice(0, -1);
        const srcParent  = await this._resolveFolderPath(db, srcFolders, false, all);
        const srcRecord  = this._findFile(all, srcFile, srcParent);
        if (!srcRecord) throw new Error(`Source file not found: "${sourcePath}"`);

        // Resolve destination (create missing folders)
        const dstFile    = dst.segments[dst.segments.length - 1];
        const dstFolders = dst.segments.slice(0, -1);
        const dstParent  = await this._resolveFolderPath(db, dstFolders, true, all);

        await this._putRecord(db, {
            ...srcRecord,
            filename: dstFile,
            parent:   dstParent,
            modified: Date.now()
        });

        return { success: true, from: sourcePath, to: destPath };
    }

    /**
     * COPY — duplicate a file to another path.
     * Auto-creates missing destination folders.
     *
     * @example
     *   await api.copy('mydb/templates/base.json', 'mydb/users/profile.json');
     *
     * @param {string} sourcePath
     * @param {string} destPath
     * @returns {Promise<{success:true, from, to, newId}>}
     */
    async copy(sourcePath, destPath) {
        const srcData = await this.read(sourcePath);
        const result  = await this.write(destPath, srcData.content);
        return { success: true, from: sourcePath, to: destPath, newId: result.id };
    }

    /* =========================================
     * QUERY / INTROSPECTION
     * ========================================= */

    /**
     * EXISTS — check whether a file or folder exists.
     *
     * @example
     *   await api.exists('mydb/users/data.json');  // true / false
     *   await api.exists('mydb/users');             // true / false
     *
     * @param {string} path
     * @returns {Promise<boolean>}
     */
    async exists(path) {
        try {
            const { dbName, segments } = this._parsePath(path);
            const db  = await this._openDB(dbName);
            const all = await this._getAll(db);

            if (segments.length === 0) return true;  // database itself exists if we got here

            const name     = segments[segments.length - 1];
            const pSegs    = segments.slice(0, -1);
            const parentId = await this._resolveFolderPath(db, pSegs, false, all);

            return !!(
                this._findFile(all, name, parentId) ||
                this._findFolder(all, name, parentId)
            );
        } catch {
            return false;
        }
    }

    /**
     * INFO — get metadata for a file or folder without fetching the full content.
     *
     * @example
     *   const meta = await api.info('mydb/users/data.json');
     *   console.log(meta.size, meta.modified);
     *
     * @param {string} path
     * @returns {Promise<{name, type, size, created, modified, id, path}>}
     */
    async info(path) {
        const { dbName, segments } = this._parsePath(path);
        if (segments.length === 0) throw new Error(`Path must point to a file or folder, not a database: "${path}"`);

        const name     = segments[segments.length - 1];
        const pSegs    = segments.slice(0, -1);

        const db       = await this._openDB(dbName);
        const all      = await this._getAll(db);
        const parentId = await this._resolveFolderPath(db, pSegs, false, all);

        const item = this._findFile(all, name, parentId) || this._findFolder(all, name, parentId);
        if (!item) throw new Error(`Not found: "${path}"`);

        return {
            path,
            name:     item.filename || item.name,
            type:     item.type,
            size:     item.size  || 0,
            created:  item.created,
            modified: item.modified,
            id:       item.id
        };
    }

    /**
     * SEARCH — find files matching a query string anywhere in the database.
     *
     * @example
     *   const results = await api.search('mydb', 'report');
     *   const results = await api.search('mydb/users', 'profile');
     *
     * @param {string} path   — "dbname" or "dbname/folder" to scope the search
     * @param {string} query  — case-insensitive substring to match against filenames
     * @returns {Promise<Array<{name, size, modified, id, parentId}>>}
     */
    async search(path, query) {
        if (!query) throw new Error('Search query required');

        const { dbName } = this._parsePath(path);
        const db  = await this._openDB(dbName);
        const all = await this._getAll(db);
        const q   = query.toLowerCase();

        return all
            .filter(item => item.type === 'file' && (item.filename || '').toLowerCase().includes(q))
            .map(item => ({
                name:     item.filename,
                size:     item.size    || 0,
                modified: item.modified,
                id:       item.id,
                parentId: item.parent
            }));
    }

    /**
     * CLEAR — delete every file and folder inside a database, keeping the database itself.
     *
     * @example
     *   await api.clear('mydb');
     *
     * @param {string} dbName
     * @returns {Promise<{success:true, db, deletedItems:number}>}
     */
    async clear(dbName) {
        if (!dbName) throw new Error('Database name required');
        const db    = await this._openDB(dbName);
        const count = (await this._getAll(db)).length;

        return new Promise((resolve, reject) => {
            const tx    = db.transaction('files', 'readwrite');
            const store = tx.objectStore('files');
            const req   = store.clear();
            req.onerror   = () => reject(req.error);
            req.onsuccess = () => resolve({ success: true, db: dbName, deletedItems: count });
        });
    }
}

/* =========================================
 * SINGLETON & EXPORTS
 * ========================================= */

/** Ready-to-use singleton — just import the file and use `webdb.*` */
const webdb = new WebDBAPI();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { WebDBAPI, webdb };
}

/* =========================================
 * USAGE EXAMPLES (reference, not executed)
 * =========================================

// ── Database ──────────────────────────────────────────────────────────────────
await webdb.createDB('shop');
await webdb.listDBs();
// [{ name: 'shop', version: 1 }, ...]
await webdb.deleteDB('shop');

// ── Folders ───────────────────────────────────────────────────────────────────
await webdb.createFolder('shop/products');
await webdb.createFolder('shop/products/electronics/phones');  // creates all
await webdb.list('shop');
// [{ name: 'products', type: 'folder', ... }]
await webdb.list('shop/products');
// [{ name: 'electronics', type: 'folder', ... }]
await webdb.renameFolder('shop/products/electronics', 'tech');
await webdb.deleteFolder('shop/products/tech');                 // recursive

// ── File CRUD ─────────────────────────────────────────────────────────────────
//  write  (create, error if exists)
await webdb.write('shop/products/item.json', { id: 1, name: 'Laptop', price: 999 });
await webdb.write('shop/notes.txt',          'Just a plain text note');

//  read
const file = await webdb.read('shop/products/item.json');
console.log(file.content);   // { id: 1, name: 'Laptop', price: 999 }

//  update  (must exist)
await webdb.update('shop/products/item.json', { id: 1, name: 'Laptop', price: 899 });

//  upsert  (create-or-update, never fails)
await webdb.upsert('shop/config/settings.json', { currency: 'USD', tax: 0.18 });

//  delete
await webdb.delete('shop/products/item.json');

// ── Extra operations ──────────────────────────────────────────────────────────
await webdb.rename('shop/notes.txt', 'readme.txt');
await webdb.move('shop/readme.txt', 'shop/docs/readme.txt');
await webdb.copy('shop/docs/readme.txt', 'shop/backup/readme.txt');

// ── Query ─────────────────────────────────────────────────────────────────────
await webdb.exists('shop/docs/readme.txt');                // true
await webdb.info  ('shop/docs/readme.txt');                // { name, type, size, ... }
await webdb.search('shop', 'readme');                      // [{ name, size, ... }]
await webdb.clear ('shop');                                // wipe all, keep DB

* =========================================
*/
