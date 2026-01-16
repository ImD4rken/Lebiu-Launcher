"use strict";

const { ipcRenderer, shell } = require("electron");
const os = require("os");
const pkg = require("../package.json");
import { config, database } from "./utils.js";
const nodeFetch = require("node-fetch");

class Splash {
    constructor() {
        this.splash = document.querySelector("#splash");
        this.logo = document.querySelector(".splash");

        this.splashMessage = document.querySelector(".splash-message") || this.createMessage("splash-message");
        this.message = document.querySelector(".message") || this.createMessage("message");
        this.progress = document.querySelector(".progress");

        document.addEventListener("DOMContentLoaded", async () => {
            let databaseLauncher = new database();
            let configClient = await databaseLauncher.readData("configClient");
            let theme = configClient?.launcher_config?.theme || "auto";
            let isDarkTheme = await ipcRenderer.invoke("is-dark-theme", theme).then(res => res);
            document.body.className = isDarkTheme ? "dark global" : "light global";

            if (process.platform === "win32") ipcRenderer.send("update-window-progress-load");

            this.startAnimation();
        });
    }

    createMessage(className) {
        const el = document.createElement("p");
        el.className = className;
        this.splash.appendChild(el);
        return el;
    }

    async startAnimation() {
        await this.sleep(300);
        this.splash.classList.add("visible");

        this.message.textContent = "Preparando el launcher...";
        this.progress.value = 0;
        this.progress.max = 100;
        this.progress.classList.add("show");

        await this.sleep(1200);
        this.checkUpdate();
    }

    async checkUpdate() {
        this.setStatus("Buscando actualizaciones...");

        ipcRenderer.invoke("update-app").catch(err => {
            return this.shutdown(`Error al buscar actualizaciones:<br>${err.message}`);
        });

        ipcRenderer.on("updateAvailable", () => {
            this.setStatus("Actualización disponible...");
            if (os.platform() === "win32") {
                this.toggleProgress();
                ipcRenderer.send("start-update");
            } else {
                this.downloadUpdate();
            }
        });

        ipcRenderer.on("error", (event, err) => {
            if (err) return this.shutdown(err.message);
        });

        ipcRenderer.on("download-progress", (event, progress) => {
            ipcRenderer.send("update-window-progress", {
                progress: progress.transferred,
                size: progress.total,
            });
            this.setProgress(progress.transferred, progress.total);
        });

        ipcRenderer.on("update-not-available", async () => {
            this.setStatus("No hay actualizaciones disponibles.");
            await this.simulateProgress();
            this.maintenanceCheck();
        });
    }

    async simulateProgress() {
        for (let i = 0; i <= 100; i += 5) {
            this.setProgress(i, 100);
            this.setStatus(`Cargando... ${i}%`);
            await this.sleep(100);
        }
    }

    async downloadUpdate() {
        const repoURL = pkg.repository.url.replace("git+", "").replace(".git", "").replace("https://github.com/", "").split("/");
        const githubAPI = await nodeFetch("https://api.github.com").then(res => res.json()).catch(err => err);
        const githubAPIRepoURL = githubAPI.repository_url.replace("{owner}", repoURL[0]).replace("{repo}", repoURL[1]);
        const githubAPIRepo = await nodeFetch(githubAPIRepoURL).then(res => res.json()).catch(err => err);
        const releases_url = await nodeFetch(githubAPIRepo.releases_url.replace("{/id}", "")).then(res => res.json()).catch(err => err);
        const latestRelease = releases_url[0].assets;

        let latest;
        if (os.platform() === "darwin") latest = this.getLatestReleaseForOS("mac", ".dmg", latestRelease);
        else if (os.platform() === "linux") latest = this.getLatestReleaseForOS("linux", ".appimage", latestRelease);

        this.setStatus(`Actualización disponible!<br><div class="download-update">Descargar</div>`);
        document.querySelector(".download-update").addEventListener("click", () => {
            shell.openExternal(latest.browser_download_url);
            this.shutdown("Descargando...");
        });
    }

    getLatestReleaseForOS(osName, preferredFormat, assets) {
        return assets.filter(asset => {
            const name = asset.name.toLowerCase();
            const isOSMatch = name.includes(osName);
            const isFormatMatch = name.endsWith(preferredFormat);
            return isOSMatch && isFormatMatch;
        }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
    }

    async maintenanceCheck() {
        config.GetConfig().then(res => {
            if (res.maintenance) return this.shutdown(res.maintenance_message);
            this.startLauncher();
        }).catch(e => {
            console.error(e);
            return this.shutdown("No hay conexión a internet, intente más tarde.");
        });
    }

    startLauncher() {
        this.setStatus("Iniciando el launcher...");
        setTimeout(() => {
            ipcRenderer.send("main-window-open");
            ipcRenderer.send("update-window-close");
        }, 800);
    }

    shutdown(text) {
        this.setStatus(`${text}<br>Saliendo en 5s`);
        let i = 4;
        const interval = setInterval(() => {
            this.setStatus(`${text}<br>Saliendo en ${i--}s`);
            if (i < 0) {
                clearInterval(interval);
                ipcRenderer.send("update-window-close");
            }
        }, 1000);
    }

    setStatus(text) {
        this.message.innerHTML = text;
    }

    toggleProgress() {
        this.progress.classList.add("show");
        this.setProgress(0, 1);
    }

    setProgress(value, max) {
        this.progress.value = value;
        this.progress.max = max;
    }

    sleep(ms) {
        return new Promise(r => setTimeout(r, ms));
    }
}

document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey && e.shiftKey && e.keyCode === 73) || e.keyCode === 123) {
        ipcRenderer.send("update-window-dev-tools");
    }
});

new Splash();
