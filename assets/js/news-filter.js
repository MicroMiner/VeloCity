// News page: category filter in the sidebar. Builds its chips from the cards
// news.js has rendered and re-applies the choice when more posts are loaded.
const list = document.getElementById("newsList");
const box = document.getElementById("newsFilter");
const chips = document.getElementById("newsFilterChips");
let active = "Alle";

function cards() {
  return [...list.querySelectorAll(".news-blog-card")];
}
function categoryOf(card) {
  return card.querySelector(".news-category")?.dataset.category || "Info";
}
function apply() {
  for (const card of cards())
    card.toggleAttribute("data-filtered", active !== "Alle" && categoryOf(card) !== active);
}
function render() {
  const counts = new Map();
  for (const card of cards()) counts.set(categoryOf(card), (counts.get(categoryOf(card)) || 0) + 1);
  if (active !== "Alle" && !counts.has(active)) active = "Alle";
  const total = [...counts.values()].reduce((sum, value) => sum + value, 0);
  const entries = [["Alle", total], ...counts];
  chips.replaceChildren(
    ...entries.map(([name, count]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "news-filter-chip";
      button.textContent = `${name} · ${count}`;
      button.setAttribute("aria-pressed", String(name === active));
      button.dataset.category = name;
      button.addEventListener("click", () => {
        active = name;
        render();
        chips.querySelector(`[data-category="${CSS.escape(name)}"]`)?.focus();
      });
      return button;
    }),
  );
  // Only worth showing when there is something to choose between.
  box.hidden = counts.size < 2;
  apply();
}
new MutationObserver(render).observe(list, { childList: true });
render();
