import { describe, expect, it } from 'vitest';

import {
  STAR_COUNT,
  STAR_RADIUS,
  TWINKLE_DEPTH,
  TWINKLE_PERIOD,
} from '@/lib/world/stars';

describe('звёздное поле', () => {
  it('звёзд хватает на небо, но они не застят луну', () => {
    /*
     * Меньше тысячи небо читается редкой сыпью, больше трёх — сплошным
     * молоком, в котором тонет диск. Верхняя граница держится не кадром: поле
     * рисуется одним вызовом и почти ничего не стоит.
     */
    expect(STAR_COUNT).toBeGreaterThan(1000);
    expect(STAR_COUNT).toBeLessThan(3000);
  });

  it('поле стоит за луной и не выходит за дальнюю плоскость', () => {
    /*
     * Луна висит в 180 юнитах от камеры, дальняя плоскость отсечения — 250.
     * Ближе луны звёзды проступили бы сквозь диск, дальше плоскости — пропали
     * бы целиком.
     */
    const MOON_DISTANCE = 180;
    const FAR_PLANE = 250;

    expect(STAR_RADIUS).toBeGreaterThan(MOON_DISTANCE);
    expect(STAR_RADIUS).toBeLessThan(FAR_PLANE);
  });
});

describe('мерцание', () => {
  it('звезда дрожит, а не моргает', () => {
    // Гашение до нуля читается битым пикселем, а не небом: настоящее мерцание
    // снимает часть яркости, а не всю.
    expect(TWINKLE_DEPTH).toBeGreaterThan(0);
    expect(TWINKLE_DEPTH).toBeLessThan(0.5);
  });

  it('круг времени длинный: повтор не читается', () => {
    /*
     * Как у воды и листьев, время идёт по кругу — иначе `float` на долгой
     * вкладке теряет младшие разряды и мерцание встаёт. Круг короче нескольких
     * минут посетитель успел бы заметить.
     */
    expect(TWINKLE_PERIOD).toBeGreaterThanOrEqual(300);
  });
});
