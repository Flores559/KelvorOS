const os = require("os");

let previousCpuInfo = os.cpus();

function calculateCpuUsage() {
  const currentCpuInfo = os.cpus();

  let idleDifference = 0;
  let totalDifference = 0;

  currentCpuInfo.forEach((cpu, index) => {
    const previous = previousCpuInfo[index];

    const currentTimes = cpu.times;
    const previousTimes = previous.times;

    const idle = currentTimes.idle - previousTimes.idle;

    const total =
      (currentTimes.user - previousTimes.user) +
      (currentTimes.nice - previousTimes.nice) +
      (currentTimes.sys - previousTimes.sys) +
      (currentTimes.idle - previousTimes.idle) +
      (currentTimes.irq - previousTimes.irq);

    idleDifference += idle;
    totalDifference += total;
  });

  previousCpuInfo = currentCpuInfo;

  if (totalDifference === 0) return 0;

  return Math.round(
    ((totalDifference - idleDifference) / totalDifference) * 100
  );
}

function getLiveSystemInfo() {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();

  return {
    cpu: calculateCpuUsage(),

    memory: {
      total: Math.round(totalMemory / 1024 / 1024 / 1024),
      free: Math.round(freeMemory / 1024 / 1024 / 1024),
      usedPercent: Math.round(
        ((totalMemory - freeMemory) / totalMemory) * 100
      )
    },

    hostname: os.hostname(),

    platform: os.platform(),

    uptime: Math.floor(os.uptime() / 60)
  };
}

module.exports = {
  getLiveSystemInfo
};