const SYSTEM_PREFIX = 'systems/osp-houserules/';
const SYSTEM_THUMB_PREFIX = `${SYSTEM_PREFIX}assets/thumbs/images/`;

// These paths predate the fully-qualified system paths used by current catalog
// data. Other `assets/` paths are Foundry userdata paths and must remain rooted
// there (for example, assets/osp-spell-focus/...).
const LEGACY_SYSTEM_ASSET_PREFIXES = [
  'assets/images/',
  'assets/thumbs/',
  'assets/character-sheet/'
];

function stripUrlSuffix(path) {
  const suffixIndex = path.search(/[?#]/);
  return suffixIndex === -1 ? [path, ''] : [path.slice(0, suffixIndex), path.slice(suffixIndex)];
}

export function resolveItemImagePath(imgPath) {
  if (!imgPath || typeof imgPath !== 'string') return imgPath;

  const [path, suffix] = stripUrlSuffix(imgPath);
  if (
    path.startsWith(SYSTEM_PREFIX) ||
    path.startsWith('/') ||
    path.startsWith('//') ||
    /^(?:https?:|data:|blob:)/i.test(path) ||
    path.startsWith('icons/') ||
    path.startsWith('magic-item-thumbs/')
  ) {
    return `${path}${suffix}`;
  }

  const isLegacySystemAsset = LEGACY_SYSTEM_ASSET_PREFIXES.some(prefix => path.startsWith(prefix));
  return `${isLegacySystemAsset ? SYSTEM_PREFIX : ''}${path}${suffix}`;
}

export function resolveFullResolutionImagePath(imgPath) {
  if (!imgPath || typeof imgPath !== 'string') return imgPath;

  const [path, suffix] = stripUrlSuffix(imgPath);
  if (/^(?:https?:|data:|blob:)/i.test(path)) return imgPath;

  if (path.startsWith(SYSTEM_THUMB_PREFIX)) {
    const relative = path.slice(SYSTEM_THUMB_PREFIX.length);
    return `${SYSTEM_PREFIX}assets/images/${relative.replace(/_thumb\.webp$/, '.webp')}`;
  }

  if (path.startsWith('magic-item-thumbs/')) {
    return path.replace(/_thumb\.webp$/, '.webp');
  }

  return /_thumb\.webp$/.test(path) ? path.replace(/_thumb\.webp$/, '.webp') : `${path}${suffix}`;
}

export function withItemImageCacheBuster(imgPath, version, random) {
  if (!imgPath || typeof imgPath !== 'string') return imgPath;
  if (/^(?:https?:|data:|blob:)/i.test(imgPath)) return imgPath;

  const fragmentIndex = imgPath.indexOf('#');
  const base = fragmentIndex === -1 ? imgPath : imgPath.slice(0, fragmentIndex);
  const fragment = fragmentIndex === -1 ? '' : imgPath.slice(fragmentIndex);
  const separator = base.includes('?') ? '&' : '?';
  return `${base}${separator}v=${version}&r=${random}${fragment}`;
}
