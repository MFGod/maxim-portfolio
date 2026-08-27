'use client';

import { GroupTitle, ItemTile } from './items';
import { type ItemView } from './shared';

/**
 * Режим значков: сетка квадратных плиток того же габарита, что ярлыки рабочего
 * стола. Колонка — плитка плюс отступ 2px с боков; без `1fr`, иначе квадраты
 * растягивались бы вместе с окном.
 */
export function IconsView({ view }: { view: ItemView }) {
  return (
    <div>
      {view.groups.map((group) => (
        <section key={group.id}>
          {group.title ? (
            <GroupTitle title={group.title} count={group.items.length} />
          ) : null}

          <ul className="grid grid-cols-[repeat(auto-fill,calc(var(--icon-size)+0.25rem))] gap-1">
            {group.items.map((item) => (
              <ItemTile key={item.key} item={item} view={view} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
