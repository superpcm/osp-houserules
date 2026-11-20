import { SECONDS_PER_DAY, dateToSeconds, safeInteger, secondsToDate } from './calendar.js';

const SLOT = 3 * 3600;
const BUFFALO_SOURCE = 'https://www.weather.gov/buf/newnormals';
const MONTH_HIGHS = [32.1, 33.3, 41.8, 54.7, 67.4, 75.6, 80.2, 79, 72.3, 59.6, 47.8, 37.2];
const MONTH_LOWS = [19, 19.5, 26.4, 36.5, 48.3, 58.1, 63.1, 61.7, 54.5, 43.9, 34.2, 25.6];
const MONTH_PRECIP = [3.35, 2.49, 2.89, 3.37, 3.37, 3.37, 3.23, 3.23, 4.1, 4.03, 3.5, 3.75];
const MONTH_SNOW = [26.7, 18.1, 14.1, 2.5, 0, 0, 0, 0, 0, 0.9, 7.8, 25.3];
export const BUFFALO_NORMALS = Object.freeze({ source: BUFFALO_SOURCE, highF: Object.freeze([...MONTH_HIGHS]), lowF: Object.freeze([...MONTH_LOWS]), precipitationIn: Object.freeze([...MONTH_PRECIP]), snowIn: Object.freeze([...MONTH_SNOW]) });
const CONDITIONS = {
  clear: { label: 'Clear', icon: 'fa-sun', guidance: { movement: 'Good footing and normal movement.', travel: 'Normal travel pace.', visibility: 'Excellent visibility.', combat: 'Clear sight lines; consider wind and temperature separately.' } },
  partlyCloudy: { label: 'Partly cloudy', icon: 'fa-cloud-sun', guidance: { movement: 'Good footing and normal movement.', travel: 'Normal travel pace.', visibility: 'Good visibility.', combat: 'Cloud cover alone adds little interference.' } },
  overcast: { label: 'Overcast', icon: 'fa-cloud', guidance: { movement: 'Good footing and normal movement.', travel: 'Normal travel pace.', visibility: 'Good visibility.', combat: 'Muted light; ranged visibility remains good.' } },
  rain: { label: 'Rain', icon: 'fa-cloud-rain', guidance: { movement: 'Wet footing; take care on slopes.', travel: 'Travel is somewhat slower.', visibility: 'Reduced visibility through rain.', combat: 'Ranged visibility is reduced; exposed flames may gutter.' } },
  snow: { label: 'Snow', icon: 'fa-snowflake', guidance: { movement: 'Snow makes footing uneven.', travel: 'Travel is slower, especially off roads.', visibility: 'Falling snow reduces visibility.', combat: 'Ranged visibility is reduced; exposed flames struggle.' } },
  sleet: { label: 'Sleet', icon: 'fa-cloud-meatball', guidance: { movement: 'Icy footing demands care.', travel: 'Travel is slow and hazardous.', visibility: 'Visibility is poor in the sleet.', combat: 'Ranged attacks and hearing are hindered; flames are fragile.' } },
  thunderstorm: { label: 'Thunderstorm', icon: 'fa-cloud-bolt', guidance: { movement: 'Waterlogged footing is hazardous.', travel: 'Travel is slow and exposed routes are risky.', visibility: 'Heavy rain and darkness greatly reduce visibility.', combat: 'Ranged visibility and hearing are poor; exposed flames are easily quenched.' } },
  fog: { label: 'Fog', icon: 'fa-smog', guidance: { movement: 'Damp footing; move carefully.', travel: 'Travel is slower while landmarks disappear.', visibility: 'Visibility is severely limited.', combat: 'Ranged sight is impaired; flames remain usable nearby.' } }
};

function hash(value) {
  let h = 2166136261;
  for (const character of String(value)) { h ^= character.charCodeAt(0); h = Math.imul(h, 16777619); }
  h += h << 13; h ^= h >>> 7; h += h << 3; h ^= h >>> 17; h += h << 5;
  return h >>> 0;
}
function random(seed, key) { return hash(`${seed}|${key}`) / 4294967296; }
function validSeconds(value, label = 'Calendar time') { const seconds = safeInteger(value, label); secondsToDate(seconds); return seconds; }
function cyclicBaseline(values, day) {
  const centers = values.map((_, index) => index * 30 + 14.5);
  let left = 11, right = 0, adjustedDay = day;
  if (day < centers[0]) adjustedDay += 360;
  else if (day <= centers[11]) { for (let index = 0; index < 11; index++) if (day >= centers[index] && day <= centers[index + 1]) { left = index; right = index + 1; break; } }
  const leftCenter = centers[left], rightCenter = centers[right] + (adjustedDay > centers[11] ? 360 : 0);
  const ratio = (adjustedDay - leftCenter) / (rightCenter - leftCenter);
  return values[left] + (values[right] - values[left]) * ratio;
}
function climate(day) {
  return { high: cyclicBaseline(MONTH_HIGHS, day), low: cyclicBaseline(MONTH_LOWS, day), precip: cyclicBaseline(MONTH_PRECIP, day), snow: cyclicBaseline(MONTH_SNOW, day) };
}
function guidance(conditionKey, temperatureF, windMph) {
  const result = { ...CONDITIONS[conditionKey].guidance };
  if (temperatureF <= 32) { result.movement = `${result.movement} Check frozen surfaces for ice.`; result.travel = `${result.travel} Plan warm clothing and shelter stops.`; result.combat = `${result.combat} Protect exposed hands and equipment from freezing.`; }
  else if (temperatureF >= 85) result.travel = 'Heat and exertion call for water and shade breaks.';
  if (windMph >= 25) { result.travel = `${result.travel} Strong wind makes exposed routes hazardous.`; result.combat = `${result.combat} Wind complicates ranged aim and open flames.`; }
  return result;
}

export function weatherAt(calendarSeconds, seed) {
  const seconds = validSeconds(calendarSeconds);
  const periodStart = Math.floor(seconds / SLOT) * SLOT;
  const periodEnd = periodStart + SLOT;
  const date = secondsToDate(periodStart);
  const dayIndex = Math.floor(periodStart / SECONDS_PER_DAY);
  const dayOfYear = dayIndex % 360;
  const weather = climate(dayOfYear);
  const front = { anomaly: (random(seed, `front:${Math.floor(dayIndex / 3)}`) - 0.5) * 14, wet: random(seed, `front-wet:${Math.floor(dayIndex / 3)}`), cloud: random(seed, `front-cloud:${Math.floor(dayIndex / 3)}`) };
  const spellRoll = random(seed, `spell:${Math.floor(dayIndex / 3)}`);
  front.anomaly += spellRoll < 0.04 ? -12 : spellRoll > 0.97 ? 10 : 0;
  const daily = (random(seed, `day:${dayIndex}`) - 0.5) * 6;
  const hour = Math.floor((periodStart % SECONDS_PER_DAY) / 3600);
  const daylight = Math.cos(((hour - 15) / 24) * Math.PI * 2);
  const temperatureF = Math.round((weather.low + (weather.high - weather.low) * (0.5 + daylight * 0.5) + front.anomaly + daily) * 10) / 10;
  const lakeEffectSeason = date.month >= 11 || date.month <= 2;
  const snowChance = Math.min(0.85, weather.snow / 30 * (temperatureF <= 32 ? 1 : temperatureF <= 35 ? 0.55 : 0) + (lakeEffectSeason ? 0.08 : 0));
  const wetChance = Math.min(0.9, weather.precip / 4.2 * 0.45 + front.wet * 0.3);
  const frontSlot = ((dayIndex % 3) * 8) + Math.floor((periodStart % SECONDS_PER_DAY) / SLOT);
  const frontStart = Math.floor(random(seed, `front-start:${Math.floor(dayIndex / 3)}`) * 18);
  const frontDuration = 2 + Math.floor(random(seed, `front-duration:${Math.floor(dayIndex / 3)}`) * 10);
  const precipitationRoll = random(seed, `precip:${dayIndex}`);
  const frontPrecipitation = front.wet > 0.42 && frontSlot >= frontStart && frontSlot < frontStart + frontDuration;
  const dailyPrecipitation = precipitationRoll < wetChance * 0.35 && (Math.floor(periodStart / SLOT) % 3 === hash(`${seed}|precip-phase:${dayIndex}`) % 3);
  let conditionKey = front.cloud < 0.22 ? 'clear' : front.cloud < 0.5 ? 'partlyCloudy' : 'overcast';
  let precipitation = 'none';
  if (frontPrecipitation || dailyPrecipitation) {
    precipitation = temperatureF <= 32 ? 'snow' : temperatureF <= 35 ? (precipitationRoll < snowChance ? 'snow' : 'sleet') : 'rain';
    conditionKey = precipitation === 'snow' ? 'snow' : precipitation === 'sleet' ? 'sleet' : 'rain';
    if (front.wet > 0.84 && temperatureF > 45) conditionKey = 'thunderstorm';
  } else if (front.cloud > 0.7 && random(seed, `fog:${dayIndex}`) > 0.72) conditionKey = 'fog';
  const windMph = Math.max(0, Math.round(4 + random(seed, `wind:${Math.floor(dayIndex / 3)}`) * 24 + Math.sin(((hour - 15) / 24) * Math.PI * 2) * 3 + (conditionKey === 'thunderstorm' ? 12 : 0)));
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const windDirection = directions[hash(`${seed}|wind-direction:${Math.floor(dayIndex / 3)}`) % directions.length];
  const exceptional = random(seed, `extreme:${dayIndex}`) > 0.985;
  const lakeEffect = conditionKey === 'snow' && lakeEffectSeason && ['W', 'SW', 'NW'].includes(windDirection) && front.wet > 0.65;
  const heavy = ['snow', 'rain'].includes(conditionKey) && front.wet > 0.8;
  const conditionSeverity = conditionKey === 'thunderstorm' ? (exceptional ? 'Extreme' : 'Severe') : ['snow', 'sleet', 'fog'].includes(conditionKey) ? (heavy && exceptional && windMph > 25 ? 'Extreme' : heavy || windMph > 20 ? 'Severe' : 'Moderate') : conditionKey === 'rain' ? (heavy ? 'Severe' : windMph > 20 ? 'Moderate' : 'Minor') : temperatureF <= 15 || temperatureF >= 95 || windMph > 28 ? 'Moderate' : windMph > 24 ? 'Minor' : 'Fair';
  const severities = ['Fair', 'Minor', 'Moderate', 'Severe', 'Extreme'];
  const exposureSeverity = temperatureF <= -10 || temperatureF >= 105 ? 4 : temperatureF <= 0 || temperatureF >= 95 ? 3 : temperatureF <= 15 || temperatureF >= 90 ? 2 : temperatureF <= 32 || temperatureF >= 85 ? 1 : 0;
  const windSeverity = windMph >= 40 ? 3 : windMph >= 25 ? 2 : windMph >= 15 ? 1 : 0;
  const severity = severities[Math.max(severities.indexOf(conditionSeverity), exposureSeverity, windSeverity)];
  const advice = guidance(conditionKey, temperatureF, windMph);
  if (exposureSeverity >= 3) advice.travel += ' Consider delaying exposed travel and using sheltered camps.';
  if (heavy) { advice.movement += ' Accumulation may conceal holes and unstable footing.'; advice.travel += ' Consider sheltering or delaying the journey.'; advice.visibility = 'Heavy precipitation obscures distant landmarks and targets.'; advice.combat += ' Consider shorter engagement ranges and difficulty hearing signals.'; }
  return { periodStart, periodEnd, condition: `${heavy ? 'Heavy ' : ''}${lakeEffect ? 'lake-effect snow' : CONDITIONS[conditionKey].label}`,  conditionKey, icon: CONDITIONS[conditionKey].icon, severity, temperatureF, windMph, windDirection, precipitation, visibility: conditionKey === 'clear' ? 10 : conditionKey === 'partlyCloudy' || conditionKey === 'overcast' ? 8 : conditionKey === 'fog' ? 0.05 : heavy ? 0.1 : conditionKey === 'thunderstorm' ? 0.2 : conditionKey === 'snow' || conditionKey === 'sleet' ? 0.5 : 4, guidance: advice };
}

export function forecastWeather(startSeconds, seed, { days = 7 } = {}) {
  const seconds = validSeconds(startSeconds, 'Forecast start');
  const startDate = secondsToDate(seconds);
  const firstMidnight = dateToSeconds({ year: startDate.year, month: startDate.month, day: startDate.day });
  return Array.from({ length: Math.max(0, Math.floor(days)) }, (_, day) => {
    const date = firstMidnight + day * SECONDS_PER_DAY;
    const periods = Array.from({ length: 8 }, (_, slot) => weatherAt(date + slot * SLOT, seed));
    const temperatures = periods.map(period => period.temperatureF);
    return { date, highF: Math.max(...temperatures), lowF: Math.min(...temperatures), periods };
  });
}
