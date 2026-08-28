/**
 * Полная луна: диск в небе по направлению ключевого света.
 *
 * Свет в сцене был, а источника видно не было — небо оставалось ровной
 * заливкой, и кадр не отвечал на вопрос «откуда светит». Диск ставит на него
 * ответ и заодно даёт `UnrealBloomPass` то единственное в кадре, чему ореол
 * положен по природе.
 *
 * Луна, а не солнце: мир читается вечерним даже в светлой теме — золото крон
 * и холодное небо просят ночного светила. Дневной набор освещения при этом
 * остаётся дневным, поэтому днём диск бледный и почти не спорит с небом.
 *
 * Спрайт, а не сфера: луна — это круг постоянного углового размера, и с земли
 * она всегда повёрнута к зрителю одной стороной. Ни объёма, ни обратной
 * стороны ей здесь не нужно. `sizeAttenuation: false` держит размер в долях
 * кадра, поэтому диск не растёт при подлёте камеры — до луны в мире долететь
 * нельзя.
 *
 * Глубина проверяется, но не пишется: спрайт лежит в прозрачной очереди, а она
 * идёт после всей непрозрачной геометрии, и без проверки диск светил бы сквозь
 * скалы и стволы. Запись глубины не нужна — закрывать собой диску нечего.
 */

import * as THREE from 'three';

/**
 * Как далеко от камеры висит диск.
 *
 * Меньше дальней плоскости отсечения (250) с запасом: луна, уехавшая за неё,
 * пропадает целиком. Само расстояние на вид не влияет — размер задан в долях
 * кадра, — но от него зависит, что окажется между диском и глазом. Звёздное
 * поле стоит дальше, поэтому луна всегда перед звёздами.
 */
const DISTANCE = 180;

/**
 * Доля высоты кадра, которую занимает диск вместе с ореолом.
 *
 * Меньше солнечных 0.26: у луны нет слепящего ореола, и на прежнем размере
 * она читалась вторым солнцем. Само тело диска — треть этого пятна, остальное
 * свечение вокруг.
 */
const SCALE = 0.2;

/** Пиксели холста. Больше не нужно: это мягкое пятно с парой пятен на теле. */
const CANVAS = 256;

/** Доля радиуса холста, на которой кончается тело диска и начинается ореол. */
const EDGE = 0.34;

/**
 * Моря: смещения от центра диска и радиусы, обе величины в долях тела.
 *
 * Без них полная луна читается лампочкой: ровный белый круг в небе глаз
 * опознаёт как источник света, а не как тело. Пятна не копируют настоящую
 * Луну — узнаваемость здесь ни к чему, важен сам факт неровности.
 *
 * Крупные и перекрывающиеся, а не мелкие и раздельные. Первая раскладка была
 * из трёх кружков в треть тела, и на снимке диск читался шаром для боулинга:
 * мелкое тёмное пятно на светлом круге глаз опознаёт дыркой, а не тенью.
 * Пятно шириной в половину тела и шире таким уже не читается — оно становится
 * неровностью самого тела. Часть морей уходит за край: обрезанное пятно живее
 * вписанного.
 */
const MARIA: readonly { x: number; y: number; radius: number; depth: number }[] = [
  { x: -0.26, y: -0.28, radius: 0.78, depth: 0.15 },
  { x: 0.38, y: 0.12, radius: 0.62, depth: 0.11 },
  { x: 0.04, y: 0.46, radius: 0.54, depth: 0.13 },
  { x: -0.52, y: 0.3, radius: 0.42, depth: 0.09 },
];

export type Moon = {
  /** Ставит диск по камере. Зовётся из кадра, после рига. */
  update: (camera: THREE.Camera) => void;
  /** Перекрашивает диск под набор освещения. */
  setColor: (color: number) => void;
  dispose: () => void;
};

/**
 * Диск с ореолом: тело, резкий край, мягкое затухание вокруг и моря на теле.
 *
 * Три остановки, а не одна: у чистого радиального градиента нет края, и луна
 * получается пятном тумана. Резкая ступень на `EDGE` даёт тело, всё дальше —
 * свечение вокруг него.
 *
 * Ореол холоднее и слабее солнечного: у полной луны он есть (это рассеяние в
 * воздухе, а не корона), но втрое тусклее тела, иначе диск тонет в собственном
 * свете.
 */
function moonTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS;
  canvas.height = CANVAS;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('мир: холст луны не дал двумерный контекст');

  const half = CANVAS / 2;
  const gradient = context.createRadialGradient(half, half, 0, half, half, half);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.3, 'rgba(244, 247, 255, 1)');
  gradient.addColorStop(EDGE, 'rgba(226, 234, 255, 0.34)');
  gradient.addColorStop(0.62, 'rgba(198, 214, 255, 0.1)');
  gradient.addColorStop(1, 'rgba(180, 200, 255, 0)');

  context.fillStyle = gradient;
  context.fillRect(0, 0, CANVAS, CANVAS);

  /*
   * Моря вычитаются из готового диска, а не рисуются поверх.
   *
   * Смешение у спрайта аддитивное: тёмная краска в нём ничего не затемняет —
   * складывать нечего, чёрный это ноль. Убрать свет можно только из альфы,
   * `destination-out` ровно это и делает.
   */
  const body = half * EDGE;

  /*
   * Моря режутся по телу диска: без отсечения они выедают и ореол вокруг него,
   * и у луны появляется откушенный бок.
   */
  context.save();
  context.beginPath();
  context.arc(half, half, body, 0, Math.PI * 2);
  context.clip();
  context.globalCompositeOperation = 'destination-out';

  for (const mare of MARIA) {
    const x = half + mare.x * body;
    const y = half + mare.y * body;
    const radius = mare.radius * body;
    const spot = context.createRadialGradient(x, y, 0, x, y, radius);

    // Края морей размыты, и снимается лишь десятая доля света: резкая или
    // глубокая тень читается дыркой в диске, а не неровностью тела.
    spot.addColorStop(0, `rgba(0, 0, 0, ${mare.depth})`);
    spot.addColorStop(0.7, `rgba(0, 0, 0, ${mare.depth * 0.45})`);
    spot.addColorStop(1, 'rgba(0, 0, 0, 0)');

    context.fillStyle = spot;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }

  context.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Вешает луну в небо.
 *
 * @param parent сцена мира
 * @param direction направление на светило из начала координат — то же, по
 *   которому стоит ключевой свет: иначе тени лягут не от того источника,
 *   который виден в кадре
 */
export function createMoon(parent: THREE.Object3D, direction: THREE.Vector3): Moon {
  const texture = moonTexture();
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    // Проверять глубину, но не писать её: почему — в шапке модуля.
    depthTest: true,
    depthWrite: false,
    sizeAttenuation: false,
    fog: false,
    blending: THREE.AdditiveBlending,
  });

  const sprite = new THREE.Sprite(material);
  sprite.name = 'world-moon';
  sprite.scale.set(SCALE, SCALE, 1);
  // Первым в прозрачной очереди: небо рисуется до листьев и прочей прозрачной
  // мелочи. Звёзды идут ещё раньше — они за луной.
  sprite.renderOrder = -1;
  sprite.frustumCulled = false;
  parent.add(sprite);

  const aim = direction.clone().normalize();

  return {
    update: (camera: THREE.Camera) => {
      // Диск едет за камерой: луна одинаково далека из любой точки мира.
      sprite.position.copy(camera.position).addScaledVector(aim, DISTANCE);
    },

    setColor: (color: number) => {
      material.color.setHex(color);
    },

    dispose: () => {
      texture.dispose();
      material.dispose();
      sprite.removeFromParent();
    },
  };
}
