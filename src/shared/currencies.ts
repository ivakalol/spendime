// ISO currency codes supplied by the runtime's ICU data. Retain BGN for existing
// accounts even on runtimes whose current tender list no longer includes it.
export const currencyCodes = [...new Set([...Intl.supportedValuesOf('currency'), 'BGN'])].sort();
export const isCurrency = (code: string) => currencyCodes.includes(code);
