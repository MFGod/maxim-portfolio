import { permanentRedirect } from 'next/navigation';

/**
 * Карта переехала на отдельную страницу: в окне рабочего стола она читалась
 * виджетом. Старый адрес остаётся рабочим — на него могли ссылаться.
 */
export default function Page() {
  permanentRedirect('/world');
}
