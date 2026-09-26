import { useId } from 'react';
import { currencyCodes } from '../../shared/currencies';
import { Input } from './ui';
import { useLanguage } from '../i18n';

export function CurrencySelect({ value, onChange, disabled = false }: { value: string; onChange: (value: string) => void; disabled?: boolean }) {
  const id = useId();
  const { language } = useLanguage();
  const names = new Intl.DisplayNames([language], { type: 'currency' });
  return <>
    <Input list={id} value={value} onChange={event => onChange(event.target.value.toUpperCase())}
      onBlur={event => event.target.setCustomValidity(currencyCodes.includes(event.target.value) ? '' : 'Choose a currency from the list.')}
      onInput={event => event.currentTarget.setCustomValidity('')}
      placeholder="Search currencies" autoComplete="off" required disabled={disabled} />
    <datalist id={id}>{currencyCodes.map(code => <option key={code} value={code}>{names.of(code)} · {code}</option>)}</datalist>
  </>;
}
