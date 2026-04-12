export interface LayerSensorPoint {
  id: string;
  sensorName: string;
  position: [number, number, number];
  status: 'active' | 'inactive';
  lastUpdate: Date;
  pm1: number;
  pm25: number;
  pm10: number;
  pm100: number;
  bme: {
    temperatureC: number;
    humidityPct: number;
    pressureHpa: number;
  };
  battery: {
    percent: number;
    voltage: number;
  };
  electronics: {
    rxSnr: number;
    rxRssi: number;
    rxTime: number;
    hopStart: number;
    hopLimit: number;
  };
}

export interface LayerSmokePoint {
  position: [number, number, number];
  concentration: number;
  pm25: number;
  pm10: number;
  pm1: number;
  uncertainty: number;
  timestamp: Date;
  source: 'hysplit' | 'ai_enhanced';
}

export interface LayerMeteorology {
  windSpeed: number;
  windDirection: number;
  temperature: number;
  humidity: number;
  pressure: number;
  mixingHeight: number;
}

interface NormalizedRow {
  datetime: string;
  fromNode: string;
  pm25: number;
  pm10: number;
  pm100: number;
  pm1: number;
  rxSnr: number;
  rxRssi: number;
  rxTime: number;
  hopStart: number;
  hopLimit: number;
  temperatureC?: number;
  humidityPct?: number;
  pressureHpa?: number;
  batteryPercent?: number;
  voltage?: number;
  latitude?: number;
  longitude?: number;
  altitudeM?: number;
}

const STANFORD_CENTER = {
  latitude: 37.4275,
  longitude: -122.1697,
};

const NODE_COORDS: Record<string, { latitude: number; longitude: number; altitudeM: number; sensorName: string }> = {
  '0x433abf20': { latitude: 37.4301, longitude: -122.1738, altitudeM: 16, sensorName: 'Sensor Redwood-20' },
  '0x433af380': { latitude: 37.4263, longitude: -122.1652, altitudeM: 14, sensorName: 'Sensor Creek-80' },
  '0x433ad35c': { latitude: 37.4238, longitude: -122.1715, altitudeM: 18, sensorName: 'Sensor Ridge-5C' },
  '0x433b0b38': { latitude: 37.4324, longitude: -122.1619, altitudeM: 13, sensorName: 'Sensor Quarry-38' },
  '0x433acb14': { latitude: 37.4287, longitude: -122.1782, altitudeM: 20, sensorName: 'Sensor Foothill-14' },
  '0x433b0098': { latitude: 37.4219, longitude: -122.1661, altitudeM: 12, sensorName: 'Sensor Lake-98' },
};

function splitCsvLine(line: string): string[] {
  return line.split(',').map((part) => part.trim());
}

function toNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function parseDateTime(value: string): Date {
  const isoLike = value.includes('T') ? value : value.replace(' ', 'T');
  const parsed = new Date(isoLike);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function pick(row: Record<string, string>, keys: string[]): string | undefined {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== '') return row[key];
  }
  return undefined;
}

function getNodeCoordinate(nodeId: string) {
  if (NODE_COORDS[nodeId]) return NODE_COORDS[nodeId];

  const seed = hashString(nodeId);
  const latOffset = ((seed % 1000) / 1000 - 0.5) * 0.03;
  const lonOffset = (((seed / 1000) % 1000) / 1000 - 0.5) * 0.03;

  return {
    latitude: STANFORD_CENTER.latitude + latOffset,
    longitude: STANFORD_CENTER.longitude + lonOffset,
    altitudeM: 10 + (seed % 12),
    sensorName: `Sensor ${nodeId.slice(-4).toUpperCase()}`,
  };
}

function deriveBmeDefaults(nodeId: string) {
  const seed = hashString(nodeId);
  return {
    temperatureC: 18 + ((seed % 120) / 10),
    humidityPct: 35 + ((seed % 500) / 10),
    pressureHpa: 1004 + ((seed % 120) / 10),
  };
}

function deriveBatteryDefaults(nodeId: string) {
  const seed = hashString(nodeId);
  return {
    percent: 45 + (seed % 50),
    voltage: 3.55 + ((seed % 35) / 100),
  };
}

export function parseAirQualityCsv(csvContent: string): NormalizedRow[] {
  const lines = csvContent
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0]);

  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    const row: Record<string, string> = {};

    headers.forEach((header, index) => {
      row[header] = values[index] ?? '';
    });

    const pm25 = toNumber(pick(row, ['pm25Environmental', 'pm25Standard', 'pm25', 'pm25_ugm3'])) ?? 0;
    const pm10 = toNumber(pick(row, ['pm10Environmental', 'pm10Standard', 'pm10', 'pm10_ugm3'])) ?? 0;
    const pm100 = toNumber(pick(row, ['pm100Environmental', 'pm100Standard', 'pm100', 'pm100_ugm3'])) ?? 0;
    const pm1 = toNumber(pick(row, ['pm1_ugm3', 'pm1'])) ?? Math.max(0, pm25 * 0.7);

    return {
      datetime: pick(row, ['datetime', 'timestamp', 'ts']) ?? new Date().toISOString(),
      fromNode: pick(row, ['fromNode', 'from_node', 'sensor_id', 'sensor_uuid']) ?? 'unknown-node',
      pm25,
      pm10,
      pm100,
      pm1,
      rxSnr: toNumber(pick(row, ['rxSnr', 'snr', 'rx_snr'])) ?? 0,
      rxRssi: toNumber(pick(row, ['rxRssi', 'rssi', 'rx_rssi'])) ?? 0,
      rxTime: toNumber(pick(row, ['rxTime', 'rx_time'])) ?? 0,
      hopStart: toNumber(pick(row, ['hopStart', 'hop_start'])) ?? 0,
      hopLimit: toNumber(pick(row, ['hopLimit', 'hop_limit'])) ?? 0,
      temperatureC: toNumber(pick(row, ['temperature_c', 'temperature', 'temp'])),
      humidityPct: toNumber(pick(row, ['relative_humidity_pct', 'humidity_percent', 'humidity', 'rh_percent'])),
      pressureHpa: toNumber(pick(row, ['barometric_pressure', 'pressure_hpa', 'pressure'])),
      batteryPercent: toNumber(pick(row, ['battery_level', 'battery_percent'])),
      voltage: toNumber(pick(row, ['voltage', 'battery_voltage'])),
      latitude: toNumber(pick(row, ['latitude', 'lat'])),
      longitude: toNumber(pick(row, ['longitude', 'lon', 'lng'])),
      altitudeM: toNumber(pick(row, ['altitude_m', 'altitude'])),
    };
  });
}

export function buildLayerDataFromRows(rows: NormalizedRow[]): {
  sensors: LayerSensorPoint[];
  smokePoints: LayerSmokePoint[];
  meteorology: LayerMeteorology;
} {
  if (!rows.length) {
    return {
      sensors: [],
      smokePoints: [],
      meteorology: {
        windSpeed: 4.5,
        windDirection: 210,
        temperature: 293.15,
        humidity: 55,
        pressure: 1012,
        mixingHeight: 900,
      },
    };
  }

  const parsedRows = rows.map((row) => ({
    ...row,
    date: parseDateTime(row.datetime),
  }));

  const latestTimestamp = parsedRows.reduce((max, row) => Math.max(max, row.date.getTime()), 0);

  const latestByNode = new Map<string, (NormalizedRow & { date: Date })>();
  for (const row of parsedRows) {
    const prev = latestByNode.get(row.fromNode);
    if (!prev || row.date.getTime() > prev.date.getTime()) {
      latestByNode.set(row.fromNode, row);
    }
  }

  const sensors: LayerSensorPoint[] = Array.from(latestByNode.values()).map((row) => {
    const coord = getNodeCoordinate(row.fromNode);
    const bmeDefaults = deriveBmeDefaults(row.fromNode);
    const batteryDefaults = deriveBatteryDefaults(row.fromNode);

    const temperatureC = row.temperatureC ?? bmeDefaults.temperatureC;
    const humidityPct = row.humidityPct ?? bmeDefaults.humidityPct;
    const pressureHpa = row.pressureHpa ?? bmeDefaults.pressureHpa;

    const batteryPercent = clamp(row.batteryPercent ?? batteryDefaults.percent, 1, 100);
    const voltage = row.voltage ?? batteryDefaults.voltage;

    const isActive = latestTimestamp - row.date.getTime() <= 8 * 60 * 1000;

    return {
      id: row.fromNode,
      sensorName: coord.sensorName,
      position: [row.longitude ?? coord.longitude, row.latitude ?? coord.latitude, row.altitudeM ?? coord.altitudeM],
      status: isActive ? 'active' : 'inactive',
      lastUpdate: row.date,
      pm1: row.pm10,
      pm25: row.pm25,
      pm10: row.pm10,
      pm100: row.pm100,
      bme: {
        temperatureC,
        humidityPct,
        pressureHpa,
      },
      battery: {
        percent: batteryPercent,
        voltage,
      },
      electronics: {
        rxSnr: row.rxSnr,
        rxRssi: row.rxRssi,
        rxTime: row.rxTime,
        hopStart: row.hopStart,
        hopLimit: row.hopLimit,
      },
    };
  });

  const smokePoints: LayerSmokePoint[] = parsedRows.slice(-250).map((row, index) => {
    const coord = getNodeCoordinate(row.fromNode);
    const baseAltitude = row.altitudeM ?? coord.altitudeM;

    return {
      position: [
        row.longitude ?? coord.longitude,
        row.latitude ?? coord.latitude,
        baseAltitude + (index % 5) * 35 + Math.max(10, row.pm25 * 2),
      ],
      concentration: row.pm25,
      pm25: row.pm25,
      pm10: row.pm10,
      pm1: row.pm1,
      uncertainty: Math.max(0.5, row.pm25 * 0.08),
      timestamp: row.date,
      source: 'hysplit',
    };
  });

  const avgTemperature = sensors.reduce((sum, sensor) => sum + sensor.bme.temperatureC, 0) / sensors.length;
  const avgHumidity = sensors.reduce((sum, sensor) => sum + sensor.bme.humidityPct, 0) / sensors.length;
  const avgPressure = sensors.reduce((sum, sensor) => sum + sensor.bme.pressureHpa, 0) / sensors.length;
  const avgSnr = sensors.reduce((sum, sensor) => sum + sensor.electronics.rxSnr, 0) / sensors.length;

  const meteorology: LayerMeteorology = {
    windSpeed: clamp(2 + Math.abs(avgSnr) * 0.4, 1, 15),
    windDirection: 220,
    temperature: avgTemperature + 273.15,
    humidity: clamp(avgHumidity, 1, 100),
    pressure: avgPressure,
    mixingHeight: 900,
  };

  return {
    sensors,
    smokePoints,
    meteorology,
  };
}

export function buildLayerDataFromCsv(csvContent: string) {
  return buildLayerDataFromRows(parseAirQualityCsv(csvContent));
}
