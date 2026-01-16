/**
 * @author Darken
 * @license CC-BY-NC 4.0 - https://creativecommons.org/licenses/by-nc/4.0
 */

let console_log = console.log;
let console_info = console.info;
let console_warn = console.warn;
let console_debug = console.debug;
let console_error = console.error;

class logger {
    constructor(name, color) {
        this.Logger(name, color)
    }

    async Logger(name, color) {
        console.log = (...args) => {
            console_log.call(console, `%c[${name}]:`, `color: ${color};`, ...args);
        };

        console.info = (...args) => {
            console_info.call(console, `%c[${name}]:`, `color: ${color};`, ...args);
        };

        console.warn = (...args) => {
            console_warn.call(console, `%c[${name}]:`, `color: ${color};`, ...args);
        };

        console.debug = (...args) => {
            console_debug.call(console, `%c[${name}]:`, `color: ${color};`, ...args);
        };

        console.error = (...args) => {
            console_error.call(console, `%c[${name}]:`, `color: ${color};`, ...args);
        };
    }
}

export default logger;