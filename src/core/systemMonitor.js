const os = require("os");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

let previousCpuInfo = os.cpus();

function calculateCpuUsage() {
  const currentCpuInfo = os.cpus();

  let idleDifference = 0;
  let totalDifference = 0;

  currentCpuInfo.forEach((cpu, index) => {
    const previous = previousCpuInfo[index];

    if (!previous) {
      return;
    }

    const currentTimes = cpu.times;
    const previousTimes = previous.times;

    const idle =
      currentTimes.idle -
      previousTimes.idle;

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

  if (totalDifference <= 0) {
    return 0;
  }

  return Math.round(
    ((totalDifference - idleDifference) /
      totalDifference) *
      100
  );
}

function bytesToGigabytes(bytes) {
  return Number(
    (bytes / 1024 / 1024 / 1024).toFixed(1)
  );
}

function calculateDefaultMemory() {
  const totalBytes = os.totalmem();
  const freeBytes = os.freemem();
  const usedBytes = totalBytes - freeBytes;

  return {
    total: bytesToGigabytes(totalBytes),
    free: bytesToGigabytes(freeBytes),
    used: bytesToGigabytes(usedBytes),
    cached: 0,
    usedPercent: Math.round(
      (usedBytes / totalBytes) * 100
    ),
    pressure: "Unknown"
  };
}

function parseVmStatValue(output, label) {
  const line = output
    .split("\n")
    .find((entry) =>
      entry.startsWith(label)
    );

  if (!line) {
    return 0;
  }

  const value = line
    .split(":")[1]
    ?.replace(/\./g, "")
    .trim();

  return Number.parseInt(value, 10) || 0;
}

async function getMacMemoryInfo() {
  const totalBytes = os.totalmem();

  const { stdout } = await execFileAsync(
    "/usr/bin/vm_stat"
  );

  const pageSizeMatch =
    stdout.match(
      /page size of (\d+) bytes/
    );

  const pageSize =
    Number.parseInt(
      pageSizeMatch?.[1] || "4096",
      10
    );

  const freePages =
    parseVmStatValue(
      stdout,
      "Pages free"
    );

  const inactivePages =
    parseVmStatValue(
      stdout,
      "Pages inactive"
    );

  const speculativePages =
    parseVmStatValue(
      stdout,
      "Pages speculative"
    );

  const purgeablePages =
    parseVmStatValue(
      stdout,
      "Pages purgeable"
    );

  const fileBackedPages =
    parseVmStatValue(
      stdout,
      "File-backed pages"
    );

  const compressedPages =
    parseVmStatValue(
      stdout,
      "Pages occupied by compressor"
    );

  const cachedPages =
    inactivePages +
    speculativePages +
    purgeablePages +
    fileBackedPages;

  const availablePages =
    freePages +
    inactivePages +
    speculativePages +
    purgeablePages;

  const freeBytes =
    availablePages * pageSize;

  const cachedBytes =
    cachedPages * pageSize;

  const compressedBytes =
    compressedPages * pageSize;

  const usedBytes =
    Math.max(
      0,
      totalBytes -
      freeBytes
    );

  const usedPercent =
    Math.min(
      100,
      Math.max(
        0,
        Math.round(
          (usedBytes / totalBytes) * 100
        )
      )
    );

  let pressure = "Normal";

  if (usedPercent >= 90) {
    pressure = "High";
  } else if (usedPercent >= 75) {
    pressure = "Moderate";
  }

  return {
    total: bytesToGigabytes(totalBytes),
    free: bytesToGigabytes(freeBytes),
    used: bytesToGigabytes(usedBytes),
    cached: bytesToGigabytes(cachedBytes),
    compressed: bytesToGigabytes(
      compressedBytes
    ),
    usedPercent,
    pressure
  };
}

async function getMemoryInfo() {
  if (process.platform !== "darwin") {
    return calculateDefaultMemory();
  }

  try {
    return await getMacMemoryInfo();
  } catch (error) {
    console.error(
      "Unable to read macOS memory statistics:",
      error
    );

    return calculateDefaultMemory();
  }
}

async function getLiveSystemInfo() {
  const memory =
    await getMemoryInfo();

  return {
    cpu: calculateCpuUsage(),
    memory,
    hostname: os.hostname(),
    platform: os.platform(),
    uptime: Math.floor(
      os.uptime() / 60
    )
  };
}

module.exports = {
  getLiveSystemInfo
};