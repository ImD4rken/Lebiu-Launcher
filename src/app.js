/**
 * @author Luuxis
 * Luuxis License v1.0 (voir fichier LICENSE pour les détails en FR/EN)
 */

const { app, ipcMain, nativeTheme } = require('electron');
const { Microsoft } = require('minecraft-java-core');
const { autoUpdater } = require('electron-updater')
const path = require('path');
const fs = require('fs');
const RPC = require('discord-rpc');

const UpdateWindow = require("./assets/js/windows/updateWindow.js");
const MainWindow = require("./assets/js/windows/mainWindow.js");

const CLIENT_ID = '1461439794151161856';
RPC.register(CLIENT_ID);

const rpc = new RPC.Client({ transport: 'ipc' });

let currentInstance = 'Sin seleccionar';
let currentPanel = 'home';

const DEFAULT_SMALL_IMAGE = 'launcher_logo';
const DEFAULT_LARGE_IMAGE = 'icon';

// Actualizamos setActivity para recibir la imagen
async function setActivity(instanceName = currentInstance, panelName = currentPanel, avatarURL = null) {
    if (!rpc) return;

    let details = 'En el menú principal';
    if (panelName === 'settings') {
        details = 'Configurando Launcher';
    } else if (panelName === 'login') {
        details = 'En el login';
    }

    rpc.setActivity({
        startTimestamp: new Date(),
        smallImageKey: DEFAULT_SMALL_IMAGE,
        largeImageText: 'Lebiu Launcher',
        largeImageKey: avatarURL ? avatarURL : DEFAULT_LARGE_IMAGE,
        smallImageText: `Instancia: ${instanceName}`,
        details: details,
        state: `Jugando: ${instanceName}`,
        instance: true,
    });
}

// ...


rpc.on('ready', () => {
    console.log('Rich Presence conectado.');
    setActivity();
});

rpc.login({ clientId: CLIENT_ID }).catch(console.error);

let dev = process.env.NODE_ENV === 'dev';

if (dev) {
    let appPath = path.resolve('./data/Launcher').replace(/\\/g, '/');
    let appdata = path.resolve('./data').replace(/\\/g, '/');
    if (!fs.existsSync(appPath)) fs.mkdirSync(appPath, { recursive: true });
    if (!fs.existsSync(appdata)) fs.mkdirSync(appdata, { recursive: true });
    app.setPath('userData', appPath);
    app.setPath('appData', appdata)
}

if (!app.requestSingleInstanceLock()) app.quit();
else app.whenReady().then(() => {
    if (dev) return MainWindow.createWindow()
    UpdateWindow.createWindow()
});

ipcMain.on('main-window-open', () => MainWindow.createWindow())
ipcMain.on('main-window-dev-tools', () => MainWindow.getWindow().webContents.openDevTools({ mode: 'detach' }))
ipcMain.on('main-window-dev-tools-close', () => MainWindow.getWindow().webContents.closeDevTools())
ipcMain.on('main-window-close', () => MainWindow.destroyWindow())
ipcMain.on('main-window-reload', () => MainWindow.getWindow().reload())
ipcMain.on('main-window-progress', (event, options) => MainWindow.getWindow().setProgressBar(options.progress / options.size))
ipcMain.on('main-window-progress-reset', () => MainWindow.getWindow().setProgressBar(-1))
ipcMain.on('main-window-progress-load', () => MainWindow.getWindow().setProgressBar(2))
ipcMain.on('main-window-minimize', () => MainWindow.getWindow().minimize())

ipcMain.on('update-window-close', () => UpdateWindow.destroyWindow())
ipcMain.on('update-window-dev-tools', () => UpdateWindow.getWindow().webContents.openDevTools({ mode: 'detach' }))
ipcMain.on('update-window-progress', (event, options) => UpdateWindow.getWindow().setProgressBar(options.progress / options.size))
ipcMain.on('update-window-progress-reset', () => UpdateWindow.getWindow().setProgressBar(-1))
ipcMain.on('update-window-progress-load', () => UpdateWindow.getWindow().setProgressBar(2))

ipcMain.handle('path-user-data', () => app.getPath('userData'))
ipcMain.handle('appData', e => app.getPath('appData'))

ipcMain.on('main-window-maximize', () => {
    if (MainWindow.getWindow().isMaximized()) {
        MainWindow.getWindow().unmaximize();
    } else {
        MainWindow.getWindow().maximize();
    }
})

ipcMain.on('main-window-hide', () => MainWindow.getWindow().hide())
ipcMain.on('main-window-show', () => MainWindow.getWindow().show())

ipcMain.handle('Microsoft-window', async (_, client_id) => {
    return await new Microsoft(client_id).getAuth();
})

ipcMain.handle('is-dark-theme', (_, theme) => {
    if (theme === 'dark') return true
    if (theme === 'light') return false
    return nativeTheme.shouldUseDarkColors;
})

ipcMain.on('instance-changed', (event, data) => {
    currentInstance = data.instanceName;
    // Pasamos el avatarURL que enviaremos desde el renderer
    setActivity(currentInstance, currentPanel, data.avatarURL);
    console.log(`Instancia cambió a: ${currentInstance} con avatar: ${data.avatarURL}`);
})
ipcMain.on('panel-changed', (event, data) => {
    currentPanel = data.panelName;
    setActivity(currentInstance, currentPanel);
    console.log(`Panel cambió a: ${currentPanel}`);
})

app.on('window-all-closed', () => app.quit());

 

autoUpdater.autoDownload = false;

ipcMain.handle('update-app', async () => {
    return await new Promise(async (resolve, reject) => {
        autoUpdater.checkForUpdates().then(res => {
            resolve(res);
        }).catch(error => {
            reject({
                error: true,
                message: error
            })
        })
    })
})

autoUpdater.on('update-available', () => {
    const updateWindow = UpdateWindow.getWindow();
    if (updateWindow) updateWindow.webContents.send('updateAvailable');
});

ipcMain.on('start-update', () => {
    autoUpdater.downloadUpdate();
})

autoUpdater.on('update-not-available', () => {
    const updateWindow = UpdateWindow.getWindow();
    if (updateWindow) updateWindow.webContents.send('update-not-available');
});

autoUpdater.on('update-downloaded', () => {
    autoUpdater.quitAndInstall();
});

autoUpdater.on('download-progress', (progress) => {
    const updateWindow = UpdateWindow.getWindow();
    if (updateWindow) updateWindow.webContents.send('download-progress', progress);
})

autoUpdater.on('error', (err) => {
    const updateWindow = UpdateWindow.getWindow();
    if (updateWindow) updateWindow.webContents.send('error', err);
});