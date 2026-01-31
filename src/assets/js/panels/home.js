/**

 * @author Darken

 * @license CC-BY-NC 4.0 - https://creativecommons.org/licenses/by-nc/4.0

 */

import { config, database, logger, changePanel, appdata, setStatus, pkg, popup } from '../utils.js'



const { Launch } = require('minecraft-java-core')

const { shell, ipcRenderer } = require('electron')



class Home {

    static id = "home";



    async init(config) {

        this.config = config;

        this.db = new database();

        this.currentSession = null;

        this.news();

        this.renderSidebarAvatars();

        this.instancesSelect();

        document.querySelector('.settings-btn').addEventListener('click', e => changePanel('settings'));

    }



    async filterAuthorizedInstances(instancesList, authName) {

        let unlockedData = {};

        try {

            unlockedData = await this.db.readData('unlockedInstances') || {};

            console.log('filterAuthorizedInstances: unlockedData from DB =', JSON.stringify(unlockedData));

        } catch (e) {

            console.warn('Error reading unlocked instances from DB:', e);

        }



        let needsUpdate = false;

        for (let instanceName in unlockedData) {

            const unlockedInfo = unlockedData[instanceName];

            const savedCode = typeof unlockedInfo === 'object' ? unlockedInfo.code : null;

           

            const currentInstance = instancesList.find(i => i.name === instanceName);

            if (currentInstance && currentInstance.password) {

                if (!savedCode || savedCode !== currentInstance.password) {

                    const reason = !savedCode ? 'no code stored' : 'code mismatch';

                    console.log(`🔄 ${reason} for "${instanceName}" - clearing unlock`);

                    delete unlockedData[instanceName];

                    needsUpdate = true;

                }

            } else {

                if (currentInstance && !currentInstance.password) {

                    console.log(`🔄 Password removed from "${instanceName}" - clearing unlock`);

                    delete unlockedData[instanceName];

                    needsUpdate = true;

                }

            }

        }



        if (needsUpdate) {

            try {

                const dataToSave = { ...unlockedData };

                delete dataToSave.ID;

                await this.db.updateData('unlockedInstances', dataToSave);

                console.log('✅ Cleaned up expired unlocks');

            } catch (e) {

                console.warn('Error updating unlocks:', e);

            }

        }



        const unlockedInstances = Object.keys(unlockedData).filter(key => {

            const info = unlockedData[key];

            return info === true || (typeof info === 'object' && info !== null);

        });



        const filtered = instancesList.filter(instance => {

            if (instance.password) {

                const isUnlocked = unlockedInstances.includes(instance.name);

                console.log(`Instance "${instance.name}" has password, unlocked=${isUnlocked}`);

                return isUnlocked;

            }



            if (instance.whitelistActive) {

                const wl = Array.isArray(instance.whitelist) ? instance.whitelist : [];

                const unlockInfo = unlockedData[instance.name];

                const unlockedUsers = (unlockInfo && Array.isArray(unlockInfo.users)) ? unlockInfo.users : [];

               

                const isAuthorized = wl.includes(authName) || unlockedUsers.includes(authName);

                console.log(`Instance "${instance.name}" has whitelist=[${wl.join(', ')}], unlockedUsers=[${unlockedUsers.join(', ')}], authName=${authName}, authorized=${isAuthorized}`);

                return isAuthorized;

            }



            return true;

        });

       

        console.log('filterAuthorizedInstances: total instances in =', instancesList.length, 'filtered out =', filtered.length);

        return filtered;

    }



    setBackground(url) {

        try {

            if (!url) {

                document.body.style.backgroundImage = '';

                this.currentBackground = null;

                return;

            }



            const img = new Image();

            img.onload = () => {

                document.body.style.backgroundImage = `url('${url}')`;

                this.currentBackground = url;

            };

            img.onerror = () => {

                console.warn('No se pudo cargar la imagen de fondo:', url);

                document.body.style.backgroundImage = '';

                this.currentBackground = null;

            };

            img.src = url;

        } catch (e) {

            console.warn('Error estableciendo fondo:', e);

            document.body.style.backgroundImage = '';

        }

    }



    formatPlaytime(durationMs) {

        if (!durationMs || durationMs < 0) return '0m';

        const totalSeconds = Math.floor(durationMs / 1000);

        const hours = Math.floor(totalSeconds / 3600);

        const minutes = Math.floor((totalSeconds % 3600) / 60);

        const seconds = totalSeconds % 60;

        const parts = [];

        if (hours) parts.push(`${hours}h`);

        if (minutes) parts.push(`${minutes}m`);

        if (!hours && !minutes) parts.push(`${seconds}s`);

        return parts.join(' ');

    }



    async updateInstanceDisplay(instanceName) {

        const titleEl = document.querySelector('.instance-title');

        const lastSessionEl = document.querySelector('.last-session-value');

        const playtimeEl = document.querySelector('.playtime-value');

        if (!titleEl || !lastSessionEl || !playtimeEl) return;

        titleEl.textContent = instanceName || '';

        lastSessionEl.textContent = '—';

        playtimeEl.textContent = '—';

        if (!instanceName) return;

        try {

            const stats = await this.db.readData('instanceStats');

            const entry = stats?.instances?.[instanceName];

            if (entry?.lastSession) lastSessionEl.textContent = new Date(entry.lastSession).toLocaleString();

            if (entry?.playtimeMs) playtimeEl.textContent = this.formatPlaytime(entry.playtimeMs);

        } catch (err) {

            console.warn('No se pudieron cargar las estadísticas de la instancia:', err);

        }

    }



    async persistSession(instanceName, startedAt) {

        if (!instanceName || !startedAt) return;

        const duration = Math.max(0, Date.now() - startedAt);

        let stats = await this.db.readData('instanceStats');

        if (!stats) {

            try {

                stats = await this.db.createData('instanceStats', { instances: {} });

            } catch (err) {

                console.warn('No se pudo crear el registro de estadísticas:', err);

                return;

            }

        }

        const existingInstances = stats.instances || {};

        const current = existingInstances[instanceName] || {};

        const playtimeMs = (current.playtimeMs || 0) + duration;

        const updated = {

            ...stats,

            instances: {

                ...existingInstances,

                [instanceName]: {

                    ...current,

                    playtimeMs,

                    lastSession: Date.now()

                }

            }

        };

        try {

            await this.db.updateData('instanceStats', updated, stats.ID || 1);

            await this.updateInstanceDisplay(instanceName);

        } catch (err) {

            console.warn('No se pudieron guardar las estadísticas de la instancia:', err);

        }

    }



    async news() {

        let newsElement = document.querySelector('.news-list');

        if (!newsElement) {

            console.warn('news-list element not found in DOM');

            return;

        }

       

        let news = await config.getNews().then(res => res).catch(err => false);



        if (news) {

            if (!news.length) {

                let blockNews = document.createElement('div');

                blockNews.classList.add('news-block');

                blockNews.innerHTML = `

                    <div class="news-header">

                        <img class="server-status-icon" src="assets/images/icon.png">

                        <div class="header-text">

                            <div class="title">No hay noticias disponibles actualmente.</div>

                        </div>

                        <div class="date">

                            <div class="day">25</div>

                            <div class="month">Abril</div>

                        </div>

                    </div>

                    <div class="news-content">

                        <div class="bbWrapper">

                            <p>Puedes seguir todas las novedades relativas al servidor aquí.</p>

                        </div>

                    </div>`;

                newsElement.appendChild(blockNews);

            } else {

                for (let News of news) {

                    let date = this.getdate(News.publish_date);

                    let blockNews = document.createElement('div');

                    blockNews.classList.add('news-block');

                    blockNews.innerHTML = `

                        <div class="news-header">

                            <img class="server-status-icon" src="assets/images/icon.png">

                            <div class="header-text">

                                <div class="title">${News.title}</div>

                            </div>

                            <div class="date">

                                <div class="day">${date.day}</div>

                                <div class="month">${date.month}</div>

                            </div>

                        </div>

                        <div class="news-content">

                            <div class="bbWrapper">

                                <p>${News.content.replace(/\n/g, '<br>')}</p>

                                <p class="news-author">- <span>${News.author}</span></p>

                            </div>

                        </div>`;

                    newsElement.appendChild(blockNews);

                }

            }

        } else {

            let blockNews = document.createElement('div');

            blockNews.classList.add('news-block');

            blockNews.innerHTML = `

                <div class="news-header">

                        <img class="server-status-icon" src="assets/images/icon.png">

                        <div class="header-text">

                            <div class="title">Error.</div>

                        </div>

                        <div class="date">

                            <div class="day">25</div>

                            <div class="month">Abril</div>

                        </div>

                    </div>

                    <div class="news-content">

                        <div class="bbWrapper">

                            <p>No se puede contactar con el servidor de noticias.</br>Por favor verifique su configuración.</p>

                        </div>

                    </div>`

            newsElement.appendChild(blockNews);

        }

    }



    socialLick() {

        let socials = document.querySelectorAll('.social-block');

        socials.forEach(social => {

            social.addEventListener('click', e => shell.openExternal(social.dataset.url));

        });

    }



    async renderSidebarAvatars() {

        try {

            let configClient = await this.db.readData('configClient');

            let auth = await this.db.readData('accounts', configClient.account_selected);

            let allInstances = await config.getInstanceList();

            let instancesList = await this.filterAuthorizedInstances(allInstances, auth?.name);

            const container = document.querySelector('.instance-avatars');

            if (!container) return;



            console.debug('renderSidebarAvatars: auth=', auth?.name, 'authorized instances=', instancesList.map(i => i.name));



            container.innerHTML = '';



            let tooltip = document.querySelector('.instance-tooltip');

            if (!tooltip) {

                tooltip = document.createElement('div');

                tooltip.className = 'instance-tooltip';

                tooltip.style.display = 'none';

                document.body.appendChild(tooltip);

            }



            const defaultAvatar = 'assets/images/icon.png';

            for (let instance of instancesList) {



                const bg = instance.backgroundUrl || instance.background || null;

                const avatar = instance.avatarUrl || instance.iconUrl || instance.icon || '';

                const el = document.createElement('div');

                el.className = 'instance-avatar';

                el.dataset.name = instance.name;



                if (avatar) el.style.backgroundImage = `url('${avatar}')`;

                else if (bg) el.style.backgroundImage = `url('${bg}')`;

                else el.style.backgroundImage = `url('${defaultAvatar}')`;



                if (configClient.instance_selct === instance.name) el.classList.add('active');



                el.addEventListener('mouseenter', (ev) => {

                    try {

                        let tooltipText = instance.name;

                        tooltip.textContent = tooltipText;

                        tooltip.style.display = 'block';

                        const rect = el.getBoundingClientRect();

                        tooltip.style.top = `${rect.top + rect.height / 2}px`;

                        tooltip.style.left = `${rect.right + 10}px`;

                    } catch (err) { }

                });

                el.addEventListener('mousemove', (ev) => {

                    tooltip.style.top = `${ev.clientY + 12}px`;

                    tooltip.style.left = `${ev.clientX + 12}px`;

                });

                el.addEventListener('mouseleave', () => {

                    tooltip.style.display = 'none';

                });



                el.addEventListener('click', async () => {
    try {
        const prev = container.querySelector('.instance-avatar.active');
        if (prev) prev.classList.remove('active');
        el.classList.add('active');

        configClient.instance_selct = instance.name;
        await this.db.updateData('configClient', configClient);

        // Determinamos el avatar con prioridad
        const avatarToDiscord = instance.avatarUrl || instance.iconUrl || instance.icon || 'assets/images/icon.png';

        // Enviamos la actualización completa
        ipcRenderer.send('instance-changed', { 
            instanceName: instance.name,
            avatarURL: avatarToDiscord 
        });

        if (bg) {
            this.setBackground(bg);
        } else {
            this.setBackground(null);
        }
        
        try { setStatus(instance.status); } catch (e) { }
        await this.updateInstanceDisplay(instance.name);
    } catch (err) { console.warn('Error al seleccionar instancia desde sidebar:', err); }
});



                container.appendChild(el);

            }

        } catch (e) {

            console.warn('Error renderizando avatars de instancia:', e);

        }

    }



    async instancesSelect() {

        let configClient = await this.db.readData('configClient') || {};

        configClient.instance_selct = null;

        await this.db.updateData('configClient', configClient);

        let auth = await this.db.readData('accounts', configClient.account_selected);

        let playBTN = document.querySelector('.play-btn');

        let instanceBTN = document.querySelector('.instance-select');

        let instancePopup = document.querySelector('.instance-popup');

        let instanceCloseBTN = document.querySelector('.close-popup');

        const notificationInstance = new popup();

        const updateInstanceSelection = async (preferredInstance = null) => {

            configClient = await this.db.readData('configClient');

            auth = await this.db.readData('accounts', configClient.account_selected);

            const allInstances = await config.getInstanceList();

            const instancesList = await this.filterAuthorizedInstances(allInstances, auth?.name);

            let instanceSelect = preferredInstance || configClient?.instance_selct || null;

            if (instanceSelect && !instancesList.find(i => i.name === instanceSelect)) instanceSelect = null;

            if (configClient.instance_selct !== instanceSelect) {

                configClient.instance_selct = instanceSelect;

                await this.db.updateData('configClient', configClient);

            }

            await this.renderSidebarAvatars();

            if (playBTN) {

                if (instanceSelect) playBTN.removeAttribute('disabled');

                else playBTN.setAttribute('disabled', 'true');

            }

            if (instanceSelect) await this.updateInstanceDisplay(instanceSelect);

            const currentInstanceData = instancesList.find(i => i.name === instanceSelect);

            if (currentInstanceData) {

                const initialAvatar = currentInstanceData.avatarUrl || currentInstanceData.iconUrl || currentInstanceData.icon || 'assets/images/icon.png';

                ipcRenderer.send('instance-changed', {

                    instanceName: instanceSelect,

                    avatarURL: initialAvatar

                });

                const bg = currentInstanceData.backgroundUrl || currentInstanceData.background || null;

                if (bg) this.setBackground(bg);

                else this.setBackground(null);

                try { setStatus(currentInstanceData.status); } catch (e) { }

            } else {

                this.setBackground(null);

            }

            return { instancesList, instanceSelect };

        };

        await updateInstanceSelection();

        instanceBTN.style.display = 'flex';



        instanceBTN.addEventListener('click', async () => {

            instancePopup.style.display = 'flex';

            const codeInput = document.querySelector('.code-unlock-input');

            if (codeInput) codeInput.focus();

        });


        
        instanceCloseBTN.addEventListener('click', () => instancePopup.style.display = 'none');



        // Code unlock functionality

        const codeInput = document.querySelector(".code-unlock-input");

        const unlockButton = document.querySelector(".code-unlock-button");

        const cancelButton = document.querySelector('.code-cancel-button');



        if (cancelButton) cancelButton.addEventListener('click', () => instancePopup.style.display = 'none');



        if (codeInput && unlockButton) {

            codeInput.addEventListener("keypress", (event) => {

                if (event.key === "Enter") {

                    unlockButton.click();

                }

            });



            unlockButton.addEventListener("click", async () => {

                let codigo = codeInput.value.trim();

                if (!codigo) {

                    notificationInstance.openNotification({

                        title: 'Código Requerido',

                        content: 'Por favor ingresa un código de instancia',

                        color: '#e21212'

                    });

                    return;

                }

               

                codeInput.value = "";

         

                let configClient = await this.db.readData("configClient");



                if (!configClient.account_selected) {

                    const allAccounts = await this.db.readAllData("accounts");

                    if (allAccounts.length > 0) {

                        configClient.account_selected = allAccounts[0].ID;

                        await this.db.updateData("configClient", configClient);

                    }

                }

               

                let cuenta = await this.db.readData("accounts", configClient.account_selected);

                console.log("Cuenta cargada:", cuenta);

               

                let usuario = (cuenta && cuenta.name) || "Invitado";

                console.log("Usuario detectado:", usuario);

             

                try {

                    const response = await fetch(`http://51.222.47.158:10023/BridgeClient/api/validate.php`, {

                        method: "POST",

                        headers: {

                            "Content-Type": "application/json",

                        },

                        body: JSON.stringify({

                            codigo: codigo,

                            usuario: usuario,

                        }),

                    });



                    const data = await response.json();

                    console.info("Respuesta del servidor:", data);

         

                    if (data.status === "success") {

                        console.info("✅ Acceso concedido a la instancia");

                       

                        try {

                            // Obtener la instancia desde el servidor si está disponible

                            const instanceName = data.instanceName || data.instance;

                           

                            if (instanceName) {

                                // Guardar el usuario en la BD bajo la instancia

                                let unlockedData = await this.db.readData('unlockedInstances') || {};

                               

                                if (!unlockedData[instanceName]) {

                                    unlockedData[instanceName] = { users: [] };

                                }

                               

                                if (!Array.isArray(unlockedData[instanceName].users)) {

                                    unlockedData[instanceName].users = [];

                                }

                               

                                if (!unlockedData[instanceName].users.includes(usuario)) {

                                    unlockedData[instanceName].users.push(usuario);

                                }

                               

                                const dataToSave = { ...unlockedData };

                                delete dataToSave.ID;

                                await this.db.updateData('unlockedInstances', dataToSave);

                               

                                console.log(`👤 Usuario ${usuario} agregado a instancia ${instanceName} en BD`);

                            }

                           

                            notificationInstance.openNotification({

                                title: 'Éxito',

                                content: '¡Código canjeado exitosamente! Instancia desbloqueada.',

                                color: '#4CAF50'

                            });

                           

                            await updateInstanceSelection(instanceName);

                        } catch (e) {

                            console.error("Error procesando acceso:", e);

                            notificationInstance.openNotification({

                                title: 'Error',

                                content: 'Error procesando el acceso.',

                                color: '#e21212'

                            });

                        }

                    } else if (data.status === "error" && data.message === "Ya tienes acceso a esta instancia") {

                        console.info("⚠️ El usuario ya tiene acceso a esta instancia.");

                        notificationInstance.openNotification({

                            title: 'Acceso Duplicado',

                            content: 'Ya tienes acceso a esta instancia.',

                            color: '#FFC107'

                        });

                        await updateInstanceSelection(data.instanceName || data.instance);

                    } else {

                        console.error("❌ Instancia no encontrada o código inválido.");

                        notificationInstance.openNotification({

                            title: 'Código Inválido',

                            content: 'Código inválido o instancia no encontrada.',

                            color: '#e21212'

                        });

                    }

                } catch (error) {

                    console.error("❌ Error en la petición:", error);

                    notificationInstance.openNotification({

                        title: 'Error de Conexión',

                        content: 'Error al conectar con el servidor.',

                        color: '#e21212'

                    });

                }

            });

        } else {

            console.warn('Code unlock elements not found in DOM');

        }



        playBTN.addEventListener('click', () => this.startGame());

    }



    async startGame() {

        const rawConfig = await this.db.readData('configClient');

        let configClient = rawConfig || {};

        let needPersist = false;



        if (!rawConfig || typeof rawConfig !== 'object') {

            needPersist = true;

            configClient = {

                account_selected: null,

                instance_selct: null,

                java_config: { java_path: null, java_memory: { min: 2, max: 4 } },

                game_config: { screen_size: { width: 854, height: 480 } },

                launcher_config: { download_multi: 5, theme: 'auto', closeLauncher: 'close-launcher', intelEnabledMac: true }

            };

        }



        if (!configClient.launcher_config) { configClient.launcher_config = { download_multi: 5, theme: 'auto', closeLauncher: 'close-launcher', intelEnabledMac: true }; needPersist = true; }

        if (!configClient.java_config) { configClient.java_config = { java_path: null, java_memory: { min: 2, max: 4 } }; needPersist = true; }

        if (!configClient.java_config.java_memory) { configClient.java_config.java_memory = { min: 2, max: 4 }; needPersist = true; }

        if (!configClient.game_config) { configClient.game_config = { screen_size: { width: 854, height: 480 } }; needPersist = true; }

        if (!configClient.game_config.screen_size) { configClient.game_config.screen_size = { width: 854, height: 480 }; needPersist = true; }

        if (needPersist) {

            try { await this.db.updateData('configClient', configClient); } catch (err) { console.warn('Failed to persist default configClient:', err); }

        }

        const instances = await config.getInstanceList();

        const authenticator = await this.db.readData('accounts', configClient.account_selected);

        const options = instances.find(i => i.name === configClient.instance_selct);



        const playInstanceBTN = document.querySelector('.play-instance');

        const infoStartingBOX = document.querySelector('.info-starting-game');

        const infoStarting = document.querySelector(".info-starting-game-text");

        const progressBar = document.querySelector('.progress-bar');



        if (!options) {

            console.error('startGame: no options found for selected instance', configClient.instance_selct);

            new popup().openPopup({ title: 'Error', content: 'No se encontró la instancia seleccionada. Revise la configuración.', color: 'red', options: true });

            return;

        }



        if (!authenticator) {

            console.error('startGame: no authenticator/account selected');

            new popup().openPopup({ title: 'Error', content: 'No hay una cuenta seleccionada. Inicie sesión primero.', color: 'red', options: true });

            return;

        }



        if (options.whitelistActive) {

            const wl = Array.isArray(options.whitelist) ? options.whitelist : [];

            if (!wl.includes(authenticator?.name)) {

                console.error('startGame: Usuario no autorizado para lanzar instancia', configClient.instance_selct, 'usuario:', authenticator?.name);

                new popup().openPopup({ title: 'Acceso denegado', content: `No tienes permiso para lanzar la instancia ${options.name}.`, color: 'red', options: true });

                return;

            }

        }



        if (!options.loadder || typeof options.loadder !== 'object') {

            console.warn('startGame: instance loader info missing or invalid, attempting to continue with defaults', options.name);

        }



        const opt = {

            url: options.url,

            authenticator,

            timeout: 10000,

            path: `${await appdata()}/${process.platform === 'darwin' ? this.config.dataDirectory : `.${this.config.dataDirectory}`}`,

            instance: options.name,

            version: options.loadder?.minecraft_version,

            detached: configClient.launcher_config.closeLauncher !== "close-all",

            downloadFileMultiple: configClient.launcher_config.download_multi,

            intelEnabledMac: configClient.launcher_config.intelEnabledMac,

            loader: {

                type: options.loadder?.loadder_type,

                build: options.loadder?.loadder_version,

                enable: options.loadder?.loadder_type !== 'none'

            },

            verify: options.verify,

            ignored: Array.isArray(options.ignored) ? [...options.ignored] : [],

            javaPath: configClient.java_config?.java_path,

            screen: {

                width: configClient.game_config?.screen_size?.width,

                height: configClient.game_config?.screen_size?.height

            },

            memory: {

                min: `${configClient.java_config.java_memory.min * 1024}M`,

                max: `${configClient.java_config.java_memory.max * 1024}M`

            }

        };



        this.currentSession = { instance: options.name, start: Date.now() };



        const launch = new Launch();



        launch.on('extract', () => ipcRenderer.send('main-window-progress-load'));

        launch.on('progress', (progress, size) => {

            infoStarting.innerHTML = `Descargando ${((progress / size) * 100).toFixed(0)}%`;

            ipcRenderer.send('main-window-progress', { progress, size });

            if (progressBar) {

                progressBar.value = progress;

                progressBar.max = size;

            }

        });

        launch.on('check', (progress, size) => {

            infoStarting.innerHTML = `Verificando ${((progress / size) * 100).toFixed(0)}%`;

            ipcRenderer.send('main-window-progress', { progress, size });

            if (progressBar) {

                progressBar.value = progress;

                progressBar.max = size;

            }

        });

        launch.on('estimated', time => console.log(`Tiempo estimado: ${time}s`));

        launch.on('speed', speed => console.log(`${(speed / 1067008).toFixed(2)} Mb/s`));

        launch.on('patch', () => { if (infoStarting) infoStarting.innerHTML = `Parche en curso...`; });

        launch.on('data', () => {

            if (progressBar) progressBar.style.display = "none";

            if (infoStarting) infoStarting.innerHTML = `Jugando...`;

            new logger('Minecraft', '#36b030');

        });

        launch.on('close', async code => {

            ipcRenderer.send('main-window-progress-reset');

            if (infoStartingBOX) infoStartingBOX.style.display = "none";

            if (playInstanceBTN) playInstanceBTN.style.display = "flex";

            if (infoStarting) infoStarting.innerHTML = `Verificando`;

            await this.persistSession(options.name, this.currentSession?.start);

            this.currentSession = null;

            new logger(pkg.name, '#7289da');

        });

        launch.on('error', async err => {

            let popupError = new popup();

            popupError.openPopup({ title: 'Error', content: err?.error || err?.message || String(err), color: 'red', options: true });
            ipcRenderer.send('main-window-progress-reset');
            if (infoStartingBOX) infoStartingBOX.style.display = "none";
            if (playInstanceBTN) playInstanceBTN.style.display = "flex";
            if (infoStarting) infoStarting.innerHTML = `Verificando`;
            new logger(pkg.name, '#7289da');
        });

        if (playInstanceBTN) playInstanceBTN.style.display = "none";
        if (infoStartingBOX) infoStartingBOX.style.display = "block";
        if (progressBar) progressBar.style.display = "";
        ipcRenderer.send('main-window-progress-load');

        try {
            const startImg = document.querySelector('.starting-icon-big');
            if (startImg) {
                const avatar = options.avatarUrl || options.avatar || options.iconUrl || options.icon || options.backgroundUrl || options.background;
                startImg.src = avatar || 'assets/images/icon.png';
            }
        } catch (err) { console.warn('Failed to set starting image:', err); }

        try {
            console.log('Calling launch.Launch with opt:', opt);
            const maybePromise = launch.Launch(opt);
            if (maybePromise && typeof maybePromise.then === 'function') {
                await maybePromise.catch(launchErr => { throw launchErr; });
            }
            console.log('launch.Launch invoked successfully');
        } catch (launchErr) {
            console.error('launch.Launch threw an exception:', launchErr);
            let popupError = new popup();
            popupError.openPopup({ title: 'Error al lanzar', content: launchErr?.message || String(launchErr), color: 'red', options: true });
            ipcRenderer.send('main-window-progress-reset');
            if (infoStartingBOX) infoStartingBOX.style.display = "none";
            if (playInstanceBTN) playInstanceBTN.style.display = "flex";
            return;
        }
    }

    getdate(e) {
        let date = new Date(e);
        let year = date.getFullYear();
        let month = date.getMonth() + 1;
        let day = date.getDate();
        let allMonth = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        return { year, month: allMonth[month - 1], day };
    }
}

export default Home;
