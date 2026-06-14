/**
 * =========================================
 * WebDB Manager Pro - JavaScript Core
 * =========================================
 * Reusable IndexedDB Manager Module
 * FIXED: Proper transaction handling
 */

/* ========================================= */
/* UTILITIES */
/* ========================================= */

/**
 * Generate UUID v4
 */
function uuid() {
    return 'xxx-yxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * Format bytes to human-readable size
 */
function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Format timestamp to readable date
 */
function formatDate(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Get MIME type from filename
 */
function getMimeType(filename) {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    const mimeTypes = {
        'json': 'application/json',
        'txt': 'text/plain',
        'html': 'text/html',
        'css': 'text/css',
        'js': 'application/javascript',
        'xml': 'application/xml',
        'pdf': 'application/pdf',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'svg': 'image/svg+xml'
    };
    return mimeTypes[ext] || 'application/octet-stream';
}

/* ========================================= */
/* DATABASE MANAGER CLASS */
/* ========================================= */

class DBManager {
    constructor() {
        this.db = null;
        this.currentDBName = null;
    }

    /**
     * Initialize or open database
     */
    async use(name) {
        return new Promise((resolve, reject) => {
            try {
                const request = indexedDB.open(name, 1);
                
                request.onerror = () => {
                    console.error('DB open error:', request.error);
                    reject(request.error);
                };
                
                request.onsuccess = () => {
                    this.db = request.result;
                    this.currentDBName = name;
                    console.log('DB opened:', name);
                    resolve(this.db);
                };
                
                request.onupgradeneeded = (e) => {
                    const db = e.target.result;
                    console.log('Creating object store...');
                    if (!db.objectStoreNames.contains('files')) {
                        db.createObjectStore('files', { keyPath: 'id' });
                    }
                };
            } catch (error) {
                console.error('Error opening database:', error);
                reject(error);
            }
        });
    }

    /**
     * List all IndexedDB databases
     */
    async listDatabases() {
        try {
            // Fallback for browsers that don't support indexedDB.databases()
            if (typeof indexedDB.databases === 'function') {
                const dbs = await indexedDB.databases();
                return dbs.map(db => ({
                    name: db.name,
                    version: db.version
                }));
            }
            return [];
        } catch (error) {
            console.error('Error listing databases:', error);
            return [];
        }
    }

    /**
     * Drop/delete a database
     */
    async dropDatabase(name) {
        return new Promise((resolve, reject) => {
            try {
                const request = indexedDB.deleteDatabase(name);
                request.onerror = () => reject(request.error);
                request.onsuccess = () => {
                    console.log('Database deleted:', name);
                    resolve();
                };
            } catch (error) {
                console.error('Error deleting database:', error);
                reject(error);
            }
        });
    }
}

/* ========================================= */
/* STORE ADAPTER CLASS */
/* ========================================= */

class StoreAdapter {
    constructor(db, dbName) {
        this.db = db;
        this.dbName = dbName;
    }

    /**
     * Helper to get transaction
     */
    getTransaction(mode = 'readonly') {
        return this.db.transaction('files', mode);
    }

    /**
     * Helper to get store
     */
    getStore(mode = 'readonly') {
        return this.getTransaction(mode).objectStore('files');
    }

    /**
     * Add item to store
     */
    async add(item) {
        return new Promise((resolve, reject) => {
            try {
                const tx = this.getTransaction('readwrite');
                const store = tx.objectStore('files');
                const request = store.add(item);
                
                request.onerror = () => reject(request.error);
                request.onsuccess = () => resolve(request.result);
                
                tx.onerror = () => reject(tx.error);
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Update item in store
     */
    async update(item) {
        return new Promise((resolve, reject) => {
            try {
                const tx = this.getTransaction('readwrite');
                const store = tx.objectStore('files');
                const request = store.put(item);
                
                request.onerror = () => reject(request.error);
                request.onsuccess = () => resolve(request.result);
                
                tx.onerror = () => reject(tx.error);
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Get raw record by ID
     */
    async getRaw(id) {
        return new Promise((resolve, reject) => {
            try {
                const tx = this.getTransaction('readonly');
                const store = tx.objectStore('files');
                const request = store.get(id);
                
                request.onerror = () => reject(request.error);
                request.onsuccess = () => resolve(request.result);
                
                tx.onerror = () => reject(tx.error);
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Remove item from store
     */
    async remove(id) {
        return new Promise((resolve, reject) => {
            try {
                const tx = this.getTransaction('readwrite');
                const store = tx.objectStore('files');
                const request = store.delete(id);
                
                request.onerror = () => reject(request.error);
                request.onsuccess = () => resolve();
                
                tx.onerror = () => reject(tx.error);
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Save file with content
     */
    async save(filename, content, parent = null, id = null) {
        try {
            let existingFile = null;
            if (id) {
                existingFile = await this.getRaw(id);
            }

            const file = {
                id: id || uuid(),
                filename,
                content,
                parent: parent || null,
                type: 'file',
                size: typeof content === 'string' ? content.length : (content.size || 0),
                created: existingFile?.created || Date.now(),
                modified: Date.now(),
                _isBinary: content instanceof Blob
            };

            if (id && existingFile) {
                return await this.update(file);
            } else {
                return await this.add(file);
            }
        } catch (error) {
            console.error('Error saving file:', error);
            throw error;
        }
    }

    /**
     * Get all records
     */
    async getAll() {
        return new Promise((resolve, reject) => {
            try {
                const tx = this.getTransaction('readonly');
                const store = tx.objectStore('files');
                const request = store.getAll();
                
                request.onerror = () => reject(request.error);
                request.onsuccess = () => resolve(request.result || []);
                
                tx.onerror = () => reject(tx.error);
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Clear all records
     */
    async clear() {
        return new Promise((resolve, reject) => {
            try {
                const tx = this.getTransaction('readwrite');
                const store = tx.objectStore('files');
                const request = store.clear();
                
                request.onerror = () => reject(request.error);
                request.onsuccess = () => resolve();
                
                tx.onerror = () => reject(tx.error);
            } catch (error) {
                reject(error);
            }
        });
    }
}

/* ========================================= */
/* TREE BUILDER */
/* ========================================= */

const expanded = {};

/**
 * Build tree structure from items
 */
function buildTree(parentId = null) {
    const items = explorer?.items || [];
    return items.filter(i => i.parent === parentId);
}

/* ========================================= */
/* UI EXPLORER CLASS */
/* ========================================= */

class UIExplorer {
    constructor() {
        this.items = [];
        this.currentStore = null;
        this.currentDBName = null;
    }

    /**
     * Switch to different database
     */
    async switchDB(dbName) {
        try {
            console.log('Switching to database:', dbName);
            await dbManager.use(dbName);
            this.currentDBName = dbName;
            this.currentStore = new StoreAdapter(dbManager.db, dbName);
            await this.refresh();
            await this.renderDBs();
        } catch (error) {
            console.error('Error switching database:', error);
            alert('Error switching database: ' + error.message);
        }
    }

    /**
     * Refresh items from store
     */
    async refresh() {
        try {
            if (!this.currentStore) {
                console.warn('No current store');
                return;
            }
            
            this.items = await this.currentStore.getAll();
            this.render();
            refreshTree();
        } catch (error) {
            console.error('Error refreshing:', error);
        }
    }

    /**
     * Render database list
     */
    async renderDBs() {
        try {
            const dbs = await dbManager.listDatabases();
            const dbList = document.getElementById('db-list');
            
            if (!dbList) {
                console.warn('db-list element not found');
                return;
            }
            
            if (!dbs || dbs.length === 0) {
                dbList.innerHTML = '<p style="color: var(--text-muted); padding: 10px;">No databases</p>';
                return;
            }
            
            dbList.innerHTML = dbs.map(db => `
                <div class="db-row ${this.currentDBName === db.name ? 'db-active' : ''}" 
                     onclick="explorer.switchDB('${db.name}')">
                    <span>${db.name}</span>
                    <button class="btn-danger-text btn" onclick="event.stopPropagation(); deleteDatabase('${db.name}')">🗑️</button>
                </div>
            `).join('');
        } catch (error) {
            console.error('Error rendering databases:', error);
        }
    }

    /**
     * Render file table with improved information
     */
    render() {
        try {
            const searchInput = document.getElementById('search-input');
            const q = searchInput ? searchInput.value.toLowerCase() : '';
            
            const filtered = this.items.filter(f => 
                f.filename && f.filename.toLowerCase().includes(q)
            );

            const rows = filtered.map(f => {
                const size = typeof f.size === 'number' ? formatBytes(f.size) : 'N/A';
                const modified = f.modified ? formatDate(f.modified) : 'N/A';
                const created = f.created ? formatDate(f.created) : 'N/A';
                const statusClass = f.type === 'folder' ? 'folder' : 'file';
                
                return `
                    <tr>
                        <td><span class="cell-name">${f.filename || f.name}</span></td>
                        <td><span class="cell-type">${f.type.toUpperCase()}</span></td>
                        <td><span class="cell-size">${size}</span></td>
                        <td><span class="cell-date">${created}</span></td>
                        <td><span class="cell-date">${modified}</span></td>
                        <td>
                            <span class="cell-status ${statusClass}">${f.type}</span>
                        </td>
                        <td>
                            ${f.type === 'file' ? `<button class="btn btn-outline" onclick="openEditor('${f.id}')">Edit</button>` : ''}
                            <button class="btn btn-outline" onclick="renameFile('${f.id}')">Rename</button>
                            <button class="btn btn-danger-text" onclick="deleteFile('${f.id}')">Delete</button>
                        </td>
                    </tr>
                `;
            }).join('');

            const tbody = document.getElementById('file-table');
            if (tbody) {
                tbody.innerHTML = rows || '<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 20px;">No files found</td></tr>';
            }
        } catch (error) {
            console.error('Error rendering table:', error);
        }
    }
}

/* ========================================= */
/* GLOBAL INSTANCES */
/* ========================================= */

const dbManager = new DBManager();
const explorer = new UIExplorer();

let currentFilename = '';
let currentParentname = null;
let currentFileId = null;
let originalData = '';
let dragItem = null;

/* ========================================= */
/* TREE FUNCTIONS */
/* ========================================= */

/**
 * Render tree view of files/folders
 */
function renderTree() {
    const container = document.getElementById('tree');
    if (!container) return;
    
    container.innerHTML = '';
    
    function render(parent, el) {
        const items = buildTree(parent);
        
        items.forEach(c => {
            const wrapper = document.createElement('div');
            const div = document.createElement('div');
            
            div.className = 'tree-item ' + c.type;
            div.textContent = c.name || c.filename;
            div.draggable = true;
            
            div.onclick = () => {
                if (c.type === 'folder') {
                    expanded[c.id] = !expanded[c.id];
                    renderTree();
                }
            };
            
            div.oncontextmenu = (e) => {
                e.preventDefault();
                showMenu(e, c);
            };
            
            div.ondragstart = () => { dragItem = c; };
            div.ondragover = e => {
                e.preventDefault();
                div.classList.add('drag-over');
            };
            div.ondragleave = () => div.classList.remove('drag-over');
            div.ondrop = async e => {
                e.preventDefault();
                div.classList.remove('drag-over');
                if (c.type === 'folder' && dragItem.id !== c.id) {
                    dragItem.parent = c.id;
                    await explorer.currentStore.update(dragItem);
                    refreshTree();
                }
            };
            
            wrapper.appendChild(div);
            
            if (c.type === 'folder') {
                const child = document.createElement('div');
                child.className = 'children';
                child.style.marginLeft = '15px';
                if (!expanded[c.id]) child.style.display = 'none';
                wrapper.appendChild(child);
                render(c.id, child);
            }
            
            el.appendChild(wrapper);
        });
    }
    
    render(null, container);
}

/**
 * Refresh tree view
 */
function refreshTree() {
    renderTree();
}

/**
 * Show context menu
 */
function showMenu(e, item) {
    const menu = document.getElementById('menu');
    if (!menu) return;
    
    menu.innerHTML = `
        <div onclick="renameFile('${item.id}')">Rename</div>
        <div onclick="deleteFile('${item.id}')">Delete</div>
        ${item.type === 'folder' ? `
            <div onclick="createFolder('${item.id}')">New Folder</div>
            <div onclick="createNewFile('${item.id}')">New File</div>
        ` : `
            <div onclick="openEditor('${item.id}')">Edit</div>
        `}
    `;
    
    menu.style.left = e.pageX + 'px';
    menu.style.top = e.pageY + 'px';
    menu.style.display = 'block';
}

/* ========================================= */
/* FILE OPERATIONS */
/* ========================================= */

/**
 * Create new folder
 */
async function createFolder(parent = null) {
    const name = prompt('Folder name:');
    if (!name) return;
    
    if (!explorer.currentStore) {
        alert('No database selected');
        return;
    }
    
    try {
        await explorer.currentStore.add({
            id: uuid(),
            name,
            type: 'folder',
            parent,
            created: Date.now(),
            modified: Date.now()
        });
        
        refreshTree();
        explorer.refresh();
    } catch (error) {
        alert('Error creating folder: ' + error.message);
    }
}

/**
 * Create new file
 */
async function createNewFile(parent = null) {
    const fn = prompt('New filename:');
    if (!fn) return;
    
    if (!explorer.currentStore) {
        alert('No database selected');
        return;
    }
    
    try {
        const content = fn.endsWith('.json') ? '{}' : '';
        await explorer.currentStore.save(fn, content, parent);
        explorer.refresh();
    } catch (error) {
        alert('Error creating file: ' + error.message);
    }
}

/**
 * Rename file or folder
 */
async function renameFile(id) {
    if (!explorer.currentStore) {
        alert('No database selected');
        return;
    }
    
    try {
        const rec = await explorer.currentStore.getRaw(id);
        if (!rec) {
            alert('Item not found');
            return;
        }
        
        const newName = prompt('New name:', rec.filename || rec.name);
        
        if (!newName || newName === (rec.filename || rec.name)) return;
        
        if (rec.type === 'file') {
            rec.filename = newName;
        } else {
            rec.name = newName;
        }
        
        rec.modified = Date.now();
        await explorer.currentStore.update(rec);
        explorer.refresh();
    } catch (error) {
        alert('Error renaming: ' + error.message);
    }
}

/**
 * Open file editor modal
 */
async function openEditor(id) {
    if (!explorer.currentStore) {
        alert('No database selected');
        return;
    }
    
    try {
        const record = await explorer.currentStore.getRaw(id);
        if (!record) {
            alert('File not found');
            return;
        }
        
        currentFilename = record.filename;
        currentParentname = record.parent;
        currentFileId = id;
        
        const isBin = record.content instanceof Blob;
        originalData = isBin 
            ? '[Binary Data]' 
            : (typeof record.content === 'object' 
                ? JSON.stringify(record.content, null, 2) 
                : record.content);
        
        const modalTitle = document.getElementById('modal-title');
        const modalContent = document.getElementById('modal-content');
        
        if (modalTitle) modalTitle.innerText = `Edit: ${currentFilename}`;
        if (modalContent) {
            modalContent.value = originalData;
            modalContent.readOnly = isBin;
        }
        
        checkChanges();
        
        const editModal = document.getElementById('edit-modal');
        const modalOverlay = document.getElementById('modal-overlay');
        
        if (editModal) editModal.classList.add('active');
        if (modalOverlay) modalOverlay.classList.add('active');
    } catch (error) {
        alert('Error opening file: ' + error.message);
    }
}

/**
 * Check for unsaved changes
 */
function checkChanges() {
    const modalContent = document.getElementById('modal-content');
    const saveBtn = document.getElementById('save-file-btn');
    const changeIndicator = document.getElementById('change-indicator');
    
    if (!modalContent) return;
    
    const current = modalContent.value;
    const changed = current !== originalData;
    
    if (saveBtn) saveBtn.disabled = !changed;
    if (changeIndicator) changeIndicator.style.display = changed ? 'block' : 'none';
}

/**
 * Close editor modal
 */
function closeModal(force = false) {
    const modalContent = document.getElementById('modal-content');
    
    if (!force && modalContent && modalContent.value !== originalData) {
        if (!confirm('Discard unsaved changes?')) return;
    }
    
    const editModal = document.getElementById('edit-modal');
    const modalOverlay = document.getElementById('modal-overlay');
    
    if (editModal) editModal.classList.remove('active');
    if (modalOverlay) modalOverlay.classList.remove('active');
}

/**
 * Save file content
 */
async function handleSave() {
    const modalContent = document.getElementById('modal-content');
    if (!modalContent) return;
    
    if (!explorer.currentStore) {
        alert('No database selected');
        return;
    }
    
    try {
        const content = modalContent.value;
        let final = content;
        
        if (currentFilename.endsWith('.json')) {
            try {
                final = JSON.parse(content);
            } catch (e) {
                alert('Invalid JSON: ' + e.message);
                return;
            }
        }
        
        await explorer.currentStore.save(currentFilename, final, currentParentname, currentFileId);
        originalData = content;
        closeModal(true);
        explorer.refresh();
    } catch (error) {
        alert('Error saving: ' + error.message);
    }
}

/**
 * Delete file or folder
 */
async function deleteFile(id) {
    if (!confirm('Delete this item?')) return;
    
    if (!explorer.currentStore) {
        alert('No database selected');
        return;
    }
    
    try {
        await explorer.currentStore.remove(id);
        explorer.refresh();
    } catch (error) {
        alert('Error deleting: ' + error.message);
    }
}

/* ========================================= */
/* DATABASE OPERATIONS */
/* ========================================= */

/**
 * Create new database
 */
async function createNewDB() {
    const name = prompt('Database name:');
    if (!name) return;
    
    try {
        await dbManager.use(name);
        explorer.switchDB(name);
    } catch (error) {
        alert('Error creating database: ' + error.message);
    }
}

/**
 * Delete database
 */
async function deleteDatabase(name) {
    if (!confirm(`Delete database "${name}"?`)) return;
    
    try {
        await dbManager.dropDatabase(name);
        location.reload();
    } catch (error) {
        alert('Error deleting database: ' + error.message);
    }
}

/* ========================================= */
/* IMPORT/EXPORT FUNCTIONS */
/* ========================================= */

/**
 * Export database as JSON
 */
async function handleDBExport() {
    if (!explorer.currentStore) {
        alert('No database selected');
        return;
    }
    
    try {
        const items = await explorer.currentStore.getAll();
        const jsonStr = JSON.stringify(items, null, 2);
        
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `webdb-${explorer.currentDBName}-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        alert('Database exported successfully!');
    } catch (error) {
        alert('Error exporting: ' + error.message);
    }
}

/**
 * Import database from JSON (single database)
 */
async function handleFileImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    if (!explorer.currentStore) {
        alert('No database selected');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = async (ev) => {
        try {
            const data = JSON.parse(ev.target.result);
            
            // Check if it's a multi-database backup
            if (data.backupType === 'all-databases' && data.databases) {
                alert('This is an ALL DATABASES backup. Use "Import All Databases" instead.');
                return;
            }
            
            if (!Array.isArray(data)) {
                alert('Invalid file format. Expected JSON array.');
                return;
            }
            
            let importedCount = 0;
            for (let item of data) {
                try {
                    if (item._isBinary && typeof item.content === 'string') {
                        try {
                            const resp = await fetch(item.content);
                            item.content = await resp.blob();
                        } catch (err) {
                            console.warn('Could not fetch binary data:', err);
                        }
                    }
                    
                    item.id = item.id || uuid();
                    await explorer.currentStore.add(item);
                    importedCount++;
                } catch (itemError) {
                    console.warn('Could not import item:', itemError);
                }
            }
            
            alert(`Successfully imported ${importedCount} items to database "${explorer.currentDBName}"`);
            explorer.refresh();
            
            // Reset file input
            e.target.value = '';
        } catch (error) {
            alert('Error importing file: ' + error.message);
        }
    };
    reader.readAsText(file);
}

/**
 * Backup ALL databases to single file
 */
async function handleAllDBsExport() {
    try {
        console.log('Starting backup of all databases...');
        
        const dbs = await dbManager.listDatabases();
        
        if (!dbs || dbs.length === 0) {
            alert('No databases to backup');
            return;
        }
        
        const allDatabasesData = {
            backupType: 'all-databases',
            backupDate: new Date().toISOString(),
            backupVersion: '1.0',
            totalDatabases: dbs.length,
            databases: {}
        };
        
        // Collect data from all databases
        for (let db of dbs) {
            try {
                console.log(`Backing up database: ${db.name}`);
                await dbManager.use(db.name);
                const store = new StoreAdapter(dbManager.db, db.name);
                const items = await store.getAll();
                
                allDatabasesData.databases[db.name] = {
                    version: db.version,
                    itemCount: items.length,
                    files: items
                };
                
                console.log(`✓ Backed up ${items.length} items from ${db.name}`);
            } catch (error) {
                console.error(`Error backing up ${db.name}:`, error);
                allDatabasesData.databases[db.name] = {
                    error: error.message,
                    version: db.version
                };
            }
        }
        
        // Create backup file
        const jsonStr = JSON.stringify(allDatabasesData, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `webdb-all-databases-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        alert(`✅ Successfully backed up ${dbs.length} databases!\n\nFile: webdb-all-databases-${Date.now()}.json`);
        console.log('All databases backup completed');
    } catch (error) {
        console.error('Error backing up all databases:', error);
        alert('Error backing up databases: ' + error.message);
    }
}

/**
 * Import ALL databases from single file
 */
async function handleAllDBsImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async (ev) => {
        try {
            const data = JSON.parse(ev.target.result);
            
            // Validate backup format
            if (data.backupType !== 'all-databases' || !data.databases) {
                alert('Invalid backup format. This must be an ALL DATABASES backup file.');
                return;
            }
            
            const dbNames = Object.keys(data.databases);
            let successCount = 0;
            let failureCount = 0;
            
            console.log(`Importing ${dbNames.length} databases...`);
            
            // Import each database
            for (let dbName of dbNames) {
                try {
                    const dbData = data.databases[dbName];
                    
                    if (dbData.error) {
                        console.warn(`Skipping ${dbName} (had error in backup)`);
                        failureCount++;
                        continue;
                    }
                    
                    console.log(`Importing database: ${dbName}`);
                    
                    // Open/create database
                    await dbManager.use(dbName);
                    const store = new StoreAdapter(dbManager.db, dbName);
                    
                    // Import files
                    const files = dbData.files || [];
                    let itemsImported = 0;
                    
                    for (let item of files) {
                        try {
                            if (item._isBinary && typeof item.content === 'string') {
                                try {
                                    const resp = await fetch(item.content);
                                    item.content = await resp.blob();
                                } catch (err) {
                                    console.warn('Could not fetch binary for:', item.filename);
                                }
                            }
                            
                            item.id = item.id || uuid();
                            await store.add(item);
                            itemsImported++;
                        } catch (itemError) {
                            // Item might already exist, skip
                            console.warn(`Could not import item ${item.filename}:`, itemError.message);
                        }
                    }
                    
                    console.log(`✓ Imported ${itemsImported}/${files.length} items to ${dbName}`);
                    successCount++;
                } catch (dbError) {
                    console.error(`Error importing database ${dbName}:`, dbError);
                    failureCount++;
                }
            }
            
            // Show summary
            const summary = `
✅ Import Complete!

Total Databases: ${dbNames.length}
Successfully Imported: ${successCount}
Failed: ${failureCount}

Backup Date: ${new Date(data.backupDate).toLocaleString()}
            `.trim();
            
            alert(summary);
            
            // Reload to show all databases
            setTimeout(() => {
                location.reload();
            }, 1000);
            
            // Reset file input
            e.target.value = '';
        } catch (error) {
            console.error('Error importing all databases:', error);
            alert('Error importing backup: ' + error.message);
        }
    };
    reader.readAsText(file);
}

/* ========================================= */
/* EVENT LISTENERS & INITIALIZATION */
/* ========================================= */

document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM loaded, initializing WebDB Manager...');
    
    try {
        // Close menu when clicking elsewhere
        document.addEventListener('click', (e) => {
            if (e.target.id !== 'menu') {
                const menu = document.getElementById('menu');
                if (menu) menu.style.display = 'none';
            }
        });
        
        // Search input listener
        const searchInput = document.getElementById('search-input');
        if (searchInput) {
            searchInput.addEventListener('input', () => explorer.render());
        }
        
        // Modal content change listener
        const modalContent = document.getElementById('modal-content');
        if (modalContent) {
            modalContent.addEventListener('input', checkChanges);
        }
        
        // Save button listener
        const saveBtn = document.getElementById('save-file-btn');
        if (saveBtn) {
            saveBtn.addEventListener('click', handleSave);
        }
        
        // Import file listener
        const importFile = document.getElementById('importFile');
        if (importFile) {
            importFile.addEventListener('change', handleFileImport);
        }
        
        // Initialize with default database
        console.log('Initializing default database...');
        await explorer.switchDB('root');
        console.log('WebDB Manager initialized successfully!');
    } catch (error) {
        console.error('Initialization error:', error);
        alert('Error initializing WebDB Manager: ' + error.message);
    }
});

/* ========================================= */
/* EXPORT FOR MODULE USE */
/* ========================================= */

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        DBManager,
        StoreAdapter,
        UIExplorer,
        uuid,
        formatBytes,
        formatDate,
        getMimeType,
        explorer,
        dbManager
    };
}
