/* ==========================================
   AETHER BI - CORE APPLICATION LOGIC
   ========================================== */

// Global Application State
let currentUser = null;
let activeDataset = null;
let datasetMetadata = null;
let pendingOps = [];
let savedCharts = [];

// ==========================================
// PERSISTENCE MANAGEMENT (LOCALSTORAGE)
// ==========================================
const STORAGE_DASHBOARD_KEY = "data_analyzer_saved_dashboard_v2";
const STORAGE_DATASET_KEY = "data_analyzer_active_dataset_v2";

function saveDashboardToStorage() {
    try {
        localStorage.setItem(STORAGE_DASHBOARD_KEY, JSON.stringify(savedCharts));
        if (activeDataset) {
            localStorage.setItem(STORAGE_DATASET_KEY, activeDataset);
        }
    } catch (e) {
        console.warn("Could not save dashboard to storage:", e);
    }
}

async function loadDashboardFromStorage() {
    try {
        const storedCharts = localStorage.getItem(STORAGE_DASHBOARD_KEY);
        if (storedCharts) {
            const parsed = JSON.parse(storedCharts);
            if (Array.isArray(parsed) && parsed.length > 0) {
                savedCharts = parsed;
            }
        }
        
        const storedDataset = localStorage.getItem(STORAGE_DATASET_KEY);
        if (storedDataset && !activeDataset) {
            await selectDatasetSilent(storedDataset);
        } else if (!activeDataset && savedCharts.length > 0 && savedCharts[0].file) {
            await selectDatasetSilent(savedCharts[0].file);
        }
        
        if (savedCharts.length > 0) {
            renderDashboardReport();
        }
    } catch (e) {
        console.warn("Could not load dashboard from storage:", e);
    }
}

async function selectDatasetSilent(filename) {
    if (!filename) return;
    try {
        const response = await fetch(`/api/datasets/info?file=${encodeURIComponent(filename)}`);
        const data = await response.json();
        if (data.metadata) {
            activeDataset = filename;
            datasetMetadata = data.metadata;
            updateAppStateDataset();
            refreshDatasetList();
            renderDashboardReport();
        }
    } catch (e) {
        console.warn("Silent dataset restore failed for", filename, e);
    }
}

function printDashboardGraphsOnly() {
    if (savedCharts.length === 0) {
        showToast("Dashboard Empty", "Please pin at least one visual chart before printing.", "warning");
        return;
    }
    // Switch to dashboard tab if not active
    switchTab("dashboard");
    setTimeout(() => {
        window.print();
    }, 150);
}

// ==========================================
// ON INITIAL LOAD
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    // Load saved theme
    loadTheme();

    // Load saved dashboard widgets and restore active dataset
    loadDashboardFromStorage();

    // Check if user is already logged in
    checkLoginStatus();
    
    // Set up Drag & Drop for file uploads
    setupDragAndDrop();
    
    // Default accordion toggles
    document.querySelectorAll(".accordion-header").forEach((header, index) => {
        // Open the first accordion item by default
        if (index === 0) {
            header.parentElement.classList.add("open");
        }
    });
});

// ==========================================
// ==========================================
// THEME MANAGEMENT
// ==========================================
const THEME_NAMES = {
    'cosmic': 'Cosmic Neon',
    'oled-black': 'OLED Pitch Black',
    'cyber-slate': 'Cyber Slate',
    'dracula': 'Dracula Amethyst',
    'midnight-ocean': 'Midnight Ocean',
    'ember': 'Ember Blaze',
    'aurora': 'Aurora Emerald',
    'light': 'Frosted Light'
};

function setTheme(themeName) {
    // Normalize aliases
    if (themeName === 'dark') themeName = 'cosmic';
    if (themeName === 'oled') themeName = 'oled-black';
    if (themeName === 'slate') themeName = 'cyber-slate';

    if (themeName === 'cosmic') {
        document.body.removeAttribute('data-theme');
    } else {
        document.body.setAttribute('data-theme', themeName);
    }

    // Update current theme label in dropdown
    const themeLabel = document.getElementById('current-theme-label');
    if (themeLabel && THEME_NAMES[themeName]) {
        themeLabel.textContent = THEME_NAMES[themeName];
    }

    // Update Quick Dark / Light Toggle icon and landing label
    const isLight = themeName === 'light';
    const navThemeIcon = document.getElementById('navbar-theme-icon');
    const landingThemeIcon = document.getElementById('landing-theme-icon');
    const landingThemeLabel = document.getElementById('landing-theme-label');

    if (isLight) {
        if (navThemeIcon) navThemeIcon.className = 'fa-solid fa-sun text-warning';
        if (landingThemeIcon) landingThemeIcon.className = 'fa-solid fa-sun text-warning';
        if (landingThemeLabel) landingThemeLabel.textContent = 'Light Mode';
    } else {
        if (navThemeIcon) navThemeIcon.className = 'fa-solid fa-moon';
        if (landingThemeIcon) landingThemeIcon.className = 'fa-solid fa-moon';
        if (landingThemeLabel) landingThemeLabel.textContent = 'Dark Mode';
        // Remember user's preferred dark theme
        localStorage.setItem('aetherbi-last-dark-theme', themeName);
    }

    // Update active state on option items and swatches
    document.querySelectorAll('.theme-option-item, .theme-swatch').forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('data-theme') === themeName) {
            item.classList.add('active');
        }
    });

    // Persist selection
    localStorage.setItem('aetherbi-theme', themeName);

    // Re-render active charts so Chart.js picks up new CSS colors
    if (typeof updateChartPreview === 'function' && activeDataset) {
        updateChartPreview();
    }
}

function toggleQuickDarkLight() {
    const currentTheme = localStorage.getItem('aetherbi-theme') || 'cosmic';
    if (currentTheme === 'light') {
        const lastDark = localStorage.getItem('aetherbi-last-dark-theme') || 'cosmic';
        setTheme(lastDark);
        showToast("Theme Updated", `Switched to Dark Mode (${THEME_NAMES[lastDark] || 'Cosmic'}).`, "info");
    } else {
        setTheme('light');
        showToast("Theme Updated", "Switched to Frosted Light Mode.", "info");
    }
}

function loadTheme() {
    const saved = localStorage.getItem('aetherbi-theme');
    if (saved) {
        setTheme(saved);
    } else {
        setTheme('cosmic');
    }
}

function toggleThemeDropdown(event) {
    if (event) event.stopPropagation();
    const wrapper = document.querySelector('.theme-dropdown-wrapper');
    const menu = document.getElementById('theme-dropdown-menu');
    if (menu) {
        menu.classList.toggle('hidden');
        if (wrapper) wrapper.classList.toggle('open');
    }
}

function selectTheme(themeName) {
    setTheme(themeName);
    const menu = document.getElementById('theme-dropdown-menu');
    const wrapper = document.querySelector('.theme-dropdown-wrapper');
    if (menu) menu.classList.add('hidden');
    if (wrapper) wrapper.classList.remove('open');
    showToast("Theme Activated", `${THEME_NAMES[themeName] || themeName} applied.`, "success");
}

// Close theme dropdown when clicking outside
document.addEventListener('click', (e) => {
    const wrapper = document.querySelector('.theme-dropdown-wrapper');
    const menu = document.getElementById('theme-dropdown-menu');
    if (menu && !menu.classList.contains('hidden')) {
        if (wrapper && !wrapper.contains(e.target)) {
            menu.classList.add('hidden');
            wrapper.classList.remove('open');
        }
    }
});

// ==========================================
// NAVIGATION & SPA ROUTING
// ==========================================
function switchTab(tabId) {
    const targetItem = document.querySelector(`.sidebar-nav-item[data-tab="${tabId}"]`) || document.querySelector(`.nav-item[data-tab="${tabId}"]`);
    if (targetItem && targetItem.classList.contains("disabled")) {
        showToast("Access Denied", "Please upload or select a dataset first to enable this feature.", "warning");
        return;
    }

    // Toggle active state on navbar & sidebar items
    document.querySelectorAll(".sidebar-nav-item, .nav-links .nav-item").forEach(item => {
        item.classList.remove("active");
    });
    document.querySelectorAll(`[data-tab="${tabId}"]`).forEach(item => {
        item.classList.add("active");
    });

    // Toggle panel visibility
    document.querySelectorAll(".tab-panel").forEach(panel => {
        panel.classList.remove("active");
    });
    
    const targetPanel = document.getElementById(`panel-${tabId}`);
    if (targetPanel) {
        targetPanel.classList.add("active");
    }

    // Reset scroll position to top of page and workspace content
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    const workspace = document.querySelector(".workspace-content");
    if (workspace) workspace.scrollTop = 0;

    // Custom actions when switching tab
    if (tabId === "home") {
        if (typeof initHomeDashboard === 'function') {
            initHomeDashboard();
        }
    } else if (tabId === "dashboard") {
        renderDashboardReport();
    } else if (tabId === "visualizer") {
        updateChartPreview();
        if (typeof initAgentAdvisor === 'function' && activeDataset) {
            initAgentAdvisor(activeDataset);
        }
    } else if (tabId === "analytics") {
        populateDatasetJoinDropdowns();
        if (typeof initAgentAdvisor === 'function' && activeDataset) {
            initAgentAdvisor(activeDataset);
        }
    } else if (tabId === "predict") {
        if (window.PredictModule && typeof window.PredictModule.init === 'function') {
            window.PredictModule.init();
        }
    }
}

function switchAuthTab(type) {
    document.querySelectorAll(".auth-tab-btn").forEach(btn => {
        btn.classList.remove("active");
    });
    
    if (type === 'login') {
        document.querySelector(".auth-tab-btn:nth-child(1)").classList.add("active");
        document.getElementById("login-form").classList.remove("hidden");
        document.getElementById("register-form").classList.add("hidden");
    } else {
        document.querySelector(".auth-tab-btn:nth-child(2)").classList.add("active");
        document.getElementById("login-form").classList.add("hidden");
        document.getElementById("register-form").classList.remove("hidden");
    }
}

function toggleAccordion(header) {
    const item = header.parentElement;
    const isOpen = item.classList.contains("open");
    
    // Close other items
    document.querySelectorAll(".accordion-item").forEach(i => {
        i.classList.remove("open");
    });
    
    if (!isOpen) {
        item.classList.add("open");
    }
}

// ==========================================
// TOAST NOTIFICATIONS
// ==========================================
function showToast(title, message, type = 'info') {
    const container = document.getElementById("toast-container");
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    
    let iconClass = 'fa-circle-info';
    if (type === 'success') iconClass = 'fa-circle-check';
    if (type === 'error') iconClass = 'fa-triangle-exclamation';
    if (type === 'warning') iconClass = 'fa-triangle-exclamation';
    
    toast.innerHTML = `
        <i class="fa-solid ${iconClass}"></i>
        <div class="toast-content">
            <h5>${title}</h5>
            <p>${message}</p>
        </div>
    `;
    
    container.appendChild(toast);
    
    // Self-destruct after 4 seconds
    setTimeout(() => {
        toast.style.animation = "slideIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) reverse forwards";
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 4000);
}

// ==========================================
// LOADING SPINNER OVERLAY
// ==========================================
function showLoading(message = "Processing your data...") {
    const overlay = document.getElementById("loading-overlay");
    document.getElementById("loading-message").innerText = message;
    overlay.classList.add("visible");
}

function hideLoading() {
    const overlay = document.getElementById("loading-overlay");
    overlay.classList.remove("visible");
}

// ==========================================
// AUTHENTICATION LOGIC (API CALLS)
// ==========================================
async function checkLoginStatus() {
    try {
        const response = await fetch("/api/auth/me");
        const data = await response.json();
        if (data.logged_in && data.user) {
            loginSuccess(data.user);
        } else {
            loginSuccess({ id: 1, username: 'Shashvat Rai', email: 'shashvat@example.com' });
        }
    } catch (e) {
        loginSuccess({ id: 1, username: 'Shashvat Rai', email: 'shashvat@example.com' });
    }
}

async function performLogin(usernameOrEmail, password) {
    showLoading("Authenticating...");
    try {
        const response = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username_or_email: usernameOrEmail, password: password })
        });
        
        const data = await response.json();
        hideLoading();
        
        if (data.success) {
            loginSuccess(data.user);
            showToast("Welcome Back!", `Logged in as ${data.user.username}`, "success");
            return true;
        } else {
            showToast("Login Failed", data.message || "Invalid credentials.", "error");
            return false;
        }
    } catch (err) {
        hideLoading();
        showToast("Error", "Network connection issues.", "error");
        return false;
    }
}

async function handleLogin(e) {
    if (e) e.preventDefault();
    const usernameOrEmail = document.getElementById("login-username").value;
    const password = document.getElementById("login-password").value;
    await performLogin(usernameOrEmail, password);
}

async function handleRegister(e) {
    if (e) e.preventDefault();
    const username = document.getElementById("reg-username").value;
    const email = document.getElementById("reg-email").value;
    const password = document.getElementById("reg-password").value;
    
    showLoading("Creating account...");
    try {
        const response = await fetch("/api/auth/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: username, email: email, password: password })
        });
        
        const data = await response.json();
        hideLoading();
        
        if (data.success) {
            showToast("Account Created", "Registration successful! Logging you in...", "success");
            await performLogin(username, password);
        } else {
            showToast("Registration Failed", data.message || "Could not register account.", "error");
        }
    } catch (err) {
        hideLoading();
        showToast("Error", "Network connection issues: " + err.message, "error");
    }
}

async function quickDemoLogin() {
    document.getElementById("login-username").value = "demo";
    document.getElementById("login-password").value = "demo123";
    await performLogin("demo", "demo123");
}

async function handleLogout() {
    showLoading("Logging out...");
    try {
        await fetch("/api/auth/logout", { method: "POST" });
        logoutSuccess();
        hideLoading();
        showToast("Logged Out", "Goodbye!", "info");
    } catch (e) {
        hideLoading();
        logoutSuccess();
    }
}

function loginSuccess(user) {
    currentUser = user;
    document.getElementById("auth-view").classList.add("hidden");
    document.getElementById("app-view").classList.remove("hidden");
    
    const displayName = (user && user.username) ? user.username : 'Shashvat Rai';
    const userDisplayEl = document.getElementById("user-display-name");
    if (userDisplayEl) userDisplayEl.innerText = displayName;
    
    const menuUserName = document.getElementById("menu-user-name");
    if (menuUserName) menuUserName.innerText = displayName;
    const menuUserEmail = document.getElementById("menu-user-email");
    if (menuUserEmail && user && user.email) menuUserEmail.innerText = user.email;

    const welcomeFirstEl = document.getElementById("welcome-user-firstname");
    if (welcomeFirstEl) {
        welcomeFirstEl.innerText = displayName.split(' ')[0] || 'Shashvat';
    }
    
    // Clear forms
    const lForm = document.getElementById("login-form");
    if (lForm) lForm.reset();
    const rForm = document.getElementById("register-form");
    if (rForm) rForm.reset();
    
    // Switch to Home Dashboard
    switchTab('home');
    
    // Refresh datasets list
    refreshDatasetList();
}

function logoutSuccess() {
    currentUser = null;
    activeDataset = null;
    datasetMetadata = null;
    pendingOps = [];
    savedCharts = [];
    
    document.getElementById("auth-view").classList.remove("hidden");
    document.getElementById("app-view").classList.add("hidden");
    
    // Disable navigation panel triggers
    const navCleaner = document.getElementById("nav-cleaner");
    if (navCleaner) navCleaner.classList.add("disabled");
    const navVisualizer = document.getElementById("nav-visualizer");
    if (navVisualizer) navVisualizer.classList.add("disabled");
    const navAnalytics = document.getElementById("nav-analytics");
    if (navAnalytics) navAnalytics.classList.add("disabled");
    const sbActive = document.getElementById("sidebar-active-dataset");
    if (sbActive) sbActive.classList.add("hidden");
    
    // Clear UI state
    const prevTable = document.getElementById("preview-table");
    if (prevTable) prevTable.innerHTML = "";
    const dsContainer = document.getElementById("datasets-list-container");
    if (dsContainer) dsContainer.innerHTML = "";
    const sbName = document.getElementById("sidebar-dataset-name");
    if (sbName) sbName.innerText = "No file";
    const sbRows = document.getElementById("sidebar-dataset-rows");
    if (sbRows) sbRows.innerText = "0 rows";
}

// ==========================================
// DATASETS LIST & UPLOADER LOGIC
// ==========================================
async function refreshDatasetList() {
    try {
        const response = await fetch("/api/datasets/list");
        const data = await response.json();
        
        const container = document.getElementById("datasets-list-container");
        container.innerHTML = "";
        
        if (data.datasets && data.datasets.length > 0) {
            data.datasets.forEach(file => {
                const isActive = activeDataset === file.name;
                const fileItem = document.createElement("div");
                fileItem.className = `dataset-item ${isActive ? 'active' : ''}`;
                
                const isExcel = file.name.toLowerCase().endsWith('.xls') || file.name.toLowerCase().endsWith('.xlsx');
                const fileIcon = isExcel ? 'fa-file-excel' : 'fa-file-csv';
                
                fileItem.innerHTML = `
                    <div class="dataset-info-block">
                        <div class="dataset-icon">
                            <i class="fa-solid ${fileIcon}"></i>
                        </div>
                        <div class="dataset-details">
                            <span class="name" title="${file.name}">${file.name}</span>
                            <span class="meta">${file.size_kb} KB</span>
                        </div>
                    </div>
                    <div class="dataset-item-actions">
                        <button class="btn btn-accent btn-sm" onclick="selectDataset('${file.name}')">
                            ${isActive ? '<i class="fa-solid fa-check"></i> Active' : 'Load'}
                        </button>
                        <button class="btn-delete-dataset" onclick="promptDeleteDataset('${file.name}', event)" title="Delete dataset">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                `;
                container.appendChild(fileItem);
            });
        } else {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-folder-open"></i>
                    <p>No datasets found. Upload a file to get started.</p>
                </div>
            `;
        }
    } catch (err) {
        console.error("Error refreshing dataset list:", err);
        showToast("Error", "Failed to retrieve dataset listing: " + err.message, "error");
    }
}

// --- DATASET DELETE LOGIC ---
let datasetToDelete = null;

function promptDeleteDataset(filename, e) {
    if (e) e.stopPropagation();
    datasetToDelete = filename;
    document.getElementById("confirm-delete-filename").textContent = filename;
    document.getElementById("confirm-dialog-overlay").classList.add("visible");
}

function closeConfirmDialog() {
    datasetToDelete = null;
    document.getElementById("confirm-dialog-overlay").classList.remove("visible");
}

async function confirmDeleteDataset() {
    if (!datasetToDelete) return;
    const filename = datasetToDelete;
    closeConfirmDialog();
    
    showLoading(`Deleting ${filename}...`);
    try {
        const response = await fetch(`/api/datasets/delete?file=${encodeURIComponent(filename)}`, {
            method: 'DELETE'
        });
        const data = await response.json();
        hideLoading();

        if (data.success) {
            showToast("Dataset Deleted", `File ${filename} removed.`, "success");
            if (activeDataset === filename) {
                logoutSuccess();
                currentUser = true; // Keep user session state
                document.getElementById("auth-view").classList.add("hidden");
                document.getElementById("app-view").classList.remove("hidden");
            }
            refreshDatasetList();
        } else {
            showToast("Delete Failed", data.error || "Could not delete file.", "error");
        }
    } catch (err) {
        hideLoading();
        showToast("Error", "Failed to communicate with server: " + err.message, "error");
    }
}

function setupDragAndDrop() {
    const zone = document.getElementById("drag-drop-zone");
    
    zone.addEventListener("click", () => {
        document.getElementById("file-input").click();
    });
    
    zone.addEventListener("dragover", (e) => {
        e.preventDefault();
        zone.classList.add("dragover");
    });
    
    zone.addEventListener("dragleave", () => {
        zone.classList.remove("dragover");
    });
    
    zone.addEventListener("drop", (e) => {
        e.preventDefault();
        zone.classList.remove("dragover");
        
        if (e.dataTransfer.files.length > 0) {
            uploadFile(e.dataTransfer.files[0]);
        }
    });
}

function handleFileSelect(e) {
    if (e.target.files.length > 0) {
        uploadFile(e.target.files[0]);
    }
}

async function uploadFile(file) {
    const validExts = ['.csv', '.xls', '.xlsx'];
    const fileExt = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    
    if (!validExts.includes(fileExt)) {
        showToast("Invalid File Type", "Only CSV and Excel sheets are supported.", "error");
        return;
    }
    
    const formData = new FormData();
    formData.append("file", file);
    
    showLoading(`Uploading and parsing ${file.name}...`);
    try {
        const response = await fetch("/api/datasets/upload", {
            method: "POST",
            body: formData
        });
        const data = await response.json();
        hideLoading();
        
        if (data.success) {
            showToast("Upload Successful", data.message, "success");
            activeDataset = data.filename;
            datasetMetadata = data.metadata;
            
            updateAppStateDataset();
            refreshDatasetList();
            
            // Switch directly to the cleaner tab to inspect data
            switchTab("cleaner");
        } else {
            showToast("Upload Failed", data.error || "An error occurred.", "error");
        }
    } catch (e) {
        hideLoading();
        console.error("Error uploading file:", e);
        showToast("Error", "Failed to upload file due to network issue: " + e.message, "error");
    }
}

async function selectDataset(filename) {
    showLoading(`Loading dataset ${filename}...`);
    try {
        const response = await fetch(`/api/datasets/info?file=${encodeURIComponent(filename)}`);
        const data = await response.json();
        hideLoading();
        
        if (data.metadata) {
            activeDataset = filename;
            datasetMetadata = data.metadata;
            saveDashboardToStorage();
            
            updateAppStateDataset();
            refreshDatasetList();
            refreshHomeDatasetsSummary();
            
            showToast("Dataset Loaded", `Active dataset set to: ${filename}`, "success");
            
            // Switch to cleaner tab
            switchTab("cleaner");
        } else {
            showToast("Load Failed", data.error || "Could not parse metadata.", "error");
        }
    } catch (e) {
        hideLoading();
        console.error("Error loading dataset:", e);
        showToast("Error", "Could not connect to dataset loader: " + e.message, "error");
    }
}

// Update UI elements dependent on active dataset
function updateAppStateDataset() {
    if (!activeDataset || !datasetMetadata) return;
    
    // Enable tabs
    const navCleaner = document.getElementById("nav-cleaner");
    if (navCleaner) navCleaner.classList.remove("disabled");
    const navAnalytics = document.getElementById("nav-analytics");
    if (navAnalytics) navAnalytics.classList.remove("disabled");
    const navVisualizer = document.getElementById("nav-visualizer");
    if (navVisualizer) navVisualizer.classList.remove("disabled");
    const navPredict = document.getElementById("nav-predict");
    if (navPredict) navPredict.classList.remove("disabled");
    
    // Active dataset card on sidebar & navbar dropdown
    const sbActive = document.getElementById("sidebar-active-dataset");
    if (sbActive) sbActive.classList.remove("hidden");
    const sbName = document.getElementById("sidebar-dataset-name");
    if (sbName) sbName.innerText = activeDataset;
    const sbRows = document.getElementById("sidebar-dataset-rows");
    if (sbRows && datasetMetadata.shape) sbRows.innerText = `${datasetMetadata.shape[0].toLocaleString()} rows`;
    
    const navDatasetName = document.getElementById("nav-active-dataset-name");
    if (navDatasetName) navDatasetName.textContent = activeDataset;
    
    // Cleaner headers
    const clTitle = document.getElementById("cleaner-dataset-title");
    if (clTitle) clTitle.innerText = activeDataset;
    const clSub = document.getElementById("cleaner-dataset-subtitle");
    if (clSub && datasetMetadata.shape) clSub.innerText = `Inspect schema types, handle null values, remove duplicates, or create calculated measures. (${datasetMetadata.shape[0]} rows, ${datasetMetadata.shape[1]} cols)`;
    
    // Populate column configuration lists in Cleaner
    populateCleanerDropdowns();
    
    // Render cleaner stats & table preview
    renderDatasetCleanerUI();

    // Update Executive Dashboard KPI Summary
    if (typeof updateDashboardKpiStrip === 'function') {
        updateDashboardKpiStrip();
    }

    // Dynamic Home Dashboard update with active dataset
    if (typeof updateHomeWithActiveDataset === 'function') {
        updateHomeWithActiveDataset();
    }
}

function populateCleanerDropdowns() {
    const cols = datasetMetadata.columns;
    const dropdowns = document.querySelectorAll(".column-select-dropdown");
    
    dropdowns.forEach(dropdown => {
        dropdown.innerHTML = "";
        
        // Add empty optional choice if required for some dropdowns (like group-by or y-axis)
        if (dropdown.id === "chart-group-by") {
            const opt = document.createElement("option");
            opt.value = "";
            opt.innerText = "-- None (No group grouping) --";
            dropdown.appendChild(opt);
        }
        if (dropdown.id === "chart-y-axis" || dropdown.id === "chart-line-y-axis") {
            const opt = document.createElement("option");
            opt.value = "";
            opt.innerText = "-- Record Count (Rows count) --";
            dropdown.appendChild(opt);
        }
        if (dropdown.id === "chart-r-axis") {
            const opt = document.createElement("option");
            opt.value = "";
            opt.innerText = "-- Choose bubble size column --";
            dropdown.appendChild(opt);
        }
        
        cols.forEach(col => {
            const opt = document.createElement("option");
            opt.value = col;
            opt.innerText = `${col} (${datasetMetadata.dtypes[col] || 'Text'})`;
            dropdown.appendChild(opt);
        });

        // Set smart default for forecast target metric
        if (dropdown.id === "forecast-y-col") {
            const firstNumCol = cols.find(c => {
                const dt = (datasetMetadata.dtypes[c] || '').toLowerCase();
                return dt.includes('int') || dt.includes('float') || dt.includes('num') || dt.includes('double') || dt.includes('score') || dt.includes('price') || dt.includes('revenue') || dt.includes('unit') || dt.includes('tax');
            });
            if (firstNumCol) {
                dropdown.value = firstNumCol;
            }
        }
    });
}

// Table state for search & sort
let currentTableData = [];
let currentSortColumn = null;
let currentSortAsc = true;
let currentSearchQuery = "";

// ==========================================
// DATA CLEANER PANEL LOGIC
// ==========================================
function renderDatasetCleanerUI() {
    // 1. Populate summary stats
    document.getElementById("summary-rows").innerText = datasetMetadata.shape[0].toLocaleString();
    document.getElementById("summary-cols").innerText = datasetMetadata.shape[1].toLocaleString();
    
    let totalNulls = 0;
    Object.values(datasetMetadata.missing_counts).forEach(c => totalNulls += c);
    document.getElementById("summary-nulls").innerText = totalNulls.toLocaleString();
    
    // Store data for search & sort
    currentTableData = [...(datasetMetadata.sample_data || [])];
    currentSortColumn = null;
    currentSortAsc = true;
    currentSearchQuery = "";
    document.getElementById("table-search-input").value = "";
    document.getElementById("table-search-count").textContent = "";

    renderTableRows();
}

function renderTableRows() {
    const table = document.getElementById("preview-table");
    table.innerHTML = "";
    
    if (!currentTableData || currentTableData.length === 0) {
        table.innerHTML = "<tr><td class='empty-state'>No preview data available</td></tr>";
        return;
    }

    // Filter rows by search query
    let filteredData = currentTableData;
    if (currentSearchQuery.trim()) {
        const q = currentSearchQuery.toLowerCase().trim();
        filteredData = currentTableData.filter(row => {
            return Object.values(row).some(val => val !== null && val !== undefined && String(val).toLowerCase().includes(q));
        });
        document.getElementById("table-search-count").textContent = `${filteredData.length} of ${currentTableData.length} rows`;
    } else {
        document.getElementById("table-search-count").textContent = `${currentTableData.length} rows previewed`;
    }

    // Sort data if sort column is active
    if (currentSortColumn) {
        filteredData.sort((a, b) => {
            let valA = a[currentSortColumn];
            let valB = b[currentSortColumn];
            if (valA === null || valA === undefined) return 1;
            if (valB === null || valB === undefined) return -1;
            if (typeof valA === 'number' && typeof valB === 'number') {
                return currentSortAsc ? valA - valB : valB - valA;
            }
            return currentSortAsc 
                ? String(valA).localeCompare(String(valB)) 
                : String(valB).localeCompare(String(valA));
        });
    }

    // Render Headers
    const headerRow = document.createElement("tr");
    datasetMetadata.columns.forEach(col => {
        const th = document.createElement("th");
        th.className = "sortable";
        if (currentSortColumn === col) {
            th.classList.add("sorted");
        }
        const type = datasetMetadata.dtypes[col] || "Text";
        const nullCount = datasetMetadata.missing_counts[col] || 0;
        
        let sortIcon = 'fa-sort';
        if (currentSortColumn === col) {
            sortIcon = currentSortAsc ? 'fa-sort-up' : 'fa-sort-down';
        }

        th.innerHTML = `
            <span>${col}</span>
            <span class="col-type">${type} ${nullCount > 0 ? `(${nullCount} nulls)` : ''}</span>
            <span class="sort-indicator"><i class="fa-solid ${sortIcon}"></i></span>
        `;

        // Single click header -> Sort, double click -> Open Column Insight Drawer
        let clickTimer = null;
        th.addEventListener("click", (e) => {
            if (clickTimer) {
                clearTimeout(clickTimer);
                clickTimer = null;
                fetchAndOpenColumnStats(col);
            } else {
                clickTimer = setTimeout(() => {
                    clickTimer = null;
                    sortTableByColumn(col);
                }, 250);
            }
        });

        headerRow.appendChild(th);
    });
    table.appendChild(headerRow);
    
    // Render Rows
    filteredData.forEach(row => {
        const tr = document.createElement("tr");
        datasetMetadata.columns.forEach(col => {
            const td = document.createElement("td");
            const val = row[col];
            
            if (val === null || val === undefined) {
                td.innerHTML = "[NaN]";
                td.className = "null-cell";
            } else {
                td.innerText = val;
            }
            tr.appendChild(td);
        });
        table.appendChild(tr);
    });
}

function handleTableSearch(query) {
    currentSearchQuery = query || "";
    const clearBtn = document.getElementById("btn-clear-table-search");
    if (clearBtn) {
        if (currentSearchQuery.trim().length > 0) {
            clearBtn.classList.remove("hidden");
        } else {
            clearBtn.classList.add("hidden");
        }
    }
    renderTableRows();
}

function clearTableSearch() {
    const input = document.getElementById("table-search-input");
    if (input) input.value = "";
    handleTableSearch("");
}

function sortTableByColumn(col) {
    if (currentSortColumn === col) {
        currentSortAsc = !currentSortAsc;
    } else {
        currentSortColumn = col;
        currentSortAsc = true;
    }
    renderTableRows();
}

// --- COLUMN STATS DRAWER ---
let drawerChartInstance = null;

async function fetchAndOpenColumnStats(columnName) {
    if (!activeDataset) return;
    
    document.getElementById("stats-drawer-col-name").textContent = columnName;
    document.getElementById("stats-drawer-body").innerHTML = `<div class="spinner-container" style="padding:40px;"><div class="spinner"></div><p style="margin-top:12px; font-size:0.85rem; color:var(--text-muted);">Calculating statistics for ${columnName}...</p></div>`;
    
    document.getElementById("stats-drawer-overlay").classList.add("visible");
    document.getElementById("stats-drawer").classList.add("open");

    try {
        const response = await fetch("/api/datasets/column-stats", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ file: activeDataset, column: columnName })
        });
        const res = await response.json();
        
        if (res.success && res.data) {
            renderColumnStatsDrawer(res.data);
        } else {
            document.getElementById("stats-drawer-body").innerHTML = `<p style="color:var(--danger); padding:20px;">Failed to calculate stats: ${res.error || 'Unknown error'}</p>`;
        }
    } catch (err) {
        document.getElementById("stats-drawer-body").innerHTML = `<p style="color:var(--danger); padding:20px;">Network error: ${err.message}</p>`;
    }
}

function renderColumnStatsDrawer(data) {
    const body = document.getElementById("stats-drawer-body");
    body.innerHTML = "";

    const stats = data.stats || {};
    let gridHtml = '';

    if (data.type === 'numeric') {
        gridHtml = `
            <div class="stats-grid">
                <div class="stats-grid-item"><span class="stat-label">Mean</span><span class="stat-value">${stats.mean ?? 'N/A'}</span></div>
                <div class="stats-grid-item"><span class="stat-label">Median</span><span class="stat-value">${stats.median ?? 'N/A'}</span></div>
                <div class="stats-grid-item"><span class="stat-label">Min</span><span class="stat-value">${stats.min ?? 'N/A'}</span></div>
                <div class="stats-grid-item"><span class="stat-label">Max</span><span class="stat-value">${stats.max ?? 'N/A'}</span></div>
                <div class="stats-grid-item"><span class="stat-label">Std Dev</span><span class="stat-value">${stats.std ?? 'N/A'}</span></div>
                <div class="stats-grid-item"><span class="stat-label">Unique Values</span><span class="stat-value">${stats.unique ?? 'N/A'}</span></div>
                <div class="stats-grid-item"><span class="stat-label">Non-Null Count</span><span class="stat-value">${stats.count ?? 0}</span></div>
                <div class="stats-grid-item"><span class="stat-label">Missing (%)</span><span class="stat-value">${stats.missing ?? 0} (${stats.missing_pct ?? 0}%)</span></div>
            </div>
        `;
    } else {
        gridHtml = `
            <div class="stats-grid">
                <div class="stats-grid-item"><span class="stat-label">Unique Values</span><span class="stat-value">${stats.unique ?? 0}</span></div>
                <div class="stats-grid-item"><span class="stat-label">Most Frequent</span><span class="stat-value" style="font-size:0.9rem;">${stats.top ?? 'N/A'}</span></div>
                <div class="stats-grid-item"><span class="stat-label">Top Freq Count</span><span class="stat-value">${stats.top_freq ?? 0}</span></div>
                <div class="stats-grid-item"><span class="stat-label">Non-Null Count</span><span class="stat-value">${stats.count ?? 0}</span></div>
                <div class="stats-grid-item"><span class="stat-label">Missing</span><span class="stat-value">${stats.missing ?? 0} (${stats.missing_pct ?? 0}%)</span></div>
            </div>
        `;
    }

    const chartHeaderTitle = data.type === 'numeric' ? 'Value Distribution (Histogram)' : 'Top 10 Categories';
    
    body.innerHTML = `
        ${gridHtml}
        <div class="stats-mini-chart">
            <h4>${chartHeaderTitle}</h4>
            <div style="height:200px; position:relative;">
                <canvas id="drawer-chart-canvas"></canvas>
            </div>
        </div>
    `;

    // Render distribution chart
    const ctx = document.getElementById("drawer-chart-canvas");
    if (!ctx) return;

    if (drawerChartInstance) {
        drawerChartInstance.destroy();
    }

    let labels = [];
    let counts = data.counts || [];

    if (data.type === 'numeric' && data.bins && data.bins.length > 1) {
        for (let i = 0; i < data.bins.length - 1; i++) {
            labels.push(`${data.bins[i]} - ${data.bins[i+1]}`);
        }
    } else if (data.labels) {
        labels = data.labels;
    }

    drawerChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Frequency',
                data: counts,
                backgroundColor: 'rgba(0, 242, 254, 0.65)',
                borderColor: '#00f2fe',
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(19, 23, 48, 0.95)',
                    titleColor: '#00f2fe',
                    bodyColor: '#f1f3fa'
                }
            },
            scales: {
                x: {
                    ticks: { color: '#a3a8c3', font: { size: 9 }, maxRotation: 45 },
                    grid: { display: false }
                },
                y: {
                    ticks: { color: '#a3a8c3', font: { size: 9 } },
                    grid: { color: 'rgba(255, 255, 255, 0.05)' }
                }
            }
        }
    });
}

function closeStatsDrawer() {
    document.getElementById("stats-drawer-overlay").classList.remove("visible");
    document.getElementById("stats-drawer").classList.remove("open");
    if (drawerChartInstance) {
        drawerChartInstance.destroy();
        drawerChartInstance = null;
    }
}

function handleFillMethodChange() {
    const method = document.getElementById("clean-null-method").value;
    const group = document.getElementById("constant-val-group");
    if (method === "constant") {
        group.classList.remove("hidden");
    } else {
        group.classList.add("hidden");
    }
}

// --- PENDING OPERATIONS MANAGEMENT ---
function queueOperation(op) {
    pendingOps.push(op);
    renderPendingOpsList();
    showToast("Operation Queued", `Queued action: ${op.description}`, "info");
}

function renderPendingOpsList() {
    const list = document.getElementById("pending-ops-list");
    list.innerHTML = "";
    
    const countBadge = document.getElementById("ops-badge");
    countBadge.innerText = pendingOps.length;
    
    const applyBtn = document.getElementById("btn-apply-ops");
    const clearBtn = document.getElementById("btn-clear-ops");
    
    if (pendingOps.length > 0) {
        applyBtn.removeAttribute("disabled");
        clearBtn.removeAttribute("disabled");
        
        pendingOps.forEach((op, index) => {
            const item = document.createElement("div");
            item.className = "op-item";
            item.innerHTML = `
                <span>${op.description}</span>
                <button onclick="removePendingOp(${index})" title="Remove operation"><i class="fa-solid fa-xmark"></i></button>
            `;
            list.appendChild(item);
        });
    } else {
        applyBtn.setAttribute("disabled", "true");
        clearBtn.setAttribute("disabled", "true");
        list.innerHTML = '<p class="empty-ops-text">No pending changes. Select tools above to modify data.</p>';
    }
}

function removePendingOp(index) {
    pendingOps.splice(index, 1);
    renderPendingOpsList();
}

function clearPendingOps() {
    pendingOps = [];
    renderPendingOpsList();
    showToast("Operations Cleared", "Reset pending data cleaning steps.", "info");
}

// Queue creators
function queueDropColumn() {
    const col = document.getElementById("clean-op-column").value;
    if (!col) return;
    queueOperation({
        action: "drop_columns",
        columns: [col],
        description: `Drop column '${col}'`
    });
}

function queueRenameColumn() {
    const col = document.getElementById("clean-op-column").value;
    const newName = document.getElementById("clean-op-rename-val").value.trim();
    if (!col || !newName) {
        showToast("Error", "Please provide a valid rename string.", "error");
        return;
    }
    queueOperation({
        action: "rename_columns",
        renames: { [col]: newName },
        description: `Rename '${col}' → '${newName}'`
    });
    document.getElementById("clean-op-rename-val").value = "";
}

function queueHandleNulls() {
    const col = document.getElementById("clean-null-column").value;
    const method = document.getElementById("clean-null-method").value;
    const constantVal = document.getElementById("clean-null-constant").value;
    
    if (!col) return;
    
    if (method === "constant" && constantVal === "") {
        showToast("Error", "Please specify a constant value to fill.", "error");
        return;
    }
    
    if (method === "drop") {
        queueOperation({
            action: "drop_missing_rows",
            column: col,
            description: `Drop rows where '${col}' is null`
        });
    } else {
        queueOperation({
            action: "fill_missing",
            column: col,
            method: method,
            value: method === "constant" ? constantVal : null,
            description: `Fill nulls in '${col}' with ${method === 'constant' ? `'` + constantVal + `'` : method}`
        });
    }
}

function queueCastType() {
    const col = document.getElementById("clean-cast-column").value;
    const type = document.getElementById("clean-cast-type").value;
    if (!col) return;
    queueOperation({
        action: "change_types",
        types: { [col]: type },
        description: `Convert type of '${col}' to ${type}`
    });
}

function queueRemoveDuplicates() {
    queueOperation({
        action: "remove_duplicates",
        description: "Remove duplicate rows"
    });
}

function queueDropAllNullRows() {
    queueOperation({
        action: "drop_missing_rows",
        description: "Drop rows containing any null fields"
    });
}

// POST CLEAN DATA TO API
async function applyCleaningOperations() {
    if (pendingOps.length === 0) return;
    
    showLoading("Applying data cleaning rules...");
    try {
        const response = await fetch("/api/datasets/clean", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ file: activeDataset, operations: pendingOps })
        });
        const data = await response.json();
        hideLoading();
        
        if (data.success) {
            datasetMetadata = data.metadata;
            pendingOps = [];
            
            renderPendingOpsList();
            updateAppStateDataset();
            
            showToast("Changes Applied", "The dataset has been cleaned successfully.", "success");
        } else {
            showToast("Cleaning Failed", data.error || "Failed to process changes.", "error");
        }
    } catch (e) {
        hideLoading();
        console.error("Error applying cleaning operations:", e);
        showToast("Error", "Could not apply rules due to networking issue: " + e.message, "error");
    }
}

function exportCleanDataset() {
    if (!activeDataset) return;
    const url = `/api/datasets/download?file=${encodeURIComponent(activeDataset)}`;
    window.open(url, "_blank");
}

// ==========================================
// CALCULATED MEASURES SUITE
// ==========================================
function handleMeasureRightTypeChange() {
    const useConstant = document.getElementById("measure-use-constant").checked;
    const colGroup = document.getElementById("measure-right-col-group");
    const constGroup = document.getElementById("measure-right-constant-group");
    
    if (useConstant) {
        colGroup.classList.add("hidden");
        constGroup.classList.remove("hidden");
    } else {
        colGroup.classList.remove("hidden");
        constGroup.classList.add("hidden");
    }
}

async function createCalculatedMeasure() {
    if (!activeDataset) return;
    
    const newName = document.getElementById("measure-name").value.trim();
    const leftCol = document.getElementById("measure-left-col").value;
    const operator = document.getElementById("measure-operator").value;
    const useConstant = document.getElementById("measure-use-constant").checked;
    const rightCol = useConstant ? null : document.getElementById("measure-right-col").value;
    const rightConstant = useConstant ? document.getElementById("measure-right-constant").value.trim() : null;
    
    if (!newName) {
        showToast("Configuration Incomplete", "Please specify a name for the new column.", "warning");
        return;
    }
    if (!leftCol) {
        showToast("Configuration Incomplete", "Please select the left column operand.", "warning");
        return;
    }
    if (!useConstant && !rightCol) {
        showToast("Configuration Incomplete", "Please select the right column operand.", "warning");
        return;
    }
    if (useConstant && rightConstant === "") {
        showToast("Configuration Incomplete", "Please specify a constant value.", "warning");
        return;
    }
    
    showLoading(`Creating calculated measure '${newName}'...`);
    try {
        const response = await fetch("/api/datasets/measure", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                file: activeDataset,
                new_col_name: newName,
                left_col: leftCol,
                operator: operator,
                right_col: rightCol,
                right_constant: rightConstant
            })
        });
        
        const data = await response.json();
        hideLoading();
        
        if (data.success) {
            datasetMetadata = data.metadata;
            document.getElementById("measure-name").value = "";
            document.getElementById("measure-right-constant").value = "";
            
            updateAppStateDataset();
            refreshDatasetList();
            
            showToast("Measure Created", `Column '${newName}' created successfully!`, "success");
        } else {
            showToast("Creation Failed", data.error || "Failed to create calculated column.", "error");
        }
    } catch (e) {
        hideLoading();
        console.error("Error creating calculated measure:", e);
        showToast("Error", "Could not connect to measure creator: " + e.message, "error");
    }
}

// ==========================================
// GRAPH BUILDER LOGIC (CHART CONFIG / PREVIEW)
// ==========================================
function handleChartTypeChange(radioInput, skipPreview = false) {
    document.querySelectorAll(".visual-picker-grid .type-btn, .chart-type-picker .type-btn").forEach(btn => {
        btn.classList.remove("active");
    });
    if (radioInput && radioInput.parentElement) {
        radioInput.parentElement.classList.add("active");
    }
    
    const type = radioInput.value;
    
    const xGroup = document.getElementById("chart-x-axis").parentElement;
    const yGroup = document.getElementById("chart-y-axis").parentElement;
    const rGroup = document.getElementById("chart-r-axis").parentElement;
    const lineYGroup = document.getElementById("chart-line-y-axis").parentElement;
    const aggSelect = document.getElementById("chart-aggregation");
    const legendGroup = document.getElementById("chart-group-by").parentElement;
    const xSelect = document.getElementById("chart-x-axis");
    const ySelect = document.getElementById("chart-y-axis");
    const titleInput = document.getElementById("chart-title");
    
    // Reset defaults
    xGroup.classList.remove("hidden");
    yGroup.classList.remove("hidden");
    rGroup.classList.add("hidden");
    lineYGroup.classList.add("hidden");
    aggSelect.parentElement.classList.remove("hidden");
    legendGroup.classList.remove("hidden");
    
    if (type === 'kpi') {
        xGroup.classList.add("hidden");
        legendGroup.classList.add("hidden");
        yGroup.querySelector("label").innerText = "KPI Target Value Column";
        if (aggSelect.value === 'NONE') aggSelect.value = 'SUM';
    } else if (type === 'histogram') {
        yGroup.classList.add("hidden");
        legendGroup.classList.add("hidden");
        aggSelect.parentElement.classList.add("hidden");
        xGroup.querySelector("label").innerText = "Distribution Metric Column (Histogram)";
    } else if (type === 'boxPlot') {
        legendGroup.classList.add("hidden");
        aggSelect.parentElement.classList.add("hidden");
        xGroup.querySelector("label").innerText = "Categorical Dimension Column (Groups)";
        yGroup.querySelector("label").innerText = "Numerical Value Column (Box & Whiskers)";
    } else if (type === 'funnel') {
        legendGroup.classList.add("hidden");
        xGroup.querySelector("label").innerText = "Process Stage / Category Column";
        yGroup.querySelector("label").innerText = "Stage Volume / Metric Column";
    } else if (type === 'waterfall') {
        legendGroup.classList.add("hidden");
        xGroup.querySelector("label").innerText = "Financial Step / Timeline Column";
        yGroup.querySelector("label").innerText = "Variance / Delta Metric Column";
    } else if (type === 'treemap') {
        xGroup.querySelector("label").innerText = "Hierarchy / Category Area Column";
        yGroup.querySelector("label").innerText = "Proportional Size Metric Column";
    } else if (['gauge', 'bullet'].includes(type)) {
        legendGroup.classList.add("hidden");
        xGroup.querySelector("label").innerText = "Actual Value Metric Column";
        yGroup.querySelector("label").innerText = "Target Comparison Column (Optional)";
    } else if (type === 'gantt') {
        legendGroup.classList.add("hidden");
        xGroup.querySelector("label").innerText = "Project Task / Milestone Column";
        yGroup.querySelector("label").innerText = "Duration / Phase Column (Numeric)";
    } else if (type === 'geoMap') {
        legendGroup.classList.add("hidden");
        xGroup.querySelector("label").innerText = "Geographic Country / Region Column";
        yGroup.querySelector("label").innerText = "Regional Bubble Value Column";
    } else if (type === 'tableMatrix' || type === 'multiCard' || type === 'ribbon') {
        legendGroup.classList.add("hidden");
        xGroup.querySelector("label").innerText = "Primary Dimension Column";
        yGroup.querySelector("label").innerText = "Metric / Value Column";
    } else if (type === 'heatmap') {
        legendGroup.classList.add("hidden");
        aggSelect.parentElement.classList.add("hidden");
        xGroup.querySelector("label").innerText = "X-Axis / Metric 1 (Heatmap)";
        yGroup.querySelector("label").innerText = "Y-Axis / Metric 2 (Heatmap)";
    } else if (['horizontalBar', 'stackedHorizontalBar', 'percentStackedBar'].includes(type)) {
        xGroup.querySelector("label").innerText = "Category / Dimension Column (Bar Labels)";
        yGroup.querySelector("label").innerText = "Metric Value Column (Horizontal Length)";
    } else if (['bar', 'stackedBar', 'percentStackedColumn'].includes(type)) {
        xGroup.querySelector("label").innerText = "Category / Dimension Column (X-Axis)";
        yGroup.querySelector("label").innerText = "Metric Value Column (Y-Axis Height)";
    } else if (['lineClusteredColumn', 'lineStackedColumn'].includes(type)) {
        lineYGroup.classList.remove("hidden");
        legendGroup.classList.add("hidden");
        xGroup.querySelector("label").innerText = "X-Axis Column (Categories/Keys)";
        yGroup.querySelector("label").innerText = "Column Y-Axis Column";
        if (aggSelect.value === 'NONE') aggSelect.value = 'SUM';
    } else if (type === 'scatter') {
        aggSelect.parentElement.classList.add("hidden");
        legendGroup.classList.add("hidden");
        xGroup.querySelector("label").innerText = "X-Axis Metric (Numeric)";
        yGroup.querySelector("label").innerText = "Y-Axis Metric (Numeric)";
    } else if (type === 'bubble') {
        rGroup.classList.remove("hidden");
        aggSelect.parentElement.classList.add("hidden");
        legendGroup.classList.add("hidden");
        xGroup.querySelector("label").innerText = "X-Axis Metric (Numeric)";
        yGroup.querySelector("label").innerText = "Y-Axis Metric (Numeric)";
    } else {
        xGroup.querySelector("label").innerText = "X-Axis Column (Categories/Keys)";
        yGroup.querySelector("label").innerText = "Y-Axis Column (Metric Values)";
    }
    
    if (!skipPreview) {
        updateChartPreview();
    }
}

function applyChartPreset(type) {
    const radio = document.querySelector(`input[name="chart_type"][value="${type}"]`);
    if (!radio) return;

    radio.checked = true;
    
    // Update active class on archetype picker buttons
    document.querySelectorAll('.chart-type-picker .type-btn').forEach(btn => btn.classList.remove('active'));
    if (radio.parentElement) radio.parentElement.classList.add('active');

    // Pass skipPreview = true so we set up columns before fetching
    handleChartTypeChange(radio, true);
    
    // Smart column classification
    const xSelect = document.getElementById("chart-x-axis");
    const ySelect = document.getElementById("chart-y-axis");
    const aggSelect = document.getElementById("chart-aggregation");
    const titleInput = document.getElementById("chart-title");

    const allCols = datasetMetadata ? (datasetMetadata.columns || []) : [];
    const numCols = allCols.filter(c => {
        const dt = (datasetMetadata.dtypes[c] || '').toLowerCase();
        return dt.includes('int') || dt.includes('float') || dt.includes('num') || dt.includes('double') || dt.includes('year') || dt.includes('price') || dt.includes('score') || dt.includes('km') || dt.includes('revenue') || dt.includes('sold') || dt.includes('amount') || dt.includes('total') || dt.includes('count') || dt.includes('rating') || dt.includes('age');
    });
    
    const sortedNumCols = [...numCols].sort((a, b) => {
        const getScore = (name) => {
            const n = name.toLowerCase();
            if (n.includes('price') || n.includes('revenue') || n.includes('sales') || n.includes('profit') || n.includes('amount') || n.includes('total')) return 10;
            if (n.includes('score') || n.includes('km') || n.includes('cost') || n.includes('rating') || n.includes('count') || n.includes('quantity')) return 8;
            if (n.includes('year') || n.includes('age')) return 5;
            if (n.includes('id')) return 0;
            return 6;
        };
        return getScore(b) - getScore(a);
    });

    const catCols = allCols.filter(c => !numCols.includes(c));
    const sortedCatCols = [...catCols].sort((a, b) => {
        const getScore = (name) => {
            const n = name.toLowerCase();
            if (n.includes('fuel') || n.includes('type') || n.includes('seller') || n.includes('transmission') || n.includes('owner') || n.includes('category') || n.includes('status') || n.includes('region') || n.includes('segment') || n.includes('gender') || n.includes('department')) return 10;
            if (n.includes('brand') || n.includes('city') || n.includes('state') || n.includes('country') || n.includes('month')) return 8;
            if (n.includes('name') || n.includes('title') || n.includes('desc') || n.includes('id')) return 2;
            return 5;
        };
        return getScore(b) - getScore(a);
    });

    const firstCat = sortedCatCols[0] || catCols[0] || allCols[0] || '';
    const firstNum = sortedNumCols[0] || numCols[0] || allCols[1] || allCols[0] || '';
    const secondNum = sortedNumCols[1] || sortedNumCols[0] || numCols[1] || numCols[0] || '';

    if (type === 'histogram') {
        if (firstNum && xSelect) xSelect.value = firstNum;
        if (titleInput && xSelect) titleInput.value = `Distribution of ${xSelect.value}`;
    } else if (type === 'scatter') {
        if (firstNum && xSelect) xSelect.value = firstNum;
        if (secondNum && ySelect) ySelect.value = secondNum;
        if (aggSelect) aggSelect.value = 'NONE';
        if (titleInput && xSelect && ySelect) titleInput.value = `${ySelect.value} vs ${xSelect.value} Correlation`;
    } else if (type === 'boxPlot') {
        if (firstCat && xSelect) xSelect.value = firstCat;
        if (firstNum && ySelect) ySelect.value = firstNum;
        if (titleInput && xSelect && ySelect) titleInput.value = `${ySelect.value} Box & Whisker by ${xSelect.value}`;
    } else if (type === 'heatmap') {
        if (firstNum && xSelect) xSelect.value = firstNum;
        if (secondNum && ySelect) ySelect.value = secondNum;
        if (titleInput) titleInput.value = `Correlation Heatmap Matrix`;
    } else if (['gauge', 'bullet'].includes(type)) {
        if (firstNum && xSelect) xSelect.value = firstNum;
        if (secondNum && secondNum !== firstNum && ySelect) ySelect.value = secondNum;
        if (aggSelect) aggSelect.value = 'AVG';
        if (titleInput && xSelect) titleInput.value = `${xSelect.value} ${type === 'gauge' ? 'Target Gauge' : 'Benchmark'}`;
    } else if (type === 'kpi') {
        if (firstNum && ySelect) ySelect.value = firstNum;
        if (aggSelect) aggSelect.value = 'SUM';
        if (titleInput && ySelect) titleInput.value = `Total ${ySelect.value}`;
    } else if (['funnel', 'waterfall', 'treemap', 'gantt', 'geoMap', 'tableMatrix'].includes(type)) {
        if (firstCat && xSelect) xSelect.value = firstCat;
        if (firstNum && ySelect) ySelect.value = firstNum;
        if (aggSelect) aggSelect.value = 'SUM';
        if (titleInput && xSelect && ySelect) titleInput.value = `${ySelect.value} by ${xSelect.value} (${type.toUpperCase()})`;
    } else {
        if (firstCat && xSelect) xSelect.value = firstCat;
        if (firstNum && ySelect) ySelect.value = firstNum;
        if (aggSelect && aggSelect.value === 'NONE') aggSelect.value = 'SUM';
        if (titleInput && xSelect && ySelect) titleInput.value = `${ySelect.value} by ${xSelect.value} (${aggSelect.value || 'Sum'})`;
    }
    
    showToast("Preset Applied", `Configured ${type.toUpperCase()} chart visual.`, "info");
    updateChartPreview();
}

function formatKPIValue(value) {
    if (value === null || value === undefined) return "N/A";
    const num = Number(value);
    if (isNaN(num)) return value;
    
    const absVal = Math.abs(num);
    let formatted = "";
    if (absVal >= 1.0e9) {
        formatted = (num / 1.0e9).toFixed(2).replace(/\.00$/, '') + " B";
    } else if (absVal >= 1.0e6) {
        formatted = (num / 1.0e6).toFixed(2).replace(/\.00$/, '') + " M";
    } else if (absVal >= 1.0e3) {
        formatted = (num / 1.0e3).toFixed(2).replace(/\.00$/, '') + " K";
    } else {
        formatted = num.toLocaleString(undefined, { maximumFractionDigits: 2 });
    }
    return formatted;
}

async function updateChartPreview() {
    const chartTypeElement = document.querySelector('input[name="chart_type"]:checked');
    if (!activeDataset || !chartTypeElement) return;
    
    const chartType = chartTypeElement.value;
    const xCol = document.getElementById("chart-x-axis").value;
    const yCol = document.getElementById("chart-y-axis").value;
    const lineYCol = document.getElementById("chart-line-y-axis").value;
    const aggregate = document.getElementById("chart-aggregation").value;
    const groupBy = document.getElementById("chart-group-by").value;
    const palette = document.getElementById("chart-palette").value;
    const showGrid = document.getElementById("chart-show-grid").checked;
    const title = document.getElementById("chart-title").value.trim() || "Live Chart Preview";

    const errBox = document.getElementById("chart-error-msg");
    errBox.className = "chart-status";
    errBox.innerText = "Generating...";

    // Wipe previous canvas drawings / chart instances before doing anything
    destroyChartInstance("preview-chart-canvas");

    // Handle toggling KPI view vs Canvas view
    const canvas = document.getElementById("preview-chart-canvas");
    let kpiCard = document.getElementById("preview-kpi-card");
    
    if (chartType === 'kpi') {
        canvas.classList.add("hidden");
        if (!kpiCard) {
            kpiCard = document.createElement("div");
            kpiCard.id = "preview-kpi-card";
            kpiCard.className = "kpi-display-card";
            canvas.parentElement.appendChild(kpiCard);
        }
        kpiCard.classList.remove("hidden");
    } else {
        canvas.classList.remove("hidden");
        if (kpiCard) kpiCard.classList.add("hidden");
    }

    // Validation
    if (chartType === 'kpi') {
        if (!yCol) {
            errBox.innerText = "Select KPI Target Value column to aggregate";
            kpiCard.innerHTML = "<div class='kpi-empty'>Select target column</div>";
            return;
        }
    } else if (chartType === 'histogram') {
        if (!xCol) {
            errBox.innerText = "Select numeric distribution column for Histogram";
            return;
        }
    } else if (chartType === 'heatmap') {
        if (!xCol && !yCol) {
            errBox.innerText = "Select dimension/metric columns for Heatmap";
            return;
        }
    } else {
        if (!xCol) {
            errBox.innerText = "Select Category / X-Axis column to render visual";
            return;
        }
        if (chartType === 'bubble' && !yCol) {
            errBox.innerText = "Select Y-axis column for Bubble Chart";
            return;
        }
        if (chartType === 'scatter' && !yCol) {
            errBox.innerText = "Select Y-axis column for Scatter Plot";
            return;
        }
        if (['lineClusteredColumn', 'lineStackedColumn'].includes(chartType) && (!yCol || !lineYCol)) {
            errBox.innerText = "Select both Column Y-Axis and Combo Line Y-Axis columns";
            return;
        }
    }

    try {
        const queryPayload = {
            file: activeDataset,
            x_col: chartType === 'kpi' ? yCol : xCol,
            y_col: chartType === 'kpi' ? null : (yCol || null),
            aggregate: aggregate
        };

        if (chartType === 'histogram') {
            queryPayload.aggregate = 'HISTOGRAM';
            queryPayload.x_col = xCol;
            queryPayload.y_col = null;
        } else if (chartType === 'heatmap') {
            queryPayload.aggregate = 'HEATMAP';
            queryPayload.x_col = xCol || null;
            queryPayload.y_col = yCol || null;
        } else if (chartType === 'boxPlot') {
            queryPayload.aggregate = 'BOXPLOT';
        } else if (chartType === 'funnel') {
            queryPayload.aggregate = 'FUNNEL';
        } else if (chartType === 'waterfall') {
            queryPayload.aggregate = 'WATERFALL';
        } else if (chartType === 'treemap') {
            queryPayload.aggregate = 'TREEMAP';
        } else if (['gauge', 'bullet'].includes(chartType)) {
            queryPayload.aggregate = chartType.toUpperCase();
        } else if (chartType === 'geoMap') {
            queryPayload.aggregate = 'GEOMAP';
        } else if (chartType === 'scatter') {
            queryPayload.aggregate = 'NONE';
        } else if (chartType === 'bubble') {
            const rCol = document.getElementById("chart-r-axis").value;
            if (!rCol) {
                errBox.innerText = "Select Bubble Size (Radius Column)";
                return;
            }
            queryPayload.r_col = rCol;
            queryPayload.aggregate = 'NONE';
        } else if (['lineClusteredColumn', 'lineStackedColumn'].includes(chartType)) {
            queryPayload.line_y_col = lineYCol;
        } else if (chartType !== 'kpi' && groupBy) {
            queryPayload.group_by = groupBy;
        }

        const response = await fetch("/api/datasets/query", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(queryPayload)
        });
        
        const res = await response.json();
        
        if (!res.success) {
            errBox.innerText = res.error || "Failed to fetch aggregated data.";
            errBox.classList.add("error");
            if (chartType === 'kpi') {
                kpiCard.innerHTML = `<div class='kpi-error'>Error loading data</div>`;
            } else {
                destroyChartInstance("preview-chart-canvas");
            }
            return;
        }

        const dataPoints = res.data;
        if (!dataPoints || dataPoints.length === 0) {
            errBox.innerText = "Query returned empty results. Check missing fields.";
            errBox.classList.add("error");
            if (chartType === 'kpi') {
                kpiCard.innerHTML = `<div class='kpi-empty'>No data</div>`;
            } else {
                destroyChartInstance("preview-chart-canvas");
            }
            return;
        }

        // 1. Render KPI Card
        if (chartType === 'kpi') {
            errBox.innerText = "KPI Rendered";
            const val = dataPoints[0][yCol];
            kpiCard.innerHTML = `
                <div class="kpi-glow-number">${formatKPIValue(val)}</div>
                <div class="kpi-glow-label">${aggregate} of ${yCol}</div>
            `;
            return;
        }

        // 2. Render Charts
        let labels = [];
        let datasets = [];
        errBox.innerText = `Visualizing ${dataPoints.length} records`;
        const colors = getPaletteColors(palette, 10);

        if (chartType === 'histogram') {
            labels = dataPoints.map(d => String(d[xCol] ?? ''));
            const counts = dataPoints.map(d => Number(d.count ?? d.frequency ?? 0));
            const histColors = getPaletteColors(palette, labels.length || 10);
            datasets.push({
                label: `Frequency (${xCol})`,
                data: counts,
                backgroundColor: histColors.backgrounds,
                borderColor: histColors.borders,
                borderWidth: 1.5,
                borderRadius: 4
            });
        } else if (['boxPlot', 'funnel', 'waterfall', 'treemap', 'gauge', 'bullet', 'gantt', 'geoMap', 'tableMatrix', 'multiCard', 'ribbon'].includes(chartType)) {
            labels = dataPoints.map(d => String(d[xCol] ?? ''));
            datasets.push({
                label: title || chartType,
                data: dataPoints
            });
        } else if (chartType === 'heatmap') {
            const xUnique = [...new Set(dataPoints.map(d => d.x))];
            labels = xUnique;
            datasets.push({
                label: 'Correlation Heatmap',
                data: dataPoints
            });
        } else if (chartType === 'scatter') {
            const scatterData = dataPoints.map(item => ({
                x: Number(item[xCol] ?? 0),
                y: Number(item[yCol] ?? 0)
            }));
            const paletteColors = getPaletteColors(palette, 1);
            datasets.push({
                label: `${yCol} vs ${xCol}`,
                data: scatterData,
                backgroundColor: paletteColors.backgrounds[0],
                borderColor: paletteColors.borders[0],
                borderWidth: 1.5,
                pointRadius: 6,
                pointHoverRadius: 8
            });
            labels = [];
        } else if (chartType === 'bubble') {
            const rCol = queryPayload.r_col;
            const rValues = dataPoints.map(d => Number(d[rCol] || 0));
            const minR = Math.min(...rValues);
            const maxR = Math.max(...rValues);
            const rangeR = maxR - minR || 1;
            
            const bubbleData = dataPoints.map(item => {
                const rVal = Number(item[rCol] || 0);
                const scaledR = 4 + ((rVal - minR) / rangeR) * 21;
                return {
                    x: Number(item[xCol] ?? 0),
                    y: Number(item[yCol] ?? 0),
                    r: scaledR
                };
            });
            
            const paletteColors = getPaletteColors(palette, 1);
            datasets.push({
                label: `${yCol} by ${xCol} (Bubble: ${rCol})`,
                data: bubbleData,
                backgroundColor: paletteColors.backgrounds[0],
                borderColor: paletteColors.borders[0],
                borderWidth: 1.5
            });
            labels = [];
            
        } else if (['lineClusteredColumn', 'lineStackedColumn'].includes(chartType)) {
            // Combo Mixed Chart: main column vs secondary line
            labels = dataPoints.map(item => String(item[xCol] ?? 'Null'));
            const barValues = dataPoints.map(item => item[yCol] ?? 0);
            const lineValues = dataPoints.map(item => item[lineYCol] ?? 0);
            
            datasets.push({
                label: `${yCol} (${aggregate})`,
                data: barValues,
                backgroundColor: colors.backgrounds[0],
                borderColor: colors.borders[0],
                borderWidth: 1.5,
                type: 'bar'
            });
            
            datasets.push({
                label: `${lineYCol} (${aggregate})`,
                data: lineValues,
                backgroundColor: 'rgba(255, 99, 132, 0.2)',
                borderColor: 'rgba(255, 99, 132, 1)',
                borderWidth: 3,
                tension: 0.35,
                pointBackgroundColor: 'rgba(255, 99, 132, 1)',
                type: 'line'
            });
            
        } else if (groupBy && dataPoints.length > 0) {
            // Grouped Category Chart
            const xCategories = [...new Set(dataPoints.map(item => String(item[xCol] ?? 'Null')))];
            const groups = [...new Set(dataPoints.map(item => String(item[groupBy] ?? 'Null')))];
            labels = xCategories;
            
            groups.forEach((groupVal, grpIdx) => {
                const groupColors = getPaletteColors(palette, groups.length);
                const dsData = xCategories.map(xCat => {
                    const record = dataPoints.find(d => String(d[xCol] ?? 'Null') === xCat && String(d[groupBy] ?? 'Null') === groupVal);
                    if (record) return yCol ? (record[yCol] ?? 0) : 1;
                    return 0;
                });
                
                datasets.push({
                    label: groupVal,
                    data: dsData,
                    backgroundColor: groupColors.backgrounds[grpIdx],
                    borderColor: groupColors.borders[grpIdx],
                    borderWidth: 1.5
                });
            });
        } else {
            // Simple Chart (Bar, Column, Pie, Line, Area, Doughnut, Radar, etc.)
            labels = dataPoints.map(item => String(item[xCol] ?? 'Null'));
            const values = dataPoints.map(item => yCol ? (item[yCol] ?? 0) : 1);
            const isCircular = ['pie', 'doughnut', 'polarArea'].includes(chartType);
            const sliceColors = getPaletteColors(palette, labels.length);
            
            datasets.push({
                label: yCol ? `${yCol} (${aggregate})` : 'Row Count',
                data: values,
                backgroundColor: isCircular ? sliceColors.backgrounds : sliceColors.backgrounds[0],
                borderColor: isCircular ? sliceColors.borders : sliceColors.borders[0],
                borderWidth: 1.5
            });
        }
        
        // Apply 100% stack normalization if selected
        if (['percentStackedColumn', 'percentStackedBar'].includes(chartType) && labels.length > 0 && datasets.length > 0) {
            for (let i = 0; i < labels.length; i++) {
                const total = datasets.reduce((sum, ds) => sum + Math.abs(Number(ds.data[i] || 0)), 0);
                if (total > 0) {
                    datasets.forEach(ds => {
                        ds.data[i] = Number(((Number(ds.data[i] || 0) / total) * 100).toFixed(2));
                    });
                } else {
                    datasets.forEach(ds => { ds.data[i] = 0; });
                }
            }
        }

        const showLabels = document.getElementById("chart-show-labels") ? document.getElementById("chart-show-labels").checked : false;

        buildChart(
            "preview-chart-canvas", 
            chartType, 
            labels, 
            datasets, 
            showGrid, 
            { title: title, showLegend: true, showDataLabels: showLabels }
        );
        
    } catch (e) {
        errBox.innerText = "Error building visual graph representation.";
        errBox.classList.add("error");
        console.error(e);
    }
}

function addChartToDashboard() {
    const chartTypeElement = document.querySelector('input[name="chart_type"]:checked');
    if (!activeDataset || !chartTypeElement) return;

    const chartType = chartTypeElement.value;
    const xCol = document.getElementById("chart-x-axis").value;
    const yCol = document.getElementById("chart-y-axis").value;
    const lineYCol = document.getElementById("chart-line-y-axis").value;
    const aggregate = document.getElementById("chart-aggregation").value;
    const groupBy = document.getElementById("chart-group-by").value;
    const palette = document.getElementById("chart-palette").value;
    const showGrid = document.getElementById("chart-show-grid").checked;
    const title = document.getElementById("chart-title").value.trim() || `Chart ${savedCharts.length + 1}`;

    const showLabels = document.getElementById("chart-show-labels") ? document.getElementById("chart-show-labels").checked : false;

    const chartConfig = {
        id: "dashboard-widget-" + Date.now(),
        title: title,
        type: chartType,
        x_col: xCol,
        y_col: yCol || null,
        aggregate: aggregate,
        group_by: groupBy || null,
        palette: palette,
        show_grid: showGrid,
        show_labels: showLabels,
        file: activeDataset
    };

    if (chartType === 'kpi') {
        if (!yCol) {
            showToast("Configuration Incomplete", "Please select the target column for your KPI.", "warning");
            return;
        }
        chartConfig.x_col = yCol; 
        chartConfig.y_col = null;
        chartConfig.show_grid = false;
    } else if (chartType === 'histogram') {
        chartConfig.aggregate = 'HISTOGRAM';
        chartConfig.y_col = null;
    } else if (chartType === 'heatmap') {
        chartConfig.aggregate = 'HEATMAP';
    } else if (chartType === 'boxPlot') {
        chartConfig.aggregate = 'BOXPLOT';
    } else if (chartType === 'funnel') {
        chartConfig.aggregate = 'FUNNEL';
    } else if (chartType === 'waterfall') {
        chartConfig.aggregate = 'WATERFALL';
    } else if (chartType === 'treemap') {
        chartConfig.aggregate = 'TREEMAP';
    } else if (['gauge', 'bullet'].includes(chartType)) {
        chartConfig.aggregate = chartType.toUpperCase();
    } else if (chartType === 'geoMap') {
        chartConfig.aggregate = 'GEOMAP';
    } else if (chartType === 'scatter') {
        chartConfig.aggregate = 'NONE';
    } else if (chartType === 'bubble') {
        const rCol = document.getElementById("chart-r-axis").value;
        if (!xCol || !yCol || !rCol) {
            showToast("Configuration Incomplete", "Bubble charts require X-Axis, Y-Axis, and Radius variables.", "warning");
            return;
        }
        chartConfig.r_col = rCol;
        chartConfig.aggregate = 'NONE';
    } else if (['lineClusteredColumn', 'lineStackedColumn'].includes(chartType)) {
        if (!xCol || !yCol || !lineYCol) {
            showToast("Configuration Incomplete", "Combo charts require X-Axis, Column Y-Axis, and Line Y-Axis columns.", "warning");
            return;
        }
        chartConfig.line_y_col = lineYCol;
    } else {
        if (!xCol) {
            showToast("Configuration Incomplete", "Please select X-axis variable.", "warning");
            return;
        }
    }

    savedCharts.push(chartConfig);
    saveDashboardToStorage();
    showToast("Pinned to Dashboard", `"${title}" added to Report Workspace.`, "success");
    switchTab("dashboard");
}

function clearDashboard() {
    savedCharts.forEach(widget => {
        destroyChartInstance(`canvas-${widget.id}`);
    });
    savedCharts = [];
    saveDashboardToStorage();
    renderDashboardReport();
    showToast("Dashboard Reset", "All widgets cleared from workspace.", "info");
}

function removeDashboardWidget(id) {
    destroyChartInstance(`canvas-${id}`);
    savedCharts = savedCharts.filter(w => w.id !== id);
    saveDashboardToStorage();
    renderDashboardReport();
}

async function renderDashboardReport() {
    const grid = document.getElementById("dashboard-grid");
    const emptyMsg = document.getElementById("empty-dashboard-msg");
    
    // Update KPI summary strip
    if (typeof updateDashboardKpiStrip === 'function') {
        updateDashboardKpiStrip();
    }

    document.querySelectorAll(".dashboard-card").forEach(c => c.remove());
    
    if (savedCharts.length === 0) {
        emptyMsg.classList.remove("hidden");
        return;
    }
    
    emptyMsg.classList.add("hidden");
    
    for (const widget of savedCharts) {
        const card = document.createElement("div");
        card.className = "dashboard-card";
        card.id = widget.id;
        
        if (widget.type === 'kpi') {
            card.innerHTML = `
                <div class="dashboard-card-header">
                    <h4>${widget.title}</h4>
                    <button class="btn btn-icon btn-sm" onclick="removeDashboardWidget('${widget.id}')" title="Delete card">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </div>
                <div class="kpi-card-content">
                    <span class="kpi-value" id="kpi-val-${widget.id}">Calculating...</span>
                    <span class="kpi-label">${widget.aggregate} of ${widget.x_col}</span>
                </div>
            `;
            grid.appendChild(card);
            
            try {
                const response = await fetch("/api/datasets/query", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        file: widget.file,
                        x_col: widget.x_col,
                        y_col: null,
                        aggregate: widget.aggregate
                    })
                });
                const res = await response.json();
                if (res.success && res.data.length > 0) {
                    const val = res.data[0][widget.x_col];
                    document.getElementById(`kpi-val-${widget.id}`).innerText = formatKPIValue(val);
                } else {
                    document.getElementById(`kpi-val-${widget.id}`).innerText = "Error";
                }
            } catch (err) {
                document.getElementById(`kpi-val-${widget.id}`).innerText = "Error";
            }
        } else {
            card.innerHTML = `
                <div class="dashboard-card-header">
                    <h4>${widget.title}</h4>
                    <button class="btn btn-icon btn-sm" onclick="removeDashboardWidget('${widget.id}')" title="Delete chart">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </div>
                <div class="chart-wrapper">
                    <canvas id="canvas-${widget.id}"></canvas>
                </div>
            `;
            grid.appendChild(card);
            
            try {
                const queryPayload = {
                    file: widget.file,
                    x_col: widget.x_col,
                    y_col: widget.y_col,
                    aggregate: widget.aggregate
                };

                if (widget.type === 'histogram') {
                    queryPayload.aggregate = 'HISTOGRAM';
                    queryPayload.y_col = null;
                } else if (widget.type === 'heatmap') {
                    queryPayload.aggregate = 'HEATMAP';
                } else if (widget.type === 'boxPlot') {
                    queryPayload.aggregate = 'BOXPLOT';
                } else if (widget.type === 'funnel') {
                    queryPayload.aggregate = 'FUNNEL';
                } else if (widget.type === 'waterfall') {
                    queryPayload.aggregate = 'WATERFALL';
                } else if (widget.type === 'treemap') {
                    queryPayload.aggregate = 'TREEMAP';
                } else if (['gauge', 'bullet'].includes(widget.type)) {
                    queryPayload.aggregate = widget.type.toUpperCase();
                } else if (widget.type === 'geoMap') {
                    queryPayload.aggregate = 'GEOMAP';
                } else if (widget.type === 'scatter') {
                    queryPayload.aggregate = 'NONE';
                } else if (widget.type === 'bubble') {
                    queryPayload.r_col = widget.r_col;
                    queryPayload.aggregate = 'NONE';
                } else if (['lineClusteredColumn', 'lineStackedColumn'].includes(widget.type)) {
                    queryPayload.line_y_col = widget.line_y_col;
                } else if (widget.group_by) {
                    queryPayload.group_by = widget.group_by;
                }

                const response = await fetch("/api/datasets/query", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(queryPayload)
                });
                const res = await response.json();
                
                if (res.success && res.data.length > 0) {
                    const dataPoints = res.data;
                    let labels = [];
                    let datasets = [];
                    const colors = getPaletteColors(widget.palette, 10);
                    
                    if (widget.type === 'histogram') {
                        labels = dataPoints.map(d => String(d[widget.x_col] ?? ''));
                        const counts = dataPoints.map(d => Number(d.count ?? d.frequency ?? 0));
                        const histColors = getPaletteColors(widget.palette, labels.length || 10);
                        datasets.push({
                            label: `Frequency (${widget.x_col})`,
                            data: counts,
                            backgroundColor: histColors.backgrounds,
                            borderColor: histColors.borders,
                            borderWidth: 1.5,
                            borderRadius: 4
                        });
                    } else if (['boxPlot', 'funnel', 'waterfall', 'treemap', 'gauge', 'bullet', 'gantt', 'geoMap', 'tableMatrix', 'multiCard', 'ribbon'].includes(widget.type)) {
                        labels = dataPoints.map(d => String(d[widget.x_col] ?? ''));
                        datasets.push({
                            label: widget.title || widget.type,
                            data: dataPoints
                        });
                    } else if (widget.type === 'heatmap') {
                        const xUnique = [...new Set(dataPoints.map(d => d.x))];
                        labels = xUnique;
                        datasets.push({
                            label: 'Correlation Heatmap',
                            data: dataPoints
                        });
                    } else if (widget.type === 'scatter') {
                        const scatterData = dataPoints.map(item => ({
                            x: Number(item[widget.x_col] ?? 0),
                            y: Number(item[widget.y_col] ?? 0)
                        }));
                        const paletteColors = getPaletteColors(widget.palette, 1);
                        datasets.push({
                            label: `${widget.y_col} vs ${widget.x_col}`,
                            data: scatterData,
                            backgroundColor: paletteColors.backgrounds[0],
                            borderColor: paletteColors.borders[0],
                            borderWidth: 1.5,
                            pointRadius: 5,
                            pointHoverRadius: 7
                        });
                        labels = [];
                    } else if (widget.type === 'bubble') {
                        const rValues = dataPoints.map(d => Number(d[widget.r_col] || 0));
                        const minR = Math.min(...rValues);
                        const maxR = Math.max(...rValues);
                        const rangeR = maxR - minR || 1;
                        
                        const bubbleData = dataPoints.map(item => {
                            const rVal = Number(item[widget.r_col] || 0);
                            return {
                                x: Number(item[widget.x_col] ?? 0),
                                y: Number(item[widget.y_col] ?? 0),
                                r: 4 + ((rVal - minR) / rangeR) * 21
                            };
                        });
                        const paletteColors = getPaletteColors(widget.palette, 1);
                        datasets.push({
                            label: `${widget.y_col} by ${widget.x_col} (Bubble: ${widget.r_col})`,
                            data: bubbleData,
                            backgroundColor: paletteColors.backgrounds[0],
                            borderColor: paletteColors.borders[0],
                            borderWidth: 1.5
                        });
                        labels = [];
                    } else if (['lineClusteredColumn', 'lineStackedColumn'].includes(widget.type)) {
                        labels = dataPoints.map(item => String(item[widget.x_col] ?? 'Null'));
                        datasets.push({
                            label: `${widget.y_col} (${widget.aggregate})`,
                            data: dataPoints.map(item => item[widget.y_col] ?? 0),
                            backgroundColor: colors.backgrounds[0],
                            borderColor: colors.borders[0],
                            borderWidth: 1.5,
                            type: 'bar'
                        });
                        datasets.push({
                            label: `${widget.line_y_col} (${widget.aggregate})`,
                            data: dataPoints.map(item => item[widget.line_y_col] ?? 0),
                            backgroundColor: 'rgba(255, 99, 132, 0.2)',
                            borderColor: 'rgba(255, 99, 132, 1)',
                            borderWidth: 3,
                            tension: 0.35,
                            pointBackgroundColor: 'rgba(255, 99, 132, 1)',
                            type: 'line'
                        });
                    } else if (widget.group_by) {
                        const xCats = [...new Set(dataPoints.map(item => String(item[widget.x_col] ?? 'Null')))];
                        const groups = [...new Set(dataPoints.map(item => String(item[widget.group_by] ?? 'Null')))];
                        labels = xCats;
                        
                        groups.forEach((groupVal, grpIdx) => {
                            const groupColors = getPaletteColors(widget.palette, groups.length);
                            const dsData = xCats.map(xCat => {
                                const record = dataPoints.find(d => String(d[widget.x_col] ?? 'Null') === xCat && String(d[widget.group_by] ?? 'Null') === groupVal);
                                if (record) return widget.y_col ? (record[widget.y_col] ?? 0) : 1;
                                return 0;
                            });
                            datasets.push({
                                label: groupVal,
                                data: dsData,
                                backgroundColor: groupColors.backgrounds[grpIdx],
                                borderColor: groupColors.borders[grpIdx],
                                borderWidth: 1.5
                            });
                        });
                    } else {
                        labels = dataPoints.map(item => String(item[widget.x_col] ?? 'Null'));
                        const values = dataPoints.map(item => widget.y_col ? (item[widget.y_col] ?? 0) : 1);
                        const isCircular = ['pie', 'doughnut', 'polarArea'].includes(widget.type);
                        const sliceColors = getPaletteColors(widget.palette, labels.length);
                        
                        datasets.push({
                            label: widget.y_col ? `${widget.y_col} (${widget.aggregate})` : 'Row Count',
                            data: values,
                            backgroundColor: (isCircular || ['bar', 'horizontalBar', 'histogram'].includes(widget.type)) ? sliceColors.backgrounds : sliceColors.backgrounds[0],
                            borderColor: (isCircular || ['bar', 'horizontalBar', 'histogram'].includes(widget.type)) ? sliceColors.borders : sliceColors.borders[0],
                            borderWidth: 1.5
                        });
                    }
                    
                    // Apply 100% stack normalization
                    if (['percentStackedColumn', 'percentStackedBar'].includes(widget.type) && labels.length > 0 && datasets.length > 0) {
                        for (let i = 0; i < labels.length; i++) {
                            const total = datasets.reduce((sum, ds) => sum + Math.abs(Number(ds.data[i] || 0)), 0);
                            if (total > 0) {
                                datasets.forEach(ds => {
                                    ds.data[i] = Number(((Number(ds.data[i] || 0) / total) * 100).toFixed(2));
                                });
                            } else {
                                datasets.forEach(ds => { ds.data[i] = 0; });
                            }
                        }
                    }

                    buildChart(
                        `canvas-${widget.id}`, 
                        widget.type, 
                        labels, 
                        datasets, 
                        widget.show_grid, 
                        { title: '', showLegend: true, showDataLabels: widget.show_labels }
                    );
                }
            } catch (e) {
                console.error("Failed to build widget: " + widget.id, e);
            }
        }
    }
}

// ==========================================
// FULLSCREEN CHART MODAL LOGIC
// ==========================================
let fullscreenChartInstance = null;

function openFullscreenChart(sourceCanvasId) {
    const sourceCanvas = document.getElementById(sourceCanvasId);
    if (!sourceCanvas) return;

    const sourceChart = activeChartInstances[sourceCanvasId];
    if (!sourceChart) return;

    const modal = document.getElementById("fullscreen-modal");
    const modalTitle = document.getElementById("fullscreen-modal-title");
    modalTitle.textContent = sourceChart.options.plugins.title?.text || "Chart Detail View";

    modal.classList.add("visible");

    // Clone & render chart on fullscreen canvas
    const targetCanvasId = "fullscreen-chart-canvas";
    if (fullscreenChartInstance) {
        fullscreenChartInstance.destroy();
    }

    fullscreenChartInstance = buildChart(
        targetCanvasId,
        sourceChart.config.type,
        sourceChart.data.labels,
        JSON.parse(JSON.stringify(sourceChart.data.datasets)),
        true,
        {
            title: sourceChart.options.plugins.title?.text || "",
            showLegend: true,
            showDataLabels: sourceChart.options.plugins.aetherDataLabels?.enabled
        }
    );
}

function closeFullscreenChart() {
    const modal = document.getElementById("fullscreen-modal");
    modal.classList.remove("visible");
    if (fullscreenChartInstance) {
        fullscreenChartInstance.destroy();
        fullscreenChartInstance = null;
    }
}

// ==========================================
// KEYBOARD SHORTCUTS HANDLER
// ==========================================
document.addEventListener("keydown", (e) => {
    // ESC -> Close modals & drawers
    if (e.key === "Escape") {
        closeFullscreenChart();
        closeStatsDrawer();
        closeConfirmDialog();
    }

    // Ctrl + 1..4 -> Switch Navigation Tabs
    if (e.ctrlKey && !e.shiftKey && !e.altKey) {
        if (e.key === "1") {
            e.preventDefault();
            switchTab("datasets");
        } else if (e.key === "2") {
            e.preventDefault();
            switchTab("cleaner");
        } else if (e.key === "3") {
            e.preventDefault();
            switchTab("visualizer");
        } else if (e.key === "4") {
            e.preventDefault();
            switchTab("dashboard");
        } else if (e.key === "s" || e.key === "S") {
            // Ctrl + S -> Pin to Dashboard (if on Graph Builder tab)
            const activePanel = document.querySelector(".tab-panel.active");
            if (activePanel && activePanel.id === "panel-visualizer") {
                e.preventDefault();
                addChartToDashboard();
            }
        }
    }
});
// ==========================================
// AI COPILOT & CHART NARRATIVE ENGINE
// ==========================================
function openAiKeyModal() {
    const savedKey = localStorage.getItem("aetherbi-ai-key") || "";
    const savedProvider = localStorage.getItem("aetherbi-ai-provider") || "gemini";
    
    document.getElementById("ai-api-key-input").value = savedKey;
    document.getElementById("ai-provider-select").value = savedProvider;
    document.getElementById("ai-key-modal-overlay").classList.add("visible");
}

function closeAiKeyModal() {
    document.getElementById("ai-key-modal-overlay").classList.remove("visible");
}

function saveAiKey() {
    const key = document.getElementById("ai-api-key-input").value.trim();
    const provider = document.getElementById("ai-provider-select").value;
    
    localStorage.setItem("aetherbi-ai-key", key);
    localStorage.setItem("aetherbi-ai-provider", provider);
    
    closeAiKeyModal();
    if (key) {
        showToast("AI Key Saved", `Configured ${provider === 'gemini' ? 'Google Gemini' : 'OpenAI'} API key.`, "success");
    } else {
        showToast("Key Cleared", "Using built-in analytical engine.", "info");
    }
}

function clearAiKey() {
    localStorage.removeItem("aetherbi-ai-key");
    localStorage.removeItem("aetherbi-ai-provider");
    document.getElementById("ai-api-key-input").value = "";
    closeAiKeyModal();
    showToast("AI Key Cleared", "Reset to default engine.", "info");
}

function toggleApiKeyVisibility() {
    const input = document.getElementById("ai-api-key-input");
    const eye = document.getElementById("toggle-key-eye");
    if (!input || !eye) return;
    if (input.type === "password") {
        input.type = "text";
        eye.classList.remove("fa-eye");
        eye.classList.add("fa-eye-slash");
    } else {
        input.type = "password";
        eye.classList.remove("fa-eye-slash");
        eye.classList.add("fa-eye");
    }
}

async function generateAiChartSummary(canvasId) {
    const chart = activeChartInstances[canvasId];
    if (!chart) {
        showToast("No Chart Data", "Please plot a chart before generating AI insights.", "warning");
        return;
    }

    const container = document.getElementById("preview-ai-insights-container");
    if (!container) return;

    container.innerHTML = `
        <div class="ai-insights-card">
            <div class="ai-insights-header">
                <span class="ai-insights-title"><i class="fa-solid fa-wand-magic-sparkles"></i> AI Copilot Narrative Engine</span>
                <span class="ai-badge-provider">Analyzing Data...</span>
            </div>
            <div class="spinner-container" style="padding: 20px 0;">
                <div class="spinner"></div>
                <p style="margin-top:10px; font-size:0.85rem; color:var(--text-muted);">Synthesizing trends, anomalies, and business recommendations...</p>
            </div>
        </div>
    `;

    // Extract plot data from Chart.js object
    const chartTitle = chart.options.plugins.title?.text || document.getElementById("chart-title")?.value || "Chart Analysis";
    const xCol = document.getElementById("chart-x-axis")?.value || "Category";
    const yCol = document.getElementById("chart-y-axis")?.value || "Value";
    const aggregate = document.getElementById("chart-aggregation")?.value || "NONE";
    const chartType = chart.config.type;

    const labels = chart.data.labels || [];
    const datasets = chart.data.datasets || [];

    const dataPoints = [];
    if (labels.length > 0 && datasets.length > 0) {
        const firstDs = datasets[0];
        labels.forEach((lbl, idx) => {
            const pt = {};
            pt[xCol] = lbl;
            pt[yCol || 'Value'] = firstDs.data[idx];
            dataPoints.push(pt);
        });
    }

    const apiKey = localStorage.getItem("aetherbi-ai-key") || "";
    const provider = localStorage.getItem("aetherbi-ai-provider") || "gemini";

    try {
        const response = await fetch("/api/ai/summarize-chart", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-AI-API-Key": apiKey
            },
            body: JSON.stringify({
                title: chartTitle,
                chart_type: chartType,
                x_col: xCol,
                y_col: yCol,
                aggregate: aggregate,
                data_points: dataPoints,
                api_key: apiKey,
                provider: provider
            })
        });

        const res = await response.json();

        if (res.success && res.data) {
            renderAiInsightsCard(container, res.data, res.provider);
        } else {
            container.innerHTML = `
                <div class="ai-insights-card">
                    <p style="color:var(--danger);">Failed to generate AI insights: ${res.error || 'Unknown error'}</p>
                </div>
            `;
        }
    } catch (err) {
        container.innerHTML = `
            <div class="ai-insights-card">
                <p style="color:var(--danger);">Network error while connecting to AI engine: ${err.message}</p>
            </div>
        `;
    }
}

function renderAiInsightsCard(container, aiData, providerName) {
    const headline = aiData.headline || "Executive Business Summary";
    const whatIsHappening = aiData.what_is_happening || "";
    const topPerf = aiData.top_performer || "N/A";
    const botPerf = aiData.bottom_performer || "N/A";
    const insights = aiData.insights || [];
    const focusAreas = aiData.where_to_focus || [];
    const salesActionPlan = aiData.how_to_increase_sales || (aiData.recommendation ? [aiData.recommendation] : []);

    const bulletsHtml = insights.map(b => `<li>${b}</li>`).join("");
    const focusHtml = focusAreas.map(f => `<li><i class="fa-solid fa-crosshairs" style="color:var(--secondary); margin-right:6px;"></i> ${f}</li>`).join("");
    const salesPlanHtml = salesActionPlan.map(s => `<li><i class="fa-solid fa-rocket" style="color:#ffe600; margin-right:6px;"></i> ${s}</li>`).join("");

    container.innerHTML = `
        <div class="ai-insights-card">
            <div class="ai-insights-header">
                <span class="ai-insights-title">
                    <i class="fa-solid fa-wand-magic-sparkles"></i> AI Business Intelligence Advisor
                </span>
                <span class="ai-badge-provider">${providerName || 'AI Insights'}</span>
            </div>
            
            <div class="ai-headline">${headline}</div>

            ${whatIsHappening ? `
                <div style="background:rgba(255,255,255,0.03); border-left:3px solid var(--primary); padding:10px 14px; border-radius:0 8px 8px 0; margin-bottom:14px;">
                    <strong style="font-size:0.82rem; text-transform:uppercase; letter-spacing:0.5px; color:var(--primary-light,#00f2fe); display:block; margin-bottom:4px;">
                        <i class="fa-solid fa-circle-info"></i> What is Happening (Dataset Context)
                    </strong>
                    <p style="font-size:0.88rem; color:var(--text-secondary); line-height:1.5; margin:0;">${whatIsHappening}</p>
                </div>
            ` : ''}

            <div class="ai-performer-grid">
                <div class="ai-performer-box top">
                    <span class="tag"><i class="fa-solid fa-trophy"></i> Top Performer / Volume Leader</span>
                    <span class="val">${topPerf}</span>
                </div>
                <div class="ai-performer-box bottom">
                    <span class="tag"><i class="fa-solid fa-triangle-exclamation"></i> Lowest Category / Deficit</span>
                    <span class="val">${botPerf}</span>
                </div>
            </div>

            <h5 style="font-size:0.82rem; text-transform:uppercase; letter-spacing:0.5px; color:var(--text-muted); margin:14px 0 8px 0;">
                <i class="fa-solid fa-chart-column"></i> Volume & Metrics Breakdown
            </h5>
            <ul class="ai-bullets-list">
                ${bulletsHtml}
            </ul>

            ${focusHtml ? `
                <div style="background:rgba(155, 81, 224, 0.08); border:1px solid rgba(155, 81, 224, 0.25); border-radius:10px; padding:12px 14px; margin-top:14px;">
                    <strong style="font-size:0.85rem; color:#e0b0ff; text-transform:uppercase; letter-spacing:0.5px; display:block; margin-bottom:6px;">
                        <i class="fa-solid fa-bullseye"></i> Where to Focus On
                    </strong>
                    <ul style="list-style:none; padding:0; margin:0; font-size:0.88rem; color:var(--text-primary); line-height:1.6;">
                        ${focusHtml}
                    </ul>
                </div>
            ` : ''}

            ${salesPlanHtml ? `
                <div class="ai-recommendation-box margin-top">
                    <strong style="font-size:0.88rem; display:block; margin-bottom:6px; color:#ffe600;">
                        <i class="fa-solid fa-lightbulb"></i> How to Increase Sales & Boost Results
                    </strong>
                    <ul style="list-style:none; padding:0; margin:0; font-size:0.88rem; line-height:1.6;">
                        ${salesPlanHtml}
                    </ul>
                </div>
            ` : ''}
        </div>
    `;
}

function renderCombinedAiInsightsCard(container, aiData, providerName) {
    const headline = aiData.headline || "Multi-Graph Combined Report Strategy";
    const whatIsHappening = aiData.what_is_happening || aiData.executive_summary || "";
    const insights = aiData.cross_graph_insights || [];
    const metrics = aiData.key_metrics_summary || [];
    const focusAreas = aiData.where_to_focus || [];
    const salesActionPlan = aiData.how_to_increase_sales || aiData.strategic_recommendations || [];

    const bulletsHtml = insights.map(b => `<li>${b}</li>`).join("");
    const metricsHtml = metrics.map(m => `
        <div class="ai-metrics-card">
            <div class="metric-label">${m.label}</div>
            <div class="metric-value">${m.val}</div>
        </div>
    `).join("");

    const focusHtml = focusAreas.map(f => `<li><i class="fa-solid fa-crosshairs" style="color:var(--secondary); margin-right:6px;"></i> ${f}</li>`).join("");
    const salesPlanHtml = salesActionPlan.map(s => `<li><i class="fa-solid fa-rocket" style="color:#ffe600; margin-right:6px;"></i> ${s}</li>`).join("");

    container.innerHTML = `
        <div class="ai-insights-card">
            <div class="ai-insights-header">
                <span class="ai-insights-title">
                    <i class="fa-solid fa-wand-magic-sparkles"></i> Combined Executive Report Narrative
                </span>
                <div style="display:flex; align-items:center; gap:10px;">
                    <button class="btn btn-secondary btn-sm" onclick="speakAudioSummary(document.getElementById('dashboard-ai-insights-container').innerText)" title="Listen to Executive Audio Summary" style="padding:4px 10px; font-size:0.75rem; color:var(--secondary); background:rgba(13,148,136,0.12); border:1px solid rgba(13,148,136,0.3);">
                        <i class="fa-solid fa-volume-high"></i> <span>Listen Audio</span>
                    </button>
                    <span class="ai-badge-provider">${providerName || 'Multi-Graph Strategy AI'}</span>
                    <button class="btn btn-icon btn-sm" onclick="closeDashboardAiInsights()" title="Dismiss AI Insights">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
            </div>

            <div class="ai-headline">${headline}</div>
            
            ${whatIsHappening ? `
                <div style="background:rgba(255,255,255,0.03); border-left:3px solid var(--secondary); padding:10px 14px; border-radius:0 8px 8px 0; margin-bottom:14px;">
                    <strong style="font-size:0.82rem; text-transform:uppercase; letter-spacing:0.5px; color:var(--secondary-light,#00f2fe); display:block; margin-bottom:4px;">
                        <i class="fa-solid fa-chart-line"></i> What is Happening Across All Graphs
                    </strong>
                    <p style="font-size:0.9rem; color:var(--text-secondary); line-height:1.6; margin:0;">${whatIsHappening}</p>
                </div>
            ` : ''}

            ${metricsHtml ? `<div class="ai-metrics-grid">${metricsHtml}</div>` : ''}

            <h5 style="font-size:0.82rem; text-transform:uppercase; letter-spacing:0.5px; color:var(--text-muted); margin:14px 0 8px 0;">
                <i class="fa-solid fa-diagram-project"></i> Multi-Graph Figures & Volume Breakdown
            </h5>
            <ul class="ai-bullets-list">
                ${bulletsHtml}
            </ul>

            ${focusHtml ? `
                <div style="background:rgba(155, 81, 224, 0.08); border:1px solid rgba(155, 81, 224, 0.25); border-radius:10px; padding:12px 14px; margin-top:14px;">
                    <strong style="font-size:0.85rem; color:#e0b0ff; text-transform:uppercase; letter-spacing:0.5px; display:block; margin-bottom:6px;">
                        <i class="fa-solid fa-bullseye"></i> Where to Focus On (Key Segments & Areas)
                    </strong>
                    <ul style="list-style:none; padding:0; margin:0; font-size:0.88rem; color:var(--text-primary); line-height:1.6;">
                        ${focusHtml}
                    </ul>
                </div>
            ` : ''}

            ${salesPlanHtml ? `
                <div class="ai-recommendation-box margin-top">
                    <strong style="font-size:0.88rem; display:block; margin-bottom:6px; color:#ffe600;">
                        <i class="fa-solid fa-rocket"></i> How to Increase Sales & Business Growth Action Plan
                    </strong>
                    <ul style="list-style:none; padding:0; margin:0; font-size:0.88rem; line-height:1.6;">
                        ${salesPlanHtml}
                    </ul>
                </div>
            ` : ''}
        </div>
    `;
}

function closeDashboardAiInsights() {
    const container = document.getElementById("dashboard-ai-insights-container");
    if (container) {
        container.innerHTML = "";
    }
}

async function generateCombinedReportAiInsights() {
    const container = document.getElementById("dashboard-ai-insights-container");
    if (!container) return;

    if (!savedCharts || savedCharts.length === 0) {
        showToast("No Visuals Pinned", "Please pin at least one visual from the Graph Builder to generate an executive briefing.", "warning");
        return;
    }

    container.innerHTML = `
        <div class="ai-insights-card">
            <div class="ai-insights-header">
                <span class="ai-insights-title">
                    <i class="fa-solid fa-wand-magic-sparkles"></i> AI Executive Briefing Engine
                </span>
                <span class="ai-badge-provider">Analyzing ${savedCharts.length} Visuals...</span>
            </div>
            <div class="spinner-container" style="padding: 24px 0; text-align: center;">
                <div class="spinner"></div>
                <p style="margin-top:12px; font-size:0.9rem; color:var(--text-muted);">
                    Synthesizing cross-widget metrics, trends, revenue drivers, and executive growth action plans across all pinned charts...
                </p>
            </div>
        </div>
    `;

    container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    const reportTitle = document.getElementById("dashboard-title")?.innerText?.trim() || "Executive Performance Dashboard";
    const reportSubtitle = document.getElementById("dashboard-subtitle")?.innerText?.trim() || "Quarterly Data Intelligence & KPI Summary Analysis";

    // Prepare chart payloads
    const chartsPayload = [];
    for (let i = 0; i < savedCharts.length; i++) {
        const widget = savedCharts[i];
        let dataPoints = [];

        // Check active chart instance first
        const chartInst = activeChartInstances[`canvas-${widget.id}`];
        if (chartInst && chartInst.data && chartInst.data.labels && chartInst.data.labels.length > 0) {
            const labels = chartInst.data.labels;
            const datasets = chartInst.data.datasets || [];
            if (datasets.length > 0) {
                const firstDs = datasets[0];
                labels.forEach((lbl, idx) => {
                    const pt = {};
                    pt[widget.x_col || 'Category'] = lbl;
                    pt[widget.y_col || 'Value'] = (firstDs.data && firstDs.data[idx] !== undefined) ? firstDs.data[idx] : 0;
                    dataPoints.push(pt);
                });
            }
        }

        // Fallback to querying API if dataPoints is empty and not a KPI
        if (dataPoints.length === 0 && widget.type !== 'kpi' && (widget.file || activeDataset)) {
            try {
                const qRes = await fetch("/api/datasets/query", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        file: widget.file || activeDataset,
                        x_col: widget.x_col,
                        y_col: widget.y_col,
                        aggregate: widget.aggregate
                    })
                });
                const qData = await qRes.json();
                if (qData.success && Array.isArray(qData.data)) {
                    dataPoints = qData.data;
                }
            } catch (err) {
                console.warn(`Query failed for widget ${widget.id}:`, err);
            }
        } else if (widget.type === 'kpi') {
            const kpiValEl = document.getElementById(`kpi-val-${widget.id}`);
            const kpiVal = kpiValEl ? kpiValEl.innerText : 'N/A';
            dataPoints = [{ [widget.x_col || 'KPI']: kpiVal }];
        }

        chartsPayload.push({
            title: widget.title || `Visual #${i + 1}`,
            type: widget.type || 'bar',
            x_col: widget.x_col || 'Category',
            y_col: widget.y_col || 'Value',
            aggregate: widget.aggregate || 'NONE',
            data_points: dataPoints
        });
    }

    const apiKey = localStorage.getItem("aetherbi-ai-key") || "";
    const provider = localStorage.getItem("aetherbi-ai-provider") || "gemini";

    try {
        const response = await fetch("/api/ai/summarize-report", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-AI-API-Key": apiKey
            },
            body: JSON.stringify({
                report_title: reportTitle,
                report_subtitle: reportSubtitle,
                charts: chartsPayload,
                api_key: apiKey,
                provider: provider
            })
        });

        const res = await response.json();

        if (res.success && res.data) {
            renderCombinedAiInsightsCard(container, res.data, res.provider);
            showToast("Briefing Generated", "Executive AI briefing compiled successfully!", "success");
            container.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
            container.innerHTML = `
                <div class="ai-insights-card">
                    <div class="ai-insights-header">
                        <span class="ai-insights-title">
                            <i class="fa-solid fa-triangle-exclamation" style="color:var(--danger,#ff4d4f);"></i> AI Executive Briefing
                        </span>
                        <button class="btn btn-icon btn-sm" onclick="closeDashboardAiInsights()" title="Dismiss">
                            <i class="fa-solid fa-xmark"></i>
                        </button>
                    </div>
                    <p style="color:var(--danger,#ff4d4f); padding:8px 0; margin:0;">
                        Failed to generate executive briefing: ${res.error || 'Unknown error occurred'}
                    </p>
                </div>
            `;
            showToast("Briefing Error", res.error || "Failed to generate briefing", "error");
        }
    } catch (err) {
        container.innerHTML = `
            <div class="ai-insights-card">
                <div class="ai-insights-header">
                    <span class="ai-insights-title">
                        <i class="fa-solid fa-triangle-exclamation" style="color:var(--danger,#ff4d4f);"></i> AI Executive Briefing
                    </span>
                    <button class="btn btn-icon btn-sm" onclick="closeDashboardAiInsights()" title="Dismiss">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
                <p style="color:var(--danger,#ff4d4f); padding:8px 0; margin:0;">
                    Network error while connecting to AI briefing engine: ${err.message}
                </p>
            </div>
        `;
        showToast("Network Error", err.message, "error");
    }
}

/* ==========================================
   NEW UNIQUE FEATURES (NOT IN POWER BI)
   ========================================== */

// 1. Conversational Natural Language Data Cleaning (ETL)
async function executeAiCleanPrompt() {
    const inputEl = document.getElementById("ai-clean-prompt-input");
    if (!inputEl) return;
    const promptText = inputEl.value.trim();
    if (!promptText) {
        showToast("AI Cleaner", "Please type a data cleaning instruction prompt.", "warning");
        return;
    }
    if (!activeDataset) {
        showToast("No Dataset", "Please select an active dataset first.", "error");
        return;
    }

    showLoading("Running Conversational AI Data Cleaning...");
    try {
        const response = await fetch('/api/cleaner/ai_clean', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file: activeDataset, prompt: promptText })
        });
        const data = await response.json();
        hideLoading();

        if (data.success) {
            inputEl.value = "";
            datasetMetadata = data.metadata;
            if (typeof updateCleanerUI === "function") {
                updateCleanerUI();
            }
            showToast("AI Clean Success", `Dataset transformed (${(data.actions || []).length} fixes applied).`, "success");
            showAiCleanResultModal(data.actions || []);
        } else {
            showToast("AI Clean Failed", data.error || "Execution error", "error");
        }
    } catch (err) {
        hideLoading();
        showToast("Error", "Server error during AI cleaning: " + err.message, "error");
    }
}

function showAiCleanResultModal(actions) {
    const listEl = document.getElementById("ai-clean-actions-list");
    const overlay = document.getElementById("ai-clean-result-modal-overlay");
    if (!listEl || !overlay) return;

    if (!actions || actions.length === 0) {
        listEl.innerHTML = `<p style="margin:0; color:var(--text-muted);">General automated data standardization applied.</p>`;
    } else {
        listEl.innerHTML = actions.map(act => `
            <div style="display:flex; align-items:flex-start; gap:8px; margin-bottom:8px; padding-bottom:8px; border-bottom:1px solid rgba(255,255,255,0.05);">
                <i class="fa-solid fa-check" style="color:var(--secondary); margin-top:3px;"></i>
                <span style="color:var(--text-primary); line-height:1.4;">${act}</span>
            </div>
        `).join('');
    }

    overlay.classList.add("visible");
}

function closeAiCleanResultModal() {
    const overlay = document.getElementById("ai-clean-result-modal-overlay");
    if (overlay) {
        overlay.classList.remove("visible");
    }
}

// 2. 1-Click PII Masking & Data Anonymization
async function queueAnonymizePII() {
    if (!activeDataset) {
        showToast("No Dataset", "Please select an active dataset first.", "error");
        return;
    }

    showLoading("Anonymizing PII Data Columns...");
    try {
        const response = await fetch('/api/cleaner/anonymize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file: activeDataset })
        });
        const data = await response.json();
        hideLoading();

        if (data.success) {
            datasetMetadata = data.metadata;
            if (typeof updateCleanerUI === "function") {
                updateCleanerUI();
            }
            showToast("PII Anonymized", "Sensitive names, emails, and IDs masked safely.", "success");
        } else {
            showToast("Anonymization Error", data.error || "Failed to mask dataset", "error");
        }
    } catch (err) {
        hideLoading();
        showToast("Error", "Failed to anonymize PII: " + err.message, "error");
    }
}

// 3. Export Editable 10-Slide PPTX Presentation
function exportPptxPresentation() {
    showToast("Generating PPTX", "Preparing your 10-slide editable PowerPoint presentation...", "info");
    window.location.href = '/api/export/pptx';
}

// 5. Executive Voice Audio Briefing (Speech Synthesis)
let isSpeaking = false;
function speakAudioSummary(text) {
    if (!('speechSynthesis' in window)) {
        showToast("Speech Unsupported", "Your browser does not support text-to-speech synthesis.", "warning");
        return;
    }

    if (isSpeaking) {
        window.speechSynthesis.cancel();
        isSpeaking = false;
        showToast("Audio Paused", "Speech playback stopped.", "info");
        return;
    }

    const cleanText = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!cleanText) {
        showToast("No Content", "No text available for audio briefing.", "warning");
        return;
    }

    const utterance = new SpeechSynthesisUtterance(cleanText.substring(0, 1500));
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    utterance.onend = () => { isSpeaking = false; };
    utterance.onerror = () => { isSpeaking = false; };

    isSpeaking = true;
    window.speechSynthesis.speak(utterance);
    showToast("Audio Briefing", "Playing executive narrative audio briefing...", "info");
}

// 6. In-Browser Cell Editing Handler
async function saveEditedCell(rowIndex, colName, newValue) {
    if (!activeDataset) return;
    try {
        const response = await fetch('/api/cleaner/edit_cell', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                file: activeDataset,
                row_index: rowIndex,
                column: colName,
                value: newValue
            })
        });
        const data = await response.json();
        if (data.success) {
            datasetMetadata = data.metadata;
            showToast("Cell Updated", `Row ${rowIndex}, ${colName} updated to "${newValue}"`, "success");
        } else {
            showToast("Cell Update Failed", data.error || "Error editing cell", "error");
        }
    } catch (err) {
        showToast("Error", "Failed to update cell: " + err.message, "error");
    }
}

/* ==========================================
   MOBILE RESPONSIVE NAVIGATION LOGIC
   ========================================== */
function toggleMobileMenu() {
    const navbar = document.getElementById("top-navbar");
    const icon = document.getElementById("mobile-menu-icon");
    if (!navbar) return;

    navbar.classList.toggle("mobile-open");
    
    if (icon) {
        if (navbar.classList.contains("mobile-open")) {
            icon.classList.remove("fa-bars");
            icon.classList.add("fa-xmark");
        } else {
            icon.classList.remove("fa-xmark");
            icon.classList.add("fa-bars");
        }
    }
}

function closeMobileMenu() {
    const navbar = document.getElementById("top-navbar");
    const icon = document.getElementById("mobile-menu-icon");
    if (!navbar) return;

    navbar.classList.remove("mobile-open");
    if (icon) {
        icon.classList.remove("fa-xmark");
        icon.classList.add("fa-bars");
    }
}

// Window resize listener to handle responsive canvas resizing
let resizeTimeout;
window.addEventListener("resize", () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        if (typeof Chart !== "undefined" && Chart.instances) {
            Object.keys(Chart.instances).forEach(id => {
                const chartInstance = Chart.instances[id];
                if (chartInstance && typeof chartInstance.resize === "function") {
                    chartInstance.resize();
                }
            });
        }
    }, 250);
});

/* ==========================================
   SMART ANALYTICS HANDLERS
   ========================================== */

// 1. Outlier Scanner
async function runOutlierDetection() {
    if (!activeDataset) {
        showToast("No Dataset", "Please select or upload a dataset first.", "warning");
        return;
    }
    const container = document.getElementById("outlier-results-container");
    const method = document.getElementById("outlier-method").value;
    container.innerHTML = '<p class="loading-text"><i class="fa-solid fa-spinner fa-spin"></i> Scanning dataset for statistical outliers...</p>';

    try {
        const response = await fetch('/api/analytics/detect_outliers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file: activeDataset, method: method })
        });
        const res = await response.json();
        if (res.success) {
            const data = res.data;
            if (data.total_outlier_rows === 0) {
                container.innerHTML = `<p style="color: var(--success); font-weight: 500;"><i class="fa-solid fa-check-circle"></i> Clean Dataset! No mathematical outliers detected using ${method.toUpperCase()} method.</p>`;
                return;
            }

            let html = `
                <div style="margin-bottom: 12px;">
                    <span class="badge badge-warning" style="font-size: 0.85rem; padding: 4px 8px;">Found ${data.total_outlier_rows} Outlier Rows (out of ${data.total_rows} total rows)</span>
                </div>
                <div class="table-wrapper" style="max-height: 200px; overflow-y: auto; margin-bottom: 12px;">
                    <table class="preview-table" style="width: 100%; font-size: 0.8rem;">
                        <thead>
                            <tr><th>Column Name</th><th>Outliers Count</th><th>Min Outlier</th><th>Max Outlier</th></tr>
                        </thead>
                        <tbody>
            `;

            for (const [col, info] of Object.entries(data.columns_outliers)) {
                if (info.outlier_count > 0) {
                    html += `<tr>
                        <td><strong>${col}</strong></td>
                        <td style="color: var(--danger); font-weight: 600;">${info.outlier_count}</td>
                        <td>${info.min_outlier ?? 'N/A'}</td>
                        <td>${info.max_outlier ?? 'N/A'}</td>
                    </tr>`;
                }
            }

            html += `</tbody></table></div>
                <div style="display: flex; gap: 10px;">
                    <button class="btn btn-danger btn-sm" onclick="applyOutlierAction('remove')"><i class="fa-solid fa-trash-can"></i> Remove Outlier Rows</button>
                    <button class="btn btn-accent btn-sm" onclick="applyOutlierAction('cap')"><i class="fa-solid fa-scissors"></i> Cap Outliers (Winsorize)</button>
                </div>
            `;
            container.innerHTML = html;
        } else {
            container.innerHTML = `<p style="color: var(--danger);">${res.error || 'Failed to scan outliers.'}</p>`;
        }
    } catch (err) {
        container.innerHTML = `<p style="color: var(--danger);">Error scanning outliers: ${err.message}</p>`;
    }
}

async function applyOutlierAction(action) {
    if (!activeDataset) return;
    const method = document.getElementById("outlier-method").value;
    try {
        const response = await fetch('/api/analytics/handle_outliers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file: activeDataset, method: method, action: action })
        });
        const res = await response.json();
        if (res.success) {
            datasetMetadata = res.metadata;
            showToast("Outliers Action Applied", `Outliers successfully ${action}d!`, "success");
            runOutlierDetection();
        } else {
            showToast("Error", res.error || "Failed to handle outliers", "error");
        }
    } catch (err) {
        showToast("Error", "Outliers action failed: " + err.message, "error");
    }
}

// 2. Correlation Matrix
async function runCorrelationMatrix() {
    if (!activeDataset) {
        showToast("No Dataset", "Please select or upload a dataset first.", "warning");
        return;
    }
    const container = document.getElementById("correlation-results-container");
    container.innerHTML = '<p class="loading-text"><i class="fa-solid fa-spinner fa-spin"></i> Computing Pearson Correlation Matrix...</p>';

    try {
        const response = await fetch('/api/analytics/correlation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file: activeDataset })
        });
        const res = await response.json();
        if (res.success) {
            const cols = res.data.columns;
            const matrix = res.data.matrix;
            if (!cols || cols.length < 2) {
                container.innerHTML = '<p style="color: var(--text-secondary);">At least 2 numerical columns are required to compute a correlation matrix.</p>';
                return;
            }

            let html = `<table class="preview-table" style="width: 100%; text-align: center; font-size: 0.78rem;">
                <thead><tr><th>Col \\ Col</th>`;
            cols.forEach(c => { html += `<th>${c}</th>`; });
            html += `</tr></thead><tbody>`;

            matrix.forEach((row, i) => {
                html += `<tr><td><strong>${cols[i]}</strong></td>`;
                row.forEach((val, j) => {
                    let bg = 'rgba(255,255,255,0.05)';
                    let fg = 'inherit';
                    if (i === j) {
                        bg = 'rgba(255,255,255,0.15)';
                    } else if (val > 0.6) {
                        bg = 'rgba(34, 197, 94, 0.35)';
                        fg = '#4ade80';
                    } else if (val < -0.6) {
                        bg = 'rgba(239, 68, 68, 0.35)';
                        fg = '#f87171';
                    } else if (val > 0.2) {
                        bg = 'rgba(34, 197, 94, 0.15)';
                    } else if (val < -0.2) {
                        bg = 'rgba(239, 68, 68, 0.15)';
                    }
                    html += `<td style="background:${bg}; color:${fg}; font-weight:${Math.abs(val) > 0.5 ? 'bold' : 'normal'};">${val}</td>`;
                });
                html += `</tr>`;
            });
            html += `</tbody></table>`;
            container.innerHTML = html;
        } else {
            container.innerHTML = `<p style="color: var(--danger);">${res.error || 'Failed to compute correlation.'}</p>`;
        }
    } catch (err) {
        container.innerHTML = `<p style="color: var(--danger);">Error computing correlation matrix: ${err.message}</p>`;
    }
}

// 3. Trend Forecasting
async function runForecast() {
    if (!activeDataset) {
        showToast("No Dataset", "Please select or upload a dataset first.", "warning");
        return;
    }
    const xCol = document.getElementById("forecast-x-col").value;
    const yCol = document.getElementById("forecast-y-col").value;
    const periods = document.getElementById("forecast-periods").value;

    if (!xCol || !yCol) {
        showToast("Select Columns", "Please select both X and Y columns.", "warning");
        return;
    }

    const container = document.getElementById("forecast-results-container");
    container.innerHTML = '<p class="loading-text"><i class="fa-solid fa-spinner fa-spin"></i> Fitting regression model & generating forecast...</p>';

    try {
        const response = await fetch('/api/analytics/forecast', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file: activeDataset, x_column: xCol, y_column: yCol, periods: periods })
        });
        const res = await response.json();
        if (res.success) {
            const data = res.data;
            let html = `
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; margin-bottom: 12px;">
                    <div style="background: rgba(255,255,255,0.05); padding: 10px; border-radius: 8px;">
                        <span style="font-size: 0.7rem; color: var(--text-secondary);">Regression Model</span>
                        <div style="font-size: 0.95rem; font-weight: 600; color: var(--primary);">${data.equation}</div>
                    </div>
                    <div style="background: rgba(255,255,255,0.05); padding: 10px; border-radius: 8px;">
                        <span style="font-size: 0.7rem; color: var(--text-secondary);">Fit Accuracy Score (R²)</span>
                        <div style="font-size: 0.95rem; font-weight: 600; color: var(--secondary);">${(data.r2_score * 100).toFixed(1)}%</div>
                    </div>
                    <div style="background: rgba(255,255,255,0.05); padding: 10px; border-radius: 8px;">
                        <span style="font-size: 0.7rem; color: var(--text-secondary);">Trend Slope</span>
                        <div style="font-size: 0.95rem; font-weight: 600; color: ${data.slope >= 0 ? '#4ade80' : '#f87171'};">${data.slope >= 0 ? '+' : ''}${data.slope} / step</div>
                    </div>
                </div>
                <h4 style="margin: 10px 0 6px 0; font-size: 0.85rem;">Projected Future Values:</h4>
                <table class="preview-table" style="width: 100%; font-size: 0.8rem;">
                    <thead><tr><th>Period Step</th><th>Predicted Value</th><th>Confidence Lower (95%)</th><th>Confidence Upper (95%)</th></tr></thead>
                    <tbody>
            `;

            data.forecast.forEach(item => {
                html += `<tr>
                    <td><strong>${item.label}</strong></td>
                    <td style="color: var(--primary); font-weight: 600;">${item.predicted}</td>
                    <td style="color: var(--text-secondary);">${item.lower_bound}</td>
                    <td style="color: var(--text-secondary);">${item.upper_bound}</td>
                </tr>`;
            });

            html += `</tbody></table>`;
            container.innerHTML = html;
        } else {
            container.innerHTML = `<div style="background: rgba(255, 107, 107, 0.1); border: 1px solid #ef4444; border-radius: 8px; padding: 12px 16px; color: #fca5a5; font-size: 0.85rem;"><i class="fa-solid fa-triangle-exclamation" style="color: #ef4444; margin-right: 8px;"></i> ${res.error || 'Failed to compute forecast.'}</div>`;
        }
    } catch (err) {
        container.innerHTML = `<div style="background: rgba(255, 107, 107, 0.1); border: 1px solid #ef4444; border-radius: 8px; padding: 12px 16px; color: #fca5a5; font-size: 0.85rem;"><i class="fa-solid fa-triangle-exclamation" style="color: #ef4444; margin-right: 8px;"></i> Error computing forecast: ${err.message}</div>`;
    }
}

// 4. Multi-Dataset Joiner
async function populateDatasetJoinDropdowns() {
    const file2Select = document.getElementById("join-file2");
    const key1Select = document.getElementById("join-key1");
    if (!file2Select) return;

    // Populate current dataset columns into join-key1
    if (key1Select && datasetMetadata && datasetMetadata.columns) {
        key1Select.innerHTML = '';
        datasetMetadata.columns.forEach(col => {
            const opt = document.createElement("option");
            opt.value = col;
            opt.innerText = `${col} (${datasetMetadata.dtypes[col] || 'Text'})`;
            key1Select.appendChild(opt);
        });
    }

    try {
        const response = await fetch('/api/datasets/list');
        const res = await response.json();
        const datasets = res.datasets || [];
        file2Select.innerHTML = '<option value="">-- Select Second Dataset --</option>';
        datasets.forEach(f => {
            if (f.name !== activeDataset) {
                file2Select.innerHTML += `<option value="${f.name}">${f.name} (${f.size_kb} KB)</option>`;
            }
        });
        
        // If a second dataset is available and none selected yet, auto-select it and load its columns
        if (file2Select.options.length > 1 && !file2Select.value) {
            file2Select.selectedIndex = 1;
            loadJoinFile2Columns();
        }
    } catch (e) {
        console.error("Error populating join dataset dropdowns", e);
    }
}

async function loadJoinFile2Columns() {
    const file2 = document.getElementById("join-file2").value;
    const key2Select = document.getElementById("join-key2");
    if (!key2Select) return;
    if (!file2) {
        key2Select.innerHTML = '<option value="">-- Select dataset first --</option>';
        return;
    }
    key2Select.innerHTML = '<option value="">Loading columns...</option>';

    try {
        const response = await fetch(`/api/datasets/info?file=${encodeURIComponent(file2)}`);
        const res = await response.json();
        if (res.metadata && res.metadata.columns) {
            key2Select.innerHTML = '';
            res.metadata.columns.forEach(c => {
                const colName = typeof c === 'object' ? c.name : c;
                const colType = (res.metadata.dtypes && res.metadata.dtypes[colName]) ? res.metadata.dtypes[colName] : 'Text';
                key2Select.innerHTML += `<option value="${colName}">${colName} (${colType})</option>`;
            });
        } else {
            key2Select.innerHTML = '<option value="">No columns found</option>';
        }
    } catch (e) {
        key2Select.innerHTML = '<option value="">Error loading columns</option>';
    }
}

async function runJoinDatasets() {
    if (!activeDataset) {
        showToast("No Dataset", "Please select or upload a dataset first.", "warning");
        return;
    }
    const file2 = document.getElementById("join-file2").value;
    const key1 = document.getElementById("join-key1").value;
    const key2 = document.getElementById("join-key2").value;
    const joinType = document.getElementById("join-type").value;

    if (!file2 || !key1 || !key2) {
        showToast("Select Options", "Please select second dataset and matching join keys.", "warning");
        return;
    }

    try {
        const response = await fetch('/api/datasets/join', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                file1: activeDataset,
                file2: file2,
                key1: key1,
                key2: key2,
                join_type: joinType
            })
        });
        const res = await response.json();
        if (res.success) {
            showToast("Datasets Merged!", `Created new dataset: ${res.metadata.filename}`, "success");
            selectDataset(res.metadata.filename);
        } else {
            showToast("Merge Failed", res.error || "Error merging datasets", "error");
        }
    } catch (err) {
        showToast("Error", "Dataset join failed: " + err.message, "error");
    }
}

/* ==========================================
   NAVBAR DATASET SWITCHER & QUICK SAMPLES
   ========================================== */
function toggleDatasetSwitcherMenu(event) {
    if (event) event.stopPropagation();
    const menu = document.getElementById("dataset-switcher-menu");
    if (menu) {
        menu.classList.toggle("hidden");
        if (!menu.classList.contains("hidden")) {
            populateNavDatasetSwitcherList();
        }
    }
}

async function populateNavDatasetSwitcherList() {
    const container = document.getElementById("nav-datasets-list-container");
    if (!container) return;
    try {
        const response = await fetch("/api/datasets/list");
        const data = await response.json();
        container.innerHTML = "";
        if (data.datasets && data.datasets.length > 0) {
            data.datasets.forEach(file => {
                const isActive = activeDataset === file.name;
                const isExcel = file.name.toLowerCase().endsWith('.xls') || file.name.toLowerCase().endsWith('.xlsx');
                const fileIcon = isExcel ? 'fa-file-excel' : 'fa-file-csv';
                
                const item = document.createElement("div");
                item.className = `menu-dataset-item ${isActive ? 'active' : ''}`;
                item.innerHTML = `
                    <i class="fa-solid ${fileIcon}" style="color:${isActive ? 'var(--primary)' : 'var(--text-muted)'};"></i>
                    <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${file.name}</span>
                    ${isActive ? '<i class="fa-solid fa-check" style="color:var(--primary); font-size:0.75rem;"></i>' : ''}
                `;
                item.onclick = (e) => {
                    e.stopPropagation();
                    selectDataset(file.name);
                    document.getElementById("dataset-switcher-menu").classList.add("hidden");
                };
                container.appendChild(item);
            });
        } else {
            container.innerHTML = '<p class="menu-empty-text">No uploaded datasets</p>';
        }
    } catch (e) {
        container.innerHTML = '<p class="menu-empty-text">Error loading dataset list</p>';
    }
}

async function loadSampleDataset(filename) {
    const menu = document.getElementById("dataset-switcher-menu");
    if (menu) menu.classList.add("hidden");
    
    if (!currentUser) {
        showLoading(`Authenticating demo session and loading ${filename}...`);
        await performLogin("demo", "demo123");
    } else {
        showLoading(`Loading sample dataset ${filename}...`);
    }

    try {
        await fetch("/api/datasets/samples", { method: "POST" });
        await selectDataset(filename);
    } catch (e) {
        hideLoading();
        showToast("Error", "Could not load sample dataset: " + e.message, "error");
    }
}

// Close dataset switcher when clicking outside
document.addEventListener('click', (e) => {
    const switcher = document.getElementById('dataset-switcher-wrapper');
    const menu = document.getElementById('dataset-switcher-menu');
    if (menu && !menu.classList.contains('hidden')) {
        if (switcher && !switcher.contains(e.target)) {
            menu.classList.add('hidden');
        }
    }
});

/* ==========================================
   COMMAND PALETTE LOGIC (Ctrl+K)
   ========================================== */
let cmdPaletteSelectedIndex = 0;
let cmdPaletteFilteredItems = [];

const COMMAND_PALETTE_ITEMS = [
    { group: "Navigation", icon: "fa-database", title: "Go to Datasets Warehouse", action: () => switchTab('datasets') },
    { group: "Navigation", icon: "fa-wand-magic-sparkles", title: "Go to Data Cleaner", action: () => switchTab('cleaner') },
    { group: "Navigation", icon: "fa-brain", title: "Go to Smart Analytics", action: () => switchTab('analytics') },
    { group: "Navigation", icon: "fa-chart-column", title: "Go to Graph Builder", action: () => switchTab('visualizer') },
    { group: "Navigation", icon: "fa-table-columns", title: "Go to Dashboard Report Canvas", action: () => switchTab('dashboard') },
    { group: "Navigation", icon: "fa-robot", title: "Go to Predictive AI Studio", action: () => switchTab('predict') },
    
    { group: "Quick Samples", icon: "fa-cart-shopping", title: "Load Sample: Sales Performance Data", action: () => loadSampleDataset('sales_data.csv') },
    { group: "Quick Samples", icon: "fa-graduation-cap", title: "Load Sample: Student Scores & Attendance", action: () => loadSampleDataset('student_scores.xlsx') },
    
    { group: "Data Cleaning", icon: "fa-wand-magic-sparkles", title: "Natural Language AI Cleaning Prompt", action: () => { switchTab('cleaner'); setTimeout(() => document.getElementById('ai-clean-prompt-input')?.focus(), 200); } },
    { group: "Data Cleaning", icon: "fa-user-shield", title: "Mask PII & Anonymize Dataset", action: () => { switchTab('cleaner'); queueAnonymizePII(); } },
    { group: "Data Cleaning", icon: "fa-clone", title: "Remove Duplicate Rows", action: () => { switchTab('cleaner'); queueRemoveDuplicates(); } },
    
    { group: "Analytics Tools", icon: "fa-triangle-exclamation", title: "Scan Outliers & Anomaly Values", action: () => { switchTab('analytics'); runOutlierDetection(); } },
    { group: "Analytics Tools", icon: "fa-chart-line", title: "Calculate Pearson Correlation Heatmap", action: () => { switchTab('analytics'); runCorrelationMatrix(); } },
    
    { group: "Report Actions", icon: "fa-wand-magic-sparkles", title: "Generate Combined AI Report Insights", action: () => { switchTab('dashboard'); generateCombinedReportAiInsights(); } },
    { group: "Report Actions", icon: "fa-print", title: "Export Dashboard Report to PDF / Print", action: () => window.print() },
    
    { group: "Themes", icon: "fa-circle-half-stroke", title: "Toggle Dark / Light Mode (Shift+T)", action: () => toggleQuickDarkLight() },
    { group: "Themes", icon: "fa-palette", title: "Theme: Cosmic Neon (Dark)", action: () => selectTheme('cosmic') },
    { group: "Themes", icon: "fa-palette", title: "Theme: OLED Pitch Black (Dark)", action: () => selectTheme('oled-black') },
    { group: "Themes", icon: "fa-palette", title: "Theme: Cyber Slate (Dark)", action: () => selectTheme('cyber-slate') },
    { group: "Themes", icon: "fa-palette", title: "Theme: Dracula Amethyst (Dark)", action: () => selectTheme('dracula') },
    { group: "Themes", icon: "fa-palette", title: "Theme: Midnight Ocean (Dark)", action: () => selectTheme('midnight-ocean') },
    { group: "Themes", icon: "fa-palette", title: "Theme: Ember Blaze (Dark)", action: () => selectTheme('ember') },
    { group: "Themes", icon: "fa-palette", title: "Theme: Aurora Emerald (Dark)", action: () => selectTheme('aurora') },
    { group: "Themes", icon: "fa-sun", title: "Theme: Frosted Light", action: () => selectTheme('light') }
];

function openCommandPalette() {
    const modal = document.getElementById("command-palette-modal");
    const input = document.getElementById("cmd-palette-input");
    if (!modal || !input) return;
    
    modal.classList.remove("hidden");
    input.value = "";
    cmdPaletteSelectedIndex = 0;
    filterCommandPalette("");
    setTimeout(() => input.focus(), 50);
}

function closeCommandPalette(event) {
    if (event && event.target !== document.getElementById("command-palette-modal")) return;
    const modal = document.getElementById("command-palette-modal");
    if (modal) modal.classList.add("hidden");
}

function filterCommandPalette(query) {
    const resultsContainer = document.getElementById("cmd-palette-results");
    if (!resultsContainer) return;
    
    const q = query.toLowerCase().trim();
    cmdPaletteFilteredItems = COMMAND_PALETTE_ITEMS.filter(item => 
        item.title.toLowerCase().includes(q) || item.group.toLowerCase().includes(q)
    );
    
    if (cmdPaletteSelectedIndex >= cmdPaletteFilteredItems.length) {
        cmdPaletteSelectedIndex = 0;
    }
    
    renderCommandPaletteResults();
}

function renderCommandPaletteResults() {
    const container = document.getElementById("cmd-palette-results");
    if (!container) return;
    container.innerHTML = "";
    
    if (cmdPaletteFilteredItems.length === 0) {
        container.innerHTML = '<p class="menu-empty-text" style="padding:16px; text-align:center;">No matching actions found</p>';
        return;
    }
    
    let currentGroup = null;
    cmdPaletteFilteredItems.forEach((item, index) => {
        if (item.group !== currentGroup) {
            currentGroup = item.group;
            const groupHeader = document.createElement("div");
            groupHeader.className = "cmd-group-title";
            groupHeader.textContent = currentGroup;
            container.appendChild(groupHeader);
        }
        
        const itemEl = document.createElement("div");
        itemEl.className = `cmd-item ${index === cmdPaletteSelectedIndex ? 'selected' : ''}`;
        itemEl.innerHTML = `
            <div class="cmd-left">
                <i class="fa-solid ${item.icon}"></i>
                <span>${item.title}</span>
            </div>
            <kbd>Enter</kbd>
        `;
        itemEl.onclick = () => {
            const modal = document.getElementById("command-palette-modal");
            if (modal) modal.classList.add("hidden");
            item.action();
        };
        container.appendChild(itemEl);
    });
    
    const selectedEl = container.querySelector(".cmd-item.selected");
    if (selectedEl) {
        selectedEl.scrollIntoView({ block: "nearest" });
    }
}

function handleCommandPaletteKeydown(e) {
    if (e.key === "ArrowDown") {
        e.preventDefault();
        if (cmdPaletteFilteredItems.length > 0) {
            cmdPaletteSelectedIndex = (cmdPaletteSelectedIndex + 1) % cmdPaletteFilteredItems.length;
            renderCommandPaletteResults();
        }
    } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (cmdPaletteFilteredItems.length > 0) {
            cmdPaletteSelectedIndex = (cmdPaletteSelectedIndex - 1 + cmdPaletteFilteredItems.length) % cmdPaletteFilteredItems.length;
            renderCommandPaletteResults();
        }
    } else if (e.key === "Enter") {
        e.preventDefault();
        if (cmdPaletteFilteredItems.length > 0 && cmdPaletteFilteredItems[cmdPaletteSelectedIndex]) {
            const item = cmdPaletteFilteredItems[cmdPaletteSelectedIndex];
            const modal = document.getElementById("command-palette-modal");
            if (modal) modal.classList.add("hidden");
            item.action();
        }
    } else if (e.key === "Escape") {
        closeCommandPalette();
    }
}

// Global Keyboard Shortcut Listeners
document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        openCommandPalette();
    }
    if (e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        quickDemoLogin();
    }
    if (e.shiftKey && e.key.toLowerCase() === 't') {
        // Prevent toggle if actively typing in an input/textarea
        if (!['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
            e.preventDefault();
            toggleQuickDarkLight();
        }
    }
    if (e.key === "Escape") {
        const cmdModal = document.getElementById("command-palette-modal");
        if (cmdModal && !cmdModal.classList.contains("hidden")) {
            closeCommandPalette();
        }
    }
});



function setDashboardGridMode(mode) {
    const grid = document.getElementById("dashboard-grid");
    if (!grid) return;
    
    grid.classList.remove("grid-1col", "grid-2col", "grid-3col");
    grid.classList.add(`grid-${mode}`);
    
    document.querySelectorAll(".btn-layout-mode").forEach(btn => btn.classList.remove("active"));
    const targetBtn = document.getElementById(`btn-grid-${mode}`);
    if (targetBtn) targetBtn.classList.add("active");
}

/* ==========================================
   UI / UX POLISH HELPERS
   ========================================== */

function togglePasswordInputVisibility(inputId, btn) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const isPassword = input.type === 'password';
    input.type = isPassword ? 'text' : 'password';
    const icon = btn.querySelector('i');
    if (icon) {
        if (isPassword) {
            icon.className = 'fa-regular fa-eye-slash';
        } else {
            icon.className = 'fa-regular fa-eye';
        }
    }
}

function setAiPromptAndRun(promptText) {
    const input = document.getElementById("ai-clean-prompt-input");
    if (input) {
        input.value = promptText;
        executeAiCleanPrompt();
    }
}

function updateDashboardKpiStrip() {
    const nameEl = document.getElementById("kpi-dataset-name");
    const rowsEl = document.getElementById("kpi-total-rows");
    const pinnedEl = document.getElementById("kpi-pinned-count");
    const qualityEl = document.getElementById("kpi-quality-score");

    if (nameEl) nameEl.textContent = activeDataset || "None Selected";
    if (rowsEl) rowsEl.textContent = datasetMetadata ? datasetMetadata.shape[0].toLocaleString() : "0";
    if (pinnedEl) pinnedEl.textContent = (savedCharts ? savedCharts.length : 0).toString();
    
    if (qualityEl) {
        if (!datasetMetadata) {
            qualityEl.textContent = "--";
            qualityEl.className = "kpi-mini-val";
        } else {
            let totalNulls = 0;
            if (datasetMetadata.missing_counts) {
                Object.values(datasetMetadata.missing_counts).forEach(c => totalNulls += c);
            }
            const totalCells = (datasetMetadata.shape[0] * datasetMetadata.shape[1]) || 1;
            const healthPct = Math.max(0, Math.round(100 - ((totalNulls / totalCells) * 100)));
            if (healthPct >= 95) {
                qualityEl.textContent = `${healthPct}% Clean`;
                qualityEl.className = "kpi-mini-val text-success";
            } else if (healthPct >= 80) {
                qualityEl.textContent = `${healthPct}% Fair`;
                qualityEl.className = "kpi-mini-val text-warning";
            } else {
                qualityEl.textContent = `${healthPct}% Needs Cleaning`;
                qualityEl.className = "kpi-mini-val text-danger";
            }
        }
    }
}



// =======================================================
// ⭐ FEATURE 1: SMART AXIS RECOMMENDER
// =======================================================

let _axisRecommendations = null; // cached suggestions for active dataset

async function fetchAxisSuggestions(filename) {
    if (!filename) return;
    try {
        const resp = await fetch('/api/datasets/suggest-axes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file: filename })
        });
        const data = await resp.json();
        if (data.success) {
            _axisRecommendations = data.suggestions;
            applyAxisSuggestions();
        }
    } catch(e) {
        console.warn('[AetherBI] Axis suggestions fetch failed:', e);
    }
}

function applyAxisSuggestions() {
    if (!_axisRecommendations) return;
    const { x_recommended, y_recommended, excluded, top_x, top_y, chart_suggestion, chart_reason, forecast_eligible, forecast_cols } = _axisRecommendations;

    // Rebuild the X-axis dropdown with ⭐ recommended items first
    const xDropdown = document.getElementById('chart-x-axis');
    const yDropdown = document.getElementById('chart-y-axis');
    if (!xDropdown || !yDropdown) return;

    // Build a lookup of column → reason
    const xNames = new Set(x_recommended.map(c => c.name));
    const yNames = new Set(y_recommended.map(c => c.name));
    const excludedNames = new Set(excluded.map(c => c.name));

    // Rebuild X dropdown
    xDropdown.innerHTML = '';
    // Recommended X columns first
    x_recommended.forEach((c, i) => {
        const opt = document.createElement('option');
        opt.value = c.name;
        opt.textContent = `⭐ ${c.name} (${c.dtype}) — ${c.reason}`;
        if (i === 0) opt.style.fontWeight = '700';
        xDropdown.appendChild(opt);
    });
    // Remaining columns (that are Y or borderline)
    if (datasetMetadata) {
        datasetMetadata.columns.forEach(col => {
            if (xNames.has(col)) return; // already added
            if (excludedNames.has(col)) return; // skip excluded
            const opt = document.createElement('option');
            opt.value = col;
            opt.textContent = `${col} (${datasetMetadata.dtypes[col] || 'Text'})`;
            opt.style.color = '#94a3b8';
            xDropdown.appendChild(opt);
        });
    }

    // Rebuild Y dropdown with recommended first
    yDropdown.innerHTML = '';
    const emptyOpt = document.createElement('option');
    emptyOpt.value = '';
    emptyOpt.textContent = '-- Record Count (Rows count) --';
    yDropdown.appendChild(emptyOpt);
    y_recommended.forEach((c, i) => {
        const opt = document.createElement('option');
        opt.value = c.name;
        opt.textContent = `⭐ ${c.name} (${c.dtype})`;
        if (i === 0) opt.style.fontWeight = '700';
        yDropdown.appendChild(opt);
    });
    if (datasetMetadata) {
        datasetMetadata.columns.forEach(col => {
            if (yNames.has(col)) return;
            if (excludedNames.has(col)) return;
            const opt = document.createElement('option');
            opt.value = col;
            opt.textContent = `${col} (${datasetMetadata.dtypes[col] || 'Text'})`;
            opt.style.color = '#94a3b8';
            yDropdown.appendChild(opt);
        });
    }

    // Auto-set chart type selector if it exists
    const chartTypeEl = document.getElementById('chart-type');
    if (chartTypeEl && chart_suggestion) {
        const matchOpt = [...chartTypeEl.options].find(o => o.value === chart_suggestion);
        if (matchOpt) {
            chartTypeEl.value = chart_suggestion;
        }
    }

    // Set top recommendations as defaults
    if (top_x) xDropdown.value = top_x;
    if (top_y) yDropdown.value = top_y;

    // Show smart axis guide banner
    showAxisGuideBanner(chart_reason, top_x, top_y, forecast_eligible, forecast_cols);

    // Show forecast badge if eligible
    const forecastBadge = document.getElementById('forecast-eligible-badge');
    if (forecastBadge) {
        if (forecast_eligible) {
            forecastBadge.style.display = 'inline-flex';
            forecastBadge.onclick = () => {
                // Pre-fill forecast columns
                const fxEl = document.getElementById('forecast-x-col');
                const fyEl = document.getElementById('forecast-y-col');
                if (fxEl && forecast_cols.x) fxEl.value = forecast_cols.x;
                if (fyEl && forecast_cols.y) fyEl.value = forecast_cols.y;
                openForecastModal();
            };
        } else {
            forecastBadge.style.display = 'none';
        }
    }
}

function showAxisGuideBanner(chartReason, topX, topY, forecastEligible, forecastCols) {
    let banner = document.getElementById('axis-guide-banner');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'axis-guide-banner';
        banner.style.cssText = `
            background: linear-gradient(135deg, rgba(99,102,241,0.12), rgba(139,92,246,0.08));
            border: 1px solid rgba(99,102,241,0.3);
            border-radius: 10px;
            padding: 0.75rem 1rem;
            margin-bottom: 1rem;
            font-size: 0.82rem;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 1rem;
            animation: fadeInDown 0.3s ease;
        `;
        // Insert before the chart config area
        const vizPanel = document.getElementById('panel-visualizer') || document.getElementById('chart-builder-section');
        if (vizPanel) {
            const firstChild = vizPanel.querySelector('.card') || vizPanel.firstElementChild;
            if (firstChild) vizPanel.insertBefore(banner, firstChild);
            else vizPanel.prepend(banner);
        }
    }
    const forecastTag = forecastEligible
        ? `<button onclick="openForecastModal()" style="background:rgba(16,185,129,0.15);border:1px solid rgba(16,185,129,0.4);color:#34d399;padding:0.25rem 0.6rem;border-radius:6px;font-size:0.75rem;cursor:pointer;border-radius:20px;">🔮 Run Forecast</button>`
        : '';
    banner.innerHTML = `
        <div style="display:flex;align-items:center;gap:0.6rem;">
            <span style="font-size:1.1rem;">🧠</span>
            <div>
                <strong style="color:#818cf8;">Smart Recommendation:</strong>
                <span style="color:#94a3b8;"> ${chartReason}. Best X: <strong style="color:#e2e8f0;">${topX || 'N/A'}</strong>, Best Y: <strong style="color:#e2e8f0;">${topY || 'Count'}</strong></span>
            </div>
        </div>
        <div style="display:flex;gap:0.5rem;align-items:center;flex-shrink:0;">
            ${forecastTag}
            <button onclick="autoFillAxes()" style="background:rgba(99,102,241,0.2);border:1px solid rgba(99,102,241,0.5);color:#818cf8;padding:0.25rem 0.8rem;border-radius:20px;font-size:0.75rem;cursor:pointer;font-weight:600;">✨ Auto-Fill</button>
            <button onclick="this.parentElement.parentElement.remove()" style="background:none;border:none;color:#64748b;cursor:pointer;font-size:1rem;">✕</button>
        </div>
    `;
}

function autoFillAxes() {
    if (!_axisRecommendations) return;
    const { top_x, top_y, chart_suggestion } = _axisRecommendations;
    const xDropdown = document.getElementById('chart-x-axis');
    const yDropdown = document.getElementById('chart-y-axis');
    const chartTypeEl = document.getElementById('chart-type');
    if (xDropdown && top_x) xDropdown.value = top_x;
    if (yDropdown && top_y) yDropdown.value = top_y;
    if (chartTypeEl && chart_suggestion) {
        const matchOpt = [...chartTypeEl.options].find(o => o.value === chart_suggestion);
        if (matchOpt) chartTypeEl.value = chart_suggestion;
    }
    showToast('✨ Auto-Fill Applied', `X: ${top_x || 'N/A'}, Y: ${top_y || 'Count'}, Chart: ${chart_suggestion || 'bar'}`, 'success');
    if (typeof updateChartPreview === 'function') updateChartPreview();
}


// =======================================================
// 🔔 FEATURE 2: DATASET UPDATE NOTIFICATION
// =======================================================

function showDatasetUpdateModal(diff, filename) {
    // Remove existing modal if present
    const existing = document.getElementById('dataset-update-modal');
    if (existing) existing.remove();

    const prevV = diff.prev_version || 1;
    const newV = diff.new_version || prevV + 1;

    const addedRowsHtml = diff.added_rows > 0
        ? `<div style="color:#34d399;font-weight:600;">+${diff.added_rows.toLocaleString()} new rows added</div>` : '';
    const removedRowsHtml = diff.removed_rows > 0
        ? `<div style="color:#f87171;">-${diff.removed_rows.toLocaleString()} rows removed</div>` : '';
    const newColsHtml = diff.new_columns && diff.new_columns.length
        ? `<div style="color:#34d399;">+${diff.new_columns.length} new column${diff.new_columns.length > 1 ? 's' : ''}: <strong>${diff.new_columns.join(', ')}</strong></div>` : '';
    const removedColsHtml = diff.removed_columns && diff.removed_columns.length
        ? `<div style="color:#f87171;">-${diff.removed_columns.length} removed column${diff.removed_columns.length > 1 ? 's' : ''}: <strong>${diff.removed_columns.join(', ')}</strong></div>` : '';

    const modal = document.createElement('div');
    modal.id = 'dataset-update-modal';
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.7); z-index: 10000;
        display: flex; align-items: center; justify-content: center;
        animation: fadeIn 0.2s ease;
    `;
    modal.innerHTML = `
        <div style="background:#111827;border:1px solid rgba(99,102,241,0.4);border-radius:16px;padding:2rem;max-width:480px;width:90%;box-shadow:0 25px 60px rgba(0,0,0,0.6);animation:slideInUp 0.3s ease;">
            <div style="display:flex;align-items:center;gap:1rem;margin-bottom:1.5rem;">
                <div style="font-size:2.5rem;">📊</div>
                <div>
                    <h3 style="font-size:1.1rem;font-weight:700;color:#e2e8f0;margin:0;">Dataset Updated!</h3>
                    <p style="color:#64748b;font-size:0.8rem;margin-top:0.2rem;">${filename} — v${prevV} → v${newV}</p>
                </div>
                <span style="margin-left:auto;background:rgba(16,185,129,0.15);border:1px solid rgba(16,185,129,0.4);color:#34d399;padding:0.2rem 0.75rem;border-radius:999px;font-size:0.75rem;font-weight:600;">Updated</span>
            </div>
            <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:1rem;margin-bottom:1.5rem;display:flex;flex-direction:column;gap:0.4rem;font-size:0.875rem;">
                <div style="color:#94a3b8;margin-bottom:0.4rem;font-weight:600;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.05em;">Change Summary</div>
                ${addedRowsHtml}
                ${removedRowsHtml}
                ${newColsHtml}
                ${removedColsHtml}
                <div style="color:#64748b;margin-top:0.5rem;font-size:0.8rem;">${diff.prev_row_count.toLocaleString()} rows → ${diff.new_row_count.toLocaleString()} rows total</div>
            </div>
            <div style="display:flex;gap:0.75rem;">
                <button onclick="document.getElementById('dataset-update-modal').remove()" style="flex:1;background:rgba(99,102,241,0.2);border:1px solid rgba(99,102,241,0.4);color:#818cf8;padding:0.65rem;border-radius:8px;cursor:pointer;font-weight:600;font-size:0.875rem;">Got it!</button>
                <button onclick="document.getElementById('dataset-update-modal').remove();if(typeof updateChartPreview==='function')updateChartPreview();" style="flex:1;background:linear-gradient(135deg,#6366f1,#8b5cf6);border:none;color:white;padding:0.65rem;border-radius:8px;cursor:pointer;font-weight:600;font-size:0.875rem;">🔄 Refresh Charts</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
}


// =======================================================
// 🤝 FEATURE 3: ANALYSIS SHARING
// =======================================================

let _shareModalOpen = false;

function openShareModal(chartConfig) {
    // chartConfig: single chart object OR null (share entire dashboard)
    const existing = document.getElementById('share-modal-overlay');
    if (existing) existing.remove();

    const isChart = !!chartConfig;
    const title = isChart ? `Share Chart: ${chartConfig.title || 'Chart'}` : 'Share Dashboard';

    const overlay = document.createElement('div');
    overlay.id = 'share-modal-overlay';
    overlay.style.cssText = `
        position:fixed;top:0;left:0;width:100%;height:100%;
        background:rgba(0,0,0,0.75);z-index:10000;
        display:flex;align-items:center;justify-content:center;
        animation:fadeIn 0.2s ease;
    `;
    overlay.innerHTML = `
        <div id="share-modal" style="background:#111827;border:1px solid rgba(99,102,241,0.4);border-radius:18px;padding:2rem;max-width:500px;width:92%;box-shadow:0 30px 70px rgba(0,0,0,0.7);animation:slideInUp 0.3s ease;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.5rem;">
                <div style="display:flex;align-items:center;gap:0.75rem;">
                    <span style="font-size:1.8rem;">🤝</span>
                    <div>
                        <h3 style="font-size:1.1rem;font-weight:700;color:#e2e8f0;margin:0;">${title}</h3>
                        <p style="color:#64748b;font-size:0.78rem;margin-top:0.15rem;">Generate a public link anyone can view without logging in</p>
                    </div>
                </div>
                <button onclick="document.getElementById('share-modal-overlay').remove()" style="background:none;border:none;color:#64748b;cursor:pointer;font-size:1.2rem;">✕</button>
            </div>

            <!-- Expiry selector -->
            <div style="margin-bottom:1rem;">
                <label style="font-size:0.8rem;color:#94a3b8;font-weight:600;display:block;margin-bottom:0.4rem;">⏰ Link Expiry</label>
                <select id="share-expiry-select" style="width:100%;background:#1a2235;border:1px solid #2a3650;color:#e2e8f0;padding:0.6rem 0.8rem;border-radius:8px;font-size:0.875rem;">
                    <option value="0">Never expires</option>
                    <option value="24">24 hours</option>
                    <option value="168">7 days</option>
                    <option value="720">30 days</option>
                </select>
            </div>

            <!-- Generate button -->
            <button id="share-generate-btn" onclick="generateShareLink(${JSON.stringify(isChart)}, ${isChart ? JSON.stringify(chartConfig).replace(/"/g, '&quot;') : 'null'})"
                style="width:100%;background:linear-gradient(135deg,#6366f1,#8b5cf6);border:none;color:white;padding:0.75rem;border-radius:10px;font-weight:700;font-size:0.95rem;cursor:pointer;margin-bottom:1rem;display:flex;align-items:center;justify-content:center;gap:0.5rem;">
                🔗 Generate Share Link
            </button>

            <!-- Link output (hidden initially) -->
            <div id="share-link-area" style="display:none;">
                <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(99,102,241,0.3);border-radius:10px;padding:0.75rem 1rem;display:flex;align-items:center;gap:0.5rem;margin-bottom:0.75rem;">
                    <input id="share-link-input" type="text" readonly style="flex:1;background:none;border:none;color:#818cf8;font-size:0.85rem;outline:none;font-family:monospace;" />
                    <button onclick="copyShareLink()" style="background:rgba(99,102,241,0.2);border:1px solid rgba(99,102,241,0.4);color:#818cf8;padding:0.3rem 0.75rem;border-radius:6px;cursor:pointer;font-size:0.8rem;font-weight:600;white-space:nowrap;">📋 Copy</button>
                </div>
                <div style="display:flex;gap:0.5rem;">
                    <button onclick="openShareInNewTab()" style="flex:1;background:rgba(16,185,129,0.12);border:1px solid rgba(16,185,129,0.3);color:#34d399;padding:0.5rem;border-radius:8px;cursor:pointer;font-size:0.82rem;font-weight:600;">↗ Open Preview</button>
                    <button onclick="loadMyShares()" style="flex:1;background:rgba(255,255,255,0.05);border:1px solid #2a3650;color:#94a3b8;padding:0.5rem;border-radius:8px;cursor:pointer;font-size:0.82rem;">📋 My Links</button>
                </div>
            </div>

            <!-- My shares list -->
            <div id="my-shares-list" style="display:none;margin-top:1rem;">
                <div style="font-size:0.78rem;color:#64748b;font-weight:600;margin-bottom:0.5rem;text-transform:uppercase;letter-spacing:0.05em;">Your Active Share Links</div>
                <div id="shares-list-items" style="max-height:180px;overflow-y:auto;display:flex;flex-direction:column;gap:0.4rem;"></div>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

async function generateShareLink(isChart, chartConfig) {
    const expiryHours = parseInt(document.getElementById('share-expiry-select')?.value || '0');
    const btn = document.getElementById('share-generate-btn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Generating…'; }

    // Build payload
    let payload;
    if (isChart && chartConfig) {
        payload = { type: 'chart', charts: [chartConfig], title: chartConfig.title || 'Shared Chart' };
    } else {
        payload = { type: 'dashboard', charts: savedCharts, title: activeDataset ? `${activeDataset} Dashboard` : 'Shared Dashboard' };
    }

    try {
        const resp = await fetch('/api/share/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: isChart ? 'chart' : 'dashboard', payload, expiry_hours: expiryHours })
        });
        const data = await resp.json();
        if (data.success) {
            const linkInput = document.getElementById('share-link-input');
            if (linkInput) linkInput.value = data.share_url;
            document.getElementById('share-link-area').style.display = 'block';
            showToast('🔗 Link Created!', 'Share link copied to clipboard.', 'success');
            // Auto-copy
            navigator.clipboard?.writeText(data.share_url).catch(() => {});
        } else {
            showToast('Share Failed', data.error || 'Could not create share link.', 'error');
        }
    } catch(e) {
        showToast('Error', 'Failed to create share link: ' + e.message, 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '🔗 Generate Share Link'; }
    }
}

function copyShareLink() {
    const input = document.getElementById('share-link-input');
    if (!input?.value) return;
    navigator.clipboard?.writeText(input.value)
        .then(() => showToast('📋 Copied!', 'Share link copied to clipboard.', 'success'))
        .catch(() => {
            input.select();
            document.execCommand('copy');
            showToast('📋 Copied!', 'Link copied.', 'success');
        });
}

function openShareInNewTab() {
    const input = document.getElementById('share-link-input');
    if (input?.value) window.open(input.value, '_blank');
}

async function loadMyShares() {
    const container = document.getElementById('shares-list-items');
    const listDiv = document.getElementById('my-shares-list');
    if (!container || !listDiv) return;
    listDiv.style.display = 'block';
    container.innerHTML = '<div style="color:#64748b;font-size:0.8rem;padding:0.5rem;">Loading…</div>';

    try {
        const resp = await fetch('/api/share/list');
        const data = await resp.json();
        if (!data.success || !data.shares.length) {
            container.innerHTML = '<div style="color:#64748b;font-size:0.8rem;padding:0.5rem;">No active share links.</div>';
            return;
        }
        container.innerHTML = data.shares.map(s => `
            <div style="background:rgba(255,255,255,0.03);border:1px solid #2a3650;border-radius:8px;padding:0.6rem 0.75rem;display:flex;align-items:center;justify-content:space-between;gap:0.5rem;">
                <div style="min-width:0;">
                    <div style="font-size:0.8rem;color:#e2e8f0;font-weight:600;">${s.type === 'dashboard' ? '📊 Dashboard' : '📈 Chart'}</div>
                    <div style="font-size:0.72rem;color:#64748b;margin-top:0.1rem;">${s.views} views • ${s.expiry ? 'Expires: ' + new Date(s.expiry).toLocaleDateString() : 'Never expires'}</div>
                </div>
                <div style="display:flex;gap:0.4rem;flex-shrink:0;">
                    <button onclick="navigator.clipboard?.writeText(location.origin+'/share/${s.token}');showToast('Copied!','Link copied.','success')" style="background:rgba(99,102,241,0.15);border:1px solid rgba(99,102,241,0.3);color:#818cf8;padding:0.25rem 0.5rem;border-radius:5px;cursor:pointer;font-size:0.75rem;">📋</button>
                    <button onclick="revokeShare('${s.token}',this)" style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);color:#f87171;padding:0.25rem 0.5rem;border-radius:5px;cursor:pointer;font-size:0.75rem;">🗑</button>
                </div>
            </div>
        `).join('');
    } catch(e) {
        container.innerHTML = '<div style="color:#f87171;font-size:0.8rem;">Failed to load shares.</div>';
    }
}

async function revokeShare(token, btn) {
    if (!confirm('Revoke this share link? Anyone with the link will lose access.')) return;
    try {
        const resp = await fetch(`/api/share/revoke/${token}`, { method: 'DELETE' });
        const data = await resp.json();
        if (data.success) {
            showToast('Link Revoked', 'Share link deleted successfully.', 'success');
            loadMyShares();
        } else {
            showToast('Error', data.error || 'Could not revoke.', 'error');
        }
    } catch(e) {
        showToast('Error', e.message, 'error');
    }
}

// Add share button to dashboard chart cards
function addShareButtonToCard(cardEl, chartConfig) {
    if (!cardEl || cardEl.querySelector('.share-chart-btn')) return;
    const btn = document.createElement('button');
    btn.className = 'share-chart-btn';
    btn.title = 'Share this chart';
    btn.innerHTML = '🤝';
    btn.style.cssText = 'position:absolute;top:0.5rem;right:2.8rem;background:rgba(99,102,241,0.15);border:1px solid rgba(99,102,241,0.3);color:#818cf8;width:28px;height:28px;border-radius:6px;cursor:pointer;font-size:0.85rem;display:flex;align-items:center;justify-content:center;z-index:5;transition:all 0.2s;';
    btn.addEventListener('mouseenter', () => btn.style.background = 'rgba(99,102,241,0.3)');
    btn.addEventListener('mouseleave', () => btn.style.background = 'rgba(99,102,241,0.15)');
    btn.onclick = (e) => { e.stopPropagation(); openShareModal(chartConfig); };
    cardEl.style.position = 'relative';
    cardEl.appendChild(btn);
}

// Add share dashboard button to the dashboard header
function addShareDashboardButton() {
    if (document.getElementById('share-dashboard-btn')) return;
    const headerArea = document.getElementById('dashboard-header-actions') || document.querySelector('.dashboard-actions') || document.querySelector('[id*="dashboard"]');
    if (!headerArea) return;
    const btn = document.createElement('button');
    btn.id = 'share-dashboard-btn';
    btn.className = 'btn btn-secondary btn-sm';
    btn.innerHTML = '🤝 Share Dashboard';
    btn.style.cssText = 'margin-left:0.5rem;';
    btn.onclick = () => openShareModal(null);
    headerArea.appendChild(btn);
}


// =======================================================
// 🔮 FEATURE 4: ENHANCED FORECAST MODAL
// =======================================================

function openForecastModal() {
    if (!activeDataset) {
        showToast('No Dataset', 'Please load a dataset first.', 'warning');
        return;
    }
    const existing = document.getElementById('forecast-modal-overlay');
    if (existing) existing.remove();

    const cols = datasetMetadata ? datasetMetadata.columns : [];
    const dtypes = datasetMetadata ? (datasetMetadata.dtypes || {}) : {};

    // Build x-axis options (prefer date columns)
    const xOpts = cols.map(c => {
        const dt = dtypes[c] || 'Text';
        const isDate = dt.toLowerCase().includes('date') || dt.toLowerCase().includes('datetime');
        return `<option value="${c}" ${isDate ? 'selected' : ''}>${isDate ? '📅 ' : ''}${c} (${dt})</option>`;
    }).join('');

    // Build y-axis options (prefer numeric)
    const yOpts = cols.map(c => {
        const dt = dtypes[c] || 'Text';
        const isNum = dt === 'Integer' || dt === 'Float';
        return `<option value="${c}" ${isNum ? '' : 'style="color:#64748b;"'}>${isNum ? '📊 ' : ''}${c} (${dt})</option>`;
    }).join('');

    const overlay = document.createElement('div');
    overlay.id = 'forecast-modal-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);z-index:10001;display:flex;align-items:center;justify-content:center;animation:fadeIn 0.2s ease;';
    overlay.innerHTML = `
        <div style="background:#0d1322;border:1px solid rgba(99,102,241,0.4);border-radius:20px;padding:2rem;max-width:700px;width:95%;max-height:90vh;overflow-y:auto;box-shadow:0 40px 80px rgba(0,0,0,0.8);animation:slideInUp 0.3s ease;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.75rem;">
                <div style="display:flex;align-items:center;gap:0.75rem;">
                    <span style="font-size:2rem;">🔮</span>
                    <div>
                        <h2 style="font-size:1.25rem;font-weight:800;color:#e2e8f0;margin:0;">Forecast & Trend Prediction</h2>
                        <p style="color:#64748b;font-size:0.8rem;margin-top:0.2rem;">Project future values using ML regression models with confidence bands</p>
                    </div>
                </div>
                <button onclick="document.getElementById('forecast-modal-overlay').remove()" style="background:none;border:none;color:#64748b;cursor:pointer;font-size:1.3rem;">✕</button>
            </div>

            <!-- Config row -->
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1rem;">
                <div>
                    <label style="font-size:0.78rem;color:#94a3b8;font-weight:600;display:block;margin-bottom:0.4rem;">📅 X-Axis (Time / Category)</label>
                    <select id="fm-x-col" style="width:100%;background:#1a2235;border:1px solid #2a3650;color:#e2e8f0;padding:0.6rem 0.8rem;border-radius:8px;font-size:0.85rem;">${xOpts}</select>
                </div>
                <div>
                    <label style="font-size:0.78rem;color:#94a3b8;font-weight:600;display:block;margin-bottom:0.4rem;">📊 Y-Axis (Metric to Forecast)</label>
                    <select id="fm-y-col" style="width:100%;background:#1a2235;border:1px solid #2a3650;color:#e2e8f0;padding:0.6rem 0.8rem;border-radius:8px;font-size:0.85rem;">${yOpts}</select>
                </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1.25rem;">
                <div>
                    <label style="font-size:0.78rem;color:#94a3b8;font-weight:600;display:block;margin-bottom:0.4rem;">🔢 Forecast Periods</label>
                    <input id="fm-periods" type="number" value="10" min="1" max="100" style="width:100%;background:#1a2235;border:1px solid #2a3650;color:#e2e8f0;padding:0.6rem 0.8rem;border-radius:8px;font-size:0.85rem;" />
                </div>
                <div>
                    <label style="font-size:0.78rem;color:#94a3b8;font-weight:600;display:block;margin-bottom:0.4rem;">🤖 Model</label>
                    <select id="fm-model" style="width:100%;background:#1a2235;border:1px solid #2a3650;color:#e2e8f0;padding:0.6rem 0.8rem;border-radius:8px;font-size:0.85rem;">
                        <option value="auto">⚡ Auto (Best R² wins)</option>
                        <option value="linear">📏 Linear Regression</option>
                        <option value="poly">📐 Polynomial (Degree 2)</option>
                        <option value="sklearn_linear">🔬 Scikit-Learn (Stable)</option>
                    </select>
                </div>
            </div>

            <button onclick="runForecastFromModal()" style="width:100%;background:linear-gradient(135deg,#6366f1,#8b5cf6);border:none;color:white;padding:0.85rem;border-radius:12px;font-weight:700;font-size:1rem;cursor:pointer;margin-bottom:1.5rem;letter-spacing:0.02em;">
                🔮 Run Forecast
            </button>

            <!-- Results -->
            <div id="fm-results" style="display:none;">
                <!-- Insight card -->
                <div id="fm-insight-card" style="background:linear-gradient(135deg,rgba(99,102,241,0.1),rgba(139,92,246,0.06));border:1px solid rgba(99,102,241,0.25);border-radius:12px;padding:1rem 1.25rem;margin-bottom:1rem;"></div>
                <!-- Model info strip -->
                <div id="fm-model-strip" style="display:flex;gap:0.75rem;margin-bottom:1rem;flex-wrap:wrap;"></div>
                <!-- Chart -->
                <div style="background:#111827;border:1px solid #2a3650;border-radius:12px;padding:1rem;margin-bottom:1rem;position:relative;height:320px;">
                    <canvas id="fm-chart-canvas"></canvas>
                </div>
                <!-- Forecast table -->
                <div style="font-size:0.78rem;color:#64748b;font-weight:600;margin-bottom:0.5rem;text-transform:uppercase;letter-spacing:0.05em;">Forecast Values</div>
                <div id="fm-table-container" style="overflow-x:auto;background:#111827;border:1px solid #2a3650;border-radius:10px;max-height:200px;overflow-y:auto;"></div>
            </div>
            <div id="fm-loading" style="display:none;text-align:center;padding:2rem;color:#64748b;">
                <div style="width:40px;height:40px;border:3px solid rgba(99,102,241,0.2);border-top-color:#6366f1;border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto 1rem;"></div>
                Running forecast model…
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    // Pre-fill from axis recommender
    if (_axisRecommendations?.forecast_cols) {
        const fc = _axisRecommendations.forecast_cols;
        if (fc.x) { const el = document.getElementById('fm-x-col'); if (el) el.value = fc.x; }
        if (fc.y) { const el = document.getElementById('fm-y-col'); if (el) el.value = fc.y; }
    }
}

let _fmChartInstance = null;

async function runForecastFromModal() {
    const xCol = document.getElementById('fm-x-col')?.value;
    const yCol = document.getElementById('fm-y-col')?.value;
    const periods = parseInt(document.getElementById('fm-periods')?.value || '10');
    const model = document.getElementById('fm-model')?.value || 'auto';

    if (!xCol || !yCol) { showToast('Missing Input', 'Please select X and Y columns.', 'warning'); return; }
    if (!activeDataset) { showToast('No Dataset', 'Please load a dataset first.', 'warning'); return; }

    document.getElementById('fm-loading').style.display = 'block';
    document.getElementById('fm-results').style.display = 'none';

    try {
        const resp = await fetch('/api/analytics/forecast', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file: activeDataset, x_column: xCol, y_column: yCol, periods, model })
        });
        const data = await resp.json();

        document.getElementById('fm-loading').style.display = 'none';

        if (!data.success) {
            showToast('Forecast Failed', data.error || 'Could not compute forecast.', 'error');
            return;
        }

        const fd = data.data;
        document.getElementById('fm-results').style.display = 'block';

        // Insight card
        const trendIcon = fd.trend_direction === 'upward' ? '📈' : fd.trend_direction === 'downward' ? '📉' : '➡️';
        const trendColor = fd.trend_direction === 'upward' ? '#34d399' : fd.trend_direction === 'downward' ? '#f87171' : '#94a3b8';
        document.getElementById('fm-insight-card').innerHTML = `
            <div style="display:flex;align-items:flex-start;gap:0.75rem;">
                <span style="font-size:1.8rem;">${trendIcon}</span>
                <div>
                    <div style="font-weight:700;color:${trendColor};font-size:0.9rem;margin-bottom:0.3rem;">${fd.trend_direction?.toUpperCase()} TREND • ${fd.pct_change_historical > 0 ? '+' : ''}${fd.pct_change_historical}% historical change</div>
                    <div style="color:#94a3b8;font-size:0.85rem;line-height:1.5;">${fd.insight || ''}</div>
                </div>
            </div>
        `;

        // Model info strip
        const modelStrip = document.getElementById('fm-model-strip');
        modelStrip.innerHTML = `
            <div style="background:rgba(99,102,241,0.12);border:1px solid rgba(99,102,241,0.3);border-radius:8px;padding:0.4rem 0.75rem;font-size:0.78rem;">
                <strong style="color:#818cf8;">Model:</strong> <span style="color:#e2e8f0;">${fd.model_used}</span>
            </div>
            <div style="background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.3);border-radius:8px;padding:0.4rem 0.75rem;font-size:0.78rem;">
                <strong style="color:#34d399;">R² Score:</strong> <span style="color:#e2e8f0;">${fd.r2_score}</span>
            </div>
            <div style="background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);border-radius:8px;padding:0.4rem 0.75rem;font-size:0.78rem;">
                <strong style="color:#f59e0b;">Slope:</strong> <span style="color:#e2e8f0;">${fd.slope > 0 ? '+' : ''}${fd.slope}</span>
            </div>
        `;

        // Build chart
        if (_fmChartInstance) { _fmChartInstance.destroy(); _fmChartInstance = null; }
        const hist = fd.historical || [];
        const fore = fd.forecast || [];
        const allLabels = [...hist.map(p => p.label), ...fore.map(p => p.label)];
        const actualData = [...hist.map(p => p.actual), ...fore.map(() => null)];
        const trendData = [...hist.map(p => p.trend), ...fore.map(p => p.predicted)];
        const upperData = [...hist.map(p => p.upper_band ?? null), ...fore.map(p => p.upper_bound)];
        const lowerData = [...hist.map(p => p.lower_band ?? null), ...fore.map(p => p.lower_bound)];

        const ctx = document.getElementById('fm-chart-canvas');
        _fmChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: allLabels,
                datasets: [
                    {
                        label: `${yCol} (Actual)`,
                        data: actualData,
                        borderColor: 'rgba(99,102,241,0.9)',
                        backgroundColor: 'rgba(99,102,241,0.1)',
                        pointRadius: 2,
                        borderWidth: 2,
                        fill: false,
                        tension: 0.3,
                    },
                    {
                        label: 'Trend / Forecast',
                        data: trendData,
                        borderColor: 'rgba(16,185,129,0.9)',
                        borderWidth: 2,
                        borderDash: [6, 3],
                        pointRadius: 0,
                        fill: false,
                        tension: 0.3,
                    },
                    {
                        label: 'Upper Band (95%)',
                        data: upperData,
                        borderColor: 'rgba(245,158,11,0.4)',
                        borderWidth: 1,
                        pointRadius: 0,
                        fill: '+1',
                        backgroundColor: 'rgba(245,158,11,0.07)',
                        tension: 0.3,
                    },
                    {
                        label: 'Lower Band (95%)',
                        data: lowerData,
                        borderColor: 'rgba(245,158,11,0.4)',
                        borderWidth: 1,
                        pointRadius: 0,
                        fill: false,
                        tension: 0.3,
                    },
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { display: true, labels: { color: '#94a3b8', font: { size: 11 } } },
                    tooltip: { backgroundColor: '#1a2235', borderColor: '#2a3650', borderWidth: 1, titleColor: '#e2e8f0', bodyColor: '#94a3b8' }
                },
                scales: {
                    x: { ticks: { color: '#64748b', maxRotation: 45, font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
                    y: { ticks: { color: '#64748b', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' } }
                },
                animation: { duration: 600 }
            }
        });

        // Forecast table
        const tableContainer = document.getElementById('fm-table-container');
        const rows = fore.map(p => `
            <tr>
                <td style="padding:0.5rem 0.75rem;color:#e2e8f0;border-bottom:1px solid #1e293b;">${p.label}</td>
                <td style="padding:0.5rem 0.75rem;color:#818cf8;font-weight:700;border-bottom:1px solid #1e293b;">${p.predicted?.toLocaleString()}</td>
                <td style="padding:0.5rem 0.75rem;color:#64748b;border-bottom:1px solid #1e293b;">${p.lower_bound?.toLocaleString()} – ${p.upper_bound?.toLocaleString()}</td>
            </tr>
        `).join('');
        tableContainer.innerHTML = `
            <table style="width:100%;border-collapse:collapse;font-size:0.83rem;">
                <thead>
                    <tr style="background:#0d1322;">
                        <th style="padding:0.6rem 0.75rem;color:#64748b;text-align:left;font-weight:600;font-size:0.75rem;text-transform:uppercase;">Period</th>
                        <th style="padding:0.6rem 0.75rem;color:#64748b;text-align:left;font-weight:600;font-size:0.75rem;text-transform:uppercase;">Predicted Value</th>
                        <th style="padding:0.6rem 0.75rem;color:#64748b;text-align:left;font-weight:600;font-size:0.75rem;text-transform:uppercase;">Confidence Range (95%)</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        `;

    } catch(e) {
        document.getElementById('fm-loading').style.display = 'none';
        showToast('Forecast Error', e.message, 'error');
    }
}


// =======================================================
// 🔌 HOOK INTO EXISTING FUNCTIONS
// =======================================================

// Patch uploadFile to show dataset update notification
const _origUploadFile = uploadFile;
window.uploadFile = async function(file) {
    // We need to intercept the response to check diff
    const validExts = ['.csv', '.xls', '.xlsx'];
    const fileExt = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (!validExts.includes(fileExt)) {
        showToast('Invalid File Type', 'Only CSV and Excel sheets are supported.', 'error');
        return;
    }
    const formData = new FormData();
    formData.append('file', file);
    showLoading(`Uploading and parsing ${file.name}...`);
    try {
        const response = await fetch('/api/datasets/upload', { method: 'POST', body: formData });
        const data = await response.json();
        hideLoading();
        if (data.success) {
            // Show dataset update notification if this is a re-upload with changes
            if (data.diff && data.diff.is_update) {
                showDatasetUpdateModal(data.diff, data.filename);
            } else {
                showToast('Upload Successful', data.message, 'success');
            }
            activeDataset = data.filename;
            datasetMetadata = data.metadata;
            updateAppStateDataset();
            refreshDatasetList();
            if (typeof refreshHomeDatasetsSummary === 'function') refreshHomeDatasetsSummary();
            switchTab('cleaner');
        } else {
            showToast('Upload Failed', data.error || 'An error occurred.', 'error');
        }
    } catch(e) {
        hideLoading();
        showToast('Error', 'Failed to upload file: ' + e.message, 'error');
    }
};

// Patch updateAppStateDataset to fetch axis suggestions
const _origUpdateAppState = updateAppStateDataset;
window.updateAppStateDataset = function() {
    _origUpdateAppState();
    // Async fetch axis suggestions
    if (activeDataset) {
        fetchAxisSuggestions(activeDataset);
        if (typeof initAgentAdvisor === 'function') {
            initAgentAdvisor(activeDataset);
        }
    }
};

// Add a floating Forecast button to Visualizer tab
function injectForecastButton() {
    if (document.getElementById('floating-forecast-btn')) return;
    const btn = document.createElement('button');
    btn.id = 'floating-forecast-btn';
    btn.id = 'forecast-eligible-badge';
    btn.title = 'Run Forecast & Prediction';
    btn.innerHTML = '🔮 Forecast';
    btn.style.cssText = `
        position: fixed; bottom: 2rem; right: 2rem; z-index: 999;
        background: linear-gradient(135deg, #6366f1, #8b5cf6);
        color: white; border: none; padding: 0.75rem 1.25rem;
        border-radius: 50px; font-weight: 700; font-size: 0.9rem;
        cursor: pointer; box-shadow: 0 8px 30px rgba(99,102,241,0.5);
        display: none; align-items: center; gap: 0.4rem;
        transition: transform 0.2s, box-shadow 0.2s;
    `;
    btn.addEventListener('mouseenter', () => btn.style.transform = 'translateY(-2px)');
    btn.addEventListener('mouseleave', () => btn.style.transform = 'none');
    btn.onclick = openForecastModal;
    document.body.appendChild(btn);
}

// Inject forecast button on load
document.addEventListener('DOMContentLoaded', () => {
    injectForecastButton();
});

// Expose openShareModal and openForecastModal globally
window.openShareModal = openShareModal;
window.openForecastModal = openForecastModal;
window.autoFillAxes = autoFillAxes;
window.addShareButtonToCard = addShareButtonToCard;

console.log('[AetherBI] New features loaded: Smart Axes ⭐, Update Alerts 🔔, Sharing 🤝, Forecast 🔮');


// ==========================================
// AI VISUALIZER - HOME DASHBOARD & SIDEBAR LOGIC
// ==========================================
let homeOverviewChartInstance = null;
let homeDonutChartInstance = null;
let liveClockInterval = null;

function initHomeDashboard() {
    // 1. Live Digital Clock Widget
    updateHomeClock();
    if (!liveClockInterval) {
        liveClockInterval = setInterval(updateHomeClock, 1000);
    }

    // 2. Data Overview Smooth Spline Line Chart (Sales, Users, Profit)
    renderHomeOverviewChart();

    // 3. Dataset Distribution Donut Chart
    renderHomeDonutChart();

    // 4. Update Datasets KPI count and load table
    refreshHomeDatasetsSummary();
}

function updateHomeClock() {
    const now = new Date();
    const dateEl = document.getElementById("live-date-str");
    const timeEl = document.getElementById("live-time-str");
    if (dateEl) {
        const options = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
        dateEl.textContent = now.toLocaleDateString('en-US', options);
    }
    if (timeEl) {
        timeEl.textContent = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
    }
}

function renderHomeOverviewChart() {
    const canvas = document.getElementById("homeDataOverviewChart");
    if (!canvas) return;

    if (homeOverviewChartInstance) {
        homeOverviewChartInstance.destroy();
        homeOverviewChartInstance = null;
    }

    const ctx = canvas.getContext('2d');
    
    // Create soft gradients
    const gradBlue = ctx.createLinearGradient(0, 0, 0, 240);
    gradBlue.addColorStop(0, 'rgba(59, 130, 246, 0.35)');
    gradBlue.addColorStop(1, 'rgba(59, 130, 246, 0.0)');

    const gradPurple = ctx.createLinearGradient(0, 0, 0, 240);
    gradPurple.addColorStop(0, 'rgba(139, 92, 246, 0.28)');
    gradPurple.addColorStop(1, 'rgba(139, 92, 246, 0.0)');

    const gradEmerald = ctx.createLinearGradient(0, 0, 0, 240);
    gradEmerald.addColorStop(0, 'rgba(16, 185, 129, 0.25)');
    gradEmerald.addColorStop(1, 'rgba(16, 185, 129, 0.0)');

    let labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    let datasets = [
        {
            label: 'Sales',
            data: [8200, 9100, 11400, 10200, 12800, 14200, 13100, 15600, 16400, 15800, 17200, 18500],
            borderColor: '#3b82f6',
            backgroundColor: gradBlue,
            borderWidth: 2.5,
            fill: true,
            tension: 0.42,
            pointRadius: 3,
            pointHoverRadius: 6,
            pointBackgroundColor: '#3b82f6'
        },
        {
            label: 'Users',
            data: [5200, 5800, 7100, 6900, 8400, 9300, 8900, 11200, 12100, 11800, 13400, 14200],
            borderColor: '#8b5cf6',
            backgroundColor: gradPurple,
            borderWidth: 2.2,
            fill: true,
            tension: 0.42,
            pointRadius: 3,
            pointHoverRadius: 6,
            pointBackgroundColor: '#8b5cf6'
        },
        {
            label: 'Profit',
            data: [3100, 3400, 4200, 4100, 5200, 5800, 5400, 6900, 7400, 7100, 8200, 8900],
            borderColor: '#10b981',
            backgroundColor: gradEmerald,
            borderWidth: 2,
            fill: true,
            tension: 0.42,
            pointRadius: 3,
            pointHoverRadius: 6,
            pointBackgroundColor: '#10b981'
        }
    ];

    // If active dataset exists and has sample rows, make the overview chart dynamic with actual data!
    if (datasetMetadata && datasetMetadata.sample_data && datasetMetadata.sample_data.length > 0) {
        const rows = datasetMetadata.sample_data.slice(0, 12);
        const cols = datasetMetadata.columns || [];
        const numCols = cols.filter(c => {
            const dt = (datasetMetadata.dtypes && datasetMetadata.dtypes[c] || '').toLowerCase();
            return dt.includes('int') || dt.includes('float') || dt.includes('double') || dt.includes('num') || dt.includes('price') || dt.includes('sales') || dt.includes('unit') || dt.includes('score') || dt.includes('revenue');
        });

        // Determine X-axis label column
        const labelCol = cols.find(c => {
            const lc = c.toLowerCase();
            return lc.includes('date') || lc.includes('month') || lc.includes('name') || lc.includes('model') || lc.includes('product') || lc.includes('region') || lc.includes('category');
        }) || cols[0];

        if (labelCol) {
            labels = rows.map((r, i) => r[labelCol] !== undefined && r[labelCol] !== null ? String(r[labelCol]).slice(0, 12) : `Row ${i+1}`);
        } else {
            labels = rows.map((_, i) => `Item ${i+1}`);
        }

        if (numCols.length > 0) {
            datasets = [];
            const palette = [
                { color: '#3b82f6', grad: gradBlue },
                { color: '#8b5cf6', grad: gradPurple },
                { color: '#10b981', grad: gradEmerald }
            ];

            const topNumCols = numCols.slice(0, 3);
            topNumCols.forEach((col, idx) => {
                const p = palette[idx % palette.length];
                datasets.push({
                    label: col,
                    data: rows.map(r => typeof r[col] === 'number' ? r[col] : (parseFloat(r[col]) || 0)),
                    borderColor: p.color,
                    backgroundColor: p.grad,
                    borderWidth: 2.4,
                    fill: true,
                    tension: 0.42,
                    pointRadius: 3,
                    pointHoverRadius: 6,
                    pointBackgroundColor: p.color
                });
            });

            // Update custom legend badges in HTML
            const legendContainer = document.querySelector('.chart-custom-legend');
            if (legendContainer) {
                const dots = ['dot-blue', 'dot-purple', 'dot-emerald'];
                legendContainer.innerHTML = topNumCols.map((col, idx) => {
                    return `<span class="legend-badge"><span class="legend-dot ${dots[idx % 3]}"></span> ${col}</span>`;
                }).join('');
            }
        }
    }

    homeOverviewChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(15, 20, 35, 0.95)',
                    titleColor: '#ffffff',
                    bodyColor: '#cbd5e1',
                    borderColor: 'rgba(255, 255, 255, 0.1)',
                    borderWidth: 1,
                    padding: 10,
                    boxPadding: 4,
                    usePointStyle: true
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.04)' },
                    ticks: { color: '#64748b', font: { size: 11 } }
                },
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.04)' },
                    ticks: {
                        color: '#64748b',
                        font: { size: 11 },
                        callback: val => val >= 1000 ? (val / 1000).toFixed(0) + 'K' : val
                    }
                }
            }
        }
    });
}

function renderHomeDonutChart() {
    const canvas = document.getElementById("homeDatasetDistributionChart");
    if (!canvas) return;

    if (homeDonutChartInstance) {
        homeDonutChartInstance.destroy();
        homeDonutChartInstance = null;
    }

    const ctx = canvas.getContext('2d');

    homeDonutChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['CSV Datasets', 'Excel Workbooks', 'Reports', 'AI Models'],
            datasets: [{
                data: [4, 2, 3, 2],
                backgroundColor: [
                    '#3b82f6',
                    '#06b6d4',
                    '#8b5cf6',
                    '#10b981'
                ],
                borderWidth: 3,
                borderColor: '#0f1422',
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '72%',
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(15, 20, 35, 0.95)',
                    padding: 8
                }
            }
        }
    });
}

async function refreshHomeDatasetsSummary() {
    try {
        const response = await fetch("/api/datasets/list");
        const data = await response.json();
        if (data.success && data.datasets) {
            const datasets = data.datasets;
            const count = datasets.length;
            const dsKpi = document.getElementById("home-kpi-datasets");
            if (dsKpi) dsKpi.textContent = count;
            const donutCount = document.getElementById("donut-center-count");
            if (donutCount) donutCount.textContent = count;

            // Update Total Rows KPI
            const rowsKpi = document.getElementById("home-kpi-rows");
            if (rowsKpi) {
                if (datasetMetadata && datasetMetadata.shape) {
                    rowsKpi.textContent = datasetMetadata.shape[0].toLocaleString();
                } else {
                    rowsKpi.textContent = (count * 150).toLocaleString();
                }
            }

            // Dynamically populate "Your Datasets" table on Home panel
            const tbody = document.getElementById("home-datasets-tbody");
            if (tbody) {
                tbody.innerHTML = "";
                datasets.forEach(file => {
                    const isExcel = file.name.toLowerCase().endsWith('.xls') || file.name.toLowerCase().endsWith('.xlsx');
                    const iconClass = isExcel ? 'fa-file-excel' : 'fa-file-csv';
                    const bgClass = isExcel ? 'bg-blue' : 'bg-teal';
                    const isActive = activeDataset === file.name;
                    const dateStr = file.modified ? new Date(file.modified * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recently';

                    const tr = document.createElement("tr");
                    if (isActive) tr.style.background = "rgba(59, 130, 246, 0.12)";
                    tr.innerHTML = `
                        <td>
                            <div class="dataset-meta-cell">
                                <div class="ds-icon-sq ${bgClass}"><i class="fa-solid ${iconClass}"></i></div>
                                <div>
                                    <div class="ds-name-text" style="font-weight: 600;">${file.name} ${isActive ? '<span style="color:#10b981;font-size:0.75rem;margin-left:6px;font-weight:700;">● Active</span>' : ''}</div>
                                    <div class="ds-sub-text">${isExcel ? 'Excel Spreadsheet' : 'Comma Separated Values'}</div>
                                </div>
                            </div>
                        </td>
                        <td>${isActive && datasetMetadata && datasetMetadata.shape ? datasetMetadata.shape[0].toLocaleString() : (file.size_kb > 100 ? '1,000+' : '150+')}</td>
                        <td>${isActive && datasetMetadata && datasetMetadata.shape ? datasetMetadata.shape[1] : (isExcel ? 8 : 7)}</td>
                        <td>${file.size_kb} KB</td>
                        <td>${dateStr}</td>
                        <td>
                            <div class="tbl-action-btns">
                                <button class="tbl-act-btn" onclick="selectDataset('${file.name}')" title="Load & Explore"><i class="fa-solid fa-folder-open"></i></button>
                                <a class="tbl-act-btn" href="/api/datasets/download?filename=${encodeURIComponent(file.name)}" download title="Download"><i class="fa-solid fa-download"></i></a>
                                <button class="tbl-act-btn" onclick="promptDeleteDataset('${file.name}', event)" title="Delete"><i class="fa-solid fa-trash-can"></i></button>
                            </div>
                        </td>
                    `;
                    tbody.appendChild(tr);
                });
            }

            // Dynamically update Donut Chart distribution
            let csvCount = 0, excelCount = 0;
            datasets.forEach(f => {
                if (f.name.toLowerCase().endsWith('.xlsx') || f.name.toLowerCase().endsWith('.xls')) {
                    excelCount++;
                } else {
                    csvCount++;
                }
            });

            if (homeDonutChartInstance) {
                homeDonutChartInstance.data.labels = ['CSV Files', 'Excel Sheets', 'AI Ready'];
                homeDonutChartInstance.data.datasets[0].data = [csvCount, excelCount, count];
                homeDonutChartInstance.update();

                // Update donut legend counts in HTML
                const legendList = document.querySelector('.donut-legend-list');
                if (legendList) {
                    legendList.innerHTML = `
                        <div class="dist-legend-item"><span class="dist-dot dot-sales"></span> <span class="dist-name">CSV Files</span> <span class="dist-val">${csvCount}</span></div>
                        <div class="dist-legend-item"><span class="dist-dot dot-finance"></span> <span class="dist-name">Excel Files</span> <span class="dist-val">${excelCount}</span></div>
                        <div class="dist-legend-item"><span class="dist-dot dot-marketing"></span> <span class="dist-name">AI Ready</span> <span class="dist-val">${count}</span></div>
                    `;
                }
            }
        }
    } catch(e) {
        console.warn("Could not refresh home datasets summary:", e);
    }
}

function updateHomeWithActiveDataset() {
    if (!datasetMetadata) return;

    // Update KPI card
    const rowsKpi = document.getElementById("home-kpi-rows");
    if (rowsKpi && datasetMetadata.shape) {
        rowsKpi.textContent = datasetMetadata.shape[0].toLocaleString();
    }

    // Refresh Home overview chart with real data
    renderHomeOverviewChart();

    // Re-render datasets table to show active badge
    refreshHomeDatasetsSummary();
}

function toggleSidebar(forceState) {
    const sidebar = document.getElementById("app-sidebar");
    const backdrop = document.querySelector(".sidebar-backdrop");
    if (!sidebar) return;
    const shouldOpen = typeof forceState === 'boolean' ? forceState : !sidebar.classList.contains("open");
    if (shouldOpen) {
        sidebar.classList.add("open");
        if (backdrop) backdrop.classList.add("active");
    } else {
        sidebar.classList.remove("open");
        if (backdrop) backdrop.classList.remove("active");
    }
}

function toggleUserDropdown(e) {
    if (e) e.stopPropagation();
    const menu = document.getElementById("user-dropdown-menu");
    if (menu) menu.classList.toggle("hidden");
}

function showNotificationCenter() {
    showToast("Notifications", "All services running smoothly with high performance.", "info");
}

// Close user dropdown if clicking outside
document.addEventListener("click", (e) => {
    const userMenu = document.getElementById("user-dropdown-menu");
    if (userMenu && !userMenu.classList.contains("hidden")) {
        const badge = document.querySelector(".user-profile-badge-v2");
        if (badge && !badge.contains(e.target)) {
            userMenu.classList.add("hidden");
        }
    }
});

// Auto-initialize home dashboard if on home tab on DOM load
document.addEventListener("DOMContentLoaded", () => {
    setTimeout(() => {
        const homePanel = document.getElementById("panel-home");
        if (homePanel && homePanel.classList.contains("active")) {
            initHomeDashboard();
        }
    }, 300);
});

// ==========================================
// AI DATASET INTELLIGENCE & ADVISOR AGENT
// ==========================================
let currentAgentProfile = null;
let agentLoading = false;

async function initAgentAdvisor(filename, force = false) {
    if (!filename) return;

    // Use cached profile if already loaded for this dataset and not forced
    if (currentAgentProfile && currentAgentProfile.filename === filename && !force) {
        renderAgentAnalyticsUI(currentAgentProfile);
        renderAgentVisualizerUI(currentAgentProfile);
        return;
    }

    if (agentLoading) return;
    agentLoading = true;

    // Show initial loading placeholders
    const domainPill = document.getElementById('agent-domain-pill');
    if (domainPill) domainPill.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Detecting domain...';
    
    const domainDesc = document.getElementById('agent-domain-desc');
    if (domainDesc) domainDesc.innerHTML = 'Analyzing dataset ontology, schemas, and historical trends...';
    
    const advisorDomain = document.getElementById('advisor-domain-name');
    if (advisorDomain) advisorDomain.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Shortlisting axes...';

    const pfContainer = document.getElementById('agent-past-future-container');
    if (pfContainer) {
        pfContainer.innerHTML = '<div class="placeholder-text"><i class="fa-solid fa-spinner fa-spin"></i> Formulating diagnostic past questions & predictive forecasts...</div>';
    }

    const problemContainer = document.getElementById('agent-problem-focus-container');
    if (problemContainer) {
        problemContainer.innerHTML = '<div class="placeholder-text"><i class="fa-solid fa-spinner fa-spin"></i> Diagnosing sales and inventory bottlenecks...</div>';
    }

    const recsContainer = document.getElementById('advisor-recs-container');
    if (recsContainer) {
        recsContainer.innerHTML = '<div class="advisor-loading"><i class="fa-solid fa-spinner fa-spin"></i> AI shortlisting optimal X and Y axis pairs...</div>';
    }

    try {
        const response = await fetch(`/api/agent/profile?file=${encodeURIComponent(filename)}`);
        const data = await response.json();
        agentLoading = false;

        if (data.success) {
            currentAgentProfile = data;
            renderAgentAnalyticsUI(data);
            renderAgentVisualizerUI(data);
        } else {
            console.warn("Agent profile warning:", data.error);
        }
    } catch (err) {
        agentLoading = false;
        console.warn("Could not initialize Agent Advisor:", err);
    }
}

function renderAgentAnalyticsUI(profile) {
    if (!profile || !profile.domain) return;
    const dom = profile.domain;

    // 1. Domain Badge & Description
    const domainPill = document.getElementById('agent-domain-pill');
    if (domainPill) {
        domainPill.innerHTML = `<i class="fa-solid ${dom.icon || 'fa-layer-group'}"></i> ${dom.label} <span class="badge-confidence">${dom.confidence}% match</span>`;
        if (dom.color) domainPill.style.borderColor = dom.color;
    }

    const domainDesc = document.getElementById('agent-domain-desc');
    if (domainDesc) {
        let keyMetricsHtml = '';
        if (dom.key_metrics && dom.key_metrics.length > 0) {
            keyMetricsHtml = `<div class="agent-metrics-row mt-1"><strong>Key Metric Targets:</strong> ${dom.key_metrics.map(m => `<span class="domain-metric-badge">${m}</span>`).join(' ')}</div>`;
        }
        domainDesc.innerHTML = `<p class="mb-1">${dom.description}</p>${keyMetricsHtml}`;
    }

    // 2. Past Questions -> Future Answers
    const pfContainer = document.getElementById('agent-past-future-container');
    if (pfContainer && profile.past_to_future_qa && profile.past_to_future_qa.length > 0) {
        let pfHtml = '';
        profile.past_to_future_qa.forEach((qa, idx) => {
            pfHtml += `
                <div class="past-future-item">
                    <div class="pf-header">
                        <span class="pf-past-q"><i class="fa-solid fa-clock-rotate-left text-primary"></i> <strong>Past Inquiry:</strong> ${qa.past_question}</span>
                    </div>
                    <div class="pf-body">
                        <div class="pf-row">
                            <span class="pf-label pf-label-past">Historical Finding</span>
                            <span class="pf-val">${qa.past_finding}</span>
                        </div>
                        <div class="pf-row">
                            <span class="pf-label pf-label-future">Future Projection</span>
                            <span class="pf-val text-accent">${qa.future_projection}</span>
                        </div>
                        <div class="pf-row">
                            <span class="pf-label pf-label-action">Strategic Focus</span>
                            <span class="pf-val font-medium">${qa.action_focus}</span>
                        </div>
                    </div>
                </div>
            `;
        });
        pfContainer.innerHTML = pfHtml;
    }

    // 3. Strategic Problem Solver (Sales & Inventory Focus)
    const probContainer = document.getElementById('agent-problem-focus-container');
    if (probContainer && profile.business_problems) {
        const bp = profile.business_problems;
        const sales = bp.sales_problem_focus || {};
        const inv = bp.inventory_problem_focus || {};

        let salesHtml = `
            <div class="problem-card-box sales-problem-box">
                <div class="pc-header">
                    <h5><i class="fa-solid fa-chart-line-down text-danger"></i> Sales Problems & Revenue Leakage</h5>
                    <span class="pc-metric">Metric: ${sales.metric_analyzed || 'Revenue'}</span>
                </div>
                <p class="pc-problem-statement">${sales.primary_sales_problem || 'Analyzing revenue dispersion and sales performance.'}</p>
                <div class="pc-focus-heading"><i class="fa-solid fa-bullseye text-accent"></i> <strong>Where to Focus to Increase Sales:</strong></div>
                <ul class="pc-focus-list">
                    ${(sales.focus_recommendations || []).map(r => `<li><i class="fa-solid fa-arrow-right text-accent"></i> ${r}</li>`).join('')}
                </ul>
            </div>
        `;

        let invHtml = `
            <div class="problem-card-box inventory-problem-box">
                <div class="pc-header">
                    <h5><i class="fa-solid fa-boxes-stacked text-warning"></i> Inventory Bottlenecks & Stock Health</h5>
                    <span class="pc-metric">Tracked: ${inv.metric_tracked || 'Stock Units'}</span>
                </div>
                <p class="pc-problem-statement">${inv.primary_inventory_problem || 'Analyzing stockout risks and holding cost variance.'}</p>
                <div class="pc-focus-heading"><i class="fa-solid fa-bullseye text-warning"></i> <strong>Where to Focus to Optimize Inventory:</strong></div>
                <ul class="pc-focus-list">
                    ${(inv.focus_recommendations || []).map(r => `<li><i class="fa-solid fa-arrow-right text-warning"></i> ${r}</li>`).join('')}
                </ul>
            </div>
        `;

        probContainer.innerHTML = salesHtml + invHtml;
    }
}

function renderAgentVisualizerUI(profile) {
    if (!profile) return;
    const dom = profile.domain || {};
    const chartRecs = profile.chart_recommendations || {};
    const recs = chartRecs.recommendations || [];

    const domainNameEl = document.getElementById('advisor-domain-name');
    if (domainNameEl) {
        domainNameEl.innerHTML = `<i class="fa-solid ${dom.icon || 'fa-chart-pie'}"></i> ${dom.label || 'Multi-Domain'}`;
    }

    const domainSubtext = document.getElementById('advisor-domain-subtext');
    if (domainSubtext) {
        domainSubtext.textContent = `Shortlisted optimal X and Y axis pairs based on ${dom.label || 'dataset'} business rules`;
    }

    const container = document.getElementById('advisor-recs-container');
    if (!container) return;

    if (recs.length === 0) {
        container.innerHTML = '<div class="advisor-loading">No custom axis recommendations found for this dataset.</div>';
        return;
    }

    let cardsHtml = '';
    recs.forEach((rec, idx) => {
        const isBest = idx === 0;
        cardsHtml += `
            <div class="advisor-rec-card ${isBest ? 'recommended-primary' : ''}">
                <div class="rec-badge-row">
                    <span class="rec-type-badge"><i class="fa-solid fa-chart-simple"></i> ${(rec.chart_type || 'chart').toUpperCase()}</span>
                    ${isBest ? '<span class="badge badge-best"><i class="fa-solid fa-crown text-warning"></i> Recommended Axes</span>' : '<span class="badge badge-alternative">Alternative</span>'}
                </div>
                <h4 class="rec-card-title">${rec.name}</h4>
                <div class="rec-axes-spec">
                    <div class="rec-axis-item">
                        <span class="axis-tag axis-x">X-Axis</span>
                        <strong class="axis-name" title="${rec.x_axis}">${rec.x_axis}</strong>
                    </div>
                    <div class="rec-axis-item">
                        <span class="axis-tag axis-y">Y-Axis</span>
                        <strong class="axis-name" title="${rec.y_axis}">${rec.y_axis} <span class="agg-tag">(${rec.aggregation})</span></strong>
                    </div>
                </div>
                <p class="rec-reason-text">${rec.reason}</p>
                <button type="button" class="btn btn-sm ${isBest ? 'btn-primary' : 'btn-secondary'} w-100 rec-apply-btn" onclick="applyAgentRecommendation(${idx})">
                    <i class="fa-solid fa-wand-magic-sparkles"></i> Apply to Builder
                </button>
            </div>
        `;
    });

    container.innerHTML = cardsHtml;
}

function applyAgentRecommendation(recIndex) {
    if (!currentAgentProfile || !currentAgentProfile.chart_recommendations) return;
    const recs = currentAgentProfile.chart_recommendations.recommendations || [];
    const rec = recs[recIndex];
    if (!rec) return;

    // 1. Set Chart Type
    const typeSelect = document.getElementById('chart-type');
    if (typeSelect && rec.chart_type) {
        typeSelect.value = rec.chart_type;
    }

    // 2. Set X-Axis
    const xSelect = document.getElementById('chart-x-axis');
    if (xSelect && rec.x_axis) {
        // Ensure option exists, if not create
        let found = Array.from(xSelect.options).some(opt => opt.value === rec.x_axis);
        if (!found) {
            const opt = document.createElement('option');
            opt.value = rec.x_axis;
            opt.textContent = rec.x_axis;
            xSelect.appendChild(opt);
        }
        xSelect.value = rec.x_axis;
    }

    // 3. Set Y-Axis
    const ySelect = document.getElementById('chart-y-axis');
    if (ySelect && rec.y_axis) {
        let found = Array.from(ySelect.options).some(opt => opt.value === rec.y_axis);
        if (!found) {
            const opt = document.createElement('option');
            opt.value = rec.y_axis;
            opt.textContent = rec.y_axis;
            ySelect.appendChild(opt);
        }
        ySelect.value = rec.y_axis;
    }

    // 4. Set Aggregation
    const aggSelect = document.getElementById('chart-aggregation');
    if (aggSelect && rec.aggregation) {
        aggSelect.value = rec.aggregation;
    }

    // 5. Set Chart Title
    const titleInput = document.getElementById('chart-title');
    if (titleInput && rec.title) {
        titleInput.value = rec.title;
    }

    // 6. Update chart preview
    if (typeof updateChartPreview === 'function') {
        updateChartPreview();
    }

    showToast("Axes Shortlisted & Applied", `Configured ${rec.name}: X='${rec.x_axis}', Y='${rec.y_axis}' (${rec.aggregation}).`, "success");
}

function autoSelectBestAxes() {
    if (currentAgentProfile && currentAgentProfile.chart_recommendations) {
        applyAgentRecommendation(0);
    } else if (activeDataset) {
        initAgentAdvisor(activeDataset, true).then(() => {
            applyAgentRecommendation(0);
        });
    } else {
        showToast("No Dataset", "Please select a dataset to auto-shortlist axes.", "warning");
    }
}

function refreshAgentProfile() {
    if (!activeDataset) {
        showToast("No Dataset", "Please load a dataset first.", "warning");
        return;
    }
    showToast("Agent Refreshing", "Re-analyzing dataset domain, axes, and bottlenecks...", "info");
    initAgentAdvisor(activeDataset, true);
}

function askAgentChip(promptText) {
    const input = document.getElementById('agent-question-input');
    if (input) {
        input.value = promptText;
        submitAgentQuestion();
    }
}

async function submitAgentQuestion() {
    const input = document.getElementById('agent-question-input');
    if (!input) return;
    const question = input.value.trim();
    if (!question) {
        showToast("Question Needed", "Please enter a question to ask the agent.", "warning");
        return;
    }

    if (!activeDataset) {
        showToast("No Dataset", "Please select a dataset first.", "warning");
        return;
    }

    const answerBox = document.getElementById('agent-answer-box');
    const answerTopic = document.getElementById('agent-answer-topic');
    const answerText = document.getElementById('agent-answer-text');

    if (answerBox) answerBox.classList.remove('hidden');
    if (answerTopic) answerTopic.textContent = 'Agent Analyzing...';
    if (answerText) answerText.innerHTML = '<div class="loading-agent-spinner"><i class="fa-solid fa-spinner fa-spin"></i> Calculating dataset metrics and formulating strategic answer...</div>';

    try {
        const response = await fetch('/api/agent/ask', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file: activeDataset, question: question })
        });
        const data = await response.json();

        if (data.success) {
            if (answerTopic) answerTopic.textContent = data.topic || 'Dataset Intelligence Response';
            if (answerText) {
                // Convert newlines to formatted paragraphs
                const formatted = data.answer.split('\n\n').map(p => `<p>${p}</p>`).join('');
                answerText.innerHTML = formatted;
            }
        } else {
            if (answerTopic) answerTopic.textContent = 'Agent Notice';
            if (answerText) answerText.innerHTML = `<p class="text-danger">${data.error || 'Could not process query.'}</p>`;
        }
    } catch (e) {
        if (answerTopic) answerTopic.textContent = 'Error';
        if (answerText) answerText.innerHTML = `<p class="text-danger">Agent communication failed: ${e.message}</p>`;
    }
}

function closeAgentAnswer() {
    const answerBox = document.getElementById('agent-answer-box');
    if (answerBox) answerBox.classList.add('hidden');
}

// Global exports
window.initAgentAdvisor = initAgentAdvisor;
window.applyAgentRecommendation = applyAgentRecommendation;
window.autoSelectBestAxes = autoSelectBestAxes;
window.refreshAgentProfile = refreshAgentProfile;
window.askAgentChip = askAgentChip;
window.submitAgentQuestion = submitAgentQuestion;
window.closeAgentAnswer = closeAgentAnswer;
