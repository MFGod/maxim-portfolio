import { permanentRedirect } from 'next/navigation';

/**
 * Первый адрес карты, ещё из окна «Опыта». Ведёт сразу на корень, минуя
 * промежуточный `/world`: цепочка из двух редиректов ничего не добавляет.
 */
export default function Page() {
  permanentRedirect('/');
}
