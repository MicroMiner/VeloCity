// Home page: 2 x 2 preview of the first gallery images. Decorative only;
// the "Zur Galerie" button remains the accessible way into the gallery.
import { loadData, element } from "./portal-data.js";

const preview = document.getElementById("homeGalleryPreview");
const localImage = (value) =>
  typeof value === "string" && value.startsWith("assets/img/gallery/") ? value : null;

try {
  const images = (await loadData("assets/data/gallery.json", "images")).filter(
    (image) => image && localImage(image.thumbnail || image.src),
  );
  const shown = images.slice(0, 4);
  for (const [index, image] of shown.entries()) {
    const tile = element("span", "home-gallery-tile");
    const img = element("img", "");
    img.src = localImage(image.thumbnail) || localImage(image.src);
    img.alt = "";
    img.width = 320;
    img.height = 180;
    img.loading = "lazy";
    img.decoding = "async";
    img.addEventListener("error", () => tile.remove(), { once: true });
    tile.append(img);
    const remaining = images.length - 3;
    if (index === 3 && images.length > 4)
      tile.append(element("span", "home-gallery-more", `+${remaining}`));
    preview.append(tile);
  }
  preview.hidden = !shown.length;
} catch {
  preview.hidden = true;
}
