import { type AppletWriteup, isStepGuide } from "../../applets/writeups";
import { Snippet } from "./CodeBlock";

/**
 * The narrative shown above the reference box: premise (why), how it works, and
 * the most important snippets. Booton prose, monochrome.
 *
 * `how` renders one of two ways: a flat list of paragraphs for the simpler
 * applets, or an ordered step-by-step guide (heading + text + snippets per
 * step) so code and diagrams sit right next to the paragraph they belong to.
 */
export function WriteupSection({ writeup }: { writeup: AppletWriteup }) {
  const steps = isStepGuide(writeup.how) ? writeup.how : null;

  return (
    <section className="space-y-4">
      {writeup.premise.map((p, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static writeup content, never reordered
        <p key={`p${i}`} className="text-base leading-relaxed text-foreground">
          {p}
        </p>
      ))}
      {steps ? (
        <div className="space-y-6 pt-1">
          {steps.map((step, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static writeup content, never reordered
            <div key={i} className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">{step.heading}</h3>
              {step.text.map((p, j) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: static writeup content, never reordered
                <p key={j} className="text-sm leading-relaxed text-muted-foreground">
                  {p}
                </p>
              ))}
              {step.snippets && step.snippets.length > 0 && (
                <div className="space-y-3">
                  {step.snippets.map((s, k) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: static writeup content, never reordered
                    <Snippet key={k} code={s.code} lang={s.lang} caption={s.caption} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        (writeup.how as string[]).map((p, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static writeup content, never reordered
          <p key={`h${i}`} className="text-sm leading-relaxed text-muted-foreground">
            {p}
          </p>
        ))
      )}
      {!steps && writeup.snippets && writeup.snippets.length > 0 && (
        <div className="space-y-3 pt-1">
          {writeup.snippets.map((s, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static writeup content, never reordered
            <Snippet key={i} code={s.code} lang={s.lang} caption={s.caption} />
          ))}
        </div>
      )}
      {writeup.considerations && writeup.considerations.length > 0 && (
        <div className="space-y-2 rounded border border-border bg-muted/30 p-4">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Considerations
          </h3>
          <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-foreground">
            {writeup.considerations.map((c, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: static writeup content, never reordered
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
