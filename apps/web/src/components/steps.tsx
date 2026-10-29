const STEPS = ["Photos", "AI draft", "Review", "Price & delivery", "Publish"];

export function Steps({ current }: { current: number }) {
  return (
    <ol className="flex flex-wrap gap-2 text-[13px]">
      {STEPS.map((label, i) => {
        const n = i + 1;
        const state = n < current ? "done" : n === current ? "now" : "todo";
        return (
          <li
            key={label}
            className={`flex items-center gap-2 rounded-full px-3 py-2 font-semibold ${state === "now" ? "bg-ink text-white" : state === "done" ? "bg-accent-soft text-accent" : "bg-surface-2 text-ink-2"}`}
          >
            <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] text-white ${state === "todo" ? "bg-[#9aa3b2]" : "bg-accent"}`}>{n}</span>
            {label}
          </li>
        );
      })}
    </ol>
  );
}
