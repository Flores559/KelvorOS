const os = require("os");

function getSystemInfo() {
    return {
        hostname: os.hostname(),
        platform: os.platform(),
        release: os.release(),
        cpu: os.cpus()[0].model,
        memory: Math.round(os.totalmem() / 1024 / 1024 / 1024),
        uptime: Math.floor(os.uptime() / 60),
        node: process.version,
        electron: process.versions.electron
    };
}

module.exports = {
    getSystemInfo
};