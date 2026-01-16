const { ipcRenderer } = require('electron');

export default class notification {
    constructor() {
        this.container = document.querySelector('.notifications-container');
        if (!this.container) {
            this.container = document.createElement('div');
            this.container.className = 'notifications-container';
            document.body.appendChild(this.container);
        }
    }

    openNotification(info) {
        const notifElement = document.createElement('div');
        notifElement.className = 'notification';
        
        if (info.color && info.color !== 'var(--color)') {
            notifElement.style.setProperty('--notification-color', info.color);
        }
        
        const titleElem = document.createElement('div');
        titleElem.className = 'notification-title';
        titleElem.innerHTML = info.title;
        
        const contentElem = document.createElement('div');
        contentElem.className = 'notification-content';
        contentElem.innerHTML = info.content;
        
        const closeBtn = document.createElement('button');
        closeBtn.className = 'notification-close';
        closeBtn.innerHTML = '×';
        closeBtn.addEventListener('click', () => {
            notifElement.remove();
        });
        
        notifElement.appendChild(closeBtn);
        notifElement.appendChild(titleElem);
        notifElement.appendChild(contentElem);
        
        this.container.appendChild(notifElement);
        
        if (info.exit) {
            setTimeout(() => {
                ipcRenderer.send('main-window-close');
            }, 2000);
        } else {
            setTimeout(() => {
                notifElement.classList.add('hide');
                setTimeout(() => notifElement.remove(), 300);
            }, 4000);
        }
    }

    closeNotification() {
        const notifs = document.querySelectorAll('.notification');
        notifs.forEach(notif => notif.remove());
    }
}
