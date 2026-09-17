const KEY = "dmxi_features";
const EVENT = "dmxi:features-changed";

interface Features {
  quotations: boolean;
  reconciliation: boolean;
  pos: boolean;
}

const DEFAULTS: Features = { quotations: false, reconciliation: false, pos: false };

export function getFeatures(): Features {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return DEFAULTS;
  }
}

export function setFeature<K extends keyof Features>(key: K, value: Features[K]) {
  const current = getFeatures();
  localStorage.setItem(KEY, JSON.stringify({ ...current, [key]: value }));
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function onFeaturesChanged(fn: () => void): () => void {
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
}
