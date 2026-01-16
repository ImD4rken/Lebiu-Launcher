/**
 * @author Darken
 * @license CC-BY-NC 4.0 - https://creativecommons.org/licenses/by-nc/4.0
 */

const { ipcRenderer } = require('electron')
const { Status } = require('minecraft-java-core')
const fs = require('fs');
const pkg = require('../package.json');

import config from './utils/config.js';
import database from './utils/database.js';
import logger from './utils/logger.js';
import notification from './utils/notification.js';
import { skin2D } from './utils/skin.js';
import slider from './utils/slider.js';

async function setBackground(theme) {
    let body = document.body;
    body.className = theme ? 'dark global' : 'light global';
    let backgroundPath = './assets/images/background/dark/1.png';
    body.style.backgroundImage = `linear-gradient(#00000000, #00000080), url(${backgroundPath})`;
    body.style.backgroundSize = 'cover';
}


async function changePanel(id) {
    let panel = document.querySelector(`.${id}`);
    if (!panel) return;
    let active = document.querySelector(`.active`)
    if (active) active.classList.remove("active");

    if (id === 'settings' || id === 'login') {
        await setBackground(false);
    }

    try {
        if (id !== 'settings') {
            const activeSettingsBTN = document.querySelector('.active-settings-BTN');
            const activeContainerSettings = document.querySelector('.active-container-settings');
            if (activeSettingsBTN) activeSettingsBTN.classList.remove('active-settings-BTN');
            if (activeContainerSettings) activeContainerSettings.classList.remove('active-container-settings');
            const cancelHome = document.querySelector('.cancel-home');
            if (cancelHome) cancelHome.style.display = 'none';
        }
    } catch (err) {
        console.error('changePanel cleanup error', err);
    }

    try {
        const panels = document.querySelectorAll('.panel');
        panels.forEach(p => {
            if (p === panel) {
                p.style.display = 'block';
            } else {
                p.style.display = 'none';
                p.classList.remove('active');
            }
        })
    } catch (err) {
    }

    panel.classList.add("active");

    ipcRenderer.send('panel-changed', { panelName: id });
}

async function appdata() {
    return await ipcRenderer.invoke('appData').then(path => path)
}

async function addAccount(data) {
    let skin = false
    if (data?.profile?.skins[0]?.base64) skin = await new skin2D().creatHeadTexture(data.profile.skins[0].base64);
    let div = document.createElement("div");
    div.classList.add("account");
    div.id = data.ID;
    div.innerHTML = `
        <div class="account-card">
            <div class="profile-image" ${skin ? 'style="background-image: url(' + skin + ');"' : ''}></div>
            <div class="profile-infos">
                <div class="profile-pseudo">${data.name || data.profile?.name || data.xboxAccount?.gamertag || 'Unknown'}</div>
                <div class="profile-uuid">${data.uuid}</div>
            </div>
            <div class="delete-profile" id="${data.ID}">
                <div class="icon-account-delete delete-profile-icon"></div>
            </div>
        </div>
    `
    return document.querySelector('.accounts-list').appendChild(div);
}

async function accountSelect(data) {
    let account = document.getElementById(`${data.ID}`);
    let activeAccount = document.querySelector('.account-select')

    if (activeAccount) activeAccount.classList.toggle('account-select');
    account.classList.add('account-select');
    if (data?.profile?.skins[0]?.base64) headplayer(data.profile.skins[0].base64);
}

async function headplayer(skinBase64) {
    let skin = await new skin2D().creatHeadTexture(skinBase64);
    document.querySelector(".player-head").style.backgroundImage = `url(${skin})`;
}

async function setStatus(opt) {
    let nameServerElement = document.querySelector('.server-status-name')
    let statusServerElement = document.querySelector('.server-status-text')
    let playersOnline = document.querySelector('.status-player-count .player-count')
    let statusPlayerCount = document.querySelector('.status-player-count')

    if (!nameServerElement || !statusServerElement || !playersOnline || !statusPlayerCount) return

    if (!opt) {
        statusServerElement.classList.add('red')
        statusServerElement.innerHTML = `Ferme - 0 ms`
        statusPlayerCount.classList.add('red')
        playersOnline.innerHTML = '0'
        return
    }

    let { ip, port, nameServer } = opt
    nameServerElement.innerHTML = nameServer
    let status = new Status(ip, port);
    let statusServer = await status.getStatus().then(res => res).catch(err => err);

    if (!statusServer.error) {
        statusServerElement.classList.remove('red')
        statusPlayerCount.classList.remove('red')
        statusServerElement.innerHTML = `En Linea - ${statusServer.ms} ms`
        playersOnline.innerHTML = statusServer.playersConnect
    } else {
        statusServerElement.classList.add('red')
        statusServerElement.innerHTML = `Farm - 0 ms`
        statusPlayerCount.classList.add('red')
        playersOnline.innerHTML = '0'
    }
}


export {
    appdata as appdata,
    changePanel as changePanel,
    config as config,
    database as database,
    logger as logger,
    notification as popup,
    setBackground as setBackground,
    skin2D as skin2D,
    addAccount as addAccount,
    accountSelect as accountSelect,
    slider as Slider,
    pkg as pkg,
    setStatus as setStatus
}