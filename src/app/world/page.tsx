import { permanentRedirect } from 'next/navigation';

/**
 * Карта переехала на корень: она стала точкой входа в портфолио. Старый адрес
 * остаётся рабочим — на него могли ссылаться.
 */
export default function Page() {
  permanentRedirect('/');
}
