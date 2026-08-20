import { AppBody } from '@/components/ui/primitives';
import { about } from '@/data/about';
import { profile } from '@/data/profile';

export function AboutApp() {
  return (
    <AppBody>
      <article>
        <header className="border-line-subtle border-b pb-5">
          <h2 className="text-ink font-display text-2xl tracking-tight">
            {profile.name}
          </h2>
          <p className="text-accent mt-1 text-sm">{profile.role}</p>
        </header>

        <div className="mt-6 space-y-7">
          {about.map((section) => (
            <section key={section.id}>
              <h3 className="text-2xs text-ink-faint font-mono tracking-[0.18em] uppercase">
                {section.title}
              </h3>
              <div className="mt-2.5 space-y-2.5">
                {section.body.map((paragraph) => (
                  <p key={paragraph.slice(0, 32)} className="text-ink-muted text-sm">
                    {paragraph}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </article>
    </AppBody>
  );
}
